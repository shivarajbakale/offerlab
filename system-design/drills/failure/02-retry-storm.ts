/**
 * 02. Retry Storm
 * Level: Staff
 * Group: Failure drills
 *
 * Symptom: a 3-second hiccup on the app servers turns into 4 seconds of errors and multi-second
 *   latency, with fewer successful requests than the servers could serve even while slowed.
 *   Cause (hidden from the reader): deep queues hold requests past the client timeout, and
 *   clients resend at once, so the servers spend their reduced capacity on abandoned requests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { clients, design, loadBalancer, server, summary } from "../../traffic/index.ts";

// 1,600 requests a second; each costs 6 ms of CPU. Three 4-core servers can serve about
// 3 x 4 / 6 ms = 2,000 a second, so they run about 80% busy. Clients give up after 1 second.
const api = (name: string, o: { retry: "immediate" | "backoff"; queue: number }) =>
  design(name, {
    users: clients({ to: "lb", qps: 1600, timeoutMs: 1000, retry: o.retry, attempts: 3 }),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 3, cores: 4, threads: 50, queue: o.queue, serviceMs: { read: 6, write: 6 } }),
  });

// Every server runs 4 times slower from 4 s to 7 s: a garbage-collection storm, a noisy neighbour.
const hiccup = [1, 2, 3].map((i) => ({ at: 4000, kind: "slow" as const, target: `app-${i}`, factor: 4, durationMs: 3000 }));

export const drill = failureDrill({
  title: "A short hiccup, a long outage",
  context:
    "An API: users → load balancer → **3 app servers**, each with 50 workers and room for **400 requests waiting** for a worker. Traffic is a steady 1,600 requests a second and the servers run about 80% busy. Client libraries give up after 1 second and **resend a failed request at once**, up to 3 tries. Something happened at 4 s.",
  design: api("Deep queues, clients resend at once", { retry: "immediate", queue: 400 }),
  faults: hiccup,
  seconds: 15,
  seed: 1,
  question: "Errors go on until about 8 s, latency stays in the seconds until about 9 s and is back to normal only at about 11 s, and from 4 s to 7 s only about 240 requests a second succeed. What made it this bad?",
  options: [
    {
      text: "Requests wait in the deep queues past the 1 s timeout; clients resend at once, and the servers spend their capacity on requests nobody is waiting for any more.",
      correct: true,
      why: "From 4 s to 7 s the servers were slowed to about a quarter of their speed (500 a second), yet only about 240 a second reached a user in time: the rest of the work went to requests whose callers had already given up (the servers finished about 800 of those in the 3 seconds, a little more than half their work). Each give-up was resent at once, so clients sent about 2,700 retries a second on top of 1,600 new requests. When the servers recovered, they first had to drain 400-deep queues of stale work, so errors lasted until about 8 s and latency took until about 11 s to return to normal.",
    },
    {
      text: "A traffic surge: more users arrived at 4 s.",
      why: "New requests stay at about 1,600 a second; the Requests a second chart counts first attempts only. The extra load was retries of the same requests.",
    },
    {
      text: "One server died and the load balancer kept sending it traffic.",
      why: "Every server stays up the whole time (all their dots are green). All three got slower together.",
    },
    {
      text: "Three servers are too few; the fleet is under-provisioned.",
      why: "At 80% busy there is 20% headroom, which is normal. A fourth server would shorten the slow phase a little, but the queues would still fill with abandoned work and the retries would still multiply the load.",
    },
  ],
  fix: {
    design: api("Short queues, clients back off", { retry: "backoff", queue: 50 }),
    explain:
      "**Fail fast and back off.** A queue of 50 holds less than a second of work, so a request that cannot be served soon is rejected at once (a cheap 503) instead of waiting past its timeout; no capacity is spent on abandoned requests and the backlog clears within a second of the hiccup ending. Clients wait before resending (100 ms, then 200 ms, times a random factor), which spreads retries out. In production, add a **retry budget** (retries at most 10% of requests) so retries can never multiply load, and make servers drop requests whose deadline has already passed.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const before = summary(broken, 1, 4);
  const during = summary(broken, 4, 7);
  assert.equal(before.errorRate, 0);
  // Fewer successes than the slowed servers could serve (about 500 a second), and much wasted work.
  assert.ok(during.ok < 300, `ok ${during.ok}`);
  // `wasted` is a total over the window: about 800 finished for callers who had gone.
  assert.ok(during.wasted > 600, `wasted ${during.wasted}`);
  // Retries multiply the load: well over the 1,600 new requests a second.
  assert.ok(during.retries > 2000, `retries ${during.retries}`);
  assert.ok(Math.abs(during.sent - before.sent) < 0.1 * before.sent, `new requests ${before.sent} -> ${during.sent}`);
  // After the servers recover at 7 s, latency stays in the seconds while stale queues drain.
  assert.ok(summary(broken, 7, 8).p99 > 2000, `p99 7-8 s ${summary(broken, 7, 8).p99}`);
  assert.ok(summary(broken, 8, 9).p99 > 1000, `p99 8-9 s ${summary(broken, 8, 9).p99}`);
  assert.ok(summary(broken, 9, 11).p50 > 150, `p50 9-11 s ${summary(broken, 9, 11).p50}`);
  // Errors end at about 8 s; p99 drops below a second by 9-10 s and is normal from 11 s.
  assert.ok(summary(broken, 7, 8).errorRate > 0.1, `errors 7-8 s ${summary(broken, 7, 8).errorRate}`);
  assert.equal(summary(broken, 8, 11).errorRate, 0);
  assert.ok(summary(broken, 9, 10).p99 < 1000, `p99 9-10 s ${summary(broken, 9, 10).p99}`);
  assert.ok(summary(broken, 11, 15).p99 < 100, `p99 11-15 s ${summary(broken, 11, 15).p99}`);
});

test("the fix removes it: no wasted work, twice the successes, normal a second after the hiccup", () => {
  const { fixed } = playDrill(drill);
  const during = summary(fixed, 4, 7);
  assert.ok(during.wasted === 0, `wasted ${during.wasted}`);
  assert.ok(during.ok > 450, `ok ${during.ok}`);
  const after = summary(fixed, 8, 15);
  assert.equal(after.errorRate, 0);
  assert.ok(after.p99 < 200, `p99 ${after.p99}`);
});
