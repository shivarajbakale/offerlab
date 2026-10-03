/**
 * 27. Order Matching Exchange
 * Level: Staff
 * Group: Architectures
 *
 * Problem: A stock exchange takes buy and sell orders for 500 symbols and matches them: a buy at
 *   or above the best sell price trades. Every order for a symbol must be handled in the exact
 *   order it arrived, one at a time, or two traders could both be promised the same shares. Some
 *   days one symbol is suddenly hot. Keep matching fast and fair, and publish every change to
 *   the order book to everyone watching.
 *
 * Approach: One sequenced engine per group of symbols, and nothing else on its thread
 *   1. One matching engine for everything: a single thread caps the whole exchange. 2. Split the
 *   symbols over 8 engines; a hot symbol still fills its engine, and more engines do not help.
 *   3. Gateways with a per-firm rate limit, so a few firms' algorithms cannot fill the hot
 *   engine. 4. Market data off the engine's thread: the engine appends each update to a journal
 *   and separate servers send it out, instead of waiting while it sends.
 *
 * Cost: an engine here matches 1,000 orders a second (1 ms each; real engines are far faster).
 *   One engine is 82% busy at 800 orders a second and fails nearly every order at 2,000; 8
 *   engines carry 2,000 at 17-46% busy for ~$3.43 an hour. On a hot day (2,500 a second, one
 *   symbol ~45% of them) its engine is full and 14% of all orders fail; 32 engines cost $11.59 and
 *   it is still full. Rate limits refuse ~68% of the heaviest firms' orders and no one else's;
 *   sending market data from the engine's thread fails ~24% of ordinary traders' orders, a
 *   journal fails none.
 *
 * Pattern: single-writer sequencing (one thread per partition), partition by key, rate limiting,
 *   publish through a log
 * Key insight: Matching for one symbol is a single line: each order depends on the book left by
 *   the one before it. So it cannot be spread over threads or machines; it can only be made
 *   faster and kept free of everything else. Partition by symbol, protect each engine from
 *   floods at the edge, and move every side task off its thread.
 * Tradeoffs: A symbol's capacity is one thread's, however much hardware you buy. Rate limits
 *   refuse real orders from busy firms. Publishing through a journal adds a small delay to market
 *   data, and needs an ordered stream per symbol.
 * Staff notes: Keep the engine in memory and single-threaded; get durability and fail-over by
 *   journaling its input in order and replaying it on a standby (the same input in the same order
 *   gives the same book). Put risk checks and rate limits in the gateways, which scale out. Know
 *   your hottest symbol's peak orders a second; that number, not the total, sizes the engine.
 * Interview signals: "design a stock exchange", "order book", "matching engine", "price-time
 *   priority", "low latency", "market data feed", "fairness".
 * Real world: LMAX described a single-threaded in-memory business-logic processor fed through the
 *   Disruptor ring buffer, with every input journaled and replicated before processing. Exchanges throttle each connection's message rate, and publish market data
 *   as sequenced feeds, often over UDP multicast inside the data centre.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";
import type { CallStep } from "../traffic/index.ts";

// 2,000 orders a second from 2,000 trading accounts, over 500 symbols. Popularity is Zipf-shaped:
// on a normal day (skew 1) the busiest symbol gets ~15% of orders. On a hot day (skew 1.6, 2,500
// orders a second) one symbol gets ~45%, and 20 high-frequency firms send half of all orders.
const traders = (o: { hot?: boolean; firms?: boolean } = {}) =>
  clients({
    to: "gw",
    qps: knob("qps", o.hot ? 2500 : 2000, [10, 20_000]),
    mix: { read: 0, write: 1 },
    users: 2000,
    keys: 500,
    skew: knob("skew", o.hot ? 1.6 : 1, [0, 2]),
    hopMs: 1,
    ...(o.firms ? { abuseShare: 0.5, abusers: 20 } : {}),
  });
// Gateways check the order (format, the account's risk limits) in 0.5 ms and pass it to the
// engine that owns its symbol, holding a worker until the engine answers.
const gateways = (limit = false) => ({
  gw: loadBalancer({ to: "gateway", ...(limit ? { rateLimit: { perSecond: 20, burst: 40 } } : {}) }),
  gateway: server({ label: "Order gateways", replicas: 4, cores: 4, threads: 200, serviceMs: { read: 0.5, write: 0.5 }, calls: ["engine"] }),
});
// A matching engine: one thread (one worker, one core) that takes orders strictly in arrival order
// and spends 1 ms on each. Symbols are spread over the engines by a hash of the symbol.
const engine = (engines: number, after: CallStep[] = []) =>
  database({ label: "Matching engines", shards: knob("engines", engines, [1, 32]), cores: 1, connections: 1, readMs: 1, writeMs: 1, calls: after });
// Sending one order-book update to every subscriber costs a market data server 2 ms.
const feed = () => server({ label: "Market data servers", replicas: 2, cores: 4, serviceMs: { read: 2, write: 2 } });

// @why Stage 1: one engine, one thread, every symbol.
export const oneEngine = design("1. One matching engine", { traders: traders(), ...gateways(), engine: engine(1) });

// @why Stage 2: eight engines; each symbol always goes to the same one, so its orders stay in sequence.
export const byShard = design("2. One engine per group of symbols", { traders: traders(), ...gateways(), engine: engine(8) });

// @why The same eight engines on a hot day: 2,500 orders a second, one symbol takes ~45% of them.
export const hotSymbol = design("2. A hot symbol", { traders: traders({ hot: true, firms: true }), ...gateways(), engine: engine(8) });

// @why Stage 3: the gateways' load balancer gives each account 20 orders a second (bursts of 40);
// @why over that, it answers "slow down" at once and the order never reaches an engine.
export const rateLimited = design("3. Per-account rate limits", { traders: traders({ hot: true, firms: true }), ...gateways(true), engine: engine(8) });

// @why Stage 4, broken: after each match the engine itself sends the update to the market data
// @why servers and waits for them, on its one thread, before it takes the next order.
export const feedOnEngine = design("4. The engine sends market data itself", {
  traders: traders({ firms: true }),
  ...gateways(true),
  engine: engine(8, ["feed"]),
  feed: feed(),
});

// @why Stage 4: the engine appends the update to an in-memory journal (0.1 ms) and moves on;
// @why journal readers hand it to the market data servers, which send it out.
export const feedFromJournal = design("4. Market data from a journal", {
  traders: traders({ firms: true }),
  ...gateways(true),
  engine: engine(8, ["journal"]),
  journal: queue({ label: "Market data journal", consumers: 50, workMs: 0.1, hopMs: 0.05, to: "feed" }),
  feed: feed(),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);

test("one engine: 800 orders a second, the engine 82% busy", () => {
  const s = summary(run(oneEngine, { ...S, knobs: { qps: 800 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.engine > 0.78 && s.util.engine < 0.86, `engine ${s.util.engine}`);
  assert.ok(s.p99 < 25, `p99 ${s.p99}`);
});

test("broken: one engine at 2,000 orders a second — one thread caps the exchange", () => {
  const r = run(oneEngine, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "engine");
  assert.ok(s.util.engine > 0.99, `engine ${s.util.engine}`);
  // Sixteen gateway cores sit idle; their workers are all waiting on the engine.
  assert.ok(s.util.gateway < 0.05 && s.threads.gateway > 0.99, `gateway cpu ${s.util.gateway}, workers ${s.threads.gateway}`);
  assert.ok(s.errorRate > 0.95, `errors ${s.errorRate}`);
});

test("eight engines: 2,000 orders a second, each engine 17-46% busy", () => {
  const s = summary(run(byShard, S), 3);
  assert.equal(s.errorRate, 0);
  const u = sortDown(s.replicaUtil.engine);
  assert.ok(u[0] > 0.4 && u[0] < 0.5 && u[7] > 0.14 && u[7] < 0.2, `${u}`);
  assert.ok(s.p99 < 12, `p99 ${s.p99}`);
  assert.ok(Math.abs(s.costPerHour - 3.43) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: a hot symbol — its engine is full and orders for every symbol slow down", () => {
  const s = summary(run(hotSymbol, S), 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.engine);
  assert.ok(hot > 0.99 && rest.every((x) => x < 0.4), `engines ${hot}, ${rest}`);
  // Gateway workers pile up waiting on the hot engine, so orders for quiet symbols wait too.
  assert.ok(s.threads.gateway > 0.95, `gateway workers ${s.threads.gateway}`);
  assert.ok(s.errorRate > 0.12 && s.errorRate < 0.17, `errors ${s.errorRate}`);
  assert.ok(s.p50 > 180, `p50 ${s.p50}`);
});

test("broken: a hot symbol — 32 engines cost three times as much and its engine is still full", () => {
  const s = summary(run(hotSymbol, { ...S, knobs: { engines: 32 } }), 3);
  const u = sortDown(s.replicaUtil.engine);
  assert.ok(u[0] > 0.99 && u[16] < 0.05, `hottest ${u[0]}, median ${u[16]}`);
  assert.ok(s.costPerHour > 11.5 && s.costPerHour < 11.7, `cost ${s.costPerHour}`);
});

test("rate limits: the hot day, and only the heaviest firms are told to slow down", () => {
  const s = summary(run(rateLimited, S), 3);
  assert.equal(s.byClass.normal.errorRate, 0);
  assert.ok(s.byClass.normal.p99 < 20, `p99 ${s.byClass.normal.p99}`);
  assert.ok(s.byClass.heavy.errorRate > 0.64 && s.byClass.heavy.errorRate < 0.72, `firms refused ${s.byClass.heavy.errorRate}`);
  assert.ok(s.limitedRate > 0.3, `limited ${s.limitedRate}`);
  const hot = Math.max(...s.replicaUtil.engine);
  assert.ok(hot > 0.7 && hot < 0.85, `hot engine ${hot}`);
});

test("broken: the engine sends market data itself — its thread waits, and orders fail", () => {
  const s = summary(run(feedOnEngine, S), 3);
  // Each order now holds the engine's one worker for ~3 ms more, while its core is mostly idle.
  assert.ok(s.threads.engine > 0.6 && s.util.engine < 0.2, `engine workers ${s.threads.engine}, cpu ${s.util.engine}`);
  assert.ok(s.byClass.normal.errorRate > 0.2 && s.byClass.normal.errorRate < 0.28, `ordinary traders' errors ${s.byClass.normal.errorRate}`);
});

test("journal: the engine only appends, and ordinary traders see no errors", () => {
  const s = summary(run(feedFromJournal, S), 3);
  assert.equal(s.byClass.normal.errorRate, 0);
  assert.ok(s.byClass.normal.p99 < 11, `p99 ${s.byClass.normal.p99}`);
  assert.ok(s.threads.engine < 0.22, `engine workers ${s.threads.engine}`);
  assert.ok(s.util.feed > 0.3 && s.util.feed < 0.4, `market data servers ${s.util.feed}`);
  assert.ok(s.backlog.journal < 20, `journal ${s.backlog.journal}`);
});
