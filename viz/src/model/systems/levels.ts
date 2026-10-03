// LevelsView data: stacked rows of blocks (memtable and SSTable levels, or a WAL strip).
//
// Hint: `// @viz levels:<row>,<row>,...[,hot=<var>]`. Each row argument is a variable:
//   - a Map, a plain object or a sorted array of [key, value] pairs: one row, one block
//     holding every entry (an in-memory map, a memtable, a snapshot);
//   - an array of records: one row, one block per record. A record is labelled by its `id`,
//     `seq` or `name` field; its items come from an array of pairs (`entries`), or from `k`/`v`;
//   - an array of arrays of records: one row per inner array, named L0, L1, ... (LSM levels);
//   - null or undefined: an empty row.
// `<row>@<var>` draws a marker on that row after the first `<var>` blocks (a WAL's durable point).
// `hot=<var>` names the blocks the current operation is checking: a list (or one value) of
// block ids, of row names for whole-row blocks, or of the records themselves.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Builder, SystemsCtx } from "./types.ts";

export type LevelsBlock = {
  /** Stable within its row: the record id, or the row name for a whole-row block. */
  id: string;
  label: string;
  /** First and last key, for sorted runs. */
  range?: string;
  items: string[];
  hot: boolean;
  changed: boolean;
};

export type LevelsPanel = {
  kind: "levels";
  key: string;
  name: string;
  rows: {
    name: string;
    /** Draw a marker after this many blocks (a WAL's durable point). */
    mark?: number;
    markLabel?: string;
    blocks: LevelsBlock[];
  }[];
};

type Row = LevelsPanel["rows"][number];
type Rec = Record<string, unknown>;
/** A block before hot/changed are known, plus the heap ids it was read from. */
type RawBlock = Omit<LevelsBlock, "hot" | "changed"> & { heapId?: HeapId };

/** A deleted key's marker (a null value) is drawn as a dagger: the key is dead. */
export const TOMBSTONE_TEXT = "†";

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return TOMBSTONE_TEXT;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(fmt).join(",")}]`;
  return "…";
};

const isRecord = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x) && !(x instanceof Map) && !(x instanceof Set);
const isPair = (x: unknown): x is [unknown, unknown] =>
  Array.isArray(x) && x.length === 2 && !isRecord(x[0]) && !Array.isArray(x[0]);
const isPairs = (x: unknown): x is [unknown, unknown][] => Array.isArray(x) && x.length > 0 && x.every(isPair);

const pairsText = (pairs: [unknown, unknown][]) => pairs.map(([k, v]) => `${fmt(k)}=${fmt(v)}`);
const rangeOf = (pairs: [unknown, unknown][]) => {
  if (!pairs.length) return undefined;
  const [lo, hi] = [fmt(pairs[0][0]), fmt(pairs.at(-1)![0])];
  return lo === hi ? lo : `${lo}–${hi}`;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function wholeBlock(name: string, value: unknown, heapId: HeapId | undefined): RawBlock {
  let pairs: [unknown, unknown][] = [];
  if (value instanceof Map) pairs = [...value.entries()];
  else if (Array.isArray(value)) pairs = value as [unknown, unknown][];
  else if (isRecord(value)) pairs = Object.entries(value).filter(([k]) => !k.startsWith("__"));
  return { id: name, label: plural(pairs.length, "key"), range: Array.isArray(value) ? rangeOf(pairs) : undefined, items: pairsText(pairs), heapId };
}

function recordBlock(r: Rec): RawBlock {
  const id = r.id ?? r.seq ?? r.name ?? r.__id;
  const label = typeof id === "number" ? `#${id}` : String(id);
  const list = Object.entries(r).find(([k, v]) => !k.startsWith("__") && Array.isArray(v) && (v.length === 0 || isPairs(v)));
  if (list) {
    const pairs = list[1] as [unknown, unknown][];
    return { id: String(id), label, range: rangeOf(pairs), items: pairsText(pairs), heapId: r.__id as HeapId };
  }
  const items = "k" in r ? [`${fmt(r.k)}=${fmt(r.v)}`] : Object.entries(r).filter(([k]) => !k.startsWith("__")).map(([k, v]) => `${k}=${fmt(v)}`);
  return { id: String(id), label, items, heapId: r.__id as HeapId };
}

/** The rows one argument becomes. */
function rowsOf(name: string, value: unknown, heapId: HeapId | undefined): { name: string; blocks: RawBlock[] }[] {
  if (value === null || value === undefined) return [{ name, blocks: [] }];
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ name, blocks: [] }];
    if (value.every(Array.isArray) && !isPairs(value)) {
      return value.map((level, i) => ({ name: `L${i}`, blocks: (level as unknown[]).filter(isRecord).map(recordBlock) }));
    }
    if (value.every(isRecord)) return [{ name, blocks: value.map(recordBlock) }];
  }
  return [{ name, blocks: [wholeBlock(name, value, heapId)] }];
}

type Arg = { name: string; markVar?: string };
function parseArgs(args: string[]): { rows: Arg[]; hot?: string } {
  const rows: Arg[] = [];
  let hot: string | undefined;
  for (const a of args) {
    if (a.startsWith("hot=")) hot = a.slice(4);
    else {
      const [name, markVar] = a.split("@");
      rows.push({ name, markVar });
    }
  }
  return { rows, hot };
}

/** Every heap id reachable from `v`, so the generic scene does not draw them again. */
function reachable(step: Step, v: Value | undefined, out: Set<HeapId>) {
  const todo: Value[] = v ? [v] : [];
  while (todo.length) {
    const x = todo.pop()!;
    if (x.t !== "r" || out.has(x.id)) continue;
    const o = step.heap[x.id];
    if (!o) continue;
    out.add(x.id);
    if (o.kind === "array" || o.kind === "set") todo.push(...o.items);
    else if (o.kind === "map") for (const [k, val] of o.entries) todo.push(k, val);
    else todo.push(...Object.values(o.fields));
  }
}

function build(
  find: (n: string) => Value | undefined,
  js: (v: Value | undefined) => unknown,
  rows: Arg[],
): { name: string; mark?: number; markLabel?: string; blocks: RawBlock[] }[] | null {
  const out: { name: string; mark?: number; markLabel?: string; blocks: RawBlock[] }[] = [];
  let any = false;
  for (const arg of rows) {
    const v = find(arg.name);
    if (v !== undefined) any = true;
    const made = rowsOf(arg.name, js(v), v?.t === "r" ? v.id : undefined);
    if (arg.markVar && made.length === 1) {
      const m = js(find(arg.markVar));
      if (typeof m === "number") Object.assign(made[0], { mark: m, markLabel: arg.markVar });
    }
    out.push(...made);
  }
  return any ? out : null;
}

export const buildLevels: Builder<LevelsPanel> = (ctx: SystemsCtx) => {
  const { rows: args, hot } = parseArgs(ctx.args);
  const now = build(ctx.find, ctx.js, args);
  if (!now) return null;
  const before = ctx.prev ? build(ctx.findPrev, ctx.jsPrev, args) : null;
  const prevItems = new Map<string, string>();
  for (const r of before ?? []) for (const b of r.blocks) prevItems.set(`${r.name}/${b.id}`, JSON.stringify(b.items));

  const hotVal = hot ? ctx.find(hot) : undefined;
  const hotJs = ctx.js(hotVal);
  const hotList = hotJs instanceof Set ? [...hotJs] : Array.isArray(hotJs) ? hotJs : hotJs === undefined ? [] : [hotJs];
  const hotIds = new Set(hotList.map((x) => (isRecord(x) ? `@${String(x.__id)}` : String(x))));

  const rows: Row[] = now.map((r) => ({
    name: r.name,
    ...(r.mark !== undefined ? { mark: r.mark, markLabel: r.markLabel } : {}),
    blocks: r.blocks.map(({ heapId, ...b }) => {
      const was = prevItems.get(`${r.name}/${b.id}`);
      return {
        ...b,
        hot: hotIds.has(b.id) || (heapId !== undefined && hotIds.has(`@${heapId}`)),
        changed: before !== null && was !== JSON.stringify(b.items),
      };
    }),
  }));

  const uses = new Set<HeapId>();
  for (const a of args) reachable(ctx.step, ctx.find(a.name), uses);
  if (hotVal?.t === "r" && ctx.step.heap[hotVal.id]?.kind !== "object") reachable(ctx.step, hotVal, uses);
  return { panel: { kind: "levels", key: `levels:${args.map((a) => a.name).join(",")}`, name: args.map((a) => a.name).join(" · "), rows }, uses: [...uses] };
};
