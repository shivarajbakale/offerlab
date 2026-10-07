/**
 * 001. Consistent Hashing
 * Level: Senior
 * Group: Partitioning
 *
 * Problem: Spread keys over a set of servers so that every client agrees which server holds a
 *   key, and so that adding or removing a server moves as few keys as possible. The obvious
 *   rule, hash(key) mod N, moves almost every key when N changes.
 *
 * Approach: Hash ring with virtual nodes
 *   Treat the 32-bit hash space as a circle. Each server is hashed onto the circle at several
 *   points (tokens, or virtual nodes). A key belongs to the first token clockwise from the
 *   key's own hash, found by binary search over the sorted tokens. Adding a server only takes
 *   over the arcs just before its new tokens; removing one hands its arcs to the next tokens
 *   clockwise. Every other key stays where it was.
 *
 * Cost: lookup O(log T) for T tokens; adding or removing a server O(T log T) to rebuild the
 *   sorted token list; memory O(T). On a change, about 1/N of the keys move.
 *
 * Pattern: partitioning
 * Key insight: A key's owner depends only on the tokens next to it on the ring, not on how many
 *   servers there are. So a change touches only the arcs next to the tokens that came or went.
 * Tradeoffs: One token per server gives very uneven arcs; many tokens per server even them out
 *   but cost memory and make the token list longer to search and to ship around. The ring
 *   spreads keys, not load: one very popular key still lands on one server.
 * Staff notes: Moving a key's data is a migration, not a pointer flip: the new owner must
 *   stream the data in while the old one keeps serving, and reads may need to check both until
 *   the copy is done. Every client and server must agree on the token list, so it is usually
 *   stored and versioned somewhere (a config service, or gossip). Weight a bigger server by
 *   giving it more tokens. Hot keys need a separate fix (caching, or splitting the key).
 * Interview signals: "distributed cache", "shard by user id", "add servers without
 *   reshuffling", "minimise data movement", "partitioning a key-value store".
 * Real world: Amazon's Dynamo paper (2007) describes a ring with virtual nodes. Apache
 *   Cassandra places nodes on a token ring and has supported several tokens per node (vnodes)
 *   for many years. Client libraries for memcached (ketama) use a ring of hashed points.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why Hash values live in [0, 2^32). Positions on the ring are these numbers, wrapping from the top back to 0.
const RING = 2 ** 32;

export type Token = { hash: number; node: string };
export type Tracked = { key: string; hash: number; owner: string; before?: string };

// Not exported, so the visualizer runs it silently: one hash is one step, not a loop of them.
class Hash {
  /** 32-bit FNV-1a over the characters, then a final mix (from MurmurHash3). */
  static of(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    // @why FNV-1a alone leaves similar strings ("A-1", "A-2") close together; the mix spreads them around the whole ring.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
}

export class ConsistentHashRing {
  // @viz ring:tokens,keys hide:key,hash,lo,hi,mid,i,owner,moved,node,vnodes,servers,k
  // @why Kept sorted by hash, so "first token clockwise" is a binary search instead of a scan.
  tokens: Token[] = [];
  // @why A sample of keys to watch. The ring itself does not store keys; this is only to see who owns what.
  keys: Tracked[] = [];
  // @why Tokens per server. One token gives uneven arcs; more tokens average them out.
  vnodes: number;

  constructor(vnodes: number) {
    this.vnodes = vnodes;
  }

  addNode(node: string) {
    for (let i = 0; i < this.vnodes; i++) {
      // @why Each token is the hash of a different name, so one server's tokens land at unrelated places on the ring.
      this.tokens.push({ hash: Hash.of(`${node}-${i}`), node }); // @mark token
    }
    this.tokens.sort((a, b) => a.hash - b.hash); // @mark sorted
  }

  removeNode(node: string) {
    // @why Only this server's tokens go. The keys on its arcs now reach the next token clockwise; nobody else's arcs change.
    this.tokens = this.tokens.filter((t) => t.node !== node); // @mark remove
  }

  lookup(key: string): string {
    const hash = Hash.of(key); // @mark hash
    // Binary search: the first token whose hash is at or after the key's hash.
    let lo = 0;
    let hi = this.tokens.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.tokens[mid].hash < hash) lo = mid + 1;
      else hi = mid;
    }
    let i = lo;
    // @why Past the last token the circle wraps: the owner is the first token after 0.
    if (i === this.tokens.length) {
      i = 0; // @mark wrap
    }
    const owner = this.tokens[i].node; // @mark owner
    return owner;
  }

  track(keys: string[]) {
    this.keys = [];
    for (const key of keys) this.keys.push({ key, hash: Hash.of(key), owner: this.lookup(key) });
  }

  /** Looks every tracked key up again after a change; returns how many changed server. */
  rebalance(): number {
    let moved = 0;
    for (const k of this.keys) {
      // @why Remember the old owner, so a moved key can be told apart from one that stayed.
      k.before = k.owner;
      k.owner = this.lookup(k.key);
      if (k.owner !== k.before) {
        moved++; // @mark moved
      }
    }
    return moved;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: the server is hash mod N, so changing N changes the answer for most keys.
export class ModNSharder extends ConsistentHashRing {
  servers: string[] = [];

  addNode(node: string) {
    this.servers.push(node);
  }

  removeNode(node: string) {
    this.servers = this.servers.filter((s) => s !== node);
  }

  lookup(key: string): string {
    const hash = Hash.of(key);
    return this.servers[hash % this.servers.length]; // @mark modn
  }
}

const SERVERS = ["A", "B", "C"];

function sampleKeys(n: number, prefix = "user:"): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= n; i++) keys.push(`${prefix}${i}`);
  return keys;
}

function build(vnodes: number, servers: string[], tracked: number, modN = false) {
  const ring = modN ? new ModNSharder(1) : new ConsistentHashRing(vnodes);
  for (const s of servers) ring.addNode(s);
  ring.track(sampleKeys(tracked));
  return ring;
}

function ownersOf(ring: ConsistentHashRing, n: number): string[] {
  const owners: string[] = [];
  for (const key of sampleKeys(n, "k")) owners.push(ring.lookup(key));
  return owners;
}

function movedFraction(before: string[], after: string[]): number {
  let moved = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) moved++;
  return moved / before.length;
}

/** Each server's fraction of n keys, as a sorted list. */
function sharesOf(ring: ConsistentHashRing, servers: string[], n: number): number[] {
  const owners = ownersOf(ring, n);
  return servers.map((s) => owners.filter((o) => o === s).length / n).sort((a, b) => a - b);
}

/** The owner by brute force: the smallest token at or after the hash, or else the smallest token. */
function firstClockwise(tokens: Token[], hash: number): string {
  let best: Token | undefined;
  let lowest = tokens[0];
  for (const t of tokens) {
    if (t.hash < lowest.hash) lowest = t;
    if (t.hash >= hash && (!best || t.hash < best.hash)) best = t;
  }
  return (best ?? lowest).node;
}

function hashOf(key: string, ring: ConsistentHashRing): number {
  return ring.keys.find((k) => k.key === key)?.hash ?? -1;
}

test("lookup: a key belongs to the first server clockwise from its hash", () => {
  const ring = build(1, SERVERS, 12);
  const first = ring.lookup("user:1");
  const wrapped = ring.lookup("user:7");
  assert.equal(first, firstClockwise(ring.tokens, hashOf("user:1", ring)));
  assert.equal(wrapped, firstClockwise(ring.tokens, hashOf("user:7", ring)));
  // user:7 hashes past the last token, so it wraps around to the first one.
  assert.ok(hashOf("user:7", ring) > Math.max(...ring.tokens.map((t) => t.hash)));
  assert.ok(hashOf("user:7", ring) < RING);
});

test("add a server: only about a quarter of keys move", () => {
  const ring = build(32, SERVERS, 24);
  const before = ownersOf(ring, 10_000);
  ring.addNode("D");
  const moved = ring.rebalance();
  const fraction = movedFraction(before, ownersOf(ring, 10_000));
  assert.ok(fraction > 0.15 && fraction < 0.35, `moved ${fraction}`);
  // Every key that moved went to the new server.
  assert.ok(moved > 0);
  assert.ok(ring.keys.filter((k) => k.owner !== k.before).every((k) => k.owner === "D"));
});

test("remove a server: only its keys move", () => {
  const ring = build(32, [...SERVERS, "D"], 24);
  const hadB = ring.keys.filter((k) => k.owner === "B").length;
  ring.removeNode("B");
  const moved = ring.rebalance();
  assert.ok(hadB > 0);
  assert.equal(moved, hadB);
  assert.ok(ring.keys.filter((k) => k.owner !== k.before).every((k) => k.before === "B"));
});

test("virtual nodes: more tokens per server even out the load", () => {
  const ring = new ConsistentHashRing(32);
  for (const s of SERVERS) ring.addNode(s);
  const one = sharesOf(build(1, SERVERS, 0), SERVERS, 10_000);
  const many = sharesOf(ring, SERVERS, 10_000);
  const ratio = (shares: number[]) => shares[shares.length - 1] / shares[0];
  assert.ok(ratio(many) < ratio(one), `32 tokens: ${ratio(many)}, 1 token: ${ratio(one)}`);
  assert.ok(ratio(many) < 1.5);
});

test("broken: hash mod N — adding a server moves most keys", () => {
  const sharder = build(1, SERVERS, 24, true);
  const before = ownersOf(sharder, 10_000);
  sharder.addNode("D");
  sharder.rebalance();
  const fraction = movedFraction(before, ownersOf(sharder, 10_000));
  assert.ok(fraction > 0.6, `moved ${fraction}`);
});

test("broken: one token per server — one server owns far more than its share", () => {
  const ring = new ConsistentHashRing(1);
  for (const s of SERVERS) ring.addNode(s);
  const shares = sharesOf(ring, SERVERS, 10_000);
  const even = 1 / SERVERS.length;
  assert.ok(shares[shares.length - 1] > 1.5 * even, `largest share ${shares[shares.length - 1]}`);
});
