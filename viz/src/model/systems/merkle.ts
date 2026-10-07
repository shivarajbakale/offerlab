// MerkleView data: one or two replicas, each drawn as its tree of fingerprints over key buckets
// (or as a flat row of bucket fingerprints), so the reader sees two copies of the data being
// compared and exactly where they differ.
//
// Hint: `// @viz merkle:this,other`. Each argument names a variable holding a replica: an object
// with `root` (a tree of `{ value, left, right }` nodes over `size` buckets, with `buckets`: a Map
// from bucket number to that bucket's entries) or with `hashes` (a flat array of bucket
// fingerprints, with the same `buckets`). `this` is the replica whose method is running (the
// innermost frame that has one); other names are looked up in every frame, outermost first, so a
// method's local that shares the name does not hide it. With two replicas found, the first is
// drawn as replica A and the second as B. Fields read when present: `compared` (pairs compared by
// the last diff), `differing` (buckets the last diff found), `rehashed` (fingerprints the last
// write recomputed).
// Nodes the current call points at (`x`, `y`, `node`, ...) are hot; nodes whose fingerprint
// differs from the other replica's node in the same place are marked; changed ones flash.

import type { HeapId, HeapObj, Step, Value } from "../../tracer/types.ts";
import type { Builder } from "./types.ts";

export type MerkleNodeBox = {
  id: HeapId;
  value: string;
  /** Differs from the node in the same place in the other replica. */
  differs: boolean;
  hot: boolean;
  changed: boolean;
  /** Locals of the current call pointing here. */
  names: string[];
  /** Leaves only: the bucket number, its entries, and whether the last diff reported it. */
  bucket?: number;
  entries?: string[];
  found?: boolean;
  children?: [MerkleNodeBox, MerkleNodeBox];
};

export type MerkleReplica = {
  name: string;
  title: string;
  /** A tree replica: its root. */
  root?: MerkleNodeBox;
  /** A flat replica: one box per bucket. */
  flat?: MerkleNodeBox[];
  compared?: number;
  rehashed?: number;
};

export type MerklePanel = { kind: "merkle"; key: string; name: string; replicas: MerkleReplica[] };

type Obj = Extract<HeapObj, { kind: "object" }>;

const objOf = (step: Step, v: Value | undefined): Obj | undefined => {
  const o = v?.t === "r" ? step.heap[v.id] : undefined;
  return o?.kind === "object" ? o : undefined;
};
const prim = (v: Value | undefined) => (v?.t === "p" ? v.v : undefined);
const isReplica = (o: Obj | undefined) => Boolean(o && ("root" in o.fields || "hashes" in o.fields) && "buckets" in o.fields);

/** The replica a name refers to: `this` from the innermost frame out, other names from the outermost frame in. */
function findReplica(step: Step, names: string[]): { name: string; v: Value } | undefined {
  for (const name of names) {
    for (const frame of name === "this" ? [...step.stack].reverse() : step.stack) {
      const hit = frame.vars.find(([n]) => n === name);
      if (hit && isReplica(objOf(step, hit[1]))) return { name, v: hit[1] };
    }
  }
  return undefined;
}

function reach(step: Step, v: Value | undefined, out: Set<HeapId>) {
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

function bucketsOf(step: Step, o: Obj): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const m = o.fields.buckets?.t === "r" ? step.heap[o.fields.buckets.id] : undefined;
  if (m?.kind !== "map") return out;
  for (const [k, val] of m.entries) {
    const arr = val.t === "r" ? step.heap[val.id] : undefined;
    out.set(Number(prim(k)), arr?.kind === "array" ? arr.items.map((x) => String(prim(x))) : []);
  }
  return out;
}

const ROMAN = ["A", "B", "C", "D"];

export const buildMerkle: Builder<MerklePanel> = (ctx) => {
  const { step, prev } = ctx;
  const found = ctx.args
    .map((a) => findReplica(step, a.split("|")))
    .filter((x): x is { name: string; v: Value } => Boolean(x))
    .filter((x, i, all) => all.findIndex((y) => y.v.t === "r" && x.v.t === "r" && y.v.id === x.v.id) === i);
  if (!found.length) return null;
  const uses = new Set<HeapId>();
  for (const f of found) reach(step, f.v, uses);

  // Locals of the innermost call that point at tree nodes.
  const namesOf = new Map<HeapId, string[]>();
  for (const [name, v] of step.stack.at(-1)?.vars ?? []) {
    if (name === "this" || v.t !== "r") continue;
    const o = objOf(step, v);
    if (o && "value" in o.fields && "left" in o.fields) namesOf.set(v.id, [...(namesOf.get(v.id) ?? []), name]);
  }
  const prevValue = (id: HeapId) => {
    const o = prev ? objOf(prev, { t: "r", id }) : undefined;
    return o ? prim(o.fields.value) : undefined;
  };
  // The flat replica's current index, when its diff loop is running.
  const top = step.stack.at(-1);
  const self = top?.vars.find(([n]) => n === "this")?.[1];
  const loopI = prim(top?.vars.find(([n]) => n === "i")?.[1]);

  const objs = found.map((f) => objOf(step, f.v)!);
  const replicas: MerkleReplica[] = found.map((f, ri) => {
    const o = objs[ri];
    const other = objs.length > 1 ? objs[ri === 0 ? 1 : 0] : undefined;
    const buckets = bucketsOf(step, o);
    const differing = new Set<number>();
    const d = o.fields.differing?.t === "r" ? step.heap[o.fields.differing.id] : undefined;
    if (d?.kind === "array") for (const x of d.items) differing.add(Number(prim(x)));
    const title = found.length > 1 ? `Replica ${ROMAN[ri] ?? ri + 1}` : "Replica";
    const rep: MerkleReplica = { name: f.name, title };
    const compared = prim(o.fields.compared);
    const rehashed = prim(o.fields.rehashed);
    if (typeof compared === "number") rep.compared = compared;
    if (typeof rehashed === "number") rep.rehashed = rehashed;

    if ("hashes" in o.fields) {
      const arr = o.fields.hashes.t === "r" ? step.heap[o.fields.hashes.id] : undefined;
      const otherArr = other?.fields.hashes?.t === "r" ? step.heap[other.fields.hashes.id] : undefined;
      const inLoop = self?.t === "r" && f.v.t === "r" && self.id === f.v.id && typeof loopI === "number";
      if (arr?.kind === "array") {
        rep.flat = arr.items.map((x, i) => {
          const ov = otherArr?.kind === "array" ? prim(otherArr.items[i]) : undefined;
          return {
            id: -1 - i,
            value: String(prim(x)),
            differs: ov !== undefined && ov !== prim(x),
            hot: inLoop && loopI === i,
            changed: false,
            names: inLoop && loopI === i ? ["i"] : [],
            bucket: i,
            entries: buckets.get(i) ?? [],
            found: differing.has(i),
          };
        });
      }
      return rep;
    }

    const size = Number(prim(o.fields.size) ?? 0);
    if (size > 64) return rep;
    const walk = (v: Value | undefined, ov: Value | undefined, lo: number, hi: number): MerkleNodeBox | undefined => {
      const n = objOf(step, v);
      if (!n || v?.t !== "r") return undefined;
      const on = other ? objOf(step, ov) : undefined;
      const value = String(prim(n.fields.value));
      const box: MerkleNodeBox = {
        id: v.id,
        value,
        differs: on !== undefined && String(prim(on.fields.value)) !== value,
        hot: namesOf.has(v.id),
        changed: prev !== undefined && prevValue(v.id) !== undefined && prevValue(v.id) !== prim(n.fields.value),
        names: namesOf.get(v.id) ?? [],
      };
      if (lo === hi) {
        box.bucket = lo;
        box.entries = buckets.get(lo) ?? [];
        box.found = differing.has(lo);
        return box;
      }
      const mid = (lo + hi) >> 1;
      const l = walk(n.fields.left, on?.fields.left, lo, mid);
      const r = walk(n.fields.right, on?.fields.right, mid + 1, hi);
      if (l && r) box.children = [l, r];
      return box;
    };
    rep.root = walk(o.fields.root, other?.fields.root, 0, size - 1);
    return rep;
  });

  const panel: MerklePanel = { kind: "merkle", key: `merkle:${ctx.args.join(",")}`, name: replicas.map((r) => r.title).join(" · "), replicas };
  return { panel, uses: [...uses] };
};
