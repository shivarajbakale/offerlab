/**
 * 11. Flash Sale
 * Level: Staff
 * Group: Architectures
 *
 * Problem: A shop sells a few hundred units of one item at exactly noon. Thousands of people,
 *   plus bots, press "Buy" in the same seconds, and press it again when it fails. Every purchase
 *   must take one unit from the same stock count. Keep the site up, never sell more than exists,
 *   and treat buyers fairly.
 *
 * Approach: Protect the one hot row, then make people wait in line instead of fail
 *   1. Every buyer goes straight to the database: the stock row is a single lane and saturates;
 *   instant retries make it worse; sharding does not help one item. 2. A per-user rate limit at
 *   the load balancer and clients that back off. 3. A waiting room: purchases go on a queue and
 *   one consumer feeds the database at a steady rate. 4. The product page comes from a CDN, so
 *   only purchases reach the servers; the line itself is where this design ends.
 *
 * Cost: the stock row ~250 purchases a second (one at a time, 4 ms each); straight to the
 *   database it breaks near 700 requests a second; the rate limit holds 800; the waiting room
 *   holds 2,000 with the row 67% busy while the line grows ~340 a second; the CDN takes the
 *   product page off the servers at 2,500.
 *
 * Pattern: load shedding, rate limiting, queue-based load leveling (waiting room)
 * Key insight: Demand in a flash sale is far above what one item's stock row can take, and that
 *   row cannot be split by adding machines. So stop trying to serve everyone at once: refuse the
 *   abusive traffic cheaply, put real buyers in a line, and feed the row at the rate it can take.
 * Tradeoffs: Users wait instead of failing, and must be told their place and told quickly when
 *   the stock is gone. A cached product page shows a stock count that may be out of date.
 * Staff notes: Overselling is prevented in the database, not by the queue: decrement stock with a
 *   conditional atomic update (or a reservation with an expiry), and make "place order"
 *   idempotent so a retried click does not buy twice. Load test the sale before it happens.
 * Interview signals: "flash sale", "ticket sale", "limited inventory", "thundering herd",
 *   "hot row", "oversell", "waiting room", "Black Friday".
 * Real world: Ticketmaster's Smart Queue and Cloudflare's Waiting Room put visitors in a line
 *   before any sale page loads and admit them to the site at a set rate. The waiting room here is
 *   different: a purchase queue behind the app servers, so everyone can load the site and only
 *   purchases wait. Alibaba's Singles' Day and large ticket sales are the classic examples.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cdn, clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// The traffic as the sale opens: 60% of requests load the product page, 40% press "Buy". There
// are 20 items on sale, but one is the item everyone wants (Zipf skew 3: it gets ~83% of
// requests). 5,000 people, plus 20 bots that send 40% of all requests between them.
type Retry = "none" | "immediate" | "backoff";
const buyers = (o: { qps: number; retry: Retry; staticTo?: string }) =>
  clients({
    to: "lb",
    ...(o.staticTo ? { staticTo: o.staticTo } : {}),
    qps: knob("qps", o.qps, [10, 1_000_000]),
    // From stage 4 the product page is a static file served by the CDN.
    mix: o.staticTo ? { read: 0, write: 0.4, static: 0.6 } : { read: 0.6, write: 0.4 },
    users: 5000,
    keys: 20,
    skew: 3,
    retry: o.retry,
    abuseShare: 0.4,
    abusers: 20,
  });
// Four app servers: a product page costs 4 ms of CPU, a purchase 2 ms.
const app = (write: string) => server({ replicas: 4, cores: 4, serviceMs: { read: 4, write: 2 }, calls: { read: ["catalog"], write: [write] } });
// Product details (name, price, photos): an ordinary 4-core database, 5 ms a page.
const catalog = () => database({ label: "Catalog database", cores: 4, readMs: 5, writeMs: 5 });
// Every purchase of the item runs "UPDATE stock SET n = n - 1 WHERE item = 1 AND n > 0" on the
// same row. The database locks that row for each update until it commits, so purchases go one at
// a time however many cores the machine has: we model the row as a database with one core.
// 4 ms per purchase means at most 250 purchases a second.
const stock = (shards = 1) => database({ label: "Stock database", shards, cores: 1, readMs: 1, writeMs: 4 });
// Each user gets 2 requests a second, with a burst of 4; past that the load balancer answers 429.
const LIMIT = { perSecond: 2, burst: 4 };

const direct = (o: { retry: Retry; name: string; shards?: number }) =>
  design(o.name, {
    users: buyers({ qps: 800, retry: o.retry }),
    lb: loadBalancer({ to: "app" }),
    app: app("stock"),
    catalog: catalog(),
    stock: stock(o.shards),
  });
// @why Stage 1: every "Buy" goes straight to the stock row. Clients that fail try again at once.
export const direct1 = direct({ retry: "immediate", name: "1. Every buyer hits the database" });
// @why The same, but clients give up after one failure, to measure what instant retries add.
export const directNoRetry = direct({ retry: "none", name: "1. Every buyer hits the database, no retries" });
// @why The usual fix for write load, sharding: the stock table split over 4 databases by item.
// @why The item everyone wants still lives on one of them.
export const directSharded = direct({ retry: "immediate", name: "1. Shard the stock table", shards: 4 });

// @why Stage 2: the load balancer gives each user at most 2 requests a second (a token bucket per
// @why user) and answers the rest with 429 at once. Clients that fail wait 100 ms, 200, 400, with
// @why random jitter, before trying again.
export const limited = design("2. Rate limit and backoff", {
  users: buyers({ qps: 800, retry: "backoff" }),
  lb: loadBalancer({ to: "app", rateLimit: LIMIT }),
  app: app("stock"),
  catalog: catalog(),
  stock: stock(),
});

// @why Stage 3: "Buy" no longer touches the stock row. It puts the purchase in a waiting room
// @why (a queue) and answers "you are in line" at once. One consumer takes purchases in order and
// @why runs each on the stock row, so the row sees a steady rate it can always handle.
const line = () => queue({ label: "Waiting room", consumers: knob("consumers", 1, [1, 50]), workMs: 1, to: "stock" });
export const waitingRoom = design("3. A waiting room", {
  users: buyers({ qps: 2000, retry: "backoff" }),
  lb: loadBalancer({ to: "app", rateLimit: LIMIT }),
  app: app("line"),
  catalog: catalog(),
  line: line(),
  stock: stock(),
});

// @why Stage 4: the product page is the same for everyone, so it becomes a static page held by a
// @why CDN near every user. Only purchases reach the load balancer and the app servers.
export const withCdn = design("4. Product page from a CDN", {
  users: buyers({ qps: 2500, retry: "backoff", staticTo: "cdn" }),
  cdn: cdn({ to: "lb", capacity: 100 }),
  lb: loadBalancer({ to: "app", rateLimit: LIMIT }),
  app: app("line"),
  catalog: catalog(),
  line: line(),
  stock: stock(),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// 40% of requests come from bots; a rate limit turns nearly all of them away.
const BOTS = 0.4;

test("every buyer hits the database: 500 requests a second, the stock row 83% busy", () => {
  const s = summary(run(direct1, { ...S, knobs: { qps: 500 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.stock > 0.75 && s.util.stock < 0.9, `stock ${s.util.stock}`);
});

test("broken: every buyer hits the database — the stock row is full and page views fail too", () => {
  const r = run(direct1, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "stock");
  assert.ok(s.util.stock > 0.98, `stock ${s.util.stock}`);
  // Purchases are 40% of requests, yet more than half of all requests fail: the app workers are
  // all held by purchases waiting on the row, so product pages find no free worker either.
  assert.ok(s.errorRate > 0.5, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.95 && s.util.app < 0.2, `workers ${s.threads.app}, cpu ${s.util.app}`);
  assert.ok(s.util.catalog < 0.5, `catalog ${s.util.catalog}`);
});

test("broken: instant retries — more requests, fewer purchases", () => {
  const calm = summary(run(directNoRetry, S), 3);
  const eager = summary(run(direct1, S), 3);
  assert.ok(eager.retries > 1000, `retries ${eager.retries}`);
  assert.ok(eager.ok < 0.85 * calm.ok, `ok ${calm.ok} -> ${eager.ok}`);
  assert.ok(eager.errorRate > calm.errorRate + 0.08, `errors ${calm.errorRate} -> ${eager.errorRate}`);
});

test("broken: sharding the stock table — the hot item's shard is full, the rest idle", () => {
  const knobs = { qps: 1000 };
  const one = summary(run(direct1, { ...S, knobs }), 3);
  const s = summary(run(directSharded, { ...S, knobs }), 3);
  const [hot, ...rest] = [...s.replicaUtil.stock].sort((a, b) => b - a);
  assert.ok(hot > 0.98 && rest.every((u) => u < 0.13), `${s.replicaUtil.stock}`);
  assert.ok(s.errorRate > 0.5 && one.errorRate > 0.65, `errors ${one.errorRate} -> ${s.errorRate}`);
  assert.ok(s.costPerHour > 1.5 * one.costPerHour, `cost ${one.costPerHour} -> ${s.costPerHour}`);
});

test("rate limit: the 800 requests a second that broke stage 1, and only bots are turned away", () => {
  const s = summary(run(limited, S), 3);
  assert.equal(s.timeoutRate, 0);
  assert.equal(s.failedRate, 0);
  assert.ok(s.rejectedRate > BOTS - 0.1 && s.rejectedRate < BOTS, `rejected ${s.rejectedRate}`);
  assert.ok(s.util.stock > 0.8 && s.util.stock < 0.95, `stock ${s.util.stock}`);
  assert.ok(s.p50 < 60, `p50 ${s.p50}`);
});

test("broken: rate limit — at 2,000 a second real buyers alone are twice what the row can take", () => {
  const r = run(limited, { ...S, knobs: { qps: 2000 } });
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "stock");
  assert.ok(s.util.stock > 0.98, `stock ${s.util.stock}`);
  assert.ok(s.errorRate > 0.8, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.95, `workers ${s.threads.app}`);
});

test("waiting room: 2,000 a second, nobody but bots fails, and the line grows", () => {
  const r = run(waitingRoom, S);
  const s = summary(r, 3);
  assert.equal(s.timeoutRate, 0);
  assert.equal(s.failedRate, 0);
  assert.ok(s.rejectedRate > BOTS - 0.1 && s.rejectedRate < BOTS, `rejected ${s.rejectedRate}`);
  assert.ok(s.p50 < 60, `p50 ${s.p50}`);
  // One consumer feeds the row about 167 purchases a second: busy, never full.
  assert.ok(s.util.stock > 0.6 && s.util.stock < 0.75, `stock ${s.util.stock}`);
  const mid = summary(r, 4.9, 5);
  const end = summary(r, 9.9, 10);
  // ~500 purchases a second join, ~167 leave: the line grows ~340 a second.
  assert.ok(end.backlog.line > 3000 && end.backlog.line < 3800 && end.backlog.line > 1.7 * mid.backlog.line, `line ${mid.backlog.line} -> ${end.backlog.line}`);
  assert.ok(end.oldestMs.line > 6000 && end.oldestMs.line < 7500, `oldest ${end.oldestMs.line}`);
});

test("broken: waiting room — at 2,500 a second product pages fill the catalog database", () => {
  const r = run(waitingRoom, { ...S, knobs: { qps: 2500 } });
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "catalog");
  assert.ok(s.util.catalog > 0.98, `catalog ${s.util.catalog}`);
  assert.ok(s.errorRate > BOTS + 0.03, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.9, `workers ${s.threads.app}`);
  assert.ok(s.util.stock < 0.75, "the stock row is fine: the line protects it");
});

test("CDN: 2,500 a second, the product page from nearby, the catalog idle", () => {
  const before = summary(run(waitingRoom, { ...S, knobs: { qps: 2500 } }), 3);
  const after = summary(run(withCdn, S), 3);
  assert.ok(after.p50 < 25, `p50 ${after.p50}`);
  assert.ok(after.hitRate.cdn > 0.99, `hit ${after.hitRate.cdn}`);
  assert.ok(after.util.catalog < 0.01 && after.util.app < 0.15, `catalog ${after.util.catalog}, app ${after.util.app}`);
  // Now only bots' purchases are turned away: 40% of the 40% that are purchases.
  assert.equal(after.timeoutRate, 0);
  assert.ok(after.errorRate > 0.12 && after.errorRate < 0.17, `errors ${after.errorRate}`);
  assert.ok(after.costPerHour > 3 * before.costPerHour, `cost ${before.costPerHour} -> ${after.costPerHour}`);
});

test("broken: where this design ends — ten consumers fill the row, and the line still grows", () => {
  const r = run(withCdn, { ...S, knobs: { consumers: 10 } });
  const s = summary(r, 3);
  assert.ok(s.util.stock > 0.98, `stock ${s.util.stock}`);
  const mid = summary(r, 4.9, 5);
  const end = summary(r, 9.9, 10);
  assert.ok(end.backlog.line > 1.7 * mid.backlog.line, `line ${mid.backlog.line} -> ${end.backlog.line}`);
  assert.ok(end.oldestMs.line > 5000, `oldest ${end.oldestMs.line}`);
});
