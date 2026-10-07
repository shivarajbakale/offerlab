/**
 * 016. Circuit Breaker
 * Level: Senior
 * Group: Traffic
 *
 * Problem: A service calls a dependency that has gone down. Each call waits for a timeout
 *   before failing, holding a thread and a connection the whole time, so the caller slows to
 *   a crawl and can fail too (a cascading failure). And the steady stream of calls makes it
 *   harder for the dependency to come back.
 *
 * Approach: A three-state breaker in front of the dependency
 *   Closed: calls go through, and consecutive failures are counted. When they reach a
 *   threshold the breaker opens. Open: calls fail at once, without touching the dependency.
 *   After a cooldown the breaker goes half-open: exactly one trial call goes through while
 *   other calls still fail fast. If the trial succeeds the breaker closes; if it fails, the
 *   breaker opens again for another cooldown.
 *
 * Cost: O(1) per call: a state, a failure count and two timestamps per dependency. Calls
 *   made while open fail even if the dependency has just recovered, until the next trial.
 *
 * Pattern: resilience
 * Key insight: When a dependency is down, a fast "no" is better than a slow "no". Failing
 *   fast frees the caller, and leaving the dependency alone gives it room to recover; a
 *   single trial call is enough to find out when it has.
 * Tradeoffs: A low threshold opens on short blips and rejects calls that would have
 *   worked; a high one keeps paying timeouts longer. A long cooldown protects the dependency
 *   but keeps the feature off after it recovers; a short one probes more often.
 * Staff notes: Use one breaker per dependency (and often per endpoint), not one for
 *   everything. Decide what counts as a failure: timeouts and server errors, not "not found"
 *   or "bad request". Pair it with a fallback (cached data, a default, a degraded feature),
 *   with timeouts (a breaker can't open if calls never fail), and with retries (015): retries
 *   should stop while the breaker is open. Many breakers trip on a failure rate over a
 *   sliding window rather than consecutive failures.
 * Interview signals: "cascading failure", "dependency is down", "fail fast", "graceful
 *   degradation", "timeouts pile up", "thread pool exhausted".
 * Real world: Netflix's Hystrix library popularized circuit breakers for service calls and
 *   is now in maintenance mode; Resilience4j is a common Java replacement. Service meshes
 *   such as Istio (through Envoy) offer related outlier detection and connection limits.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type State = "closed" | "open" | "half-open";
type Result = { ok: boolean; ms: number };
type Request = { t: number; ok: boolean; row?: string; label?: string };
type Point = { t: number; v: number };
type Band = { from: number; to: number | null; state: string };

export class CircuitBreaker {
  // @viz gate:history,title=Circuit_breaker,from=Caller,to=Service,state=state,level=failures,max=threshold,unit=failure,failAt=server,gateRows=fast_fail,absent=noBreaker timeline:history,failureLevel,bands,threshold,lanes,ok=succeeded,bad=failed hide:threshold,cooldown,state,failures,openedAt,trialAt,trialOk,waited,history,failureLevel,bands,lanes,noBreaker,r,what,t,next,s,b,s2,withTrial,withBreaker,before,k,downFrom,downUntil,penalty,calls,callsAt,down,from,to
  // @why Consecutive failures that open the breaker. One or two failures may be a blip; this many in a row means the dependency is down.
  threshold: number;
  // @why Ticks to stay open before trying again: time for the dependency to recover with no calls hitting it.
  cooldown: number;
  state: State = "closed";
  // @why Failures in a row. A success resets it, so scattered failures never open the breaker.
  failures = 0;
  openedAt = -1;
  // @why The tick the half-open trial was sent. Other calls in that tick fail fast while the trial is out.
  trialAt = -1;
  trialOk = false;
  // @why For the comparison only: milliseconds callers spent waiting, in total.
  waited = 0;
  history: Request[] = [];
  // @why For the picture only: consecutive failures over time, the state as bands, and two rows of calls.
  failureLevel: Point[] = [];
  bands: Band[] = [{ from: 0, to: null, state: "closed" }];
  lanes = ["service", "fast fail"];

  constructor(threshold: number, cooldown: number) {
    this.threshold = threshold;
    // @caption A caller depends on a service and calls it twice every tick. A healthy call answers in 20 ms. A call to a service that is down gets no answer: the caller waits for its 1000 ms timeout, holding a thread the whole time, and then the call fails.
    this.cooldown = cooldown;
  }

  call(t: number, fn: () => Result): boolean {
    // @why The trial's answer has arrived by the next tick: it decides between closed and open.
    if (this.state === "half-open" && t > this.trialAt) this.settleTrial(t);
    if (this.state === "open" && t - this.openedAt >= this.cooldown) this.endCooldown(t);
    // @why Open, or a trial already out: answer "no" at once, without touching the dependency.
    if (this.state === "open" || (this.state === "half-open" && this.trialAt === t)) {
      // @caption {state === "open" ? "good: The breaker is open, so the call at t=" + t + " fails at once, in 0 ms, without touching the service. The caller can show cached data or an error right away, and the service gets no traffic. The breaker will try again at t=" + (openedAt + cooldown) + "." : "good: A trial call is already out, so the call at t=" + t + " fails fast too. A service that may still be down gets one call, not full traffic."}
      this.history.push({ t, ok: false, row: "fast fail", label: `breaker ${this.state}: rejected in 0 ms` }); // @mark fastFail
      return false;
    }
    // @caption {state === "half-open" ? "The call at t=" + t + " is the trial: it alone goes through to the service, to find out whether it is back." : "The breaker is closed, so the call at t=" + t + " goes through to the service. The breaker opens if " + threshold + " calls in a row fail."}
    if (this.state === "half-open") this.trialAt = t; // @mark trial
    const r = fn();
    this.waited += r.ms;
    const what = this.state === "half-open" ? "trial call" : "call";
    // @caption {state === "half-open" ? (r.ok ? "good: The trial call at t=" + t + " succeeds in " + r.ms + " ms: the service is back. At the next tick the breaker will close." : "bad: The trial call at t=" + t + " waits " + r.ms + " ms and times out: the service is still down. At the next tick the breaker opens again for another " + cooldown + " ticks.") : r.ok ? "good: The call at t=" + t + " succeeds in " + r.ms + " ms." + (failures > 0 ? " That resets the count of failures in a row from " + failures + " to 0: the earlier failures were just a blip." : "") : "bad: The call at t=" + t + " waits the full " + r.ms + " ms for the service and times out." + (t === bands[bands.length - 1].from && bands.length > 2 && !bands.some((x) => x.state === "half-open") ? " The breaker let full traffic back in while the service was still restarting. Both calls of this tick hit it, and the incoming connections take the resources it needs to start, so its restart is pushed back again." : "")}
    this.history.push({ t, ok: r.ok, row: "service", label: `${what} ${r.ok ? "succeeds" : "times out"} after ${r.ms} ms` });
    if (this.state === "half-open") {
      this.trialOk = r.ok;
      return r.ok;
    }
    if (r.ok) {
      this.failures = 0;
    } else {
      // @caption {failures >= threshold ? "bad: That is " + failures + " failures in a row, the threshold. The service looks down, not just slow for a moment." : "That is " + failures + (failures === 1 ? " failure" : " failures") + " in a row, under the threshold of " + threshold + ". One or two failures may be a blip, so the breaker stays closed."}
      this.failures++; // @mark fail
      if (this.failures >= this.threshold) this.trip(t);
    }
    this.failureLevel.push({ t, v: this.failures });
    return r.ok;
  }

  /** After the cooldown, let one trial call find out whether the dependency is back. */
  endCooldown(t: number) {
    this.moveTo("half-open", t);
    // @why No trial is out yet: the next call will be it.
    // @caption At t={t} the {cooldown}-tick cooldown is over. The breaker goes half-open: the next call goes through as a trial, and every other call keeps failing fast until the trial answers.
    this.trialAt = -1; // @mark halfOpen
  }

  settleTrial(t: number) {
    if (this.trialOk) {
      this.moveTo("closed", t);
      // @caption good: The trial succeeded, so at t={t} the breaker closes. Every call goes through to the service again, and the count of failures starts over at 0.
      this.failures = 0; // @mark close
    } else {
      this.trip(t);
    }
    this.failureLevel.push({ t, v: this.failures });
  }

  trip(t: number) {
    this.moveTo("open", t);
    // @caption bad: {trialAt >= 0 && !trialOk ? "The trial failed, so at t=" + t + " the breaker opens again." : "At t=" + t + " the breaker opens."} Until t={t + cooldown}, every call is answered "no" at once, in 0 ms, and the service gets no traffic, so it can recover in peace.
    this.openedAt = t; // @mark open
  }

  moveTo(next: State, t: number) {
    this.bands[this.bands.length - 1].to = t;
    this.bands.push({ from: t, to: null, state: next });
    this.state = next;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: no breaker at all. Every call goes to the dependency and waits for its answer.
export class NoBreaker extends CircuitBreaker {
  // @why For the picture only: there is no breaker, so the picture shows calls going straight to the service.
  noBreaker = true;

  call(t: number, fn: () => Result): boolean {
    const r = fn();
    // @caption {r.ok ? "good: With no breaker, the call at t=" + t + " goes straight to the service and succeeds in " + r.ms + " ms." : "bad: With no breaker, the call at t=" + t + " goes straight to the service, which is down. The caller waits the full " + r.ms + " ms for nothing: that is timeout number " + (history.filter((x) => !x.ok).length + 1) + ", and callers have waited " + Math.round(waited / 100) / 10 + " s in total, each wait holding a thread."}
    this.waited += r.ms; // @mark direct
    this.history.push({ t, ok: r.ok, row: "service", label: `call ${r.ok ? "succeeds" : "times out"} after ${r.ms} ms` });
    return r.ok;
  }
}

// Broken on purpose: after the cooldown it closes at once, so full traffic hits a dependency that may still be down.
export class NoHalfOpenBreaker extends CircuitBreaker {
  endCooldown(t: number) {
    this.moveTo("closed", t);
    // @caption bad: At t={t} the cooldown is over, and with no half-open state the breaker closes at once. Full traffic, both calls of every tick, goes to a service that may still be restarting. This is time number {bands.filter((x) => x.state === "closed").length - 1} that the breaker has let full traffic back in without testing first.
    this.failures = 0; // @mark straightClosed
  }
}

// @why How long a caller waits for a dependency that doesn't answer, before giving up.
const TIMEOUT_MS = 1000;
const OK_MS = 20;

// The dependency. It is down (restarting) from `downFrom` until `downUntil`. While it restarts,
// any tick with more than one call pushes its restart back by `penalty` ticks: the incoming
// connections take the resources it needs to start.
class Service {
  downFrom: number;
  downUntil: number;
  penalty: number;
  calls = 0;
  callsAt: Record<number, number> = {};

  constructor(downFrom: number, downUntil: number, penalty = 0) {
    this.downFrom = downFrom;
    this.downUntil = downUntil;
    this.penalty = penalty;
  }

  request(t: number): Result {
    this.calls++;
    this.callsAt[t] = (this.callsAt[t] ?? 0) + 1;
    const down = t >= this.downFrom && t < this.downUntil;
    // @caption {down && callsAt[t] === 2 && penalty > 0 ? "bad: A second call in the same tick reaches the restarting service. The incoming connections take the resources it needs to start, so its restart is pushed back " + penalty + " ticks, to t=" + downUntil + "." : down ? "The service is down (restarting until t=" + downUntil + "), so this call hangs until the caller's timeout." : "The service is up and answers in 20 ms."}
    if (down && this.callsAt[t] === 2) this.downUntil += this.penalty;
    return down ? { ok: false, ms: TIMEOUT_MS } : { ok: true, ms: OK_MS };
  }
}

// Quiet: two calls per tick from `from` to `to`, without tracing them.
function callQuietly(b: CircuitBreaker, s: Service, from: number, to: number) {
  for (let t = from; t <= to; t++) for (let k = 0; k < 2; k++) b.call(t, () => s.request(t));
}

function bandStates(b: CircuitBreaker): string[] {
  return b.bands.map((x) => `${x.state}@${x.from}`);
}

test("closed: failures below the threshold pass through", () => {
  // A blip: the service fails both calls of tick 2 only.
  const s = new Service(2, 3);
  const b = new CircuitBreaker(3, 5);
  for (let t = 0; t < 6; t++) {
    b.call(t, () => s.request(t));
    b.call(t, () => s.request(t));
  }
  assert.equal(b.state, "closed", "2 failures in a row stay under the threshold of 3");
  assert.equal(s.calls, 12, "every call reached the service");
  assert.equal(b.failures, 0, "the next success reset the count");
});

test("open: after the threshold, calls fail fast without touching the service", () => {
  // The service goes down at tick 2 and stays down.
  const s = new Service(2, 100);
  const b = new CircuitBreaker(3, 5);
  for (let t = 0; t < 7; t++) {
    b.call(t, () => s.request(t));
    b.call(t, () => s.request(t));
  }
  assert.equal(b.state, "open");
  assert.deepEqual(bandStates(b), ["closed@0", "open@3"]);
  assert.equal(s.calls, 4 + 3, "4 healthy calls, then only the 3 failures it took to open");
  assert.equal(b.history.filter((r) => r.row === "fast fail").length, 7);
});

test("half-open: after the cooldown one trial call decides", () => {
  const s = new Service(2, 100);
  const b = new CircuitBreaker(3, 5);
  callQuietly(b, s, 0, 7);
  const before = s.calls;
  // Tick 8: the cooldown is over. The first call is the trial; the second fails fast.
  b.call(8, () => s.request(8));
  b.call(8, () => s.request(8));
  assert.equal(s.calls - before, 1, "only the trial reached the service");
  // Tick 9: the trial timed out, so the breaker opens again.
  b.call(9, () => s.request(9));
  assert.deepEqual(bandStates(b), ["closed@0", "open@3", "half-open@8", "open@9"]);
});

test("recover: success in half-open closes the breaker", () => {
  // Down from tick 2 to tick 12.
  const s = new Service(2, 12);
  const b = new CircuitBreaker(3, 5);
  for (let t = 0; t < 18; t++) {
    b.call(t, () => s.request(t));
    b.call(t, () => s.request(t));
  }
  // The trial at 8 finds it still down; the trial at 14 succeeds, and from 15 every call passes.
  assert.deepEqual(bandStates(b), ["closed@0", "open@3", "half-open@8", "open@9", "half-open@14", "closed@15"]);
  assert.ok(b.history.filter((r) => r.t >= 15).every((r) => r.ok));
});

test("broken: no breaker — every call waits for the timeout while the service is down", () => {
  const s = new Service(2, 12);
  const b = new NoBreaker(3, 5);
  for (let t = 0; t < 14; t++) {
    b.call(t, () => s.request(t));
    b.call(t, () => s.request(t));
  }
  // 10 down ticks × 2 calls, each waiting the full second.
  assert.equal(b.history.filter((r) => !r.ok).length, 20);
  assert.equal(b.waited, 20 * TIMEOUT_MS + 8 * OK_MS);
  // With a breaker, callers wait a fraction of that.
  const withBreaker = new CircuitBreaker(3, 5);
  callQuietly(withBreaker, new Service(2, 12), 0, 13);
  assert.ok(withBreaker.waited < b.waited / 3);
});

test("broken: no half-open — full traffic after the cooldown knocks the recovering service over", () => {
  // Restarting from tick 2 until 12, and every tick with 2 calls during the restart pushes it back 3 ticks.
  const s = new Service(2, 12, 3);
  const b = new NoHalfOpenBreaker(3, 5);
  for (let t = 0; t < 30; t++) {
    b.call(t, () => s.request(t));
    b.call(t, () => s.request(t));
  }
  // The two calls at t=2, before the breaker opens, push the restart from 12 to 15. Then each time
  // the cooldown ends, both calls of the tick hit the restarting service and push its restart
  // back 3 more ticks: at t=8, 14 and 20. It is ready only at t=24.
  assert.deepEqual(bandStates(b), ["closed@0", "open@3", "closed@8", "open@9", "closed@14", "open@15", "closed@20", "open@21", "closed@26"]);
  assert.equal(s.downUntil, 24);
  // The same service behind a breaker with half-open is pushed back only by the calls at t=2:
  // after that it sees one call per trial, and is ready at t=15, not 12.
  const s2 = new Service(2, 12, 3);
  const withTrial = new CircuitBreaker(3, 5);
  callQuietly(withTrial, s2, 0, 29);
  assert.equal(s2.downUntil, 15);
  assert.equal(withTrial.state, "closed");
});
