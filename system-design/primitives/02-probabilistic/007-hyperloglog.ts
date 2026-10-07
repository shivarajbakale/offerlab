/**
 * 007. HyperLogLog
 * Level: Staff
 * Group: Probabilistic
 *
 * Problem: Count how many distinct items a huge stream holds (unique visitors, distinct search
 *   queries, distinct IPs) without remembering the items: a set of a billion IDs takes many
 *   gigabytes, and two such sets cannot be combined cheaply.
 *
 * Approach: Many short memories of "the luckiest hash seen", combined with a harmonic mean
 *   Hash each item to 32 random-looking bits. The first b bits pick one of m = 2^b registers.
 *   In the remaining bits, the position of the first 1 (its rank) is like a run of coin flips:
 *   a rank of r turns up about once in 2^r items. Each register keeps the largest rank it has
 *   seen. One register alone is a very noisy guess, so m registers each guess for their share
 *   of the stream, and their guesses are combined with a harmonic mean, which a single unlucky
 *   register cannot drag up. When many registers are still 0, counting the empty registers
 *   (linear counting) is more accurate, and that is used instead.
 *
 * Cost: O(1) per add; O(m) per estimate and per merge; m small registers of memory (a few bits
 *   each). The standard error is about 1.04/√m: 64 registers give about 13%, 16,384 about 0.8%.
 *
 * Pattern: probabilistic counting, cardinality estimation
 * Key insight: A duplicate hashes to the same register and the same rank, so it changes
 *   nothing: the registers depend only on the set of distinct items. And because a register is
 *   a max, two sketches merge exactly by taking the larger value of each register.
 * Tradeoffs: Gives a count, not membership: it cannot say whether a given item was seen.
 *   Error is relative (a percentage of the true count), so it stays useful from thousands to
 *   billions (with a 64-bit hash). No deletes. Intersections can only be estimated from unions, and badly when the
 *   overlap is small.
 * Staff notes: Mergeability is the reason to use it: keep one sketch per hour or per shard
 *   and union any range on demand, which exact sets cannot do cheaply. A 32-bit hash has only
 *   about 4.3 billion values, so distinct items start to share a hash (and count once) well
 *   before that: the paper corrects for it above 2^32/30, about 143 million, and production
 *   versions use a 64-bit hash instead. Implementations use a sparse representation
 *   while few registers are set, and corrections for bias at small counts (HyperLogLog++).
 * Interview signals: "count unique visitors", "distinct count over a huge stream", "approximate
 *   COUNT(DISTINCT)", "daily and monthly actives from daily data", "memory per counter".
 * Real world: Flajolet, Fusy, Gandouet and Meunier published it in 2007. Redis offers PFADD,
 *   PFCOUNT and PFMERGE, using about 12 KB per key. Several analytics databases and query
 *   engines offer an approximate count-distinct function built on HyperLogLog.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class HyperLogLog {
  // @viz bits:registers,touched,verdict,title=HyperLogLog,unit=register,ask=ask,answer=answer,cost=cost,costLabel=How_far_off hide:item,verdict,ask,answer,cost values:b,m,j,rank,h,rest,sum,zeros,raw,alpha
  b: number;
  m: number;
  // @why m small numbers instead of the items: memory is the same for a thousand items or a billion.
  registers: number[];
  // The register the current item went to (or, after a merge, the registers that changed).
  touched: number[] = [];
  verdict = "";
  // For the picture: the real-world question, the sketch's answer, and how far off that answer can be.
  ask = "";
  answer = "";
  cost = "";

  constructor(b: number) {
    this.registers = new Array<number>(2 ** b).fill(0);
    this.b = b;
    // @caption A HyperLogLog sketch: {m === 1 ? "a single register" : m + " small registers"} in memory, all 0 at the start. It answers "how many different items have we seen?", such as unique visitors to a site, without remembering the items. {m === 1 ? "Every item's hash goes to that one register." : "The first " + b + " bits of each item's hash pick its register."}
    this.m = 2 ** b;
  }

  add(item: string): number {
    this.ask = `Seen "${item}": count it if it is new`;
    this.answer = this.cost = "";
    const h = Hash.of(item, 0);
    // @why The first b bits pick the register, so each register sees its own random 1/m share of the items.
    const j = h >>> (32 - this.b);
    // @why The other bits, moved to the front: these are the "coin flips" whose run of 0s is measured.
    const rest = (h << this.b) >>> 0;
    // @why Rank = position of the first 1. Rank r turns up about once in 2^r items, so a big rank hints at many items.
    const rank = Math.min(Math.clz32(rest), 32 - this.b) + 1;
    this.touched = [j];
    const bits = h.toString(2).padStart(32, "0");
    const shown = `${bits.slice(0, this.b)} ${bits.slice(this.b, this.b + Math.min(rank, 12))}…`;
    // @why Keep only the maximum: a duplicate gives the same rank again and changes nothing.
    if (rank > this.registers[j]) {
      this.registers[j] = rank;
      // @caption "{item}" hashes to {shown}. The first {b} bits pick register {j}. Then come {rank === 1 ? "no zeros" : rank === 2 ? "one zero" : rank - 1 + " zeros"} before the first 1: rank {rank}, which happens about once in {2 ** rank} items. That beats the register's best so far, so it goes up to {rank}. A big rank hints that many different items have passed.
      this.verdict = `"${item}": hash ${shown} → register ${j}, rank ${rank}; the register goes up to ${rank}`; // @mark keep
    } else {
      // @caption "{item}" lands in register {j} with rank {rank}, but the register already holds {registers[j]}, so nothing changes. A register keeps only its best rank. That is also why repeats are free: the same item always gives the same register and rank, so seeing it again can never raise anything.
      this.verdict = `"${item}": hash ${shown} → register ${j}, rank ${rank}; the register already holds ${this.registers[j]}, so nothing changes`; // @mark skip
    }
    return rank;
  }

  estimate(): number {
    // @caption How many different items so far? To answer, all {m} registers are read and combined into one estimate.
    this.touched = [];
    let sum = 0;
    let zeros = 0;
    for (const r of this.registers) {
      // @why Harmonic mean: summing 2^−r means a huge register adds almost nothing, while a plain average of 2^r would be dominated by it.
      sum += 2 ** -r;
      if (r === 0) zeros++;
    }
    // @why A correction for the bias of the harmonic mean, from the HyperLogLog paper.
    const alpha = this.m === 16 ? 0.673 : this.m === 32 ? 0.697 : this.m === 64 ? 0.709 : 0.7213 / (1 + 1.079 / this.m);
    const raw = (alpha * this.m * this.m) / sum;
    // @why With few items most registers are still 0 and the formula overshoots; counting the empty registers is more accurate there.
    this.ask = "How many different items so far?";
    this.cost = `Typically off by about ${Math.round(104 / Math.sqrt(this.m))}% with ${this.m} registers. It cannot say whether a given item was seen.`;
    if (raw <= 2.5 * this.m && zeros > 0) {
      const linear = this.m * Math.log(this.m / zeros);
      this.answer = `About ${Math.round(linear)}.`;
      // @caption How many different items so far? {zeros} of {m} registers are still 0, so only a few items have arrived. Counting the empty registers is more accurate here: {m} × ln({m}/{zeros}) ≈ {Math.round(linear * 10) / 10}, so about {Math.round(linear)} different items.
      this.verdict = `${zeros} of ${this.m} registers are still 0, so count from the empty ones: ${this.m} × ln(${this.m}/${zeros}) ≈ ${linear.toFixed(1)}`; // @mark linear
      return linear;
    }
    this.answer = `About ${Math.round(raw)}.`;
    // @caption How many different items so far? Each register's best rank is a rough guess for its 1/{m} share of the items. A harmonic mean combines the {m} guesses, so one lucky register cannot drag the total up: about {Math.round(raw)} different items, from {m} small numbers instead of a list of every item.
    this.verdict = `harmonic mean over ${this.m} registers: estimate ≈ ${Math.round(raw)}`; // @mark harmonic
    return raw;
  }

  // @why Each register is a max, and the max of maxes is the max over both streams: the merge is exact, and duplicates across the two count once.
  merge(other: HyperLogLog): number {
    // @caption Two sketches, say Monday's and Tuesday's visitors. To count the different visitors across both days, compare them register by register and keep the larger value.
    this.touched = [];
    for (let j = 0; j < this.m; j++) {
      if (other.registers[j] > this.registers[j]) {
        this.registers[j] = other.registers[j];
        this.touched.push(j);
      }
    }
    this.ask = "Combine with another sketch (another day, or another server)";
    this.answer = "good: Exact: the same registers as one sketch that saw both streams.";
    this.cost = "Nothing extra: an item seen in both streams still counts once.";
    // @caption good: Two sketches, say Monday's and Tuesday's visitors, combine by taking the larger value in each register: {touched.length} of {m} came from the other sketch. A visitor seen on both days gave the same register and rank in both, so it still counts once.
    this.verdict = `merged: ${this.touched.length} of ${this.m} registers were larger in the other sketch and were taken from it`; // @mark merge
    return this.touched.length;
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

// Broken on purpose: one register, so the estimate rests on the single longest run seen.
// Build it with b = 0: 2^0 = 1 register.
export class OneRegisterSketch extends HyperLogLog {
  add(item: string): number {
    this.ask = `Seen "${item}": count it if it is new`;
    this.answer = this.cost = "";
    const h = Hash.of(item, 0);
    const rank = Math.min(Math.clz32(h), 32) + 1;
    this.touched = [0];
    if (rank > this.registers[0]) this.registers[0] = rank;
    // @caption "{item}" has rank {rank}. With one register, the whole count rests on the single best rank ever seen, now {registers[0]}.
    this.verdict = `"${item}": rank ${rank}; the one register holds ${this.registers[0]}`;
    return rank;
  }

  estimate(): number {
    // 0.77351 is the correction from Flajolet and Martin's original single-register counter.
    const est = 2 ** this.registers[0] / 0.77351;
    this.ask = "How many different items so far?";
    this.answer = `bad: About ${Math.round(est)}.`;
    this.cost = "One register: one lucky or unlucky hash can move the answer by a factor of 2 or more.";
    // @caption bad: One register holding {registers[0]} says about 2^{registers[0]} / 0.77 ≈ {Math.round(est)} different items. The answer can only be a power of 2 (times 1.3), and one lucky hash doubles it while one missing hash halves it. Nothing averages that out.
    this.verdict = `one register holding ${this.registers[0]}: estimate 2^${this.registers[0]} / 0.77 ≈ ${Math.round(est)}`; // @mark one
    return est;
  }
}

// Broken on purpose: averages 2^register with an ordinary mean, which the largest register dominates.
export class ArithmeticMeanSketch extends HyperLogLog {
  estimate(): number {
    // @caption How many different items so far? This sketch combines its {m} registers with an ordinary average of 2^register instead of a harmonic mean. Watch what the biggest registers do to it.
    let sum = 0;
    let top = 0;
    for (let j = 0; j < this.m; j++) {
      sum += 2 ** this.registers[j];
      if (this.registers[j] > this.registers[top]) top = j;
    }
    this.touched = [top];
    // Same scale as the real estimate for 64 registers: α · m · (mean of 2^register) = 0.709 · sum.
    const est = 0.709 * sum;
    const share = Math.round((100 * 2 ** this.registers[top]) / sum);
    this.ask = "How many different items so far?";
    this.answer = `bad: About ${Math.round(est)}.`;
    this.cost = "An ordinary mean: one register with a lucky hash can multiply the answer.";
    // @caption bad: An ordinary average of 2^register says about {Math.round(est)} different items. Register {top} alone (2^{registers[top]}) is {share}% of the sum: {share >= 50 ? "one lucky hash decides the whole answer." : "the biggest registers drown out the rest."} The harmonic mean of these same registers says about {Math.round((0.709 * m * m) / registers.reduce((a, r) => a + 2 ** -r, 0))}.
    this.verdict = `ordinary mean of 2^register: estimate ≈ ${Math.round(est)}; register ${top} alone (2^${this.registers[top]}) is ${share}% of the sum`; // @mark mean
    return est;
  }
}

const users = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `user-${from + i}`);

function addAll(sketch: HyperLogLog, items: string[]) {
  for (const item of items) sketch.add(item);
}

function filled(b: number, items: string[]): HyperLogLog {
  const sketch = new HyperLogLog(b);
  addAll(sketch, items);
  return sketch;
}

/** The standard error of HyperLogLog with m registers is about 1.04 / √m; allow three of them. */
const bound = (m: number) => (3 * 1.04) / Math.sqrt(m);
const error = (estimate: number, truth: number) => Math.abs(estimate - truth) / truth;

test("register: keeps the longest run of leading zeros seen", () => {
  const sketch = new HyperLogLog(4);
  // fox hashes to 0100 0010…: register 4, then two 0s and a 1, so rank 3.
  assert.equal(sketch.add("fox"), 3);
  // owl also lands in register 4, but its rank is 1, so the register keeps 3.
  assert.equal(sketch.add("owl"), 1);
  assert.equal(sketch.registers[4], 3);
  // cat lands in register 15 with seven 0s before its first 1: rank 8, from a single item.
  assert.equal(sketch.add("cat"), 8);
  assert.equal(sketch.registers[15], 8);
  // Three items: most registers are still 0, so the estimate switches to linear counting.
  assert.ok(Math.abs(sketch.estimate() - 3) < 1);
});

test("estimate: 10,000 distinct items within the expected error", () => {
  const sketch = filled(6, users(0, 9999));
  sketch.add("user-9999");
  const est = sketch.estimate();
  assert.ok(error(est, 10_000) < bound(64), `estimate ${est}`);
});

test("duplicates: adding the same items again changes nothing", () => {
  const sketch = filled(6, users(0, 1000));
  const before = [...sketch.registers];
  const first = sketch.estimate();
  sketch.add("user-7");
  sketch.add("user-42");
  addAll(sketch, users(0, 1000));
  assert.deepEqual(sketch.registers, before);
  assert.equal(sketch.estimate(), first);
});

test("merge: the register-wise max counts the union", () => {
  const a = filled(6, users(0, 6000));
  const b = filled(6, users(4000, 10_000));
  a.merge(b);
  // Exactly the registers one sketch would have after seeing all 10,000 users.
  assert.deepEqual(a.registers, filled(6, users(0, 10_000)).registers);
  const est = a.estimate();
  assert.ok(error(est, 10_000) < bound(64), `estimate ${est}`);
});

test("broken: one register — the estimate is off by a large factor", () => {
  const sketch = new OneRegisterSketch(0);
  addAll(sketch, users(0, 9999));
  sketch.add("user-9999");
  const est = sketch.estimate();
  assert.ok(est > 2 * 10_000 || est < 10_000 / 2, `estimate ${est}`);
  assert.ok(error(filled(6, users(0, 10_000)).estimate(), 10_000) < bound(64));
});

test("broken: arithmetic mean — one unlucky register wrecks the estimate", () => {
  const items = users(0, 1000);
  const mean = new ArithmeticMeanSketch(6);
  addAll(mean, items);
  const harmonic = filled(6, items);
  const before = mean.estimate();
  assert.ok(before > 5 * 1000, `arithmetic mean estimate ${before}`);
  // lucky-58866 lands in register 24 with rank 19, as if a quarter of a million items had passed.
  assert.equal(mean.add("lucky-58866"), 19);
  const after = mean.estimate();
  assert.ok(after > 100 * 1001, `arithmetic mean estimate ${after}`);
  harmonic.add("lucky-58866");
  assert.ok(error(harmonic.estimate(), 1001) < bound(64));
});
