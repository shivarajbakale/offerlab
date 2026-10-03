/**
 * 11. Ten Users Slow Everyone
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: p99 is about 380 ms instead of about 70, about 8% of requests are refused, and the app
 *   servers' CPUs are at 100%, with no deploy and no fault. Cause (hidden from the reader): 10 of
 *   5,000 users (a scraper, a buggy integration) send 45% of all requests, about 72 a second each,
 *   and nothing stops one user from taking as much capacity as they like.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { clients, database, design, loadBalancer, server, summary } from "../../traffic/index.ts";

// 1,600 requests a second from 5,000 users, but 10 of them send 45% of it: 720 a second, about
// 72 each, while the other 4,990 send about 0.18 a second each. Three app servers, 8 ms of CPU a
// request: about 1,500 a second of capacity.
const api = (name: string, rateLimit?: { perSecond: number; burst: number }) =>
  design(name, {
    users: clients({ to: "lb", qps: 1600, abuseShare: 0.45, abusers: 10 }),
    lb: loadBalancer({ to: "app", ...(rateLimit ? { rateLimit } : {}) }),
    app: server({ replicas: 3, cores: 4, serviceMs: { read: 8, write: 10 }, calls: ["db"] }),
    db: database({ cores: 8, readMs: 2, writeMs: 4 }),
  });

export const drill = failureDrill({
  title: "Slow for everyone, and nobody deployed",
  context:
    "A public API: users → load balancer → **3 app servers** → a database. About 5,000 users are active. Traffic is a steady 1,600 requests a second, a little over what the servers can serve. p99 is about 380 ms (it is usually about 70), about 8% of requests get a 503, and the app servers' CPUs are pinned at 100%. Nothing was deployed; no machine is down. The per-user breakdown shows normal users and the heaviest users suffering alike.",
  design: api("No per-user limit"),
  faults: [],
  seconds: 15,
  seed: 1,
  question: "What is the most likely cause?",
  options: [
    {
      text: "A few users (10 of 5,000) send almost half the traffic, and nothing limits how much one user can take, so everyone shares the overload.",
      correct: true,
      why: "The 10 heaviest users send about 720 requests a second, about 72 each; the other 4,990 users send about 0.18 a second each, together about 880 a second, which the servers could serve at about 60% busy. The servers have no notion of fairness: they serve requests in arrival order, so normal users' requests wait in the same queues and are refused at the same rate as the heavy users'. This is a **noisy neighbour**: one tenant's load degrading everyone's service.",
    },
    {
      text: "The fleet is under-provisioned for normal growth.",
      why: "Without the 10 heavy users, the load is about 880 requests a second, which three servers serve at about 60% busy. Adding servers would hide it for a while, paying for capacity that serves 10 users, until they send more.",
    },
    {
      text: "The database is slow.",
      why: "It answers in a few ms and is far from busy. The app servers' CPUs are the limit.",
    },
    {
      text: "A retry storm: clients are retrying failed requests.",
      why: "Clients here never retry; the heavy users' load is first attempts, steady from the first second.",
    },
  ],
  fix: {
    design: api("A per-user rate limit at the load balancer", { perSecond: 10, burst: 20 }),
    explain:
      "**Limit each user, not just the total.** A **token bucket** per user at the load balancer allows 10 requests a second with bursts of 20; above that, a request is refused at once with a 429 (\"too many requests\"), costing the servers nothing. Normal users never come near it, so none of them is refused, and p99 is back to about 70 ms; the heavy users get about 10 a second each. Rate limits need a key (user, API key, account, IP), a limit sized from real usage, a clear 429 with a Retry-After, and, for paying tenants, quotas or separate capacity. With several load balancers, the limit is either shared (a central counter, such as one in Redis) or split between them.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const s = summary(broken, 2, 15);
  assert.ok(s.p99 > 350, `p99 ${s.p99}`);
  assert.ok(s.errorRate > 0.06 && s.errorRate < 0.1, `errors ${s.errorRate}`);
  assert.ok(s.util.app > 0.99, `cpu ${s.util.app}`);
  assert.ok(s.util.db < 0.5, `db ${s.util.db}`);
  // 10 heavy users send about 720 a second, everyone else about 880.
  assert.ok(Math.abs(s.byClass.heavy.sent - 720) < 30, `heavy ${s.byClass.heavy.sent}`);
  assert.ok(Math.abs(s.byClass.normal.sent - 880) < 30, `normal ${s.byClass.normal.sent}`);
  // Normal users suffer just as much as the heavy ones.
  assert.ok(s.byClass.normal.errorRate > 0.06 && s.byClass.normal.p99 > 350, `normal ${s.byClass.normal.errorRate}, ${s.byClass.normal.p99}`);
  assert.equal(s.retries, 0);
});

test("the fix removes it: normal users are never refused, the heavy ones get about 10 a second each", () => {
  const { fixed } = playDrill(drill);
  const s = summary(fixed, 2, 15);
  assert.equal(s.byClass.normal.errorRate, 0);
  assert.ok(s.byClass.normal.p99 < 75, `normal p99 ${s.byClass.normal.p99}`);
  assert.ok(Math.abs(s.byClass.heavy.ok - 100) < 10, `heavy served ${s.byClass.heavy.ok}`);
  assert.ok(s.util.app < 0.7, `cpu ${s.util.app}`);
});
