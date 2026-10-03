/**
 * 012. Token Bucket and Leaky Bucket
 * Level: Senior
 * Group: Traffic
 *
 * Problem: Limit how fast one client can send requests to a shared server, so a single noisy
 *   client cannot use up capacity that everyone else needs. Short bursts are normal and
 *   should get through; a sustained flood should not.
 *
 * Approach: Token bucket (and its smoothing cousin, the leaky bucket)
 *   A bucket holds up to `capacity` tokens and gains `rate` tokens per second. Each request
 *   takes one token; with no token left, the request is rejected. The refill is lazy: on
 *   each request the bucket adds (now - last) * rate tokens, capped at capacity, so no timer
 *   runs per client. Capacity sets the largest burst; rate sets the long-run limit. A leaky
 *   bucket instead puts requests in a queue of fixed size and lets them out at a steady pace,
 *   so the output is smooth even when the input arrives in bursts.
 *
 * Cost: O(1) time and two numbers (tokens, last refill time) per client for the token
 *   bucket; the leaky bucket also keeps up to `capacity` queued requests and adds waiting time.
 *
 * Pattern: rate limiting
 * Key insight: Tokens are permission to send, saved up while a client is quiet. Saving is
 *   capped, so a client can burst up to `capacity` requests but never average more than `rate`.
 * Tradeoffs: Token bucket allows bursts (good for interactive clients, bad for a downstream
 *   that cannot absorb them). Leaky bucket smooths traffic but adds queueing delay and drops
 *   requests when the queue is full. A bigger capacity is friendlier to bursty clients and
 *   lets more load through at once.
 * Staff notes: Limits across many servers need shared state: either one central counter store
 *   updated atomically (for example a script that runs inside the store), at the cost of a
 *   network round trip per request, or a local bucket on each server with a share of the
 *   limit, which is fast but uneven when traffic is unevenly spread. Tell rejected clients
 *   when to come back (HTTP 429 with a Retry-After header). One bucket per key (user, API
 *   key, IP) is a few bytes each, but millions of keys need expiry for idle buckets.
 * Interview signals: "rate limiter", "API quota", "allow bursts", "throttle per user",
 *   "protect a downstream service", "429 Too Many Requests".
 * Real world: Token buckets are a common building block in API gateways and proxies, and many
 *   cloud API quotas are documented in terms of a rate plus a burst size, which is a token
 *   bucket's rate and capacity. NGINX's limit_req module is a leaky bucket by default: burst
 *   requests wait in line and leave at the set rate. With `nodelay`, burst requests are served
 *   at once and only the burst slots refill at the rate, which behaves like a token bucket.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Request = { t: number; ok: boolean; row?: string; label?: string };
type Point = { t: number; v: number };


export class TokenBucket {
  // @viz timeline:history,tokenLevel,queueLevel,capacity
  // @why The most tokens the bucket can hold, which is the largest burst it lets through at once.
  capacity: number;
  // @why Tokens added per second. Over a long time no client can average more than this.
  rate: number;
  // @why Starts full, so a client that has been quiet can send a burst right away.
  tokens: number;
  // @why When tokens were last topped up. Refill is worked out from the time since then, so no timer has to run for each bucket.
  last = 0;
  // @why For the picture only: every request and whether it got through.
  history: Request[] = [];
  // @why For the picture only: the token count over time.
  tokenLevel: Point[] = [];

  constructor(capacity: number, ratePerSec: number) {
    this.capacity = capacity;
    this.rate = ratePerSec;
    this.tokens = capacity;
    this.tokenLevel.push({ t: 0, v: capacity });
  }

  allow(t: number): boolean {
    this.refill(t);
    // @why One token per request. With none left, the client has used up its burst and its rate, so it must wait.
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.history.push({ t, ok: true, label: `${tokensText(this.tokens)} left` }); // @mark take
      this.tokenLevel.push({ t, v: round(this.tokens) });
      return true;
    }
    this.history.push({ t, ok: false, label: `only ${tokensText(this.tokens)}` }); // @mark reject
    return false;
  }

  refill(t: number) {
    const earned = (t - this.last) * this.rate;
    // @why For the picture only: mark the moment the bucket filled up, so the line goes flat there.
    const fullAt = this.last + (this.capacity - this.tokens) / this.rate;
    if (fullAt < t && this.tokens < this.capacity) this.tokenLevel.push({ t: round(fullAt), v: this.capacity });
    // @why The cap. Without it a long quiet spell piles up tokens, and they all come out as one huge burst.
    this.tokens = Math.min(this.capacity, this.tokens + earned); // @mark refill
    this.last = t;
    this.tokenLevel.push({ t, v: round(this.tokens) });
  }
}

export class LeakyBucket {
  // @why How many requests may wait. A burst bigger than this is rejected instead of queued.
  capacity: number;
  // @why Seconds between two releases: the steady pace the server sees, whatever the input does.
  gap: number;
  // @why Arrival times of the requests waiting to go out, oldest first.
  queue: number[] = [];
  // @why The earliest time the next request may leave. Keeps releases at least `gap` apart.
  nextOut = 0;
  history: Request[] = [];
  queueLevel: Point[] = [];

  constructor(capacity: number, drainPerSec: number) {
    this.capacity = capacity;
    this.gap = 1 / drainPerSec;
  }

  offer(t: number): boolean {
    this.drain(t);
    if (this.queue.length >= this.capacity) {
      this.history.push({ t, ok: false, row: "in", label: "queue full" }); // @mark full
      return false;
    }
    this.queue.push(t);
    this.history.push({ t, ok: true, row: "in", label: `queued, ${this.queue.length} waiting` });
    this.queueLevel.push({ t, v: this.queue.length });
    return true;
  }

  /** Lets out every request whose turn has come by time t, one every `gap` seconds. */
  drain(t: number): number[] {
    const released: number[] = [];
    while (this.queue.length > 0) {
      // @why A request can't leave before it arrived, nor sooner than `gap` after the one before it.
      const at = Math.max(this.nextOut, this.queue[0]);
      if (at > t) break;
      const arrived = this.queue.shift()!; // @mark release
      this.history.push({ t: at, ok: true, row: "out", label: `sent on after waiting ${round(at - arrived)}s` });
      this.queueLevel.push({ t: at, v: this.queue.length });
      this.nextOut = at + this.gap;
      released.push(at);
    }
    return released;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: refills without the cap, so tokens saved while idle have no limit.
export class UncappedTokenBucket extends TokenBucket {
  refill(t: number) {
    this.tokens = this.tokens + (t - this.last) * this.rate; // @mark uncapped
    this.last = t;
    this.tokenLevel.push({ t, v: round(this.tokens) });
  }
}

// Quiet: rounding for labels, so stepping through a request does not step into it.
function round(x: number): number {
  return Math.round(x * 100) / 100;
}

function tokensText(x: number): string {
  return `${round(x)} token${round(x) === 1 ? "" : "s"}`;
}

function countPassed(results: boolean[]): number {
  return results.filter(Boolean).length;
}

test("steady: requests under the rate all pass", () => {
  // 5 tokens, 2 per second; one request every 0.6 s is about 1.7 per second.
  const b = new TokenBucket(5, 2);
  const results: boolean[] = [];
  for (let i = 1; i <= 10; i++) results.push(b.allow(round(i * 0.6)));
  assert.equal(countPassed(results), 10);
  assert.ok(b.tokens >= 4, "the bucket stays nearly full");
});

test("burst: a full bucket lets a burst through, then throttles", () => {
  // 5 tokens, 1 per second. Eight requests arrive at once.
  const b = new TokenBucket(5, 1);
  const burst: boolean[] = [];
  for (let i = 0; i < 8; i++) burst.push(b.allow(0));
  assert.deepEqual(burst, [true, true, true, true, true, false, false, false]);
  // After that, one request per second gets through: half a second earns only half a token.
  assert.deepEqual([b.allow(1), b.allow(1.5), b.allow(2)], [true, false, true]);
});

test("refill: tokens come back with time, capped at capacity", () => {
  const b = new TokenBucket(5, 1);
  for (let i = 0; i < 5; i++) b.allow(0);
  assert.equal(b.allow(2), true);
  assert.equal(round(b.tokens), 1);
  // 18 quiet seconds would earn 18 tokens, but the bucket holds only 5.
  const later: boolean[] = [];
  for (let i = 0; i < 7; i++) later.push(b.allow(20));
  assert.equal(countPassed(later), 5);
  assert.ok(Math.max(...b.tokenLevel.map((p) => p.v)) <= 5);
});

test("leaky: output is smooth even when input bursts", () => {
  // Room for 4 waiting requests, let out 2 per second (one every 0.5 s).
  const b = new LeakyBucket(4, 2);
  const accepted: boolean[] = [];
  for (let i = 0; i < 6; i++) accepted.push(b.offer(0));
  // The first one leaves at once, four wait, and the sixth finds the queue full.
  assert.deepEqual(accepted, [true, true, true, true, true, false]);
  b.drain(0.5);
  b.drain(1);
  b.drain(1.5);
  for (let i = 0; i < 3; i++) b.offer(2.2);
  b.drain(4);
  const out = b.history.filter((r) => r.row === "out").map((r) => r.t);
  assert.deepEqual(out, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  for (let i = 1; i < out.length; i++) assert.equal(round(out[i] - out[i - 1]), 0.5, "releases are exactly 0.5 s apart");
});

test("broken: refill without a cap — a long idle lets a huge burst through", () => {
  const b = new UncappedTokenBucket(5, 1);
  b.allow(0);
  // A minute of silence, then 40 requests at once.
  const burst: boolean[] = [];
  for (let i = 0; i < 40; i++) burst.push(b.allow(60));
  assert.equal(countPassed(burst), 40, "all 40 pass, though the bucket is meant to allow bursts of 5");
});
