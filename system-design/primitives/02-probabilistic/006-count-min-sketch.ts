/**
 * 006. Count-Min Sketch
 * Level: Staff
 * Group: Probabilistic
 *
 * Problem: Count how often each item turns up in a stream far too large to keep a counter per
 *   distinct item (every search query, every IP address hitting a service), and find the most
 *   frequent ones (heavy hitters).
 *
 * Approach: Rows of shared counters, read with a minimum
 *   Keep d rows of w counters, all 0, and one hash per row. Adding an item adds to one counter
 *   in each row, the one its row's hash picks. Each counter is shared by every item that hashes
 *   there, so it holds the item's count plus whatever collided with it: it can only be too high,
 *   never too low. Estimating takes the smallest of the item's d counters, the one polluted
 *   least. A small sorted list of the items with the highest estimates gives the heavy hitters.
 *
 * Cost: O(d) per add or estimate; d·w counters of memory, fixed in advance, however many
 *   distinct items there are.
 *
 * Pattern: probabilistic counting, streaming
 * Key insight: Collisions only ever add, so every counter is an upper bound, and the minimum
 *   over independent rows is the tightest one. With w = e/ε and d = ln(1/δ), an estimate is
 *   too high by more than ε times the stream's total count with probability at most δ.
 * Tradeoffs: Errors are relative to the whole stream, so heavy items are estimated well and
 *   light items can be off by more than their own count. Width buys accuracy, depth buys
 *   confidence. Subtracting is safe only to undo adds that really happened (no arbitrary
 *   deletes), and a counter cannot say which items it holds.
 * Staff notes: Conservative update (raise only the counters that are at the current minimum)
 *   cuts overestimates a lot, but rules out decrements. For "top items in the last hour", keep
 *   one sketch per time slice and drop the oldest; sketches with the same width, depth and
 *   hashes merge by adding counters, so slices or shards combine cheaply. Count-min suits
 *   heavy hitters; for rare items, the error swamps the signal.
 * Interview signals: "top K in a stream", "trending hashtags", "heavy hitters", "frequency with
 *   bounded memory", "per-IP rate abuse detection", "approximate counts are fine".
 * Real world: Cormode and Muthukrishnan described it in 2005. The Caffeine Java cache's TinyLFU
 *   policy keeps a count-min style frequency sketch to decide which entries are worth caching.
 *   RedisBloom, a Redis module, offers CMS.INCRBY and CMS.QUERY.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class CountMinSketch {
  // @viz bits:rows,touched,verdict hide:item,verdict values:depth,width,topK,r,c,n,best
  depth: number;
  width: number;
  topK: number;
  // @why d rows of w counters instead of one counter per distinct item.
  rows: number[][];
  // The [row, column] counters of the item being added or estimated.
  touched: [number, number][] = [];
  verdict = "";
  // @why The current heavy hitters, highest estimate first. Without it, finding them would mean estimating every item ever seen, and the sketch does not remember which items those were.
  top = new Map<string, number>();

  constructor(depth: number, width: number, topK = 3) {
    this.rows = Array.from({ length: depth }, () => new Array<number>(width).fill(0));
    this.depth = depth;
    this.width = width;
    this.topK = topK;
  }

  add(item: string, n = 1) {
    this.touched = [];
    // @why Say what is happening now, so the previous item's verdict is not left on screen.
    this.verdict = `adding "${item}"${n === 1 ? "" : ` ${n} times`}: one counter in each row goes up by ${n}`;
    for (let r = 0; r < this.depth; r++) {
      // @why Each row has its own hash, so two items that share a counter in one row rarely share one in every row.
      const c = Hash.of(item, r + 1) % this.width;
      this.touched.push([r, c]);
      // @why One counter per row, shared with every item that hashes there: memory is fixed however many distinct items arrive.
      this.rows[r][c] += n; // @mark bump
    }
    this.updateTop(item);
  }

  estimate(item: string): number {
    this.touched = [];
    let best = Infinity;
    const seen: number[] = [];
    for (let r = 0; r < this.depth; r++) {
      const c = Hash.of(item, r + 1) % this.width;
      this.touched.push([r, c]);
      seen.push(this.rows[r][c]);
      // @why Every counter is the item's count plus collisions, so each is too high or exact. The smallest is the least polluted.
      best = Math.min(best, this.rows[r][c]);
    }
    this.verdict = `"${item}": its counters hold ${seen.join(", ")}, so the estimate is the smallest, ${best}`; // @mark estimate
    return best;
  }

  // @why Keeps the heavy hitters without a counter per item: only topK names are remembered, checked on each add.
  updateTop(item: string): number {
    const count = this.estimate(item);
    const entries = [...this.top].filter(([name]) => name !== item);
    entries.push([item, count]);
    entries.sort((a, b) => b[1] - a[1]);
    this.top = new Map(entries.slice(0, this.topK));
    this.verdict = `"${item}" estimated at ${count}; top ${this.topK}: ${[...this.top].map(([name, n]) => `${name} ${n}`).join(", ")}`; // @mark top
    return count;
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
}

// --- helpers for the scenarios ---

// Broken on purpose: one row, so nothing can outvote a collision.
export class OneRowSketch extends CountMinSketch {
  constructor(width: number, topK = 3) {
    super(1, width, topK);
  }
}

/** mulberry32: a small seeded random number generator, so every run sees the same stream. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A skewed stream: word i turns up about 1/(i+1) as often as word 0. */
function skewedStream(length: number, distinct: number, seed: number): string[] {
  const weights = Array.from({ length: distinct }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const next = rng(seed);
  const out: string[] = [];
  for (let s = 0; s < length; s++) {
    let u = next() * total;
    let i = 0;
    while (u >= weights[i] && i < distinct - 1) u -= weights[i++];
    out.push(`w${i}`);
  }
  return out;
}

function feed(sketch: CountMinSketch, stream: string[]) {
  for (const item of stream) sketch.add(item);
}

function trueCounts(stream: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of stream) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Items whose estimate is below their true count (there should be none). */
function underestimated(sketch: CountMinSketch, counts: Map<string, number>): string[] {
  return [...counts].filter(([item, n]) => sketch.estimate(item) < n).map(([item]) => item);
}

/** Average amount by which the estimate exceeds the true count, over every distinct item. */
function meanOverestimate(depth: number, width: number, stream: string[]): number {
  const sketch = new CountMinSketch(depth, width);
  feed(sketch, stream);
  const counts = trueCounts(stream);
  let over = 0;
  for (const [item, n] of counts) over += sketch.estimate(item) - n;
  return over / counts.size;
}

function trueTop(counts: Map<string, number>, k: number): string[] {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, k).map(([item]) => item);
}

test("estimate: never below the true count", () => {
  const sketch = new CountMinSketch(4, 16);
  const stream = skewedStream(1000, 100, 1);
  feed(sketch, stream);
  sketch.add("apple");
  sketch.add("apple", 2);
  const est = sketch.estimate("apple");
  assert.ok(est >= 3, `apple estimated at ${est}`);
  const counts = trueCounts(stream);
  counts.set("apple", 3);
  assert.deepEqual(underestimated(sketch, counts), []);
});

test("collision: a light item is overestimated by what it collides with", () => {
  const sketch = new CountMinSketch(2, 8);
  sketch.add("cat", 20);
  sketch.add("dog", 5);
  sketch.add("cow", 3);
  sketch.add("zebra");
  // zebra shares row 0's counter with cow, and row 1's with cat and dog.
  assert.deepEqual(sketch.touched, [[0, 2], [1, 3]]);
  assert.equal(sketch.estimate("zebra"), 4);
});

test("min of rows: more rows tighten the estimate", () => {
  const stream = skewedStream(2000, 200, 2);
  const sketch = new CountMinSketch(4, 16);
  feed(sketch, stream);
  const est = sketch.estimate("w150");
  const seen = sketch.touched.map(([r, c]) => sketch.rows[r][c]);
  assert.equal(est, Math.min(...seen));
  assert.ok(Math.max(...seen) > est, "the rows disagree, and the smallest is kept");
  const one = meanOverestimate(1, 16, stream);
  const two = meanOverestimate(2, 16, stream);
  const four = meanOverestimate(4, 16, stream);
  assert.ok(four < two && two < one, `mean overestimate: 1 row ${one}, 2 rows ${two}, 4 rows ${four}`);
});

test("heavy hitters: top 3 found in a skewed stream", () => {
  const sketch = new CountMinSketch(4, 16);
  const stream = skewedStream(3000, 300, 3);
  feed(sketch, stream);
  sketch.add("w2");
  const counts = trueCounts([...stream, "w2"]);
  assert.deepEqual([...sketch.top.keys()], trueTop(counts, 3));
});

test("broken: one row — collisions turn a light item into a false heavy hitter", () => {
  const sketch = new OneRowSketch(16);
  sketch.add("apple", 50);
  sketch.add("banana", 30);
  sketch.add("cherry", 20);
  // eel is seen once, but its only counter is apple's.
  sketch.add("eel");
  assert.deepEqual([...sketch.top.keys()], ["eel", "apple", "banana"]);
  // With four rows, eel's other counters are untouched and it stays out.
  const four = new CountMinSketch(4, 16);
  for (const [item, n] of [["apple", 50], ["banana", 30], ["cherry", 20], ["eel", 1]] as const) four.add(item, n);
  assert.deepEqual([...four.top.keys()], ["apple", "banana", "cherry"]);
});
