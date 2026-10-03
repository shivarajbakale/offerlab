/**
 * 005. Bloom Filter
 * Level: Senior
 * Group: Probabilistic
 *
 * Problem: Answer "have I ever stored this key?" before doing an expensive lookup (a disk read,
 *   a network call), when most keys asked about were never stored. Keeping every key in memory
 *   to answer exactly costs as much memory as the keys themselves.
 *
 * Approach: Bit array plus k hash functions
 *   Keep m bits, all 0 at the start. To add an item, hash it k different ways, each hash
 *   picking one of the m bits, and set those k bits to 1. To check an item, look at its k bits:
 *   if any is 0, the item was never added (no false negatives); if all are 1, it was probably
 *   added, but the bits may have been set by other items (a false positive). The k positions
 *   come from two hashes, h1 + i·h2 (double hashing), so only two hashes are computed per item.
 *   The positions cycle every m / gcd(h2, m) steps, which only matters if that is fewer than k;
 *   keeping h2 coprime with m (odd, for m a power of two) means it never happens.
 *
 * Cost: O(k) time per add or check; m bits of memory whatever the size of the items. About 9.6
 *   bits per item with k = 7 gives about a 1% false positive rate.
 *
 * Pattern: probabilistic membership
 * Key insight: Bits only ever go from 0 to 1, so an added item's bits are always still set: "no"
 *   is always right. "Yes" can be wrong, and how often is set by how full the array is, which
 *   m (bits), n (items) and k (hashes) control: rate ≈ (1 − e^(−kn/m))^k.
 * Tradeoffs: No deletes: clearing an item's bits can clear bits another item needs. No listing
 *   of the items, and no counts. Too few hashes waste the bits; too many fill the array. The
 *   best k is about (m/n)·ln 2, which leaves the array about half full. Sized for n items, the
 *   rate climbs quickly once more than n are added.
 * Staff notes: A counting Bloom filter keeps a small counter per position instead of a bit,
 *   so removing decrements; it costs several times the memory and its counters can overflow.
 *   Size the filter for the largest n you expect; a filter cannot grow, so the fix for an
 *   overfull one is to build a bigger one from the source data (or stack filters). Cuckoo
 *   filters support deletes at similar sizes. Filters are cheap to ship: a server can send a
 *   client a filter of what it has.
 * Interview signals: "avoid disk reads for missing keys", "have we seen this URL/user before",
 *   "memory-efficient set", "false positives are acceptable", "cache penetration".
 * Real world: LSM-tree stores such as LevelDB, RocksDB and Cassandra keep a Bloom filter per
 *   on-disk table so a read can skip tables that cannot hold the key. Bloom's paper is from
 *   1970.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class BloomFilter {
  // @viz bits:bits,touched,verdict,newBits hide:item,verdict values:m,k,i,p,h1,h2
  m: number;
  k: number;
  // @why One bit per position instead of the items themselves: memory is m bits no matter how long the items are.
  bits: number[];
  // The k positions of the item being added or checked.
  touched: number[] = [];
  // The positions this add switched from 0 to 1 (the rest were already set by other items).
  newBits: number[] = [];
  verdict = "";

  constructor(m: number, k: number) {
    this.bits = new Array<number>(m).fill(0);
    this.m = m;
    this.k = k;
  }

  // @why The same item must always map to the same k positions, or a check would look at different bits than the add set.
  locate(item: string) {
    this.touched = [];
    this.newBits = [];
    const h1 = Hash.of(item, 1);
    // @why A step of 0 would make all k positions the same bit, so h2 runs from 1 to m−1.
    let h2 = 1 + (Hash.of(item, 2) % (this.m - 1));
    // @why The positions cycle every m / gcd(h2, m) steps (m = 32, h2 = 16: every 2), a problem only when that is fewer than k. Coprime h2 (odd, for m = 32) never cycles before m.
    while (Hash.gcd(h2, this.m) !== 1) h2++;
    for (let i = 0; i < this.k; i++) {
      // @why Double hashing: k positions from two hashes, about as good as k independent hashes.
      this.touched.push((h1 + i * h2) % this.m); // @mark hash
    }
  }

  add(item: string): number {
    this.locate(item);
    for (const p of this.touched) {
      if (this.bits[p] === 0) this.newBits.push(p);
      // @why Bits only go from 0 to 1. That is why an added item is always found again.
      this.bits[p] = 1; // @mark set
    }
    const had = this.k - this.newBits.length;
    this.verdict = `added "${item}": set ${this.newBits.length} new bit(s)${had ? `; ${had} already set by other items` : ""}`; // @mark added
    // @why How many bits were new. 0 means every bit was already set: the filter already said "maybe" for this item.
    return this.newBits.length;
  }

  mightContain(item: string): boolean {
    this.locate(item);
    for (const p of this.touched) {
      if (this.bits[p] === 0) {
        // @why One 0 is proof: adding the item would have set this bit, and bits are never cleared.
        this.verdict = `"${item}": bit ${p} is 0, so it was never added`; // @mark absent
        return false;
      }
    }
    // @why All k bits set is only "maybe": other items may have set every one of them.
    this.verdict = `"${item}": ${this.k === 1 ? "its one bit is" : `all ${this.k} bits are`} set, so maybe present`; // @mark maybe
    return true;
  }
}

// @why Not exported, so the visualizer runs it silently: hashing is the same arithmetic every time and is not the point here.
class Hash {
  // 32-bit FNV-1a with a seed, then a final mix so every input bit affects every output bit.
  static of(text: string, seed: number): number {
    let h = (0x811c9dc5 ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** Greatest common divisor: the largest number that divides both. 1 means no shared factor. */
  static gcd(a: number, b: number): number {
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: deletes by clearing the item's bits, which other items may share.
export class ClearingBloomFilter extends BloomFilter {
  remove(item: string): number {
    this.locate(item);
    for (const p of this.touched) this.bits[p] = 0;
    this.verdict = `removed "${item}" by clearing bits ${this.touched.join(", ")}, which other items may also need`; // @mark removed
    return this.touched.length;
  }
}

// Broken on purpose: one hash function, so each item sets a single bit.
export class SingleHashBloomFilter extends BloomFilter {
  constructor(m: number) {
    super(m, 1);
  }
}

const FRUITS = ["apple", "banana", "cherry", "date", "elderberry", "fig"];

function addAll(filter: BloomFilter, items: string[]) {
  for (const item of items) filter.add(item);
}

const users = (n: number) => Array.from({ length: n }, (_, i) => `user-${i}`);
const guests = (n: number) => Array.from({ length: n }, (_, i) => `guest-${i}`);

/** Share of never-added items that the filter says might be present. */
function falsePositiveRate(filter: BloomFilter, trials: number): number {
  let yes = 0;
  for (const g of guests(trials)) if (filter.mightContain(g)) yes++;
  return yes / trials;
}

function filled(m: number, k: number, n: number, make = (mm: number, kk: number) => new BloomFilter(mm, kk)) {
  const f = make(m, k);
  addAll(f, users(n));
  return f;
}

/** Items whose k positions include the same bit twice (there should be none). */
function repeatedPositions(filter: BloomFilter, items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    filter.locate(item);
    if (new Set(filter.touched).size !== filter.touched.length) out.push(`${item}: ${filter.touched.join(", ")}`);
  }
  return out;
}

/** The first never-added guest that the filter wrongly says might be present. */
function firstFalsePositive(filter: BloomFilter): string {
  return guests(10_000).find((g) => filter.mightContain(g))!;
}

test("double hashing: an item's k positions are all different", () => {
  // With h2 sharing no factor with m, the k positions never repeat (for k up to m).
  const f = new BloomFilter(32, 8);
  f.locate("apple");
  assert.equal(new Set(f.touched).size, 8);
  assert.deepEqual(repeatedPositions(f, [...FRUITS, ...users(200)]), []);
});

test("add and check: an added item is always found", () => {
  const f = new BloomFilter(32, 3);
  f.add("apple");
  f.add("banana");
  f.add("cherry");
  assert.equal(f.mightContain("banana"), true);
  // apple and banana share bit 8: the second add found it already set.
  assert.ok(f.touched.includes(8));
  for (const item of ["apple", "cherry"]) assert.equal(f.mightContain(item), true);
});

test("absent: an item never added is usually reported absent", () => {
  const f = new BloomFilter(32, 3);
  addAll(f, FRUITS);
  assert.equal(f.mightContain("grape"), false);
  // Over a thousand never-added items, most hit at least one 0 bit.
  const rate = falsePositiveRate(f, 1000);
  assert.ok(rate < 0.2, `false positive rate ${rate}`);
});

test("false positive: every bit was already set by other items", () => {
  const f = new BloomFilter(32, 3);
  addAll(f, FRUITS);
  assert.ok(!FRUITS.includes("quail"));
  // quail maps to bits 6, 31 and 24: set by date, by banana and cherry, and by elderberry.
  assert.equal(f.mightContain("quail"), true);
  assert.deepEqual(f.touched, [6, 31, 24]);
});

test("sizing: about ten bits per item and seven hashes give about 1% false positives", () => {
  // 200 bits for 20 items: 10 bits per item. Watch the last add and two checks.
  const f = new BloomFilter(200, 7);
  addAll(f, users(19));
  f.add("user-19");
  f.mightContain("user-7");
  f.mightContain("guest-1");
  const ones = f.bits.filter((b) => b === 1).length;
  // The best k leaves about half the bits set.
  assert.ok(ones > 80 && ones < 120, `${ones} of 200 bits set`);
  // Measured on a bigger filter with the same ratio: 10,000 bits, 1,000 items.
  const rate = falsePositiveRate(filled(10_000, 7, 1000), 20_000);
  assert.ok(rate > 0.003 && rate < 0.03, `false positive rate ${rate}`);
});

test("broken: delete by clearing bits — another item disappears", () => {
  const f = new ClearingBloomFilter(32, 3);
  f.add("apple");
  f.add("banana");
  f.remove("banana");
  // apple was added and never removed, but banana's removal cleared bit 8, which apple needs.
  assert.equal(f.mightContain("apple"), false);
});

test("broken: one hash function — many more false positives", () => {
  // The same 10 bits per item, but each item sets one bit instead of seven.
  const f = new SingleHashBloomFilter(200);
  addAll(f, users(20));
  const word = firstFalsePositive(f);
  assert.equal(f.mightContain(word), true);
  const one = falsePositiveRate(filled(10_000, 1, 1000, (m) => new SingleHashBloomFilter(m)), 20_000);
  const seven = falsePositiveRate(filled(10_000, 7, 1000), 20_000);
  assert.ok(one > 0.05 && one > 5 * seven, `one hash ${one}, seven hashes ${seven}`);
});
