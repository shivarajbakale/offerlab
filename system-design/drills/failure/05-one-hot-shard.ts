/**
 * 05. One Hot Shard
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: a third of requests fail; one of four database shards is at 100% CPU while the other
 *   three sit between a quarter and a half busy. Cause (hidden from the reader): one viral post
 *   gets about a third of all reads, and every read of one key goes to the one shard that owns it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { cache, cacheAside, clients, database, design, invalidate, loadBalancer, run, server, summary } from "../../traffic/index.ts";

// 2,400 requests a second, 95% reads of posts. Keys are hashed over 4 database shards, each a
// 4-core machine doing a read in 5 ms: about 3,200 reads a second in all, so on average the
// shards would run about 75% busy. `skew` 1.5 means a few posts get most reads: the top one
// alone gets about 38% of them.
const posts = (name: string, o: { shards: number; cache: boolean }) =>
  design(name, {
    users: clients({ to: "lb", qps: 2400, mix: { read: 0.95, write: 0.05 }, skew: 1.5 }),
    lb: loadBalancer({ to: "app" }),
    app: server({
      replicas: 6,
      cores: 4,
      serviceMs: { read: 4, write: 5 },
      calls: o.cache ? { read: [cacheAside("cache", "db")], write: ["db", invalidate("cache")] } : { read: ["db"], write: ["db"] },
    }),
    ...(o.cache ? { cache: cache({ capacity: 1000 }) } : {}),
    db: database({ cores: 4, readMs: 5, writeMs: 6, shards: o.shards }),
  });

export const drill = failureDrill({
  title: "One shard on fire, three idle",
  context:
    "A social app: users → load balancer → **6 app servers** → a database **split into 4 shards** by a hash of the post id. Traffic is a steady 2,400 requests a second, 95% of them reading a post. Since a post went viral this morning, about a third of requests fail. The database dashboard shows **one shard at 100% CPU** and the other three between a quarter and a half busy.",
  design: posts("Posts hashed over 4 shards", { shards: 4, cache: false }),
  faults: [],
  seconds: 10,
  seed: 1,
  question: "What is the most likely cause, and what would help?",
  options: [
    {
      text: "The viral post is one key, and one key always lives on one shard: that shard gets about 38% of all reads on top of its share of the rest. Cache the hot posts in front of the database.",
      correct: true,
      why: "Hashing spreads **keys** evenly, not **requests**. The top post's reads alone need more than that shard's 4 cores, while the other three shards have room to spare. A cache holding the 1,000 most-read posts answers most reads (about 85% here) before they reach any shard, the hot one included, and nothing fails. Other real fixes for one hot key: read replicas of the hot shard, or splitting the key (copies under several keys, read at random).",
    },
    {
      text: "There are too few shards; go from 4 to 8.",
      why: "More shards move other keys off the hot shard, but the viral post still lives on exactly one of them, and its reads alone are more than one shard can serve. With 8 shards, one is still at 100% and requests still fail; the other seven get quieter.",
    },
    {
      text: "The hash function is unbalanced.",
      why: "The three quiet shards are not equally quiet, but none is anywhere near the hot one. A hash maps each key to one shard; it cannot split one key's traffic, however good it is.",
    },
    {
      text: "The app servers are overloaded.",
      why: "Their workers are all busy, but waiting on the hot shard, not computing. Their CPUs are not the limit.",
    },
  ],
  fix: {
    design: posts("A cache in front of the shards", { shards: 4, cache: true }),
    explain:
      "**Absorb hot keys above the partitioning.** A cache (here 1,000 posts) answers reads of the viral post from memory, so the shard that owns it sees only the misses and the writes. Partitioning scales the number of keys; it does nothing for one key's traffic. When you pick a partition key, ask what happens when one value of it becomes a celebrity: a viral post, a famous account, a flash-sale item.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const s = summary(broken, 1, 10);
  assert.ok(s.errorRate > 0.28 && s.errorRate < 0.4, `errors ${s.errorRate}`);
  const shards = [...s.replicaUtil.db].sort((a, b) => b - a);
  assert.ok(shards[0] > 0.99, `hot shard ${shards[0]}`);
  assert.ok(shards.slice(1).every((u) => u > 0.2 && u < 0.5), `other shards ${shards.slice(1)}`);
  // App workers all busy, waiting on the hot shard; their CPUs are not the limit.
  assert.ok(s.threads.app > 0.99 && s.util.app < 0.4, `app workers ${s.threads.app}, cpu ${s.util.app}`);
});

test("the top post gets about 38% of reads (Zipf, exponent 1.5, over 100,000 posts)", () => {
  let sum = 0;
  for (let k = 1; k <= 100_000; k++) sum += 1 / k ** 1.5;
  assert.ok(Math.abs(1 / sum - 0.38) < 0.01, `top share ${1 / sum}`);
});

test("more shards do not help: with 8, one is still at 100% and requests still fail", () => {
  const t = run(posts("Posts hashed over 8 shards", { shards: 8, cache: false }), { seconds: 10, seed: 1 });
  const s = summary(t, 1, 10);
  assert.ok(s.errorRate > 0.1, `errors ${s.errorRate}`);
  assert.ok(Math.max(...s.replicaUtil.db) > 0.99, `hot shard ${Math.max(...s.replicaUtil.db)}`);
});

test("the fix removes it: the cache answers most reads and no shard is busy", () => {
  const { fixed } = playDrill(drill);
  const s = summary(fixed, 1, 10);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cache > 0.82, `hit ${s.hitRate.cache}`);
  assert.ok(Math.max(...s.replicaUtil.db) < 0.5, `busiest shard ${Math.max(...s.replicaUtil.db)}`);
});
