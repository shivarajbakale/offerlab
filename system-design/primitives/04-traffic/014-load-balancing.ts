/**
 * 014. Load Balancing
 * Level: Senior
 * Group: Traffic
 *
 * Problem: Spread incoming requests over several servers so that no server is overwhelmed
 *   while others sit idle. Servers are not identical (one may be slower, or busy with a
 *   heavy request), and with several balancers in front, none of them sees the whole picture.
 *
 * Approach: Round robin, least connections, power of two choices
 *   Round robin sends each request to the next server in turn. Least connections sends it to
 *   the server with the fewest requests in flight, which adapts to slow servers because their
 *   queues drain slower. Power of two choices picks two servers at random and sends the
 *   request to the less loaded of the two: nearly as good as least connections, and because
 *   each balancer samples different pairs, many balancers working from the same slightly old
 *   counts do not all pile onto one server.
 *
 * Cost: round robin O(1); least connections O(n) per request over n servers (O(log n) with
 *   a heap); power of two choices O(1). Least connections and power of two choices need a
 *   per-server in-flight count.
 *
 * Pattern: load balancing
 * Key insight: Round robin assumes every server is equally fast and every request equally
 *   heavy. Counting what is in flight measures the truth, but fresh counts are expensive to
 *   share; a little randomness keeps balancers from all chasing the same "least loaded" server.
 * Tradeoffs: Round robin needs no state and is fair when servers are equal, but feeds a slow
 *   server as much as a fast one. Least connections adapts, but with stale or shared counts
 *   every balancer picks the same server (herding). Power of two choices is slightly less even
 *   than perfect least connections but robust to staleness and cheap.
 * Staff notes: L4 balancers (TCP connections) see connections, not requests; L7 balancers
 *   (HTTP) can balance per request and look at paths and headers. Health checks remove dead
 *   servers; slow start ramps a new server's share up gradually so it is not flooded while its
 *   caches are cold. Weighted variants handle servers of different sizes. With long-lived
 *   connections (gRPC, WebSockets), balancing happens per connection, so load can stay uneven.
 * Interview signals: "load balancer", "uneven load", "one slow server", "many balancers",
 *   "hot server", "least connections", "power of two choices".
 * Real world: NGINX offers round robin, least_conn and a "random two least_conn" method;
 *   Envoy's least-request balancer samples two hosts by default. The power of two choices
 *   comes from Michael Mitzenmacher's analysis of randomized load balancing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Strategy = "round-robin" | "least-connections" | "p2c";
type Request = { t: number; ok: boolean; row?: string; label?: string };
type Point = { t: number; v: number };

// @why A request that will wait this many ticks or more counts as slow, and is drawn red.
const SLOW_WAIT = 2;

export class Balancer {
  // @viz balancer:inflight,speed,history hide:strategy,next,seed,lanes,from,refreshEvery,twoChoices,longestQueue,rule,speed,inflight,history,seen,i,n,a,b,chosen,wait,t,balancer,best,counts,view
  strategy: Strategy;
  // @why Requests each server finishes per tick. Servers are not all equally fast.
  speed: number[];
  // @why Requests at each server right now, waiting or being worked on. Least connections and two choices read it.
  inflight: number[];
  // @why Round robin's only state: whose turn is next.
  next = 0;
  // @why Seed for the random number generator, so every run makes the same "random" choices.
  seed: number;
  history: Request[] = [];
  // @why For the picture only: the longest queue after each tick, and one timeline row per server.
  longestQueue: Point[] = [];
  lanes: string[];

  constructor(rule: Strategy, speed: number[], seed = 1) {
    this.strategy = rule;
    this.speed = speed;
    this.inflight = speed.map(() => 0);
    this.seed = seed;
    this.lanes = speed.map((_, i) => `s${i}`);
  }

  /** Sends one request arriving at tick t to a server, and returns which one. */
  route(t: number): number {
    const i = this.pick();
    // @why How long this request will wait: the requests ahead of it, divided by how many the server finishes per tick.
    const wait = Math.floor(this.inflight[i] / this.speed[i]);
    this.inflight[i]++; // @mark count
    this.history.push({ t, row: `s${i}`, ok: wait < SLOW_WAIT, label: `waits ${wait} tick${wait === 1 ? "" : "s"}` }); // @mark assign
    return i;
  }

  pick(): number {
    const n = this.inflight.length;
    if (this.strategy === "round-robin") {
      // @why Each server in turn, ignoring how busy it is. Fair only if servers and requests are all alike.
      const i = this.next; // @mark turn
      this.next = (i + 1) % n;
      return i;
    }
    if (this.strategy === "least-connections") return this.leastLoaded(this.inflight);
    // @why Two different servers chosen at random.
    const a = randomBelow(this, n);
    let b = randomBelow(this, n - 1);
    if (b >= a) b++;
    // @why The less loaded of the two. Never the busiest server, and no need to compare all n.
    const chosen = this.inflight[b] < this.inflight[a] ? b : a; // @mark two
    return chosen;
  }

  /** Index of the smallest count; ties go to the lowest index. */
  leastLoaded(counts: number[]): number {
    let best = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] < counts[best]) best = i;
    }
    return best;
  }

  /** End of tick t: every server finishes up to `speed` requests. */
  tick(t: number) {
    for (let i = 0; i < this.inflight.length; i++) {
      this.inflight[i] = Math.max(0, this.inflight[i] - this.speed[i]); // @mark work
    }
    this.longestQueue.push({ t, v: Math.max(...this.inflight) });
  }

}

// --- helpers for the scenarios ---

// Broken on purpose: several balancers pick the least loaded server from counts that are only refreshed every few ticks.
export class StaleBalancer extends Balancer {
  // @why Each balancer's own copy of the counts, as of the last refresh. Between refreshes they all hold the same numbers: a balancer does not even add its own sends.
  seen: number[][] = [];
  refreshEvery = 1;
  // @why Which balancer is routing the current request.
  from = 0;
  // @why For the comparison only: pick the better of two random servers instead of the least loaded.
  twoChoices = false;

  /** `balancers` balancers whose counts are refreshed every `refreshEvery` ticks. */
  configure(balancers: number, refreshEvery: number, twoChoices = false): this {
    this.refreshEvery = refreshEvery;
    this.twoChoices = twoChoices;
    this.seen = Array.from({ length: balancers }, () => this.inflight.slice());
    return this;
  }

  routeFrom(balancer: number, t: number): number {
    this.from = balancer;
    return this.route(t);
  }

  pick(): number {
    const view = this.seen[this.from];
    if (!this.twoChoices) return this.leastLoaded(view);
    const a = randomBelow(this, view.length);
    let b = randomBelow(this, view.length - 1);
    if (b >= a) b++;
    return view[b] < view[a] ? b : a;
  }

  tick(t: number) {
    super.tick(t);
    if ((t + 1) % this.refreshEvery === 0) this.seen = this.seen.map(() => this.inflight.slice()); // @mark refresh
  }
}

// Quiet: a random whole number from 0 to n - 1, from the owner's seeded generator (mulberry32).
function randomBelow(owner: { seed: number }, n: number): number {
  owner.seed = advance(owner.seed);
  return Math.floor(unit(owner.seed) * n);
}

// mulberry32, split in two: the state steps forward by a constant, and the output is a hash of the state.
function advance(state: number): number {
  return (state + 0x6d2b79f5) | 0;
}

function unit(state: number): number {
  let x = Math.imul(state ^ (state >>> 15), state | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

// Quiet: how many requests each server received, from the history.
function shares(b: Balancer): number[] {
  return b.speed.map((_, i) => b.history.filter((r) => r.row === `s${i}`).length);
}

// Quiet: the most requests any one server got within a single tick.
function peakPerTick(b: Balancer): number {
  let most = 0;
  for (const r of b.history) most = Math.max(most, b.history.filter((x) => x.t === r.t && x.row === r.row).length);
  return most;
}

// Quiet: many ticks of stale balancers, for the comparison only.
function runStale(twoChoices: boolean, ticks: number): StaleBalancer {
  const b = new StaleBalancer("least-connections", [3, 3, 3], 7).configure(3, 3, twoChoices);
  for (let t = 0; t < ticks; t++) {
    for (let k = 0; k < 6; k++) b.routeFrom(k % 3, t);
    b.tick(t);
  }
  return b;
}

// Quiet: the longest queue seen over a whole run.
function worstQueue(b: Balancer): number {
  return Math.max(...b.longestQueue.map((p) => p.v));
}

// Two fast servers that each finish 3 requests per tick, one slow server that finishes 1.
// 6 requests arrive per tick, under the total capacity of 7.
const UNEVEN = [3, 3, 1];

test("round robin: equal servers get equal shares", () => {
  const b = new Balancer("round-robin", [2, 2, 2]);
  for (let t = 0; t < 5; t++) {
    for (let k = 0; k < 6; k++) b.route(t);
    b.tick(t);
  }
  assert.deepEqual(shares(b), [10, 10, 10]);
  assert.ok(b.history.every((r) => r.ok), "no request waits");
});

test("broken: round robin with one slow server — its queue keeps growing", () => {
  const b = new Balancer("round-robin", UNEVEN);
  const slowQueue: number[] = [];
  for (let t = 0; t < 8; t++) {
    for (let k = 0; k < 6; k++) b.route(t);
    b.tick(t);
    slowQueue.push(b.inflight[2]);
  }
  // s2 gets 2 per tick and finishes 1, so its queue grows by one every tick, while s0 and s1 sit idle.
  assert.deepEqual(slowQueue, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(b.inflight.slice(0, 2), [0, 0]);
  assert.ok(b.history.filter((r) => !r.ok).length >= 10, "many requests wait 2 ticks or more");
});

test("least connections: work flows away from the slow server", () => {
  const b = new Balancer("least-connections", UNEVEN);
  for (let t = 0; t < 8; t++) {
    for (let k = 0; k < 6; k++) b.route(t);
    b.tick(t);
  }
  const [s0, , s2] = shares(b);
  assert.ok(s2 < s0 / 2, "the slow server gets far fewer requests");
  assert.ok(worstQueue(b) <= 1, "no queue builds up");
  assert.ok(b.history.every((r) => r.ok));
});

test("power of two choices: close to least connections with two random samples", () => {
  const b = new Balancer("p2c", UNEVEN, 6);
  for (let t = 0; t < 8; t++) {
    for (let k = 0; k < 6; k++) b.route(t);
    b.tick(t);
  }
  const rr = new Balancer("round-robin", UNEVEN);
  for (let t = 0; t < 8; t++) runTick(rr, t);
  assert.ok(worstQueue(b) <= 2, "queues stay short, like least connections");
  assert.ok(worstQueue(b) < worstQueue(rr));
  assert.ok(b.history.filter((r) => !r.ok).length <= 3);
});

test("broken: least connections on stale counts — every balancer picks the same server", () => {
  // Three equal servers that each finish 3 per tick: room for 9, and only 6 arrive.
  // Three balancers each route 2 of the 6 requests per tick, with counts refreshed every 3 ticks.
  const b = new StaleBalancer("least-connections", [3, 3, 3]).configure(3, 3);
  for (let t = 0; t < 6; t++) {
    for (let k = 0; k < 6; k++) b.routeFrom(k % 3, t);
    b.tick(t);
  }
  // Within a tick, every balancer sees the same "least loaded" server and sends everything there.
  assert.equal(peakPerTick(b), 6, "one server gets all 6 requests of a tick");
  assert.ok(b.history.some((r) => !r.ok), "and its queue backs up");
  assert.equal(worstQueue(b), 9);
  // Over 30 ticks, two random choices on the same stale counts keep queues far shorter.
  assert.ok(worstQueue(runStale(true, 30)) <= worstQueue(runStale(false, 30)) / 2);
});

// Quiet: one tick of 6 requests, for comparison runs.
function runTick(b: Balancer, t: number) {
  for (let k = 0; k < 6; k++) b.route(t);
  b.tick(t);
}
