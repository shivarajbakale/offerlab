/**
 * 10. Every Key Expires at Once
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: after a planned cache restart at 2 s and the expected stampede, the database's CPU
 *   becomes a sawtooth with a 5-second period (near idle, then about 40% for 3-4 s) where it was
 *   flat before, and p99 rises and falls with it. Cause (hidden from the reader): the restart
 *   refilled every entry within the same few seconds, and every entry has the same 5 s TTL, so
 *   they expire, and are refetched, together.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { cache, cacheAside, clients, database, design, framesIn, invalidate, loadBalancer, server, summary, type TrafficRun } from "../../traffic/index.ts";

// 1,200 requests a second over 300 category pages, nearly all reads. Each page is an expensive
// query (30 ms of database CPU), cached. With a 5 s TTL every page is refetched about every 5 s:
// 300 x 30 ms / 5 s = about 1.8 cores, under a quarter of the database's 8, when spread out.
const catalog = (name: string, o: { ttlMs: number; invalidate: boolean }) =>
  design(name, {
    users: clients({ to: "lb", qps: 1200, mix: { read: 0.99, write: 0.01 }, keys: 300, skew: 0.3 }),
    lb: loadBalancer({ to: "app" }),
    app: server({
      replicas: 6,
      cores: 4,
      serviceMs: { read: 4, write: 6 },
      calls: { read: [cacheAside("cache", "db")], write: o.invalidate ? ["db", invalidate("cache")] : ["db"] },
    }),
    cache: cache({ capacity: 300, ttlMs: o.ttlMs }),
    db: database({ cores: 8, readMs: 30, writeMs: 6 }),
  });

/** Database CPU in each half second from `fromS` to `toS`. */
const halfSeconds = (r: TrafficRun, fromS: number, toS: number) => {
  const out: number[] = [];
  for (let t = fromS; t < toS; t += 0.5) out.push(summary(r, t, t + 0.5).util.db);
  return out;
};

export const drill = failureDrill({
  title: "A sawtooth since the cache restart",
  context:
    "A catalog: users → load balancer → **6 app servers** → a **cache** (every one of the 300 category pages, each kept for **5 seconds**) in front of a database. A category page is an expensive query. At 2 s the cache was restarted for an upgrade; the stampede that followed was expected and was over by about 5 s. But since then the database's CPU chart is a **sawtooth**: almost idle for half a second or so, then about 40% for three or four seconds, again and again, **5 seconds apart**. p99 rises and falls with it. Before the restart the same database ran flat, about a quarter busy. Traffic is steady.",
  design: catalog("Every page cached for 5 s", { ttlMs: 5000, invalidate: false }),
  faults: [{ at: 2000, kind: "restart", target: "cache" }],
  seconds: 20,
  seed: 1,
  question: "Why does the database's load now come in waves, 5 seconds apart?",
  options: [
    {
      text: "The restart refilled every page within the same few seconds, and every page has the same 5 s TTL, so they all expire together, are refetched together, and so stay in step.",
      correct: true,
      why: "A TTL counts from when the entry was filled. Before the restart, entries had been filled at scattered times, so expiries were spread out and the refetch work was a flat line. The restart filled all 300 at once; 5 s later they all expired at once; each refill lands at about the same moment again, so the wave repeats every TTL. The average work is the same as before; it is just bunched up. Here the peaks are survivable; with more keys, a more expensive query or a busier hour, a peak tips the database over, and requests that miss while it is busy run the same query again (a **thundering herd**).",
    },
    {
      text: "The cache keeps restarting every 5 seconds.",
      why: "It restarted once, at 2 s, and has been up since. Its hit rate stays high between waves; each wave is a burst of expiries, not an empty cache.",
    },
    {
      text: "A scheduled job hits the database every 5 seconds.",
      why: "Only the app servers use the database, and traffic is steady. The waves begin right as many cache entries expire, and they began only after the restart.",
    },
    {
      text: "The cache is too small, so it keeps evicting pages.",
      why: "It holds all 300 pages. Nothing is evicted; entries leave only when their 5 s are up.",
    },
  ],
  fix: {
    design: catalog("Pages dropped on change, TTL as a 5-minute safety net", { ttlMs: 300_000, invalidate: true }),
    explain:
      "**Do not let expiry times line up.** The usual fixes: add random **jitter** to each TTL (say 5 s plus or minus 20%), so entries filled together expire apart; **refresh ahead** of expiry in the background, so readers never wait for a refetch; and let only one request refetch a missing key while others wait for it (**request coalescing**). This simulator gives every entry the same TTL and has no jitter or coalescing, so the fixed run uses another real fix: freshness from **invalidation** (a change to a page drops it from the cache) and a TTL of 5 minutes only as a safety net. The database is then nearly idle once the cache refills. To see what jitter buys, look at the first 2 seconds of the broken run: the same 5 s TTL with spread-out ages runs flat, never idle, never in waves.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  // Before the restart: the same TTL, ages spread out, flat load and no errors.
  const before = halfSeconds(broken, 0, 2);
  assert.ok(before.every((u) => u > 0.1 && u < 0.35), `before ${before}`);
  assert.equal(summary(broken, 0, 2).errorRate, 0);
  // The stampede after the restart is over by about 5 s.
  assert.ok(summary(broken, 3, 4).errorRate > 0.1);
  assert.equal(summary(broken, 5.5, 20).errorRate, 0);
  // Then a sawtooth: nearly idle, then about 40%, every 5 seconds.
  const waves: [quiet: [number, number], busy: [number, number]][] = [
    [[5.5, 7], [7, 9]],
    [[11, 12], [12.5, 14.5]],
    [[16.5, 17], [18, 20]],
  ];
  for (const [quiet, busy] of waves) {
    const q = Math.max(...halfSeconds(broken, quiet[0], quiet[1]));
    const b = halfSeconds(broken, busy[0], busy[1]);
    assert.ok(q < 0.1, `quiet ${quiet}: ${q}`);
    assert.ok(Math.max(...b) > 0.35 && b.every((u) => u > 0.15), `busy ${busy}: ${b}`);
  }
  // p99 rises and falls with it.
  assert.ok(summary(broken, 13, 13.5).p99 > 90 && summary(broken, 11, 11.5).p99 < 60, "p99 follows the waves");
  // The cache holds every page and stays mostly warm: not evictions, not a restarting cache.
  assert.ok(framesIn(broken, 5, 20).every((f) => f.stations.cache.up.every(Boolean)));
  assert.ok(summary(broken, 7, 20).hitRate.cache > 0.85, `hit ${summary(broken, 7, 20).hitRate.cache}`);
});

test("the fix removes it: after the same restart stampede, the database is nearly idle", () => {
  const { fixed } = playDrill(drill);
  assert.equal(summary(fixed, 6, 20).errorRate, 0);
  const after = halfSeconds(fixed, 7, 20);
  assert.ok(Math.max(...after) < 0.15, `db ${Math.max(...after)}`);
  assert.ok(summary(fixed, 7, 20).p99 < 80, `p99 ${summary(fixed, 7, 20).p99}`);
  // Invalidation also means no page is served older than its last change.
  assert.equal(summary(fixed, 7, 20).staleRate, 0);
});
