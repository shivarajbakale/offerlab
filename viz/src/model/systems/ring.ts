// RingView data: a consistent-hashing ring with server tokens and tracked keys.
//
// `@viz ring:<tokens>,<keys>` reads:
// - tokens: an array of `{ hash, node }`, with hash in [0, 2^32);
// - keys: an array of `{ key, hash, owner, before? }`. A key has moved when `before` is set and
//   differs from `owner`.
// Either may be missing (a mod-N sharder has keys but no tokens). The key being looked up (a
// `hash` or `key` local in the innermost frame) gets a pointer.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Builder } from "./types.ts";

export type RingPanel = {
  kind: "ring";
  key: string;
  name: string;
  /** Positions are fractions of the ring, in [0, 1), sorted. */
  tokens: { pos: number; node: string }[];
  keys: { label: string; pos: number; owner: string; moved: boolean; changed: boolean }[];
  moved: number;
  total: number;
  /** Fraction of the ring each server owns: the arcs ending at its tokens. */
  shares: { node: string; share: number }[];
  /** The key being looked up right now. */
  pointer?: { pos: number; label: string };
};

const RING = 2 ** 32;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !(x instanceof Map) && !(x instanceof Set);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const str = (x: unknown) => (typeof x === "string" ? x : x === undefined || x === null ? undefined : String(x));

/** The array's id and the ids of the objects directly in it. */
function arrayIds(step: Step, v: Value | undefined): HeapId[] {
  if (v?.t !== "r") return [];
  const o = step.heap[v.id];
  if (o?.kind !== "array") return [];
  return [v.id, ...o.items.flatMap((x) => (x.t === "r" ? [x.id] : []))];
}

/** Each server's share of the ring: token i owns the arc from token i-1 (exclusive) up to itself. */
export function ringShares(tokens: { pos: number; node: string }[]): { node: string; share: number }[] {
  const share = new Map<string, number>();
  tokens.forEach((t, i) => {
    const from = i === 0 ? tokens[tokens.length - 1].pos - 1 : tokens[i - 1].pos;
    share.set(t.node, (share.get(t.node) ?? 0) + (t.pos - from));
  });
  return [...share].map(([node, s]) => ({ node, share: s })).sort((a, b) => a.node.localeCompare(b.node));
}

export const buildRing: Builder<RingPanel> = (ctx) => {
  const [tokArg, keyArg] = ctx.args;
  const tv = tokArg ? ctx.find(tokArg) : undefined;
  const kv = keyArg ? ctx.find(keyArg) : undefined;
  const rawTokens = ctx.js(tv);
  const rawKeys = ctx.js(kv);
  if (!Array.isArray(rawTokens) && !Array.isArray(rawKeys)) return null;

  const tokens = (Array.isArray(rawTokens) ? rawTokens : [])
    .filter(isObj)
    .flatMap((t) => {
      const hash = num(t.hash);
      return hash === undefined ? [] : [{ pos: hash / RING, node: str(t.node) ?? "?" }];
    })
    .sort((a, b) => a.pos - b.pos);

  // Owners in the previous step, to flash keys whose owner just changed.
  const prevKeys = keyArg ? ctx.jsPrev(ctx.findPrev(keyArg)) : undefined;
  const prevOwner = new Map<string, string | undefined>();
  if (Array.isArray(prevKeys)) for (const k of prevKeys.filter(isObj)) prevOwner.set(str(k.key) ?? "", str(k.owner));

  const keys = (Array.isArray(rawKeys) ? rawKeys : []).filter(isObj).flatMap((k) => {
    const hash = num(k.hash);
    if (hash === undefined) return [];
    const label = str(k.key) ?? "?";
    const owner = str(k.owner) ?? "?";
    const before = str(k.before);
    const was = prevOwner.get(label);
    return [{ label, pos: hash / RING, owner, moved: before !== undefined && before !== owner, changed: prevOwner.has(label) && was !== owner }];
  });

  const inner = ctx.step.stack.at(-1);
  const local = (name: string) => inner?.vars.find(([n]) => n === name)?.[1];
  const hashNow = num(ctx.js(local("hash")));
  const keyNow = str(ctx.js(local("key")));
  const known = keys.find((k) => k.label === keyNow);
  const pointer =
    hashNow !== undefined
      ? { pos: hashNow / RING, label: keyNow ?? "hash" }
      : known
        ? { pos: known.pos, label: known.label }
        : undefined;

  return {
    panel: {
      kind: "ring",
      key: `ring:${tokArg ?? keyArg}`,
      name: tokens.length || !keyArg ? (tokArg ?? "ring") : keyArg,
      tokens,
      keys,
      moved: keys.filter((k) => k.moved).length,
      total: keys.length,
      shares: tokens.length ? ringShares(tokens) : [],
      ...(pointer ? { pointer } : {}),
    },
    uses: [...arrayIds(ctx.step, tv), ...arrayIds(ctx.step, kv)],
  };
};
