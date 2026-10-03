/**
 * 013. Window Rate Limiters
 * Level: Senior
 * Group: Traffic
 *
 * Problem: Enforce "at most `limit` requests per `size` seconds" for each client. The obvious
 *   way, counting requests per clock-aligned window, lets twice the limit through when a
 *   burst straddles the boundary between two windows.
 *
 * Approach: Fixed window, sliding log, sliding counter
 *   A fixed window keeps one counter for the current window (for example the current second)
 *   and resets it when the next window starts. A sliding log keeps the timestamp of every
 *   accepted request and counts those in the last `size` seconds: exact, but memory grows
 *   with the limit. A sliding counter keeps just two counters, this window's and the previous
 *   window's, and estimates the last `size` seconds as
 *   previous × (share of the previous window still inside the last `size` seconds) + current.
 *
 * Cost: fixed window and sliding counter are O(1) time and one or two counters per client;
 *   the sliding log is O(limit) memory per client and O(evicted) time per request.
 *
 * Pattern: rate limiting
 * Key insight: What matters is how many requests fall in any `size`-second stretch, not in
 *   each calendar window. The log answers that exactly; the weighted counter approximates it
 *   by assuming the previous window's requests were spread evenly.
 * Tradeoffs: Fixed window is cheapest but allows up to 2 × limit across a boundary. Sliding
 *   log is exact but stores up to `limit` timestamps per client. Sliding counter costs two
 *   counters and blocks most of a boundary burst, but bunched traffic on both sides of the
 *   boundary can still get close to 2 × limit through in the worst case.
 * Staff notes: Pick the sliding counter for most API limits: close on real traffic, and two
 *   counters per key. Use the log only for small limits where exactness matters (logins per hour). In a
 *   shared store each key's counters need an expiry so idle clients cost nothing, and the
 *   read-check-increment must be atomic. Compared with a token bucket (012), windows express
 *   "N per period" quotas directly but have no separate burst setting.
 * Interview signals: "N requests per minute", "API quota", "design a rate limiter",
 *   "boundary problem", "memory per user".
 * Real world: Cloudflare has written about using a sliding window counter, with a weighted
 *   previous-window count, for its rate limiting; a sorted set of timestamps per key is a
 *   common way to build a sliding log in Redis.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Request = { t: number; ok: boolean; row?: string; label?: string };
type Point = { t: number; v: number };
type Band = { from: number; to: number | null; state: string };

export class FixedWindow {
  // @viz timeline:history,counted,windows,limit
  // @why Most requests allowed in one window.
  limit: number;
  // @why Window length in seconds. Windows are aligned to the clock: [0, 1), [1, 2), ...
  size: number;
  // @why Start time of the window `count` belongs to. -1 means no window yet.
  windowStart = -1;
  // @why Requests accepted in the current window. This one number is all the memory a fixed window needs.
  count = 0;
  history: Request[] = [];
  // @why For the picture only: the count over time, and each window as a band.
  counted: Point[] = [];
  windows: Band[] = [];

  constructor(limit: number, size: number) {
    this.limit = limit;
    this.size = size;
  }

  allow(t: number): boolean {
    const start = Math.floor(t / this.size) * this.size;
    if (start !== this.windowStart) {
      // @why A new window starts from zero, whatever happened a moment ago in the old one.
      this.count = 0; // @mark reset
      this.windowStart = start;
      this.counted.push({ t, v: 0 });
      if (this.windows.length) this.windows[this.windows.length - 1].to = start;
      this.windows.push({ from: start, to: null, state: `window ${start}–${start + this.size}` });
    }
    if (this.count < this.limit) {
      this.count++;
      this.history.push({ t, ok: true, label: `${this.count} of ${this.limit} in this window` }); // @mark count
      this.counted.push({ t, v: this.count });
      return true;
    }
    this.history.push({ t, ok: false, label: `window already has ${this.count}` });
    return false;
  }
}

export class SlidingLog {
  limit: number;
  size: number;
  // @why The time of every accepted request still inside the last `size` seconds, oldest first. Exact, but one entry per request.
  log: number[] = [];
  history: Request[] = [];
  counted: Point[] = [];

  constructor(limit: number, size: number) {
    this.limit = limit;
    this.size = size;
  }

  allow(t: number): boolean {
    // @why Forget requests older than `size` seconds. What is left is exactly the requests in the last `size` seconds.
    while (this.log.length > 0 && this.log[0] <= t - this.size) {
      this.log.shift(); // @mark evict
    }
    if (this.log.length < this.limit) {
      this.log.push(t);
      this.history.push({ t, ok: true, label: `${this.log.length} in the last ${this.size}s` }); // @mark record
      this.counted.push({ t, v: this.log.length });
      return true;
    }
    this.history.push({ t, ok: false, label: `already ${this.log.length} since t=${this.log[0]}` }); // @mark logReject
    this.counted.push({ t, v: this.log.length });
    return false;
  }
}

export class SlidingCounter {
  limit: number;
  size: number;
  // @why Start of the current window, as in the fixed window.
  currStart = -1;
  // @why Accepted in the current window.
  currCount = 0;
  // @why Accepted in the window just before. Kept so the start of a new window is not a fresh start.
  prevCount = 0;
  history: Request[] = [];
  counted: Point[] = [];
  windows: Band[] = [];

  constructor(limit: number, size: number) {
    this.limit = limit;
    this.size = size;
  }

  allow(t: number): boolean {
    const start = Math.floor(t / this.size) * this.size;
    if (start !== this.currStart) {
      // @why The old current window becomes the previous one, unless a whole window went by with no requests at all.
      this.prevCount = start - this.currStart === this.size ? this.currCount : 0; // @mark roll
      this.currCount = 0;
      this.currStart = start;
      if (this.windows.length) this.windows[this.windows.length - 1].to = start;
      this.windows.push({ from: start, to: null, state: `window ${start}–${start + this.size}` });
    }
    // @why The share of the previous window that still lies inside the last `size` seconds: 1 at the start of a window, 0 at its end.
    const weight = (this.size - (t - start)) / this.size;
    // @why Assumes the previous window's requests were spread evenly, so `weight` of them are still recent.
    const estimate = this.prevCount * weight + this.currCount; // @mark estimate
    this.counted.push({ t, v: Math.round(estimate * 100) / 100 });
    if (estimate < this.limit) {
      this.currCount++;
      this.history.push({ t, ok: true, label: `estimate ${Math.round(estimate * 100) / 100} < ${this.limit}` }); // @mark admit
      return true;
    }
    this.history.push({ t, ok: false, label: `estimate ${Math.round(estimate * 100) / 100} ≥ ${this.limit}` }); // @mark block
    return false;
  }
}

// --- helpers for the scenarios ---

type Limiter = { allow(t: number): boolean };

// Two bursts of 5, one just before the boundary at t=1 and one just after it: 10 requests in 0.18 s.
const BOUNDARY_BURST = [0.9, 0.92, 0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06, 1.08];

// Quiet: the most accepted requests found in any `size`-second stretch.
function mostInAnyWindow(history: Request[], size: number): number {
  const ok = history.filter((r) => r.ok).map((r) => r.t);
  let most = 0;
  for (const from of ok) most = Math.max(most, ok.filter((t) => t >= from && t < from + size).length);
  return most;
}

// Quiet: the same traffic through another limiter, for comparison only.
function sendAll(limiter: Limiter, times: number[]): boolean[] {
  return times.map((t) => limiter.allow(t));
}

// Quiet: the sliding counter's real worst case. The previous window's requests all sit at its
// very end, and the current window's come late, when that window's weight has faded.
function slidingCounterWorstCase(): number {
  const c = new SlidingCounter(5, 1);
  sendAll(c, [0.99, 0.99, 0.99, 0.99, 0.99, 1.6, 1.61, 1.62, 1.85, 1.86, 1.87, 1.88, 1.89, 1.9]);
  return mostInAnyWindow(c.history, 1);
}

test("fixed window: the count resets at the boundary", () => {
  // At most 3 requests per 1-second window.
  const w = new FixedWindow(3, 1);
  const results = [w.allow(0.1), w.allow(0.3), w.allow(0.5), w.allow(0.7), w.allow(1.2)];
  assert.deepEqual(results, [true, true, true, false, true]);
  assert.equal(w.count, 1, "the new window started counting from zero");
});

test("broken: fixed window — twice the limit gets through across a boundary", () => {
  // At most 5 per second, but 10 requests in 0.18 s all pass.
  const w = new FixedWindow(5, 1);
  const results = BOUNDARY_BURST.map((t) => w.allow(t));
  assert.equal(results.filter(Boolean).length, 10);
  assert.equal(mostInAnyWindow(w.history, 1), 10, "10 accepted within one second: twice the limit");
});

test("sliding log: exact, but stores every timestamp", () => {
  const s = new SlidingLog(5, 1);
  const burst = BOUNDARY_BURST.map((t) => s.allow(t));
  assert.deepEqual(burst, [true, true, true, true, true, false, false, false, false, false]);
  assert.equal(s.log.length, 5, "one stored timestamp per accepted request: memory grows with the limit");
  // A second after the first request, it drops out of the log and a new request fits.
  assert.equal(s.allow(1.91), true);
  assert.deepEqual(s.log, [0.92, 0.94, 0.96, 0.98, 1.91]);
  assert.ok(mostInAnyWindow(s.history, 1) <= 5);
});

test("sliding counter: a weighted estimate blocks the boundary burst with two counters", () => {
  const c = new SlidingCounter(5, 1);
  const burst = BOUNDARY_BURST.map((t) => c.allow(t));
  const fixed = sendAll(new FixedWindow(5, 1), BOUNDARY_BURST);
  // Of the second burst, only one request gets through: the estimate is off by one, because
  // the previous window's 5 requests were bunched at its end, not spread evenly.
  assert.deepEqual(burst.slice(5), [false, true, false, false, false]);
  assert.equal(mostInAnyWindow(c.history, 1), 6);
  // Off by one here, but not always: bunched traffic on both sides gets close to twice the limit.
  assert.equal(slidingCounterWorstCase(), 10, "10 accepted within one second against a limit of 5");
  assert.ok(burst.filter(Boolean).length < fixed.filter(Boolean).length);
  // Later in the window, the previous window's weight has faded and requests pass again.
  assert.equal(c.allow(1.5), true);
  assert.equal(c.prevCount, 5);
  assert.equal(c.currCount, 2);
});
