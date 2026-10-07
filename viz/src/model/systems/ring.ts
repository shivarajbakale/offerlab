// RingView data: a consistent-hashing ring with server tokens and tracked keys.
//
// `@viz ring:<tokens>,<keys>` reads:
// - tokens: an array of `{ hash, node }`, with hash in [0, 2^32);
// - keys: an array of `{ key, hash, owner, before? }`. A key has moved when `before` is set and
//   differs from `owner`.
// Either may be missing (a mod-N sharder has keys but no tokens). The key being looked up (a
// `hash` or `key` local in the innermost frame) gets a pointer.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Builder, Caption } from "./types.ts";

export type RingPanel = {
  kind: "ring";
  key: string;
  name: string;
  /** Positions are fractions of the ring, in [0, 1), sorted. */
  tokens: { pos: number; node: string }[];
  keys: { label: string; pos: number; owner: string; moved: boolean; changed: boolean; before?: string }[];
  moved: number;
  total: number;
  /** Fraction of the ring each server owns: the arcs ending at its tokens. */
  shares: { node: string; share: number }[];
  /** The key being looked up right now. */
  pointer?: { pos: number; label: string };
  /** What just happened, in plain words. */
  caption: Caption;
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
    const moved = before !== undefined && before !== owner;
    return [{ label, pos: hash / RING, owner, moved, changed: prevOwner.has(label) && was !== owner, ...(moved ? { before } : {}) }];
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

  const shares = tokens.length ? ringShares(tokens) : [];
  const caption = ringCaption(ctx.mark, {
    fn: inner?.fn ?? "",
    rechecking: ctx.step.stack.some((f) => /rebalance$/.test(f.fn)),
    ownerKnown: (ctx.ran ?? 0) >= (ctx.markLine?.("moved") ?? Infinity) - 2,
    local: (name) => ctx.js(local(name)),
    find: (name) => ctx.js(ctx.find(name)),
    findPrev: (name) => ctx.jsPrev(ctx.findPrev(name)),
    tokens,
    keys,
    shares,
    pointer,
  });

  return {
    panel: {
      kind: "ring",
      key: `ring:${tokArg ?? keyArg}`,
      name: tokens.length || !keyArg ? (tokArg ?? "ring") : keyArg,
      tokens,
      keys,
      moved: keys.filter((k) => k.moved).length,
      total: keys.length,
      shares,
      ...(pointer ? { pointer } : {}),
      caption,
    },
    uses: [...arrayIds(ctx.step, tv), ...arrayIds(ctx.step, kv)],
  };
};

type CaptionInput = {
  fn: string;
  /** Inside a rebalance: keys are being looked up again after a change. */
  rechecking: boolean;
  /** In rebalance, the current key's new owner has been assigned. */
  ownerKnown: boolean;
  local: (name: string) => unknown;
  find: (name: string) => unknown;
  /** The same lookup at the marked line itself, before it ran. */
  findPrev: (name: string) => unknown;
  tokens: RingPanel["tokens"];
  keys: RingPanel["keys"];
  shares: RingPanel["shares"];
  pointer?: RingPanel["pointer"];
};

/** What the step just did, for someone who has never seen a hash ring. */
export function ringCaption(mark: string | undefined, c: CaptionInput): Caption {
  const servers = [...new Set(c.tokens.map((t) => t.node))].sort();
  const moved = c.keys.filter((k) => k.moved).length;
  const movedNote = c.keys.length ? ` So far ${moved} of ${c.keys.length} watched keys have changed server.` : "";
  const current = c.find("k");
  const tracked = isObj(current) ? current : undefined;
  const key = str(c.local("key")) ?? str(tracked?.key) ?? c.pointer?.label;

  if (mark === "modn") {
    const hash = num(c.local("hash"));
    const found = c.find("servers");
    const list = Array.isArray(found) ? found.map(String) : [];
    const n = list.length;
    if (hash !== undefined && n > 0) {
      const now = list[hash % n];
      const before = str(tracked?.before) ?? str(tracked?.owner);
      const changed = before !== undefined && before !== now;
      return {
        tone: changed ? "bad" : "info",
        text: `The simple rule: server number = hash mod ${n} (the remainder after dividing by the number of servers). For ${key ?? "this key"} that is ${hash % n}, so server ${now}.${
          changed ? ` With ${n - 1} servers the same key went to ${before}. Adding one server changed the answer, so this key's data must be copied.` : ""
        }`,
      };
    }
  }
  if (mark === "token") {
    const node = str(c.local("node")) ?? "?";
    const i = num(c.local("i")) ?? 0;
    const v = num(c.find("vnodes")) ?? 1;
    return {
      tone: "info",
      text:
        v > 1
          ? `Server ${node} joins. It gets ${v} markers on the ring by hashing the names "${node}-0" to "${node}-${v - 1}" (now on ${i + 1}). Each marker lands at a random-looking spot, so ${node}'s markers end up spread all around the ring.`
          : `Server ${node} joins. It gets one marker on the ring by hashing its name ("${node}-0"). Where it lands looks random.`,
    };
  }
  if (mark === "sorted") {
    const even = servers.length ? 1 / servers.length : 0;
    const top = [...c.shares].sort((a, b) => b.share - a.share)[0];
    if (top && servers.length > 1 && top.share > even * 1.5) {
      return {
        tone: "bad",
        text: `Each server owns the stretch of ring just before each of its markers. With so few markers the stretches are very uneven: ${top.node} owns ${Math.round(top.share * 100)}% of the ring, so it will store most of the keys. A fair share would be ${Math.round(even * 100)}%.`,
      };
    }
    return {
      tone: "info",
      text: `The markers are kept in order around the ring, so "the next marker clockwise" can be found quickly. Each server owns the stretch of ring just before each of its markers.`,
    };
  }
  if (mark === "remove") {
    const node = str(c.local("node")) ?? "?";
    return { tone: "info", text: `Server ${node} leaves. Only its markers are removed. Keys that used to stop at one of them will now walk on to the next marker clockwise; every other key stays put.` };
  }
  // The step after `moved++` may already be on the next key, so read the moved key at the mark itself.
  const movedKey = mark === "moved" ? c.findPrev("k") : undefined;
  if (isObj(movedKey)) {
    const k = str(movedKey.key) ?? "this key";
    const owner = str(movedKey.owner);
    const before = str(movedKey.before);
    const list = c.find("servers");
    const how =
      !c.tokens.length && Array.isArray(list)
        ? `With ${list.length - 1} servers, hash mod ${list.length - 1} put ${k} on ${before}. Now there are ${list.length}, and hash mod ${list.length} points to ${owner}.`
        : `Now the first marker clockwise from it is ${owner}'s.`;
    const most = !c.tokens.length && moved > c.keys.length / 2 ? " That is most of them, though the new server only needed about a quarter." : "";
    const was = c.tokens.length ? `${k} was stored on ${before}. ` : "";
    return {
      tone: "bad",
      text: `${was}${how} So ${k} moves to ${owner}, and moving a key means copying its data over the network.${movedNote}${most}`,
    };
  }
  if (mark === "wrap") {
    return {
      tone: "info",
      text: `${key ?? "This key"} lands after the last marker, near the top. Walking clockwise passes 0 and carries on from the start of the ring, so its owner is the first marker after 0.`,
    };
  }
  if (mark === "owner") {
    const owner = str(c.local("owner")) ?? "?";
    return {
      tone: "good",
      text: `The first marker clockwise from ${key ?? "the key"} belongs to ${owner}, so server ${owner} stores ${key ?? "it"}. Every app server does the same math and gets the same answer, without asking a central directory.`,
    };
  }
  if (c.rechecking && /lookup$/.test(c.fn)) {
    const q = c.tokens.length ? "which server marker is now the first one clockwise from it?" : "what does hash mod the new number of servers give?";
    return { tone: "info", text: `Checking ${key ?? "the next key"} again after the change: ${q}${movedNote}` };
  }
  if (mark === "hash" || (/lookup$/.test(c.fn) && c.pointer)) {
    const where = c.pointer ? ` That number lands ${Math.round(c.pointer.pos * 100)}% of the way around the ring (the arrow).` : "";
    const search = mark === "hash" ? "" : " Next: walk clockwise to the first server marker, using a binary search over the sorted markers.";
    return { tone: "info", text: `An app server needs ${key ?? "a key"}. It hashes the key's name into a number.${where}${search}` };
  }
  if (/rebalance$/.test(c.fn) && tracked) {
    const k = str(tracked.key) ?? "this key";
    const owner = str(tracked.owner);
    const before = str(tracked.before);
    if (c.ownerKnown && before && owner && before === owner) return { tone: "good", text: `${k} ${c.tokens.length ? "still meets the same marker first" : "gets the same answer from hash mod N"}, so it stays on ${owner}. Nothing to copy.${movedNote}` };
    if (c.ownerKnown && before && owner) return { tone: "bad", text: `${k} was stored on ${before}, and now belongs to ${owner}. Its data must be copied over.${movedNote}` };
    return { tone: "info", text: `After the change, every watched key is looked up again to see whether its server changed. Next: ${k}.${movedNote}` };
  }
  if (/track$/.test(c.fn)) {
    return { tone: "info", text: "Picking a few sample keys to watch, so the picture can show which server stores each one." };
  }
  if (c.keys.length && !c.tokens.length) {
    return { tone: "info", text: `No ring here: each key's server is picked by hash mod the number of servers.${movedNote}` };
  }
  if (c.tokens.length) {
    return {
      tone: moved ? "bad" : "info",
      text: `${servers.length === 1 ? "1 server" : `${servers.length} servers`} (${servers.join(", ")}) ${servers.length === 1 ? "has" : "have"} markers on the ring. A key belongs to the first marker clockwise from where the key hashes.${movedNote}`,
    };
  }
  return { tone: "info", text: "The ring is empty. Servers will be added one by one." };
}
