/**
 * 31. Key-Value Store
 * Level: Staff
 * Group: Architectures
 *
 * Problem: Build a store that does two things, get(key) and put(key, value), for a million keys
 *   and thousands of requests a second, and keeps working when machines die. Decide what a read
 *   may return while copies of a key disagree, and what happens to a key everyone wants.
 *
 * Approach: Split the keys, copy each split, then choose where reads go
 *   1. One node: it fills up. 2. Shard the keys over 8 nodes; losing one loses an eighth of the
 *   keys. 3. Three copies of every shard: a lost copy costs nothing, but reads from copies that
 *   trail the primary return old values, even a user's own write; a lost primary stops its keys'
 *   writes. 4. Send a user's reads to the primary right after their own write; a hot key still
 *   lands on one shard, and is the key most often read stale.
 *
 * Cost: one node (4 cores) handles ~1,800 requests a second and fails ~41% at 3,000; 8 shards are
 *   ~21% busy for ~$3.09 an hour, and one dying fails ~11% of requests; 3 copies cost ~$8.53 an
 *   hour, survive a lost copy with no errors, and with copies 300 ms behind every reread 200 ms
 *   after a user's write is stale; reading your own writes from the primary makes that 0%.
 *
 * Pattern: partitioning (consistent hashing), replication, read-your-writes, quorums
 * Key insight: Sharding buys capacity, copies buy survival, and every copy that answers reads
 *   without waiting for the others is a copy that can be behind. The question for each read is
 *   how fresh it must be, and the answer decides which copies may serve it.
 * Tradeoffs: Fresher reads cost more: more copies consulted (quorums) or reads pinned to the
 *   primary. Three copies triple the machines. Leaderless designs accept writes during failures
 *   but must merge conflicting versions.
 * Staff notes: Pick N, W and R per use, not per cluster: a shopping cart wants writes that never
 *   fail; a balance wants a single leader (or consensus) with linearizable reads, which quorums
 *   alone do not give. Place copies in different racks or zones.
 *   Measure replica lag; it is your staleness. Watch for hot keys with per-key request counts at
 *   the routers.
 * Interview signals: "design a key-value store", "Dynamo", "Cassandra", "eventual consistency",
 *   "quorum", "consistent hashing", "hot partition".
 * Real world: Amazon's Dynamo paper (2007) described consistent hashing with virtual nodes, N
 *   copies, sloppy quorums with hinted handoff, and vector clocks; Riak followed it closely, and
 *   Cassandra took its partitioning and replication but keeps the newest timestamp (last write wins).
 *   DynamoDB, a different system, splits tables into partitions and throttles a partition that
 *   gets too much traffic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, knob, loadBalancer, run, server, summary } from "../traffic/index.ts";

// 3,000 requests a second from other services: 90% get, 10% put, over a million keys (Zipf 0.8:
// popular keys get more, but no key dominates). Half the time, 200 ms after a put, the same
// caller gets the same key again (to check its write, or to show it to the user).
const apps = () =>
  clients({
    to: "lb",
    qps: knob("qps", 3000, [10, 50_000]),
    mix: { read: 0.9, write: 0.1 },
    keys: 1_000_000,
    skew: knob("skew", 0.8, [0, 2]),
    rereadMs: 200,
    rereadShare: 0.5,
    hopMs: 1,
  });
// Routers know which node owns which key, and pass each request on.
const routers = () => ({
  lb: loadBalancer({ to: "router" }),
  router: server({ label: "Request routers", replicas: 2, cores: 4, serviceMs: { read: 0.2, write: 0.2 }, calls: ["nodes"], hopMs: 0.5 }),
});
// A storage node: 4 cores, 2 ms per get and 4 ms per put (it writes a log to disk first). With
// copies, the first copy of each shard takes the puts and the others trail it by `lag` ms.
const nodes = (o: { shards: number; copies?: number; ownWrites?: boolean }) =>
  database({
    label: "Storage nodes",
    shards: knob("shards", o.shards, [1, 32]),
    replicas: o.copies ?? 1,
    cores: 4,
    readMs: 2,
    writeMs: 4,
    lagMs: knob("lag", 300, [0, 5000]),
    readYourWrites: o.ownWrites ?? false,
  });

// @why Stage 1: every key on one node.
export const oneNode = design("1. One node", { apps: apps(), ...routers(), nodes: nodes({ shards: 1 }) });

// @why Stage 2: a hash of the key picks one of 8 nodes; each holds an eighth of the keys.
export const sharded = design("2. Shard the keys", { apps: apps(), ...routers(), nodes: nodes({ shards: 8 }) });

// @why Stage 3: three copies of every shard on three nodes. Puts go to the first copy, which
// @why answers at once and passes the change on; the other two apply it ~300 ms later. Gets go
// @why to either of the other two.
export const copies = design("3. Three copies of every shard", { apps: apps(), ...routers(), nodes: nodes({ shards: 8, copies: 3 }) });

// @why Stage 4: for a second after a caller's put, its gets go to the first copy, which has it.
export const ownWrites = design("4. Read your own writes", { apps: apps(), ...routers(), nodes: nodes({ shards: 8, copies: 3, ownWrites: true }) });

// --- helpers for the scenarios ---

const S = { seconds: 8, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);
// A node dies 3 s in and stays down.
const lose = (target: string) => [{ at: 3000, kind: "kill" as const, target }];

test("broken: one node — 3,000 requests a second need 1.7 nodes", () => {
  const r = run(oneNode, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "nodes");
  assert.ok(s.util.nodes > 0.99, `node ${s.util.nodes}`);
  assert.ok(s.errorRate > 0.36 && s.errorRate < 0.46, `errors ${s.errorRate}`);
  assert.ok(s.p50 > 150, `p50 ${s.p50}`);
});

test("shards: eight nodes, each about 21% busy", () => {
  const s = summary(run(sharded, S), 3);
  assert.equal(s.errorRate, 0);
  const u = s.replicaUtil.nodes;
  assert.ok(u.every((x) => x > 0.18 && x < 0.25), `${u}`);
  assert.ok(s.p99 < 13, `p99 ${s.p99}`);
  assert.ok(Math.abs(s.costPerHour - 3.09) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: shards — one node dies and an eighth of the keys are gone", () => {
  const s = summary(run(sharded, { ...S, faults: lose("nodes-s3") }), 4);
  assert.ok(s.errorRate > 0.09 && s.errorRate < 0.14, `errors ${s.errorRate}`);
  assert.ok(s.byKind.read!.errorRate > 0.09 && s.byKind.write!.errorRate > 0.09, "gets and puts alike");
});

test("copies: one copy dies and nothing fails", () => {
  const s = summary(run(copies, { ...S, faults: lose("nodes-s3-2") }), 4);
  assert.equal(s.errorRate, 0);
});

test("broken: copies — a reread 200 ms after your own put is always stale", () => {
  const s = summary(run(copies, S), 3);
  assert.equal(s.errorRate, 0);
  // The copies are 300 ms behind, and the reread comes 200 ms after the put.
  assert.equal(s.staleOwnRate, 1);
  assert.ok(Math.abs(s.costPerHour - 8.53) < 0.02, `cost ${s.costPerHour}: three times the nodes`);
  assert.ok(s.staleRate > 0.06 && s.staleRate < 0.1, `stale ${s.staleRate}`);
});

test("broken: copies — the first copy dies: gets carry on, its keys' puts fail", () => {
  const s = summary(run(copies, { ...S, faults: lose("nodes-s3-1") }), 4);
  assert.ok(s.byKind.read!.errorRate < 0.005, `get errors ${s.byKind.read!.errorRate}`);
  assert.ok(s.byKind.write!.errorRate > 0.1 && s.byKind.write!.errorRate < 0.18, `put errors ${s.byKind.write!.errorRate}`);
});

test("read your own writes: every reread sees the put, a few other gets are still behind", () => {
  const s = summary(run(ownWrites, S), 3);
  assert.equal(s.errorRate, 0);
  assert.equal(s.staleOwnRate, 0);
  assert.ok(s.staleRate > 0.01 && s.staleRate < 0.05, `stale ${s.staleRate}`);
  // The first copies now also take those rereads.
  const u = s.replicaUtil.nodes;
  assert.ok(u.every((x) => x < 0.12), `${u}`);
});

test("broken: a hot key — its shard's nodes are far busier, and most gets return an old value", () => {
  const s = summary(run(ownWrites, { ...S, knobs: { skew: 1.5 } }), 3);
  const u = sortDown(s.replicaUtil.nodes);
  // Three busiest: the hot key's shard. The median node is far quieter.
  assert.ok(u[2] > 0.18 && u[12] < 0.05, `busiest ${u.slice(0, 3)}, median ${u[12]}`);
  // The hot key is put over 100 times a second, faster than copies 300 ms behind can keep up with.
  assert.ok(s.staleRate > 0.6 && s.staleRate < 0.8, `stale ${s.staleRate}`);
  assert.equal(s.staleOwnRate, 0);
});
