/**
 * 02. Fan-out and Tail Latency
 * Level: Senior
 * Group: Microservices
 *
 * Problem: A product page needs answers from ten backend services before it can render. Each
 *   service is fast almost every time: about 1 call in 100 hits a machine having a bad moment and
 *   takes 50 times longer. That sounds rare. Why is the page slow so often, and what can we do
 *   about it without making every service faster?
 *
 * Approach: Count the chances to be slow, then stop waiting for the slow one
 *   1. One backend call: about 1 page in 100 is slow, the same as the service. 2. Ten calls: a page
 *   is slow if any of them is, so about 1 in 10 is (1 - 0.99^10 = 9.6%), and the page's p99 is
 *   the slow case. 3. Three calls (merge or batch what you can): about 3 in 100, better but p99 is
 *   still slow. 4. Ten calls with a timeout and retry to another copy (a simplified hedge): if an
 *   answer has not come back in 20 ms, give up on it and ask another copy of that service; the
 *   slow moment is cut short. A real hedged request keeps both tries and takes the first answer.
 *
 * Cost: p99 goes from ~43 ms (one call) to ~160 ms (ten calls) with no service getting slower;
 *   three calls ~93 ms; retrying after 20 ms brings ten calls back to ~55 ms for about 1% more
 *   calls, and the work of the abandoned first tries is wasted. Retrying too early (5 ms) fails
 *   ~2% of pages, whose second try is also slow; a real hedge cannot fail that way.
 *
 * Pattern: request fan-out, tail-tolerant requests (hedged requests; simulated as timeout and retry)
 * Key insight: When a request needs N answers, it is slow if any one of them is slow. If each is
 *   slow with chance p, the request is slow with chance 1 - (1 - p)^N, which grows fast: 1% per
 *   call is 10% at N = 10 and 63% at N = 100. The service's p99 becomes the request's p90 or p50.
 *   You cannot fix that by making the average faster; you fix it by calling fewer things, or by
 *   not waiting for the rare slow answer.
 * Tradeoffs: Hedged requests add load (here ~1% more calls; more if the delay is shorter) and
 *   are only safe for reads or idempotent calls. Fewer, bigger services mean bigger codebases.
 *   A hedge cannot help when every copy is slow (an overloaded service): then it adds load.
 * Staff notes: Measure each dependency's p99 and p99.9, not its average, and multiply by the
 *   fan-out. Send hedges only after about the p95 of normal latency, so they stay a few percent
 *   of calls, and cap them (a budget) so they cannot double load during an overload.
 * Interview signals: "the page calls 20 services", "p99 is bad but every service looks fine",
 *   "scatter-gather", "search across shards", "tail latency".
 * Real world: Dean and Barroso's "The Tail at Scale" (Google, 2013) gives the 1-in-100, 100
 *   servers, 63% example, and reports that hedged requests sent after a 10 ms delay cut a
 *   BigTable benchmark's 99.9th percentile from 1,800 ms to 74 ms for 2% more requests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { call, clients, design, framesIn, knob, loadBalancer, run, server, summary, type CallStep, type TrafficRun } from "../traffic/index.ts";

// 500 page views a second, measured from our edge (1 ms away).
const users = () => clients({ to: "lb", qps: knob("qps", 500, [10, 1000]), mix: { read: 1, write: 0 }, hopMs: 1 });
// The page server does 1 ms of its own work, then calls each backend in turn.
// (The simulator makes calls one after another; real fan-out sends them at once. See the lesson.)
const page = (calls: CallStep[]) => server({ label: "Page", replicas: 4, cores: 4, threads: 200, serviceMs: { read: 1, write: 1 }, calls, hopMs: 1 });
// Each backend: 1.5 ms of CPU, four copies (machines), 0.5 ms away.
const backend = (n: number) => server({ label: `Service ${n}`, replicas: 4, cores: 8, serviceMs: { read: 1.5, write: 1.5 }, hopMs: 0.5, costPerHour: 0.34 });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `svc${i + 1}`);
const backends = (n: number) => Object.fromEntries(ids(n).map((id, i) => [id, backend(i + 1)]));

// @why Stage 1: the page needs one backend answer. When that call is slow, the page is slow.
export const oneCall = design("1. One backend call", {
  users: users(),
  lb: loadBalancer({ to: "page" }),
  page: page(ids(1)),
  ...backends(1),
});

// @why Stage 2: the page needs ten answers (price, stock, reviews, shipping...). It is slow if any one is.
export const tenCalls = design("2. Ten backend calls", {
  users: users(),
  lb: loadBalancer({ to: "page" }),
  page: page(ids(10)),
  ...backends(10),
});

// @why Stage 3: the same data from three services (merged services, batched lookups): fewer chances to be slow.
export const threeCalls = design("3. Three calls", {
  users: users(),
  lb: loadBalancer({ to: "page" }),
  page: page(ids(3)),
  ...backends(3),
});

// @why Stage 4: ten calls again, but if an answer is not back in 20 ms, give up on it and ask
// @why another copy of that service. A normal call takes about 3 ms, so only calls caught in a slow
// @why moment are repeated. (A timeout plus one retry: the simulator's simplified hedge.)
export const retryAnotherCopy = design("4. Ten calls, timeout and retry to another copy after 20 ms", {
  users: users(),
  lb: loadBalancer({ to: "page" }),
  page: page(ids(10).map((id) => call(id, { timeoutMs: knob("retry after (ms)", 20, [5, 200]), retry: { attempts: 2 } }))),
  ...backends(10),
});

// --- helpers for the scenarios ---

const S = { seconds: 12, seed: 1 };
// Every backend machine has a bad moment for 20 ms every 2 s (1% of the time): a garbage-collection
// pause, a noisy neighbour, CPU throttling. A call that starts then runs 50x slower: ~75 ms, not 1.5.
// The moments are spread out, so at any time about 1 machine in 100 is having one.
function hiccups(n: number) {
  return ids(n).flatMap((id, i) =>
    [1, 2, 3, 4].flatMap((r) => {
      const offset = ((i * 4 + r) * 311) % 2000;
      return [offset, offset + 2000, offset + 4000, offset + 6000, offset + 8000, offset + 10000].map((at) => ({
        at,
        kind: "slow" as const,
        target: `${id}-${r}`,
        factor: 50,
        durationMs: 20,
      }));
    }),
  );
}
// Share of successful page views slower than 60 ms (from 2 s on), from every request the run timed.
const slowShare = (r: TrafficRun, ms = 60) => {
  const lat = framesIn(r, 2).flatMap((f) => f.clients.latencies);
  return lat.filter((x) => x > ms).length / lat.length;
};

test("one call: fewer than 1 page in 100 is slow", () => {
  const r = run(oneCall, { ...S, faults: hiccups(1) });
  const s = summary(r, 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 7 && s.p50 < 10, `p50 ${s.p50}`);
  assert.ok(s.p99 > 38 && s.p99 < 48, `p99 ${s.p99}`);
  const slow = slowShare(r);
  assert.ok(slow > 0.004 && slow < 0.01, `slow ${slow}`);
});

test("broken: ten calls — about 1 page in 10 is slow, and p99 is the slow case", () => {
  const r = run(tenCalls, { ...S, faults: hiccups(10) });
  const s = summary(r, 2);
  assert.equal(s.errorRate, 0);
  // Normal pages take ~31 ms: ten calls in a row (see the lesson about parallel calls).
  assert.ok(s.p50 > 29 && s.p50 < 34, `p50 ${s.p50}`);
  // 1 - 0.99^10 = 9.6% of pages include a slow call.
  const slow = slowShare(r);
  assert.ok(slow > 0.08 && slow < 0.12, `slow ${slow}`);
  assert.ok(s.p99 > 130 && s.p99 < 190, `p99 ${s.p99}`);
  // No service is busy: the backends' CPUs are ~3% used. Nothing is overloaded, just unlucky.
  assert.ok(s.util.svc1 < 0.06, `svc1 cpu ${s.util.svc1}`);
});

test("three calls: about 3 pages in 100 are slow — better, but p99 still is", () => {
  const r = run(threeCalls, { ...S, faults: hiccups(3) });
  const s = summary(r, 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 12 && s.p50 < 15, `p50 ${s.p50}`);
  const slow = slowShare(r);
  assert.ok(slow > 0.015 && slow < 0.035, `slow ${slow}`);
  assert.ok(s.p99 > 85 && s.p99 < 100, `p99 ${s.p99}`);
});

test("retry after 20 ms: ten calls, and p99 is back near normal for about 1% more calls", () => {
  const r = run(retryAnotherCopy, { ...S, faults: hiccups(10) });
  const s = summary(r, 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 29 && s.p50 < 34, `p50 ${s.p50}`);
  // A slow call now costs 20 ms of waiting plus a normal call to another copy: ~55 ms at p99.
  assert.ok(s.p99 > 45 && s.p99 < 62, `p99 ${s.p99}`);
  assert.ok(slowShare(r) < 0.01, `slow ${slowShare(r)}`);
  // 5,000 backend calls a second; ~50 of them are retries.
  const calls = ids(10).reduce((n, id) => n + s.links[`page>${id}`].calls, 0);
  assert.ok(calls > 4800 && calls < 5300, `calls ${calls}`);
  assert.ok(s.serviceRetries > 35 && s.serviceRetries < 70, `retries ${s.serviceRetries}`);
});

test("broken: retry after 5 ms — the second try is sometimes slow too, and about 2% of pages fail", () => {
  // Giving up on the first try at 5 ms, barely past a normal answer: a retry that lands in another
  // slow moment also times out, and the page fails. A real hedge keeps the first try and cannot.
  const r = run(retryAnotherCopy, { ...S, faults: hiccups(10), knobs: { "retry after (ms)": 5 } });
  const s = summary(r, 2);
  assert.ok(s.errorRate > 0.015 && s.errorRate < 0.025, `errors ${s.errorRate}`);
  // About twice as many retries as at 20 ms.
  assert.ok(s.serviceRetries > 80 && s.serviceRetries < 130, `retries ${s.serviceRetries}`);
});
