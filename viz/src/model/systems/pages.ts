// PagesView data: a B+ tree drawn level by level as pages of keys.
//
// Hint: `// @viz pages:<root>[,<path>]`. A page is an object with `id` and `keys`, and either
// `children` (an inner page) or `values` (a leaf); a leaf's `next` links it to the next leaf.
// `<path>` lists the pages the current operation has read, as ids or as the pages themselves.
// Pages held by locals but not reachable from the root (a page just split off, not yet linked
// into its parent) are drawn apart as `detached`. Every page, and every array of pages (such as
// a stack of parents), is reported in `uses`, so none of them is drawn again as a list or trie.
// Option `reads=<var>`: a count of page reads (disk reads) so far, shown above the tree. Each hot
// page also carries the positions at which the path read it, so the view can number the reads.

import type { HeapId, HeapObj, Step, Value } from "../../tracer/types.ts";
import { label } from "../heap.ts";
import type { Builder } from "./types.ts";

export type PageBox = {
  id: number;
  keys: string[];
  leaf: boolean;
  hot: boolean;
  changed: boolean;
  /** Leaves only: the value stored with each key. */
  values?: string[];
  /** Inner pages only: child page ids, left to right. */
  children?: number[];
  /** Leaves only: the id of the next leaf, when the link exists. */
  next?: number;
  /** Locals of the current call that point at this page, such as `leaf` or `parent`. */
  names: string[];
  /** 1-based positions in the current path at which this page was read. */
  reads?: number[];
};

export type PagesPanel = {
  kind: "pages";
  key: string;
  name: string;
  levels: PageBox[][];
  /** Pages not reachable from the root: just created by a split, or cut loose from their parent. */
  detached?: PageBox[];
  /** The `reads=` counter: page reads so far. */
  reads?: number;
};

type Obj = Extract<HeapObj, { kind: "object" }>;

const pageObj = (step: Step, v: Value | undefined): Obj | undefined => {
  const o = v?.t === "r" ? step.heap[v.id] : undefined;
  return o?.kind === "object" && "keys" in o.fields ? o : undefined;
};
const items = (step: Step, v: Value | undefined): Value[] => {
  const o = v?.t === "r" ? step.heap[v.id] : undefined;
  return o?.kind === "array" ? o.items : [];
};
const prim = (v: Value | undefined) => (v?.t === "p" ? v.v : undefined);

/** What a page holds, to tell whether it changed since the previous step. */
function signature(step: Step, id: HeapId): string | undefined {
  const o = pageObj(step, { t: "r", id });
  if (!o) return undefined;
  const list = (k: string) => items(step, o.fields[k]).map((x) => (x.t === "r" ? `@${x.id}` : label(step, x)));
  const next = o.fields.next;
  return JSON.stringify([list("keys"), list("values"), list("children"), next?.t === "r" ? next.id : null]);
}

export const buildPages: Builder<PagesPanel> = (ctx) => {
  const { step, prev } = ctx;
  const rootVal = ctx.find(ctx.args[0]);
  if (!pageObj(step, rootVal)) return null;
  const uses = new Set<HeapId>();

  const pathArg = ctx.args[1] && !ctx.args[1].includes("=") ? ctx.args[1] : undefined;
  const readsArg = ctx.args.find((a) => a.startsWith("reads="))?.slice(6);
  const pathVal = pathArg ? ctx.find(pathArg) : undefined;
  const hot = new Set<string>();
  const order = new Map<string, number[]>();
  (pathVal?.t === "r" ? items(step, pathVal) : pathVal ? [pathVal] : []).forEach((x, i) => {
    const page = pageObj(step, x);
    const key = page ? String(prim(page.fields.id)) : String(prim(x));
    hot.add(key);
    order.set(key, [...(order.get(key) ?? []), i + 1]);
  });
  if (pathVal?.t === "r" && step.heap[pathVal.id]?.kind === "array") uses.add(pathVal.id);

  // Locals of the innermost call that point at pages, to tag them.
  const namesOf = new Map<HeapId, string[]>();
  for (const [name, v] of step.stack.at(-1)?.vars ?? []) {
    if (name === "this" || v.t !== "r" || !pageObj(step, v)) continue;
    namesOf.set(v.id, [...(namesOf.get(v.id) ?? []), name]);
  }

  const seen = new Set<HeapId>();
  const boxOf = (v: Value, o: Obj): PageBox => {
    const heapId = (v as { id: HeapId }).id;
    seen.add(heapId);
    uses.add(heapId);
    for (const f of ["keys", "values", "children"]) {
      const a = o.fields[f];
      if (a?.t === "r") uses.add(a.id);
    }
    const id = Number(prim(o.fields.id) ?? heapId);
    const kids = items(step, o.fields.children).filter((c) => pageObj(step, c));
    const leaf = kids.length === 0;
    const next = pageObj(step, o.fields.next);
    const box: PageBox = {
      id,
      keys: items(step, o.fields.keys).map((k) => label(step, k)),
      leaf,
      hot: hot.has(String(id)),
      changed: Boolean(prev) && signature(prev!, heapId) !== signature(step, heapId),
      names: namesOf.get(heapId) ?? [],
    };
    if (leaf && "values" in o.fields) box.values = items(step, o.fields.values).map((x) => label(step, x));
    if (!leaf) box.children = kids.map((c) => Number(prim(pageObj(step, c)!.fields.id) ?? (c as { id: HeapId }).id));
    if (leaf && next) box.next = Number(prim(next.fields.id));
    const at = order.get(String(id));
    if (at) box.reads = at;
    return box;
  };

  const levels: PageBox[][] = [];
  let row: Value[] = [rootVal!];
  while (row.length && levels.length < 12) {
    const boxes: PageBox[] = [];
    const nextRow: Value[] = [];
    for (const v of row) {
      const o = pageObj(step, v);
      if (!o || v.t !== "r" || seen.has(v.id)) continue;
      boxes.push(boxOf(v, o));
      nextRow.push(...items(step, o.fields.children));
    }
    if (boxes.length) levels.push(boxes);
    row = nextRow;
  }

  // Pages the heap holds that the root does not reach, in creation order.
  const detached: PageBox[] = [];
  for (const [idStr, o] of Object.entries(step.heap)) {
    const id = Number(idStr);
    if (seen.has(id) || o.kind !== "object" || !("keys" in o.fields)) continue;
    detached.push(boxOf({ t: "r", id }, o));
  }
  detached.sort((a, b) => a.id - b.id);
  // Arrays that hold only pages (a stack of parents, say) add nothing the tree does not show.
  for (const [idStr, o] of Object.entries(step.heap)) {
    if (o.kind === "array" && o.items.length > 0 && o.items.every((x) => x.t === "r" && seen.has(x.id))) uses.add(Number(idStr));
  }
  const panel: PagesPanel = { kind: "pages", key: `pages:${ctx.args[0]}`, name: ctx.args[0], levels };
  if (detached.length) panel.detached = detached;
  const reads = readsArg ? prim(ctx.find(readsArg)) : undefined;
  if (typeof reads === "number") panel.reads = reads;
  return { panel, uses: [...uses] };
};
