/**
 * 03. Slow Dependency Holds Every Worker
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: from 4 s almost every request fails, saves included, though the app servers' CPUs sit
 *   near idle and the database is fine. Cause (hidden from the reader): the recommendations service
 *   slowed to about 1.2 s an answer, every page waits for it with no timeout, so every worker is
 *   stuck waiting and new requests time out in the queue.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { breaker, call, clients, database, design, external, loadBalancer, run, server, summary, type CallStep } from "../../traffic/index.ts";

// 1,500 requests a second, 9 in 10 page reads. Every page asks a recommendations service for
// "you might also like" (about 40 ms); saves only touch the database. Four app servers with 50
// workers each: 200 workers, about half of them busy on a normal day.
const shop = (name: string, recs: CallStep) =>
  design(name, {
    users: clients({ to: "lb", qps: 1500 }),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 4, cores: 4, serviceMs: { read: 5, write: 6 }, calls: { read: ["db", recs], write: ["db"] } }),
    db: database({ cores: 8, readMs: 2, writeMs: 4 }),
    recs: external({ label: "Recommendations", latencyMs: 40 }),
  });

// From 4 s to 12 s the recommendations service answers 30 times slower: about 1.2 s.
const slowRecs = [{ at: 4000, kind: "slow" as const, target: "recs", factor: 30, durationMs: 8000 }];

export const drill = failureDrill({
  title: "Everything fails, and the servers are idle",
  context:
    "A shop: users → load balancer → **4 app servers** (50 workers each) → a database. Every product page also asks a **recommendations service** for a \"you might also like\" row; saving a cart does not. Traffic is a steady 1,500 requests a second. At 4 s the pager fires: almost every request is failing or timing out, **saves included**. The app servers' CPUs are under 10% busy and the database is quiet.",
  design: shop("Pages wait on recommendations, however long it takes", "recs"),
  faults: slowRecs,
  seconds: 16,
  seed: 1,
  question: "Why are even saves failing?",
  options: [
    {
      text: "Recommendations got slow; every page waits on it with no time limit, so all 200 workers are stuck waiting and nothing else gets a worker.",
      correct: true,
      why: "From 5 s to 12 s the app servers' workers are 100% busy while their CPUs are under 10% busy: every worker is holding a page that is waiting for recommendations. A page needs a worker for about 1.2 s now instead of well under 100 ms, so the 200 workers serve about 170 pages a second, not 1,350. Saves never call recommendations, but they need a free worker too, so they wait in the same queue and time out with the pages. One optional feature took down the whole site.",
    },
    {
      text: "The database is overloaded.",
      why: "The database is less busy than before 4 s: fewer requests get far enough to reach it. Its answers are as fast as ever.",
    },
    {
      text: "The app servers need more CPU.",
      why: "Their CPUs are under 10% busy. The workers are not computing, they are waiting. Faster or more cores would wait just the same.",
    },
    {
      text: "There are too few app servers; double them.",
      why: "Pages now take about 1.2 s and users give up after 1 s, so even with unlimited workers almost every page would time out. Doubling the servers would double the number of workers stuck waiting.",
    },
  ],
  fix: {
    design: shop(
      "Recommendations behind a timeout, a breaker and a fallback",
      breaker("recs", { timeoutMs: 200, fallback: "skip", windowMs: 2000 }),
    ),
    explain:
      "**Bound the wait, then stop waiting at all.** A **timeout** of 200 ms caps how long a page waits for recommendations; the **fallback** renders the page without the row (a degraded but useful answer). A timeout alone is not enough here: 1,350 pages a second each holding a worker for 200 ms is about 270 busy workers, more than the 200 there are. The **circuit breaker** fixes that: once most recent calls fail, it stops calling for a few seconds, so pages skip the row at once and the workers stay free. Every call to a dependency needs a deadline, and an optional dependency needs a way to answer without it.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const before = summary(broken, 1, 4);
  const during = summary(broken, 5, 12);
  assert.equal(before.errorRate, 0);
  // Under 60% of 200 workers busy at about 1,500 a second: a request holds a worker well under 100 ms.
  assert.ok(before.threads.app < 0.6, `workers before ${before.threads.app}`);
  assert.ok((before.threads.app * 200) / before.ok < 0.1, `worker hold ${(before.threads.app * 200) / before.ok} s`);
  // Almost everything fails, saves included, though saves never call recommendations.
  assert.ok(during.errorRate > 0.95, `errors ${during.errorRate}`);
  assert.ok(during.byKind.write!.errorRate > 0.95, `save errors ${during.byKind.write!.errorRate}`);
  // Every worker busy, CPUs nearly idle: waiting, not computing.
  assert.ok(during.threads.app > 0.99 && during.util.app < 0.1, `workers ${during.threads.app}, cpu ${during.util.app}`);
  // Not the database: it is less busy than before.
  assert.ok(during.util.db < before.util.db, `db ${before.util.db} -> ${during.util.db}`);
  // It ends when recommendations recover.
  assert.equal(summary(broken, 13, 16).errorRate, 0);
});

test("a timeout alone is not enough: 200 ms waits still fill the 200 workers", () => {
  const t = run(shop("Timeout and fallback, no breaker", call("recs", { timeoutMs: 200, fallback: "skip" })), { seconds: 16, seed: 1, faults: slowRecs });
  const during = summary(t, 5, 12);
  assert.ok(during.threads.app > 0.99, `workers ${during.threads.app}`);
  assert.ok(during.errorRate > 0.2, `errors ${during.errorRate}`);
});

test("the fix removes it: the breaker opens, pages skip the row, nothing waits", () => {
  const { fixed } = playDrill(drill);
  const during = summary(fixed, 5, 12);
  assert.ok(during.errorRate < 0.03, `errors ${during.errorRate}`);
  assert.ok(during.byKind.write!.errorRate < 0.03, `save errors ${during.byKind.write!.errorRate}`);
  assert.ok(during.degradedRate > 0.8, `pages without the row ${during.degradedRate}`);
  assert.ok(during.links["app>recs"].openShare > 0.9, `breaker open ${during.links["app>recs"].openShare}`);
  assert.ok(during.threads.app < 0.2, `workers ${during.threads.app}`);
});
