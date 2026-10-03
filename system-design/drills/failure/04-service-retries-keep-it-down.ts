/**
 * 04. Service Retries Keep It Down
 * Level: Staff
 * Group: Failure drills
 *
 * Symptom: a 2-second slowdown of the inventory service at 4 s turns into a total outage that is
 *   still going at 15 s, long after the slowdown ended. Cause (hidden from the reader): the app
 *   retries each timed-out inventory call 3 more times at once, so inventory receives four times
 *   its normal load, which keeps it overloaded, which keeps calls timing out (a metastable failure).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { call, clients, design, loadBalancer, server, summary } from "../../traffic/index.ts";

// 1,500 requests a second. Every request asks the inventory service for stock (5 ms of CPU).
// Three 4-core inventory servers can do about 3 x 4 / 5 ms = 2,400 a second, so they run about
// 62% busy. The app gives each call 150 ms and makes up to 4 attempts.
const shop = (name: string, retryBudget?: number) =>
  design(name, {
    users: clients({ to: "lb", qps: 1500, timeoutMs: 2000 }),
    lb: loadBalancer({ to: "app" }),
    app: server({
      replicas: 4,
      cores: 4,
      threads: 100,
      queue: 200,
      serviceMs: { read: 2, write: 2 },
      calls: [call("inventory", { timeoutMs: 150, retry: { attempts: 4 }, ...(retryBudget === undefined ? {} : { retryBudget }) })],
    }),
    inventory: server({ replicas: 3, cores: 4, threads: 40, queue: 200, serviceMs: { read: 5, write: 5 } }),
  });

// Every inventory server runs at half speed from 4 s to 6 s (a bad deploy, rolled back at once).
const hiccup = [1, 2, 3].map((i) => ({ at: 4000, kind: "slow" as const, target: `inventory-${i}`, factor: 2, durationMs: 2000 }));

export const drill = failureDrill({
  title: "The slowdown ended, the outage did not",
  context:
    "A shop: users → load balancer → **4 app servers** → an **inventory service** (3 servers, about 62% busy). Every request asks inventory for stock. The app gives each inventory call **150 ms** and, if it fails or times out, **tries again at once, up to 4 attempts**. At 4 s errors start. Inventory's own dashboard shows it ran slower from 4 s to 6 s and has been at normal speed since. Yet at 15 s every request is still failing and inventory's CPUs are pinned at 100%.",
  design: shop("App retries inventory 3 more times, at once"),
  faults: hiccup,
  seconds: 15,
  seed: 1,
  question: "Inventory is back to normal speed. Why is it still overloaded?",
  options: [
    {
      text: "The app's own retries: every timed-out call is sent up to 3 more times, so inventory gets about four times the normal load, which keeps calls timing out, which keeps the retries coming.",
      correct: true,
      why: "Users still send about 1,500 requests a second, but inventory receives about 6,000 calls a second from 6 s on: about 4,500 of them are the app's retries. That is far more than the 2,400 it can serve at full speed, so it stays at 100% and calls keep timing out after 150 ms, each one sent again. The slowdown only tipped it over; the retries hold it down. This is a **metastable failure**: a state that sustains itself after its trigger is gone. It ends only when the extra load is removed.",
    },
    {
      text: "The bad deploy was not really rolled back; inventory is still slow.",
      why: "Inventory runs at normal speed after 6 s. It is busy because it is doing four times the work, not because each call costs more.",
    },
    {
      text: "Users are retrying, multiplying the traffic.",
      why: "Clients here never retry, and they send about 1,500 requests a second the whole run. The extra calls come from the app servers, one layer down.",
    },
    {
      text: "Inventory is under-provisioned; it needs more servers.",
      why: "At 62% busy it has room for 1.6 times today's traffic, which is normal headroom. To ride this out it would need about 2.5 times its servers, sized for the retries, not for the users.",
    },
  ],
  fix: {
    design: shop("App retries inventory within a 10% budget", 0.1),
    explain:
      "**Give retries a budget.** Each app server may retry at most 10% as many calls as it sent first attempts over the last 10 seconds. On a normal day that never binds; in an overload it caps the extra load at 10% instead of 300%, so once the slowdown ends inventory catches up within about two seconds. Retries help with rare, independent failures (one lost packet); when a dependency is overloaded, every retry is more of the load that is hurting it. Real systems use the same idea: gRPC's retry throttling and Finagle's retry budgets. Also retry with backoff and jitter, and retry at one layer only.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const before = summary(broken, 1, 4);
  const after = summary(broken, 8, 15);
  assert.equal(before.errorRate, 0);
  assert.ok(before.util.inventory > 0.55 && before.util.inventory < 0.7, `inventory before ${before.util.inventory}`);
  // Long after the 2-second slowdown, every request still fails.
  assert.equal(after.errorRate, 1);
  assert.ok(after.util.inventory > 0.99, `inventory cpu ${after.util.inventory}`);
  // Users send the same; inventory gets about four times as many calls, most of them the app's retries.
  assert.ok(Math.abs(after.sent - before.sent) < 0.05 * before.sent, `users ${before.sent} -> ${after.sent}`);
  assert.equal(after.retries, 0);
  assert.ok(after.calls.inventory > 5500, `inventory calls ${after.calls.inventory}`);
  assert.ok(after.links["app>inventory"].retries > 4000, `app retries ${after.links["app>inventory"].retries}`);
});

test("the fix removes it: retries capped, inventory back to normal two seconds after the slowdown", () => {
  const { fixed } = playDrill(drill);
  const after = summary(fixed, 8, 15);
  assert.equal(after.errorRate, 0);
  assert.ok(after.util.inventory < 0.7, `inventory ${after.util.inventory}`);
  assert.ok(after.links["app>inventory"].retries < 10, `app retries ${after.links["app>inventory"].retries}`);
  // While it lasted, retries stayed near the budget rather than 3 per call.
  const during = summary(fixed, 4, 6);
  assert.ok(during.links["app>inventory"].retries < 0.35 * during.links["app>inventory"].calls, `retries ${during.links["app>inventory"].retries} of ${during.links["app>inventory"].calls}`);
});
