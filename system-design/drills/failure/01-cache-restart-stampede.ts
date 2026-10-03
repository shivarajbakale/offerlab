/**
 * 01. Cache Restart Stampede
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: just after 5 s errors climb from 0 to about 20%, then about 40%, and stay there;
 *   nothing was deployed and traffic is flat. Cause (hidden from the reader): the cache restarted empty, so most reads
 *   became database reads, and the database cannot carry the full read load.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { cache, cacheAside, clients, database, design, invalidate, loadBalancer, summary, server } from "../../traffic/index.ts";

// 2,400 requests a second, 9 in 10 reads. Ten app servers read through one cache that holds the
// 20,000 most-used of 100,000 keys (about 80% of reads), and fall back to one database.
const shop = (name: string, dbReplicas: number) =>
  design(name, {
    users: clients({ to: "lb", qps: 2400 }),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 10, cores: 4, serviceMs: { read: 6, write: 8 }, calls: { read: [cacheAside("cache", "db")], write: ["db", invalidate("cache")] } }),
    cache: cache({ capacity: 20_000 }),
    db: database({ cores: 4, readMs: 3, writeMs: 6, replicas: dbReplicas }),
  });

export const drill = failureDrill({
  title: "Errors just after 5 seconds, nobody deployed",
  context:
    "An online shop: users → load balancer → **10 app servers** → a **cache** in front of one **database**. Traffic is a steady 2,400 requests a second. Just after 5 s the error rate climbs from 0 to about 20%, then to about 40%, and it stays there. Nobody deployed anything.",
  design: shop("A shop with one database", 1),
  faults: [{ at: 5000, kind: "restart", target: "cache" }],
  seconds: 15,
  seed: 1,
  question: "What is the most likely cause?",
  options: [
    {
      text: "The cache came back empty, so most reads now go to the database, which cannot carry them.",
      correct: true,
      why: "The cache's hit rate falls from 80% to about 25% in the same second the database hits 100% CPU. Before 5 s the database saw 1 read in 5 (about 430 a second); with the cache cold it sees most of 2,160. It refills only as it misses, so the overload lasts for many seconds: a **thundering herd** (cache stampede). And while the database is overloaded, many of its answers arrive after the user has given up (about 400 a second from 8 s), so the cache warms slowly and the errors do not fall within the run.",
    },
    {
      text: "A traffic spike: more users arrived at 5 s.",
      why: "The Requests a second chart is flat at 2,400 the whole run. Same traffic, different work per request.",
    },
    {
      text: "The app servers ran out of CPU.",
      why: "Their workers are all busy, but their CPUs are mostly idle: every worker is waiting for the database to answer. More app servers would add more waiters.",
    },
    {
      text: "The database's disk slowed down.",
      why: "A slower database would not change the cache's hit rate. Here the hit rate collapses first, and the database is busy because it is doing three to four times as many reads.",
    },
  ],
  fix: {
    design: shop("A shop whose database survives a cold cache", 3),
    explain:
      "Size the database for the day the cache is empty: here two read replicas take the miss traffic and nothing fails while the cache refills. A cache that hides a capacity gap is load-bearing; a restart, an eviction storm or a new deploy that changes cache keys exposes the gap. Other fixes, which this simulator does not model: **request coalescing** (one database read per missing key, however many requests miss it at once), **warming** a new cache before it takes traffic, and restarting cache nodes one at a time so only a slice of keys is cold.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const before = summary(broken, 2, 5);
  const first = summary(broken, 5, 6);
  const after = summary(broken, 6, 15);
  assert.equal(before.errorRate, 0);
  assert.ok(before.hitRate.cache > 0.75 && before.util.db < 0.8, `before: hit ${before.hitRate.cache}, db ${before.util.db}`);
  assert.ok(first.hitRate.cache < 0.35 && first.util.db > 0.95, `first second: hit ${first.hitRate.cache}, db ${first.util.db}`);
  assert.ok(after.errorRate > 0.2, `errors ${after.errorRate}`);
  assert.ok(summary(broken, 6, 8).errorRate < 0.3 && summary(broken, 8, 15).errorRate > 0.35, `errors 6-8 s ${summary(broken, 6, 8).errorRate}, 8-15 s ${summary(broken, 8, 15).errorRate}`);
  // The cache warms slowly because the overloaded database answers many reads too late to use:
  // `wasted` is a total over the window (about 400 a second from 8 s), and errors do not fall.
  assert.ok(summary(broken, 8, 15).wasted / 7 > 300, `wasted ${summary(broken, 8, 15).wasted / 7} a second`);
  assert.ok(summary(broken, 13, 15).errorRate >= summary(broken, 6, 8).errorRate, `errors 6-8 s ${summary(broken, 6, 8).errorRate}, 13-15 s ${summary(broken, 13, 15).errorRate}`);
  // Not a traffic spike, and not the app servers' CPUs: they wait on the database.
  assert.ok(Math.abs(after.sent - before.sent) < 0.05 * before.sent, `sent ${before.sent} -> ${after.sent}`);
  assert.ok(after.threads.app > 0.95 && after.util.app < 0.5, `app workers ${after.threads.app}, cpu ${after.util.app}`);
});

test("the fix removes it: the same cold cache, no errors", () => {
  const { fixed } = playDrill(drill);
  const after = summary(fixed, 5, 15);
  assert.equal(after.errorRate, 0);
  assert.ok(after.hitRate.cache < 0.6, `the cache is just as cold: hit ${after.hitRate.cache}`);
  assert.ok(after.util.db < 0.6, `db ${after.util.db}`);
});
