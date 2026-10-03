/**
 * 13. Ride Matching
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Every driver's phone reports its location every few seconds, and every rider who
 *   asks for a car needs the drivers near them, now. Location updates are tiny but arrive in
 *   huge numbers, far more than match requests, and drivers crowd into the same few
 *   neighbourhoods: downtown, the airport, a stadium when the game ends.
 *
 * Approach: Keep only the latest location, in memory, split by map cell
 *   1. One database, one row per driver, updated on every report. 2. An in-memory location
 *   store split into 8 shards by geohash cell (a ~5 km square); a search reads its own cell and
 *   its 8 neighbours. On a big night the downtown cell holds 41% of all drivers and its shard
 *   is full. 3. Split crowded cells into smaller ones (as a quadtree does), so no
 *   single cell carries more than a few percent.
 *
 * Cost: 10,000 location updates a second need ~15 cores of a relational database (8 here), and
 *   half of all requests fail. Eight in-memory shards (each scaled down to ~4,000 updates a
 *   second; a real Redis does ~25x more) handle them for ~$1.51 an hour, the
 *   busiest ~73% busy on a normal night; on a big night the downtown shard is full, the others
 *   under 40%, and 20% of requests fail. 32 shards ($3.91) leave it full. With crowded cells
 *   split, every shard is 25-45% busy.
 *
 * Pattern: geospatial sharding, in-memory latest-value store, hot-spot splitting
 * Key insight: A driver's location is worth something for a few seconds and is replaced on the
 *   next report, so it needs no disk and no history: keep the latest value in memory. Shard by
 *   place, so each update touches one shard (a search of 9 hashed cells asks ~5-6 shards in
 *   parallel). But place is lopsided, so the shard key must adapt: small cells where drivers
 *   crowd, big cells where they are sparse.
 * Tradeoffs: Losing a shard loses its drivers' locations until their next report, a few seconds
 *   later: acceptable here, not for money. Smaller cells mean a search spans more cells and may
 *   span shards. A cell map that changes must be shared by every server.
 * Staff notes: Do the arithmetic first: drivers x (1 / report interval) is the write rate, and it
 *   dwarfs the match rate. Ask what a lost update costs (one stale dot for 4 seconds) before
 *   paying for durability. Plan for the hot spot you can predict (stadium, airport, New Year's
 *   Eve) and alert on the busiest shard, not the average.
 * Interview signals: "design Uber / Lyft / DoorDash dispatch", "nearby drivers", "location
 *   updates every few seconds", "geohash", "quadtree", "hot cell".
 * Real world: Redis keeps geo indexes in sorted sets keyed by a geohash-like score (GEOADD,
 *   GEOSEARCH). Uber developed and open-sourced H3, a grid of hexagonal cells at many sizes,
 *   for this kind of indexing and analysis.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// 40,000 drivers online, each reporting its location every 4 seconds: 10,000 updates a second
// (writes). Riders ask for a match 200 times a second (reads). Each request is about one map
// cell: the ~5 km square (geohash precision 5) the driver or rider is in. The city has 100 cells
// and drivers and riders crowd into a few: on a normal night (skew 1) the busiest cell, downtown,
// has 19% of the traffic; on a big night (skew 1.5) it has 41%.
const city = (skew: number, keys = 100) =>
  clients({ to: "lb", qps: knob("qps", 10_200, [1000, 50_000]), mix: { read: 1, write: 50 }, keys, skew: knob("skew", skew, [0.5, 2]), hopMs: 1 });
// The location service: decode the report or the search, call the store. 0.2 ms of CPU each.
const web = () => ({
  lb: loadBalancer({ to: "app" }),
  app: server({ label: "Location service", replicas: 4, cores: 4, serviceMs: { read: 0.3, write: 0.2 }, calls: ["store"] }),
});

// @why Stage 1: one relational database with a row per driver and a spatial index. Each report
// @why is an UPDATE that rewrites the row and its index entry and commits it to disk (1.5 ms,
// @why our assumption); a search scans the index around the rider (10 ms).
export const oneDatabase = design("1. One database, a row per driver", {
  users: city(1),
  ...web(),
  store: database({ label: "Drivers database", cores: 8, readMs: 10, writeMs: 1.5, connections: 100 }),
});

// The in-memory store: like Redis, one thread per shard runs every command, so one core each.
// Replacing a driver's position in the cell's index costs 0.25 ms here (about 4,000 a second per
// shard, scaled down ~25x from a real Redis so the run stays small; the ratios are what
// matter); a search of the rider's cell and its 8 neighbours costs 1 ms. Nothing goes to disk.
const memoryStore = () =>
  database({ label: "Location store (in memory)", cores: 1, readMs: 1, writeMs: 0.25, connections: 200, shards: knob("shards", 8, [1, 32]), costPerHour: 0.1 });

// @why Stage 2: keep only each driver's latest position, in memory, in a store split into 8
// @why shards by a hash of the cell. A driver's report goes to the shard that owns its cell. A
// @why search reads the rider's cell and the 8 around it, which may live on several shards, asked
// @why in parallel; searches are 2% of the traffic, so the simulator models each as one call.
export const sharded = design("2. In memory, sharded by map cell", {
  users: city(1),
  ...web(),
  store: memoryStore(),
});

// @why The same store on a big night: the game ends downtown and 41% of drivers and riders are in
// @why one cell. All of that cell's updates go to the one shard that owns it.
export const bigNight = design("2. A big night downtown", {
  users: city(1.5),
  ...web(),
  store: memoryStore(),
});

// @why Stage 3: a crowded cell is split into four smaller ones, again and again until each holds
// @why few enough drivers (the quadtree rule); each small cell is its own shard key. The simulator
// @why picks cells from one popularity curve, so the split is modelled as 1,600 cells with a
// @why flatter curve (skew 0.8), where the busiest cell has about 6% of the traffic.
export const splitCells = design("3. Split crowded cells", {
  users: city(0.8, 1600),
  ...web(),
  store: memoryStore(),
});

// --- helpers for the scenarios ---

const S = { seconds: 8, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);

test("broken: one database — 10,000 location updates a second need 15 cores of commits", () => {
  const r = run(oneDatabase, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "store");
  assert.ok(s.util.store > 0.98, `db ${s.util.store}`);
  assert.ok(s.util.app < 0.1, `app ${s.util.app}`);
  assert.ok(s.errorRate > 0.45 && s.errorRate < 0.6, `errors ${s.errorRate}`);
  // Riders fail as often as drivers: their searches wait behind the updates.
  assert.ok(s.byKind.read!.errorRate > 0.4, `match errors ${s.byKind.read!.errorRate}`);
});

test("sharded: a normal night, every shard has room", () => {
  const s = summary(run(sharded, S), 3);
  assert.equal(s.errorRate, 0);
  const [hot, ...rest] = sortDown(s.replicaUtil.store);
  assert.ok(hot > 0.65 && hot < 0.8, `busiest shard ${hot}`);
  assert.ok(rest.every((x) => x > 0.15 && x < 0.5), `others ${rest}`);
  assert.ok(s.byKind.read!.p50 > 7 && s.byKind.read!.p50 < 12, `match p50 ${s.byKind.read!.p50}`);
  assert.ok(Math.abs(s.costPerHour - 1.51) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: a big night — the downtown shard is full, the others idle", () => {
  const s = summary(run(bigNight, S), 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.store);
  assert.ok(hot > 0.98, `downtown shard ${hot}`);
  assert.ok(rest.every((x) => x < 0.4), `others ${rest}`);
  // The location service's workers all wait on that shard, so every cell's requests fail too.
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.15 && s.errorRate < 0.25, `errors ${s.errorRate}`);
  assert.ok(s.byKind.read!.errorRate > 0.15, `match errors ${s.byKind.read!.errorRate}`);
});

test("broken: a big night — 32 shards, and downtown's is still full", () => {
  const s = summary(run(bigNight, { ...S, knobs: { shards: 32 } }), 3);
  const sorted = sortDown(s.replicaUtil.store);
  assert.ok(sorted[0] > 0.98, `downtown shard ${sorted[0]}`);
  assert.ok(sorted[16] < 0.05, `median shard ${sorted[16]}`);
  assert.ok(s.errorRate > 0.05, `errors ${s.errorRate}`);
  assert.ok(Math.abs(s.costPerHour - 3.91) < 0.02, `cost ${s.costPerHour}`);
});

test("split cells: the big night spread over small cells", () => {
  const s = summary(run(splitCells, S), 3);
  assert.equal(s.errorRate, 0);
  const u = s.replicaUtil.store;
  assert.ok(u.every((x) => x > 0.25 && x < 0.45), `shards ${sortDown(u)}`);
  assert.ok(s.byKind.read!.p50 > 7 && s.byKind.read!.p50 < 12, `match p50 ${s.byKind.read!.p50}`);
});
