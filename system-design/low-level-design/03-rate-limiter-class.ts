/**
 * 03. Rate Limiter Class
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design a rate limiter class an API server can call before each request:
 *   allow(key) answers yes or no for that caller (a user id, an API key, an IP address). The
 *   limiting rule must be swappable (bursty clients want a token bucket, strict quotas want an
 *   exact window), each key must be limited on its own, a rejected caller must be told when to
 *   retry, and the whole thing must be testable without sleeping.
 *
 * Approach: A Strategy interface, one strategy object per key, made by a factory, and an
 *   injected clock
 *   `RateLimiter` owns a map from key to that key's limiter state. It does not know the rule:
 *   it is given a factory that makes a fresh `Strategy` for a new key, and asks that object
 *   tryAcquire(now). Two strategies implement the interface: a token bucket (capacity and
 *   refill rate, primitive 012) and a sliding log (exact count in the last window, primitive
 *   013). Each returns a Decision: allowed, how many are left, and retryAfterMs. Time comes
 *   from a Clock passed in, so tests step time by hand.
 *
 * Cost: token bucket O(1) time and two numbers per key; sliding log O(limit) memory per key and
 *   amortized O(1) time (each timestamp is added once and removed once).
 *
 * Pattern: strategy, factory, dependency injection (clock), per-key state
 * Key insight: Separate what changes from what does not. The bookkeeping (find the key's state,
 *   create it on first use, report the decision) is the same for every rule; the rule itself
 *   sits behind one method, tryAcquire(now). Passing `now` in, instead of reading the system
 *   clock, is what makes every rule testable to the millisecond.
 * Tradeoffs: A strategy object per key is simple but costs memory for every key ever seen; idle
 *   keys must be removed. The token bucket is cheap and allows bursts; the sliding log is exact
 *   but stores a timestamp per allowed request. A fixed window is cheapest of all but lets twice
 *   the limit through across a window boundary.
 * Staff notes: Interviewers probe extensibility (add a new rule without touching RateLimiter),
 *   concurrency (two threads calling allow for one key must not both take the last token: lock
 *   per key, or an atomic compare-and-set on the state), distribution (many servers need the
 *   state in a shared store, updated atomically there), memory (evict idle keys), and the HTTP
 *   contract (429 with Retry-After).
 * Interview signals: "design a rate limiter class", "make the algorithm pluggable", "per user
 *   limits", "how do you unit test it", "what if we add a new algorithm".
 * Real world: Libraries such as Bucket4j (token buckets) and Resilience4j keep limiter state per
 *   named limiter or per key, with the rule set by configuration. HTTP APIs answer a limited
 *   request with 429 Too Many Requests, often with a Retry-After header.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** Where time comes from. Production uses the real clock; tests use one they move by hand. */
export interface Clock {
  now(): number;
}

export class FakeClock implements Clock {
  t = 0;
  now(): number {
    return this.t;
  }
  set(ms: number) {
    this.t = ms;
  }
}

export type Decision = { allowed: boolean; remaining: number; retryAfterMs: number };

/** One key's limiting rule. RateLimiter only ever calls this. */
export interface Strategy {
  tryAcquire(nowMs: number): Decision;
}

export class TokenBucket implements Strategy {
  // @why Largest burst: the most tokens the bucket holds.
  capacity: number;
  // @why Tokens earned per millisecond: the long-run limit.
  perMs: number;
  tokens: number;
  last = 0;

  constructor(capacity: number, perSecond: number) {
    this.capacity = capacity;
    this.perMs = perSecond / 1000;
    this.tokens = capacity;
  }

  tryAcquire(nowMs: number): Decision {
    // @why Lazy refill, capped: tokens earned since the last call, never more than capacity (primitive 012).
    this.tokens = Math.min(this.capacity, this.tokens + (nowMs - this.last) * this.perMs);
    this.last = nowMs;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, remaining: Math.floor(this.tokens), retryAfterMs: 0 }; // @mark take
    }
    // @why When the bucket will next hold a whole token: the honest Retry-After.
    const wait = Math.ceil((1 - this.tokens) / this.perMs);
    return { allowed: false, remaining: 0, retryAfterMs: wait }; // @mark empty
  }
}

export class SlidingLog implements Strategy {
  limit: number;
  windowMs: number;
  // @why Times of the allowed requests in the last windowMs, oldest first. Exact, at one entry per request.
  log: number[] = [];

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  tryAcquire(nowMs: number): Decision {
    // @why Forget requests that are now more than windowMs old: what is left is exactly the last window (primitive 013).
    while (this.log.length > 0 && this.log[0] <= nowMs - this.windowMs) {
      this.log.shift(); // @mark forget
    }
    if (this.log.length < this.limit) {
      this.log.push(nowMs);
      return { allowed: true, remaining: this.limit - this.log.length, retryAfterMs: 0 }; // @mark logged
    }
    // @why A slot opens when the oldest logged request leaves the window.
    const wait = this.log[0] + this.windowMs - nowMs;
    return { allowed: false, remaining: 0, retryAfterMs: wait }; // @mark full
  }
}

type Event = { t: number; ok: boolean; row: string; label: string };

export class RateLimiter {
  // @viz timeline:history hide:clock,make,key
  // @why Makes the state for a key seen for the first time. The limiter never names a concrete rule.
  make: () => Strategy;
  clock: Clock;
  // @why One strategy object per key, so one noisy caller cannot spend another caller's allowance.
  limiters = new Map<string, Strategy>();
  // @why For the picture only: each decision, one row per key.
  history: Event[] = [];

  constructor(make: () => Strategy, clock: Clock) {
    this.make = make;
    this.clock = clock;
  }

  allow(key: string): Decision {
    let s = this.limiters.get(key);
    if (!s) {
      s = this.make();
      this.limiters.set(key, s); // @mark newKey
    }
    const now = this.clock.now();
    const d = s.tryAcquire(now);
    const label = d.allowed ? `${d.remaining} left` : `429, retry after ${d.retryAfterMs} ms`;
    this.history.push({ t: now / 1000, ok: d.allowed, row: key, label }); // @mark decide
    return d;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: counts requests per clock-aligned window and starts from zero at each boundary.
export class FixedWindow implements Strategy {
  limit: number;
  windowMs: number;
  windowStart = -1;
  count = 0;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  tryAcquire(nowMs: number): Decision {
    const start = Math.floor(nowMs / this.windowMs) * this.windowMs;
    if (start !== this.windowStart) {
      // @why A new window forgets the old one entirely, even the requests a moment ago.
      this.windowStart = start;
      this.count = 0; // @mark reset
    }
    if (this.count < this.limit) {
      this.count++;
      return { allowed: true, remaining: this.limit - this.count, retryAfterMs: 0 }; // @mark counted
    }
    return { allowed: false, remaining: 0, retryAfterMs: start + this.windowMs - nowMs };
  }
}

function burst(rl: RateLimiter, clock: FakeClock, key: string, atMs: number, n: number): number {
  clock.set(atMs);
  let ok = 0;
  for (let i = 0; i < n; i++) if (rl.allow(key).allowed) ok++;
  return ok;
}

test("token bucket: a burst up to capacity, then a 429 with an honest retry-after", () => {
  const clock = new FakeClock();
  // 5 tokens, refilled at 2 per second.
  const rl = new RateLimiter(() => new TokenBucket(5, 2), clock);
  const results: boolean[] = [];
  for (let i = 0; i < 6; i++) results.push(rl.allow("alice").allowed);
  assert.deepEqual(results, [true, true, true, true, true, false]);
  clock.set(200);
  const d = rl.allow("alice");
  // 200 ms earned 0.4 tokens; 0.6 more takes 300 ms at 2 per second.
  assert.deepEqual(d, { allowed: false, remaining: 0, retryAfterMs: 300 });
  clock.set(500);
  assert.equal(rl.allow("alice").allowed, true, "at 500 ms, as promised");
});

test("per key: one noisy key is throttled, and another key is not affected", () => {
  const clock = new FakeClock();
  const rl = new RateLimiter(() => new TokenBucket(3, 1), clock);
  const alice: boolean[] = [];
  for (let i = 0; i < 5; i++) alice.push(rl.allow("alice").allowed);
  assert.deepEqual(alice, [true, true, true, false, false]);
  assert.equal(rl.allow("bob").allowed, true, "bob has his own full bucket");
  assert.equal(rl.limiters.size, 2);
});

test("sliding log: the same limiter with another strategy — exactly the limit in any window", () => {
  const clock = new FakeClock();
  // At most 3 requests in any 1,000 ms.
  const rl = new RateLimiter(() => new SlidingLog(3, 1000), clock);
  clock.set(0);
  rl.allow("k");
  clock.set(400);
  rl.allow("k");
  clock.set(800);
  rl.allow("k");
  clock.set(900);
  assert.deepEqual(rl.allow("k"), { allowed: false, remaining: 0, retryAfterMs: 100 }, "the request at 0 leaves the window at 1,000");
  clock.set(1000);
  assert.equal(rl.allow("k").allowed, true);
  clock.set(1100);
  assert.deepEqual(rl.allow("k"), { allowed: false, remaining: 0, retryAfterMs: 300 }, "next to leave is the one at 400");
});

test("broken: fixed window — a burst across the boundary lets twice the limit through", () => {
  const clock = new FakeClock();
  // "5 per second", counted per clock-aligned second.
  const fixed = new RateLimiter(() => new FixedWindow(5, 1000), clock);
  clock.set(900);
  const late: boolean[] = [];
  for (let i = 0; i < 5; i++) late.push(fixed.allow("k").allowed);
  clock.set(1000);
  const early: boolean[] = [];
  for (let i = 0; i < 5; i++) early.push(fixed.allow("k").allowed);
  assert.deepEqual(late, [true, true, true, true, true]);
  assert.deepEqual(early, [true, true, true, true, true], "the counter reset at 1,000 ms");
  // 10 requests allowed within 100 ms, under a limit of 5 per second.
  // The sliding log and the token bucket, given the same traffic, allow 5.
  const log = new RateLimiter(() => new SlidingLog(5, 1000), new FakeClock());
  const bucket = new RateLimiter(() => new TokenBucket(5, 5), new FakeClock());
  for (const rl of [log, bucket]) {
    const c = rl.clock as FakeClock;
    assert.equal(burst(rl, c, "k", 900, 5) + burst(rl, c, "k", 1000, 5), 5);
  }
  // Over a full second the bucket can still pass capacity + refill: 5 at 0 ms and 5 more at 1,000 ms.
  const bucket2 = new RateLimiter(() => new TokenBucket(5, 5), new FakeClock());
  const c2 = bucket2.clock as FakeClock;
  assert.equal(burst(bucket2, c2, "k", 0, 5) + burst(bucket2, c2, "k", 1000, 5), 10);
});
