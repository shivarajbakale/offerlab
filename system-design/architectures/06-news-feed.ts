/**
 * 06. News Feed
 * Level: Staff
 * Group: Architectures
 *
 * Problem: Users post, and users read their home feed: the newest posts from everyone they
 *   follow. Reads outnumber posts about 9 to 1. Build the feed so reads stay cheap without
 *   posting becoming impossible for accounts with huge followings.
 *
 * Approach: Move work between the read and the write
 *   1. Fan-out on read: each feed read asks the posts database for the recent posts of every
 *   account you follow. 2. Fan-out on write: each post is copied into every follower's
 *   precomputed timeline by background jobs, so a read is one lookup. Celebrity accounts make
 *   that copying explode. 3. Hybrid: copy posts of normal accounts, and pull the few celebrity
 *   accounts' posts at read time from a small in-memory store.
 *
 * Cost: fan-out on read fails past ~870 requests a second (10 database reads per feed read,
 *   posts database 100% busy); fan-out on write serves 1,000 a second with the posts database 3%
 *   busy and 20 timeline writes per post (2,000 a second, 63% of 20 consumers); 2% celebrity
 *   posts with 2,000 followers each triple that to ~6,000 a second on average against the
 *   ~3,200 the consumers can do: the backlog grows ~3,000 a second (49,000 jobs at 15 s in the
 *   seed-1 run, 30,000-60,000 in others) and feeds fall ~7 s behind within 15 s; the hybrid
 *   keeps the backlog under 200 jobs for ~1.3 ms more per read.
 *
 * Pattern: fan-out on write (push) vs fan-out on read (pull), hybrid by follower count
 * Key insight: A feed is a join between "who I follow" and "what they posted". You choose when
 *   to pay for it: on every read (cost x accounts followed) or on every post (cost x followers).
 *   Followers are wildly uneven, so no single choice fits every account.
 * Tradeoffs: Push makes reads one lookup but multiplies writes by the follower count, delays
 *   posts behind a backlog and stores each post id many times. Pull stores each post once and is
 *   always fresh but makes every read gather from many places. The hybrid pays a little of both
 *   and adds a threshold to tune.
 * Staff notes: Store only post ids in timelines and cap their length (say the newest 800);
 *   hydrate post bodies from a cache at read time. Skip fan-out to inactive users and rebuild
 *   their timeline on their next visit. Alert on the age of the oldest fan-out job, which is how
 *   stale timelines are. Pick the celebrity threshold from the follower-count distribution and
 *   from what one read can afford to merge.
 * Interview signals: "design Twitter's home timeline", "fan-out on write vs read", "celebrity
 *   problem", "hot users", "precomputed feed".
 * Real world: Twitter described keeping home timelines as lists of tweet ids in Redis, filled by
 *   fan-out on write, with tweets from very large accounts merged in at read time instead.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same traffic: 1,000 requests a second, 90% feed reads and 10% new posts.
// Building a page costs the app 2 ms of CPU for a read, 3 ms for a post.
const users = (qps = 1000) => clients({ to: "lb", qps: knob("qps", qps, [10, 100_000]) });
const lb = () => loadBalancer({ to: "app" });
const app = (calls: { read: string[]; write: string[] }) =>
  server({ replicas: knob("apps", 4, [1, 20]), cores: 4, serviceMs: { read: 2, write: 3 }, calls });
// The posts database: every post is stored here once. Reading one account's recent posts costs
// 1 ms of CPU, storing a post 2 ms.
const posts = () => database({ cores: 8, readMs: 1, writeMs: 2, connections: 100 });
// Timelines: one list of post ids per user, kept in memory (like Redis), so a lookup is cheap.
const timelines = () => database({ label: "Timelines (in memory)", cores: 4, readMs: 0.3, writeMs: 0.2, connections: 200 });
// One timeline write job: look up the next follower, add the post id to their timeline.
const timelineWrites = (consumers: number) =>
  queue({ label: "Timeline writes", consumers: knob("consumers", consumers, [1, 500]), workMs: 5, to: "timelines", fanout: knob("followers", 20, [1, 200]) });

// A feed read gathers from 10 accounts: the 10 most active of those you follow.
const FOLLOWED = 10;
const gather = (from: string) => Array<string>(FOLLOWED).fill(from);

// @why Stage 1: no precomputed feed. A feed read asks the posts database once per followed
// @why account (10 here) and merges the results. A post is one database write.
export const fanoutOnRead = design("1. Fan-out on read", {
  users: users(),
  lb: lb(),
  app: app({ read: gather("posts"), write: ["posts"] }),
  posts: posts(),
});

// @why Stage 2: each post is stored once, then a job per follower copies its id into that
// @why follower's timeline in the background (20 followers each). A feed read is one timeline lookup.
export const fanoutOnWrite = design("2. Fan-out on write", {
  users: users(),
  lb: lb(),
  app: app({ read: ["timelines"], write: ["posts", "timelineWrites"] }),
  posts: posts(),
  timelineWrites: timelineWrites(20),
  timelines: timelines(),
});

// A celebrity's follower list is read one page of 20 at a time; each page becomes 20 jobs on
// the same timeline-writes queue. 100 pages: 2,000 followers.
const PAGES = 100;

// @why The same design, but 2% of posts come from celebrity accounts with 2,000 followers each.
// @why A fan-out service pages through their followers and puts 2,000 jobs on the same queue.
export const celebrities = design("2. Fan-out on write, celebrities post", {
  users: users(),
  lb: lb(),
  app: app({ read: ["timelines"], write: ["posts", "timelineWrites", "celebrityPosts"] }),
  posts: posts(),
  // 2% of posts: a fan-out of 0.02 makes a job for two posts in a hundred.
  celebrityPosts: queue({ label: "Celebrity posts", consumers: 10, workMs: 1, to: "fanoutService", fanout: knob("celebrityShare", 0.02, [0, 0.1]) }),
  fanoutService: server({ label: "Fan-out service", cores: 4, serviceMs: { read: 1, write: 1 }, calls: { write: Array<string>(PAGES).fill("timelineWrites") } }),
  timelineWrites: timelineWrites(20),
  timelines: timelines(),
});

// @why Stage 3: posts by normal accounts are still pushed to followers' timelines. Celebrity
// @why posts are written once to a small in-memory store, and every feed read pulls them from it.
export const hybrid = design("3. Hybrid: push for most, pull for celebrities", {
  users: users(),
  lb: lb(),
  app: app({ read: ["timelines", "celebrityStore"], write: ["posts", "timelineWrites", "celebrityPosts"] }),
  posts: posts(),
  celebrityPosts: queue({ label: "Celebrity posts", consumers: 10, workMs: 1, to: "celebrityStore", fanout: knob("celebrityShare", 0.02, [0, 0.1]) }),
  celebrityStore: database({ label: "Celebrity posts (in memory)", cores: 4, readMs: 0.3, writeMs: 0.3, connections: 200 }),
  timelineWrites: timelineWrites(20),
  timelines: timelines(),
});

// @why The threshold set too low: so many accounts count as celebrities that their posts no
// @why longer fit in a small hot store, and each read pulls from 10 of them in the posts database.
export const lowThreshold = design("3. Hybrid, celebrity threshold too low", {
  users: users(),
  lb: lb(),
  app: app({ read: ["timelines", ...gather("posts")], write: ["posts", "timelineWrites"] }),
  posts: posts(),
  timelineWrites: timelineWrites(20),
  timelines: timelines(),
});

// --- helpers for the scenarios ---

const S = { seed: 1, seconds: 10 };

test("fan-out on read: 500 requests a second, served quickly", () => {
  const s = summary(run(fanoutOnRead, { ...S, knobs: { qps: 500 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p99 < 80, `p99 ${s.p99}`);
  assert.ok(s.util.posts > 0.5 && s.util.posts < 0.65, `posts ${s.util.posts}`);
});

test("broken: fan-out on read — at 1,000 requests a second the posts database is full", () => {
  const r = run(fanoutOnRead, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "posts");
  assert.ok(s.util.posts > 0.95, `posts ${s.util.posts}`);
  // App workers are all taken while app CPUs idle: each worker waits on its 10 database reads.
  assert.ok(s.threads.app > 0.95 && s.util.app < 0.2, `threads ${s.threads.app}, cpu ${s.util.app}`);
  assert.ok(s.p50 > 650 && s.p50 < 850, `p50 ${s.p50}`);
  assert.ok(s.errorRate > 0.08 && s.errorRate < 0.2, `about 1 in 8 rejected: ${s.errorRate}`);
});

test("fan-out on write: the same 1,000 requests a second, the posts database nearly idle", () => {
  const s = summary(run(fanoutOnWrite, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p99 < 60, `p99 ${s.p99}`);
  assert.ok(s.util.posts < 0.05, `posts ${s.util.posts}`);
  assert.ok(s.util.timelines < 0.25, `timelines ${s.util.timelines}`);
  // 100 posts x 20 followers = 2,000 timeline writes a second, ~6 ms each: ~12 of 20 consumers busy.
  assert.ok(s.util.timelineWrites > 0.5 && s.util.timelineWrites < 0.75, `consumers ${s.util.timelineWrites}`);
  assert.ok(s.backlog.timelineWrites < 200 && s.oldestMs.timelineWrites < 100, `backlog ${s.backlog.timelineWrites}`);
});

test("broken: fan-out on write — 2% celebrity posts and timelines fall further behind every second", () => {
  const r = run(celebrities, { ...S, seconds: 15 });
  const s = summary(r, 3);
  assert.ok(s.util.timelineWrites > 0.95, `consumers ${s.util.timelineWrites}`);
  const mid = summary(r, 7, 8).backlog.timelineWrites;
  const end = summary(r, 14, 15);
  // ~6,000 jobs a second arrive on average, ~3,200 are done: the backlog grows ~3,000 a second.
  assert.ok(end.backlog.timelineWrites > 40_000 && end.backlog.timelineWrites < 60_000 && end.backlog.timelineWrites > 1.5 * mid, `backlog ${mid} -> ${end.backlog.timelineWrites}`);
  // The oldest job ages about half a second per second: it arrived when 3,200/6,000 of the time had passed.
  assert.ok(end.oldestMs.timelineWrites > 6000 && end.oldestMs.timelineWrites < 7500, `oldest ${end.oldestMs.timelineWrites}`);
  // Nobody gets an error and reads stay fast: the feeds are simply out of date.
  assert.equal(s.errorRate, 0);
  assert.ok(s.p99 < 60, `p99 ${s.p99}`);
});

test("hybrid: celebrity posts pulled at read time, the backlog stays near zero", () => {
  const before = summary(run(fanoutOnWrite, S), 3);
  const s = summary(run(hybrid, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.backlog.timelineWrites < 200 && s.oldestMs.timelineWrites < 100, `backlog ${s.backlog.timelineWrites}, oldest ${s.oldestMs.timelineWrites}`);
  assert.ok(s.util.timelineWrites < 0.75, `consumers ${s.util.timelineWrites}`);
  assert.ok(s.util.celebrityStore < 0.1, `celebrity store ${s.util.celebrityStore}`);
  // The price: one more in-memory lookup per read, about a millisecond.
  assert.ok(s.p50 - before.p50 > 0.5 && s.p50 - before.p50 < 3, `p50 ${before.p50} -> ${s.p50}`);
  assert.ok(s.costPerHour > before.costPerHour + 0.3, `and one more machine: $${before.costPerHour} -> $${s.costPerHour} an hour`);
});

test("broken: hybrid with the threshold too low — reads gather from the posts database again", () => {
  const r = run(lowThreshold, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "posts");
  assert.ok(s.util.posts > 0.95 && s.errorRate > 0.08 && s.errorRate < 0.2, `posts ${s.util.posts}, errors ${s.errorRate}`);
});
