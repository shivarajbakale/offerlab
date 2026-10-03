/**
 * 12. Checkout Takes the Catalog Down
 * Level: Staff
 * Group: Failure drills
 *
 * Symptom: the payment provider slows down at 4 s, and product pages, which never touch payments,
 *   fail too: almost 9 in 10 page views fail until it recovers. Cause (hidden from the reader):
 *   checkouts and page views share one pool of workers, and checkouts waiting on slow payments
 *   hold all of them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { clients, database, design, external, loadBalancer, run, server, summary } from "../../traffic/index.ts";

// 1,500 requests a second: 80% product pages (database only), 20% checkouts (database, then the
// payment provider, about 150 ms). Users wait 1 s for a page and 5 s for a checkout. Four app
// servers with 50 workers each: 200 workers; about 60 are busy on a normal day, most of them in checkouts.
const shop = (name: string, o: { pools?: Record<string, number>; replicas?: number } = {}) =>
  design(name, {
    users: clients({ to: "lb", qps: 1500, mix: { read: 0.8, write: 0.2 }, timeoutMs: { read: 1000, write: 5000 } }),
    lb: loadBalancer({ to: "app" }),
    app: server({
      replicas: o.replicas ?? 4,
      cores: 4,
      serviceMs: { read: 5, write: 6 },
      calls: { read: ["db"], write: ["db", "payments"] },
      ...(o.pools ? { pools: o.pools } : {}),
    }),
    db: database({ cores: 8, readMs: 2, writeMs: 4 }),
    payments: external({ label: "Payment provider", latencyMs: 150 }),
  });

// From 4 s to 12 s the provider answers 15 times slower: about 2.3 s.
const slowPayments = [{ at: 4000, kind: "slow" as const, target: "payments", factor: 15, durationMs: 8000 }];

export const drill = failureDrill({
  title: "Payments are slow, so the catalog is down",
  context:
    "A shop: users → load balancer → **4 app servers** (50 workers each) → a database. Product pages only read the database; **checkouts** also call an outside **payment provider**. At 4 s the provider's status page says \"degraded performance\". Checkouts getting slow is expected. But the pager is about **product pages**: from about 5 s, nearly 9 in 10 fail, though they never call the provider. The app servers' CPUs are around 13% busy. Everything recovers once the provider does, at about 12 s.",
  design: shop("One pool of workers for everything"),
  faults: slowPayments,
  seconds: 16,
  seed: 1,
  question: "Why do product pages fail when only payments are slow?",
  options: [
    {
      text: "Pages and checkouts share the same workers; checkouts waiting on slow payments end up holding all of them, so pages queue behind them and time out.",
      correct: true,
      why: "About 300 checkouts a second each now hold a worker for about 2.3 s: about 700 workers' worth, against 200. Every worker that frees up is soon taken by another checkout, so pages wait in the same queue and miss their 1 s deadline. One slow dependency spread to every feature that shares its resources. Ships solve the same problem with **bulkheads**: walls that keep one flooded compartment from sinking the ship.",
    },
    {
      text: "There are too few app servers; doubling them would ride it out.",
      why: "Doubling the servers to 400 workers is still far short of the about 700 that slow checkouts would hold, and in this run page views still fail more than half the time with 8 servers.",
    },
    {
      text: "The database is overloaded by the checkouts.",
      why: "The database does less work than before 4 s: fewer requests get a worker to reach it. Checkouts are slow at the provider, after their database write.",
    },
    {
      text: "The payment provider is rate-limiting the shop, and the errors spread.",
      why: "The provider is slow, not refusing: calls to it succeed, after about 2.3 s. Pages fail by timing out or being refused at the app servers, which never call the provider for a page.",
    },
  ],
  fix: {
    design: shop("At most 30 workers per server may wait on payments", { pools: { payments: 30 } }),
    explain:
      "**Put a bulkhead around each dependency.** Each app server lets at most 30 of its 50 workers wait on the payment provider at once (normally about 15 do); a checkout that finds them all busy fails at once instead of taking a worker from pages. During the slowdown checkouts still mostly fail, but product pages do not notice. Size the pool from normal concurrency (calls a second x latency) with headroom. Real systems do this with a separate thread pool or connection pool per dependency, or a semaphore per downstream (Resilience4j's bulkhead is one). Add a timeout and a circuit breaker to the payment call too, so checkouts fail fast instead of piling up in the pool. Because a timed-out charge may still have gone through, send every attempt with the same idempotency key and reconcile unknown outcomes with the provider before telling the user it failed.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const before = summary(broken, 1, 4);
  const during = summary(broken, 5, 12);
  assert.equal(before.errorRate, 0);
  // Pages, which never call payments, nearly all fail.
  assert.ok(during.byKind.read!.errorRate > 0.85, `page errors ${during.byKind.read!.errorRate}`);
  // Every worker busy, CPUs idle: waiting on payments.
  assert.ok(during.threads.app > 0.99 && during.util.app < 0.15, `workers ${during.threads.app}, cpu ${during.util.app}`);
  assert.ok(during.util.db < before.util.db, `db ${before.util.db} -> ${during.util.db}`);
  // It ends when the provider recovers.
  assert.equal(summary(broken, 13, 16).byKind.read!.errorRate, 0);
});

test("more servers do not fix it: with 8, pages still fail more than half the time", () => {
  const t = run(shop("Eight app servers", { replicas: 8 }), { seconds: 16, seed: 1, faults: slowPayments });
  assert.ok(summary(t, 5, 12).byKind.read!.errorRate > 0.5, `page errors ${summary(t, 5, 12).byKind.read!.errorRate}`);
});

test("the fix removes it: pages never notice; only checkouts fail", () => {
  const { fixed } = playDrill(drill);
  assert.equal(summary(fixed, 1, 4).errorRate, 0);
  const during = summary(fixed, 4, 12);
  assert.equal(during.byKind.read!.errorRate, 0);
  assert.ok(during.byKind.read!.p99 < 70, `page p99 ${during.byKind.read!.p99}`);
  assert.ok(during.byKind.write!.errorRate > 0.5, `checkout errors ${during.byKind.write!.errorRate}`);
  assert.ok(during.links["app>payments"].poolFull > 100, `refused by the bulkhead ${during.links["app>payments"].poolFull}`);
});
