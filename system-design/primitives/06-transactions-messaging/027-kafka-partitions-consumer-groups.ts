/**
 * 027. Kafka Partitions and Consumer Groups
 * Level: Senior
 * Group: Transactions & Messaging
 *
 * Problem: Many services want to react to the same stream of events, each at its own pace,
 *   and a single reader cannot keep up with the volume. Readers crash, new ones are added,
 *   and events about the same thing (one user, one order) must still be handled in order.
 *
 * Approach: A partitioned log read by a consumer group
 *   The broker keeps a topic as several append-only logs called partitions. A producer's
 *   message goes to the partition picked by hashing its key, so one key always lands in the
 *   same partition. Consumers that share a group id split the partitions between them; each
 *   partition has exactly one owner at a time. A consumer reads its partitions in offset
 *   order, processes, and then commits how far it got. When a consumer joins, or stops
 *   sending heartbeats, the group coordinator rebalances: everyone hands in their committed
 *   offsets, and the partitions are dealt out again, each resuming from its committed offset.
 *
 * Cost: append O(1); reading is sequential; parallelism is capped at the partition count; a
 *   rebalance pauses the whole group for a round trip, or a session timeout after a crash.
 *
 * Pattern: messaging / log-based stream
 * Key insight: Order is a property of one partition, not of the topic. Hashing the key picks
 *   the partition, so all of one key's messages are read by one consumer in log order.
 *   Committing after processing means a crash replays a little (at-least-once); committing
 *   before means a crash skips a little (at-most-once).
 * Tradeoffs: More partitions give more parallel consumers but more files, more rebalancing
 *   work and no order across partitions. One hot key cannot be spread out: its partition's
 *   consumer is the bottleneck. At-least-once delivery forces consumers to tolerate
 *   duplicates (see 026).
 * Staff notes: Choose the key for the ordering you actually need (per account, per order),
 *   and check its skew. Plan the partition count up front: adding partitions later changes
 *   which partition a key hashes to, so per-key order breaks across the change. Rebalancing
 *   here is "stop everyone, then reassign". Kafka also offers cooperative (incremental)
 *   rebalancing, where only the partitions that move are paused. Consumers beyond the
 *   partition count sit idle. This file leaves out replication of partitions between
 *   brokers, retention, and fetch sizing.
 * Interview signals: "event stream", "fan out to several services", "process in order per
 *   user", "replay events", "scale consumers horizontally", "exactly-once processing",
 *   "Kafka", "Kinesis", "Pulsar".
 * Real world: Apache Kafka topics, partitions, consumer groups and committed offsets work
 *   this way, and Kafka's default partitioner hashes the key (murmur2) modulo the partition
 *   count. Amazon Kinesis Data Streams uses shards and a partition key in the same role.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type ClientOp, type Ctx, type NodeId, type SimResult } from "../../kernel/sim.ts";

const BROKER: NodeId = "broker";
const PARTITIONS = 3;
// How many records one Fetch returns at most.
const BATCH = 3;
const HEARTBEAT_EVERY = 3;
const SESSION_TIMEOUT = 10;
const SESSION_CHECK_EVERY = 2;
const POLL_EVERY = 2;
// Processing one record takes this long.
const WORK_EVERY = 2;
const AUTO_COMMIT_EVERY = 8;
const JOIN_WAIT = 3;

type Rec = { offset: number; key: string; n: number };
type Done = { key: string; n: number; partition: number; offset: number; t: number };
type Offsets = Record<number, number>;
type ParkedFetch = { generation: number; partition: number; offset: number; from: NodeId };

// @why A deterministic hash, so every producer sends the same key to the same partition, run after run.
export function partitionFor(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PARTITIONS;
}

const show = (r: { key: string; n: number }) => `${r.key}#${r.n}`;
const list = (ps: number[]) => (ps.length ? ps.map((p) => `p${p}`).join(", ") : "nothing");

// @why One broker holds the topic and also acts as the group's coordinator: it owns the partition logs and decides who reads which.
export class Broker extends SimNode {
  // @why On disk: the logs are the topic and the committed offsets are the group's progress, so losing either loses data. The generation is kept so a restarted broker never reuses an old one.
  static durable = ["logs", "committed", "generation"];
  // @why One append-only log per partition. A record's offset is its position, and it never changes, so readers can replay from any point.
  logs: Rec[][] = Array.from({ length: PARTITIONS }, () => []);
  // @why The group's bookmark per partition: the offset of the next record to process. A new owner starts here.
  committed: number[] = Array(PARTITIONS).fill(0);
  // @why Who is in the group right now, and when each was last heard from.
  members: NodeId[] = [];
  lastSeen: Record<NodeId, number> = {};
  // @why Bumped on every rebalance. Anything stamped with an older generation comes from before the reshuffle and is ignored.
  generation = 0;
  // @why Exactly one consumer per partition, so one partition's records are never read by two group members at once.
  owner: (NodeId | null)[] = Array(PARTITIONS).fill(null);
  // @why Members that still have to hand in their offsets before partitions can be dealt out again. Non-empty means a rebalance is under way.
  waiting: NodeId[] = [];
  // @why Fetches waiting for a record that does not exist yet (long polling).
  parked: ParkedFetch[] = [];
  // @why A rebalance is already scheduled, so a second join in the wait window just rides along.
  joinPending = false;

  state() {
    return {
      logs: this.logs.map((l) => l.map(show)),
      committed: [...this.committed],
      members: [...this.members],
      owner: [...this.owner],
      generation: this.generation,
      rebalancing: this.waiting.length > 0,
    };
  }

  onStart(ctx: Ctx) {
    ctx.setTimer("SessionCheck", SESSION_CHECK_EVERY);
  }

  // @why The key decides the partition, so every message about one key lands in one log, in the order it arrived.
  protected choosePartition(key: string): number {
    return partitionFor(key);
  }

  onProduce(ctx: Ctx, body: { key: string; n: number }, from: NodeId) {
    const p = this.choosePartition(body.key);
    const rec = { offset: this.logs[p].length, key: body.key, n: body.n };
    // @why Append only. Nothing is removed when it is read, so many groups can read the same log, and a group can re-read it.
    this.logs[p].push(rec);
    ctx.say(`broker appends ${show(rec)} to p${p} at offset ${rec.offset}`);
    ctx.send(from, "Produced", { partition: p, offset: rec.offset });
    const ready = this.parked.filter((f) => f.partition === p);
    this.parked = this.parked.filter((f) => f.partition !== p);
    for (const f of ready) this.answerFetch(ctx, f);
  }

  onJoinGroup(ctx: Ctx, _body: unknown, from: NodeId) {
    this.lastSeen[from] = ctx.now;
    if (this.members.includes(from)) return;
    this.members = [...this.members, from].sort();
    ctx.say(`${from} joins the group; the broker waits ${JOIN_WAIT} ticks for others before rebalancing`);
    // @why Consumers often start together. Waiting a moment lets one rebalance cover all of them instead of one per join.
    if (!this.joinPending) ctx.setTimer("StartRebalance", JOIN_WAIT);
    this.joinPending = true;
  }

  onStartRebalance(ctx: Ctx) {
    this.joinPending = false;
    this.rebalance(ctx, "new members joined");
  }

  onHeartbeat(ctx: Ctx, _body: unknown, from: NodeId) {
    // @why A live consumer that was dropped from the group (it went quiet for too long) joins again instead of idling forever.
    if (!this.members.includes(from)) return this.onJoinGroup(ctx, {}, from);
    this.lastSeen[from] = ctx.now;
  }

  // @why Silence for a whole session timeout is the only sign of a dead consumer. Its partitions would sit unread forever otherwise.
  onSessionCheck(ctx: Ctx) {
    const dead = this.members.filter((m) => ctx.now - this.lastSeen[m] > SESSION_TIMEOUT);
    if (dead.length) {
      this.members = this.members.filter((m) => !dead.includes(m));
      this.rebalance(ctx, `${dead.join(", ")} sent no heartbeat for ${SESSION_TIMEOUT} ticks, so it is removed`);
    }
    ctx.setTimer("SessionCheck", SESSION_CHECK_EVERY);
  }

  // @why Stop everyone first. Handing a partition to a new owner while the old one is still reading it would let two consumers process it at once.
  private rebalance(ctx: Ctx, reason: string) {
    this.generation++;
    this.waiting = [...this.members];
    // @why Held fetches belong to the old assignment.
    this.parked = [];
    // @why A member whose rejoin never arrives must not hold up the whole group forever.
    ctx.setTimer("RebalanceTimeout", SESSION_TIMEOUT);
    ctx.say(`${reason}: rebalance to generation ${this.generation}, every member must stop and hand in its offsets`);
    for (const m of this.members) ctx.send(m, "Revoke", { generation: this.generation });
    if (!this.members.length) this.owner = this.owner.map(() => null);
  }

  onRebalanceTimeout(ctx: Ctx) {
    if (!this.waiting.length) return;
    ctx.say(`${this.waiting.join(", ")} did not rejoin in time, so the broker goes on without it`);
    this.members = this.members.filter((m) => !this.waiting.includes(m));
    this.waiting = [];
    if (this.members.length) this.assign(ctx);
  }

  // @why The member's last offsets come with its rejoin, so the next owner starts exactly where this one stopped.
  onRejoin(ctx: Ctx, body: { generation: number; offsets: Offsets }, from: NodeId) {
    if (body.generation !== this.generation || !this.waiting.includes(from)) return;
    for (const [p, offset] of Object.entries(body.offsets)) if (this.owner[Number(p)] === from) this.committed[Number(p)] = offset;
    this.waiting = this.waiting.filter((m) => m !== from);
    if (!this.waiting.length) {
      ctx.cancelTimer("RebalanceTimeout");
      this.assign(ctx);
    }
  }

  // @why Round-robin over the sorted members: partition i goes to member i mod n. With more members than partitions, the extras get nothing.
  private assign(ctx: Ctx) {
    this.owner = this.owner.map((_, p) => this.members[p % this.members.length]);
    const got = this.members.map((m) => `${m}: ${list(this.partitionsOf(m))}`);
    ctx.say(`everyone has rejoined, so the broker deals out the partitions: ${got.join("; ")}`);
    for (const m of this.members) {
      const parts = this.partitionsOf(m).map((p) => ({ partition: p, offset: this.committed[p] }));
      ctx.send(m, "Assign", { generation: this.generation, partitions: parts });
    }
  }

  private partitionsOf(m: NodeId) {
    return this.owner.flatMap((o, p) => (o === m ? [p] : []));
  }

  // @why Only the current owner, in the current generation, may move a partition's bookmark. A consumer that was replaced must not overwrite its successor's progress.
  onCommit(ctx: Ctx, body: { generation: number; offsets: Offsets }, from: NodeId) {
    if (body.generation !== this.generation || this.waiting.length) {
      return ctx.say(`broker ignores ${from}'s commit from generation ${body.generation}: the group is rebalancing or has moved on, and the offsets now come from the rejoin`);
    }
    const moved: string[] = [];
    for (const [p, offset] of Object.entries(body.offsets)) {
      if (this.owner[Number(p)] !== from) continue;
      this.committed[Number(p)] = offset;
      moved.push(`p${p} → ${offset}`);
    }
    if (moved.length) ctx.say(`broker records ${from}'s committed offsets: ${moved.join(", ")}`);
  }

  // @why Reads never change the log; the consumer says where to read from, and the broker just returns what is there.
  onFetch(ctx: Ctx, body: { generation: number; partition: number; offset: number }, from: NodeId) {
    if (body.generation !== this.generation || this.waiting.length || this.owner[body.partition] !== from) return;
    // @why Nothing new yet: hold the fetch and answer it when a record arrives, instead of making the consumer ask over and over.
    if (body.offset >= this.logs[body.partition].length) return void this.parked.push({ ...body, from });
    this.answerFetch(ctx, { ...body, from });
  }

  private answerFetch(ctx: Ctx, f: ParkedFetch) {
    const records = this.logs[f.partition].slice(f.offset, f.offset + BATCH);
    ctx.send(f.from, "Records", { generation: f.generation, partition: f.partition, records });
  }
}

// @why Every consumer in the group runs this same code; the broker's assignment decides which partitions it reads.
export class Consumer extends SimNode {
  // @why Nothing on disk. A consumer's progress lives at the broker as committed offsets, so any member can take over any partition.
  static durable: string[] = [];
  joinAt: number;
  generation = 0;
  partitions: number[] = [];
  // @why Per partition: the next offset to fetch. Moves ahead as records arrive, before they are processed.
  position: Offsets = {};
  // @why Per partition: the offset after the last record actually processed. This, not `position`, is what is safe to commit.
  processed: Offsets = {};
  // @why What was last sent as a commit, so unchanged offsets are not sent again.
  committedSent: Offsets = {};
  // @why At most one fetch in flight per partition. A second fetch for the same partition could return the same records twice, or out of order.
  fetching: Record<number, boolean> = {};
  // @why Records fetched but not yet processed, in the order they arrived; they are lost if this consumer crashes.
  buffer: (Rec & { partition: number })[] = [];
  // @why The side effects this consumer has caused (emails sent, rows written). Kept for the scenarios to inspect.
  done: Done[] = [];
  // @why True while a record is being processed; records are processed one at a time, in buffer order.
  busy = false;

  constructor(joinAt = 0) {
    super();
    // @why Lets a scenario start a consumer later, to show a member joining a running group.
    this.joinAt = joinAt;
  }

  state() {
    return {
      partitions: [...this.partitions],
      buffered: this.buffer.map(show),
      done: this.done.map(show),
      processed: { ...this.processed },
    };
  }

  onStart(ctx: Ctx) {
    ctx.setTimer("Join", ctx.now === 0 ? this.joinAt : 0);
  }

  onJoin(ctx: Ctx) {
    ctx.send(BROKER, "JoinGroup", {});
    ctx.setTimer("SendHeartbeat", HEARTBEAT_EVERY);
    ctx.setTimer("Poll", POLL_EVERY);
    ctx.setTimer("AutoCommit", AUTO_COMMIT_EVERY);
  }

  // @why Without heartbeats the broker cannot tell a live consumer that has nothing to do from a dead one.
  onSendHeartbeat(ctx: Ctx) {
    ctx.send(BROKER, "Heartbeat", {});
    ctx.setTimer("SendHeartbeat", HEARTBEAT_EVERY);
  }

  // @why Stop reading, drop records not yet processed (the next owner will fetch them again), and hand in how far this consumer really got.
  onRevoke(ctx: Ctx, body: { generation: number }) {
    // @why Revokes can arrive out of order; an older one must not drag this consumer back to an old generation.
    if (body.generation <= this.generation) return;
    this.generation = body.generation;
    const offsets = this.ownedOffsets();
    if (this.partitions.length) {
      ctx.say(`${ctx.id} gives up ${list(this.partitions)}, drops ${this.buffer.length} unprocessed record(s) and hands in offsets ${JSON.stringify(offsets)}`);
    }
    this.partitions = [];
    this.buffer = [];
    this.fetching = {};
    this.busy = false;
    ctx.cancelTimer("ProcessNext");
    ctx.send(BROKER, "Rejoin", { generation: body.generation, offsets });
  }

  // @why A new owner starts from the group's committed offset, not from the start of the log and not from where it was before.
  onAssign(ctx: Ctx, body: { generation: number; partitions: { partition: number; offset: number }[] }) {
    if (body.generation !== this.generation) return;
    this.partitions = body.partitions.map((x) => x.partition);
    for (const { partition, offset } of body.partitions) {
      this.position[partition] = offset;
      this.processed[partition] = offset;
      this.committedSent[partition] = offset;
    }
    ctx.say(
      this.partitions.length
        ? `${ctx.id} now reads ${body.partitions.map((x) => `p${x.partition} from offset ${x.offset}`).join(", ")}`
        : `${ctx.id} gets no partition: there are more consumers than partitions, so it sits idle`,
    );
  }

  onPoll(ctx: Ctx) {
    for (const p of this.partitions) {
      // @why Fetch more only once this partition's earlier records are processed, so its records are handled strictly in offset order.
      if (this.fetching[p] || this.buffer.some((r) => r.partition === p)) continue;
      this.fetching[p] = true;
      ctx.send(BROKER, "Fetch", { generation: this.generation, partition: p, offset: this.position[p] });
    }
    ctx.setTimer("Poll", POLL_EVERY);
  }

  onRecords(ctx: Ctx, body: { generation: number; partition: number; records: Rec[] }) {
    // @why Records for a partition this consumer no longer owns belong to the new owner now.
    if (body.generation !== this.generation || !this.partitions.includes(body.partition)) return;
    this.fetching[body.partition] = false;
    if (!body.records.length) return;
    for (const r of body.records) this.buffer.push({ ...r, partition: body.partition });
    this.position[body.partition] = body.records.at(-1)!.offset + 1;
    this.afterFetch(ctx, body.partition, body.records);
    if (!this.busy) {
      this.busy = true;
      ctx.setTimer("ProcessNext", WORK_EVERY);
    }
  }

  // @why Hook for the broken subclass; the real consumer commits nothing when it fetches.
  protected afterFetch(_ctx: Ctx, _partition: number, _records: Rec[]) {}

  // @why Processing one record takes WORK_EVERY ticks; this fires when the current record is finished.
  onProcessNext(ctx: Ctx) {
    const r = this.buffer.shift()!;
    this.done.push({ key: r.key, n: r.n, partition: r.partition, offset: r.offset, t: ctx.now });
    this.processed[r.partition] = r.offset + 1;
    ctx.say(`${ctx.id} has processed ${show(r)} from p${r.partition} offset ${r.offset}`);
    this.busy = this.buffer.length > 0;
    if (this.busy) ctx.setTimer("ProcessNext", WORK_EVERY);
  }

  // @why Commit only what has been processed. A crash before the next commit replays those records (at-least-once) instead of skipping them.
  onAutoCommit(ctx: Ctx) {
    const offsets = this.ownedOffsets();
    const changed = Object.fromEntries(Object.entries(offsets).filter(([p, o]) => this.committedSent[Number(p)] !== o));
    if (Object.keys(changed).length) {
      Object.assign(this.committedSent, changed);
      ctx.say(`${ctx.id} commits processed offsets ${JSON.stringify(changed)}`);
      ctx.send(BROKER, "Commit", { generation: this.generation, offsets: changed });
    }
    ctx.setTimer("AutoCommit", AUTO_COMMIT_EVERY);
  }

  private ownedOffsets(): Offsets {
    return Object.fromEntries(this.partitions.map((p) => [p, this.processed[p]]));
  }
}

// @why Per-key order, checked after every event: the first time each message is processed, it must not be before an earlier message with the same key. Reprocessing after a crash is allowed.
export function keyOrderHolds(nodes: Record<NodeId, SimNode>): string | null {
  const first = new Map<string, Map<number, number>>();
  for (const node of Object.values(nodes)) {
    if (!(node instanceof Consumer)) continue;
    for (const d of node.done) {
      const byN = first.get(d.key) ?? new Map<number, number>();
      first.set(d.key, byN);
      byN.set(d.n, Math.min(byN.get(d.n) ?? Infinity, d.t));
    }
  }
  for (const [key, byN] of first) {
    for (const [a, ta] of byN) {
      for (const [b, tb] of byN) {
        if (a < b && ta > tb) return `${key}#${a} processed after ${key}#${b}: one key's messages are out of order`;
      }
    }
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: commits each batch's offsets the moment it is fetched, before processing it.
class CommitFirst extends Consumer {
  protected afterFetch(ctx: Ctx, partition: number, records: Rec[]) {
    const offset = records.at(-1)!.offset + 1;
    this.committedSent[partition] = offset;
    ctx.say(`${ctx.id} fetched ${records.map(show).join(", ")} from p${partition} and commits offset ${offset} before processing them`);
    ctx.send(BROKER, "Commit", { generation: this.generation, offsets: { [partition]: offset } });
  }
  // Its offsets were already committed at fetch time, so there is nothing left to commit later.
  onAutoCommit(_ctx: Ctx) {}
  // On a rebalance it hands in what it fetched, as if it were done.
  onRevoke(ctx: Ctx, body: { generation: number }) {
    for (const p of this.partitions) this.processed[p] = this.position[p];
    super.onRevoke(ctx, body);
  }
}

// Broken on purpose: ignores the key and spreads messages over the partitions in turn.
class RoundRobinBroker extends Broker {
  next = 0;
  protected choosePartition(_key: string): number {
    return this.next++ % PARTITIONS;
  }
}

// Broken on purpose: never checks for silent members, so a crashed consumer keeps its partitions.
class NoSessionTimeout extends Broker {
  reported: NodeId[] = [];
  onSessionCheck(ctx: Ctx) {
    for (const m of this.members) {
      if (ctx.now - this.lastSeen[m] <= SESSION_TIMEOUT || this.reported.includes(m)) continue;
      this.reported.push(m);
      const parts = this.owner.flatMap((o, p) => (o === m ? [p] : []));
      ctx.say(`${m} has sent no heartbeat for ${SESSION_TIMEOUT} ticks, but this broker never removes anyone, so ${list(parts)} stay with ${m} and go unread`);
    }
    ctx.setTimer("SessionCheck", SESSION_CHECK_EVERY);
  }
}

// Broken on purpose: accepts every commit, whatever its generation and whoever sends it.
class NoGenerations extends Broker {
  onCommit(ctx: Ctx, body: { generation: number; offsets: Offsets }, from: NodeId) {
    const moved: string[] = [];
    for (const [p, offset] of Object.entries(body.offsets)) {
      moved.push(`p${p} ${this.committed[Number(p)]} → ${offset}`);
      this.committed[Number(p)] = offset;
    }
    ctx.say(`broker records ${from}'s commit from generation ${body.generation} without checking it (now generation ${this.generation}): ${moved.join(", ")}`);
  }
}

const group = (count: number, joinAt: Record<NodeId, number> = {}, broker = () => new Broker(), consumer = (t: number) => new Consumer(t)) => ({
  [BROKER]: broker,
  ...Object.fromEntries(Array.from({ length: count }, (_, i) => `c${i + 1}`).map((id) => [id, () => consumer(joinAt[id] ?? 0)])),
});
const produce = (at: number, key: string, n: number): ClientOp => ({ at, to: BROKER, type: "Produce", body: { key, n } });
const consumersOf = (r: SimResult) => Object.entries(r.nodes).filter(([id]) => id !== BROKER) as [NodeId, Consumer][];
const label = (d: Done) => show(d);
const processed = (r: SimResult) => consumersOf(r).flatMap(([, c]) => c.done.map(label));
const sent = (ops: ClientOp[]) => ops.map((op) => show(op.body as { key: string; n: number }));
const violated = (r: SimResult) => r.run.steps.find((s) => s.violation)?.violation;

// alice hashes to p0, bob to p1 and dave to p2.
const traffic = [
  produce(1, "alice", 1),
  produce(1, "bob", 1),
  produce(2, "alice", 2),
  produce(2, "dave", 1),
  produce(3, "alice", 3),
  produce(3, "bob", 2),
  produce(4, "dave", 2),
  produce(5, "alice", 4),
];

test("ordering: messages with the same key are processed in the order they were sent", () => {
  const r = simulate({ nodes: group(3), seed: 2, until: 60, clients: traffic, invariant: keyOrderHolds });
  assert.equal(r.run.error, undefined);
  assert.equal(violated(r), undefined);
  assert.deepEqual(processed(r).sort(), sent(traffic).sort());
  const c1 = r.nodes.c1 as Consumer;
  assert.deepEqual(c1.done.map(label), ["alice#1", "alice#2", "alice#3", "alice#4"]);
});

test("rebalance on crash: the crashed consumer's partitions move and resume from the committed offset, so some messages are processed twice", () => {
  const r = simulate({ nodes: group(2), seed: 2, until: 80, clients: traffic, faults: [{ at: 18, kind: "crash", node: "c1" }], invariant: keyOrderHolds });
  assert.equal(r.run.error, undefined);
  assert.equal(violated(r), undefined);
  assert.deepEqual((r.nodes.c2 as Consumer).partitions, [0, 1, 2]);
  const c1 = (r.nodes.c1 as Consumer).done.map(label);
  const c2 = (r.nodes.c2 as Consumer).done.map(label);
  // c1 processed dave#1 at t=17 and crashed at t=18, before its next commit at t=24.
  assert.ok(c1.includes("dave#1") && c2.includes("dave#1"), "dave#1 was not processed twice");
  for (const m of sent(traffic)) assert.ok(c1.includes(m) || c2.includes(m), `${m} never processed`);
});

test("scale out: a new consumer joining takes over some partitions", () => {
  const ops = [...traffic, produce(30, "dave", 3), produce(31, "alice", 5), produce(32, "bob", 3)];
  const r = simulate({ nodes: group(3, { c3: 20 }), seed: 3, until: 80, clients: ops, invariant: keyOrderHolds });
  assert.equal(r.run.error, undefined);
  assert.equal(violated(r), undefined);
  const before = r.run.steps.filter((s) => s.t < 20).at(-1)!;
  assert.deepEqual(before.nodes.c3.state.partitions, []);
  assert.equal((r.nodes.c3 as Consumer).partitions.length, 1);
  assert.ok((r.nodes.c3 as Consumer).done.length > 0);
  assert.deepEqual(processed(r).sort(), sent(ops).sort());
});

test("idle: with more consumers than partitions, the extra consumer gets nothing", () => {
  const r = simulate({ nodes: group(4), seed: 4, until: 60, clients: traffic, invariant: keyOrderHolds });
  assert.equal(r.run.error, undefined);
  for (const id of ["c1", "c2", "c3"]) assert.equal((r.nodes[id] as Consumer).partitions.length, 1, id);
  assert.deepEqual((r.nodes.c4 as Consumer).partitions, []);
  assert.deepEqual((r.nodes.c4 as Consumer).done, []);
  assert.deepEqual(processed(r).sort(), sent(traffic).sort());
});

test("broken: commit before processing — a crash loses messages for good", () => {
  const r = simulate({
    nodes: group(2, {}, () => new Broker(), (t) => new CommitFirst(t)),
    seed: 2,
    until: 80,
    clients: traffic,
    faults: [{ at: 18, kind: "crash", node: "c1" }],
    invariant: keyOrderHolds,
  });
  assert.equal(r.run.error, undefined);
  // c1 committed p0 up to 3 and p2 up to 2 at t=17, had processed only alice#1, and crashed at t=18.
  const lost = sent(traffic).filter((m) => !processed(r).includes(m));
  assert.deepEqual(lost, ["alice#2", "dave#1", "alice#3", "dave#2"]);
  assert.deepEqual((r.nodes.broker as Broker).committed, [4, 2, 2]);
  assert.deepEqual((r.nodes.c2 as Consumer).partitions, [0, 1, 2]);
});

test("broken: no heartbeat timeout — a crashed consumer keeps its partitions, and their messages are never processed", () => {
  const r = simulate({ nodes: group(2, {}, () => new NoSessionTimeout()), seed: 2, until: 80, clients: traffic, faults: [{ at: 18, kind: "crash", node: "c1" }], invariant: keyOrderHolds });
  assert.equal(r.run.error, undefined);
  const b = r.nodes.broker as Broker;
  // The dead c1 still owns p0 and p2; nobody reads them.
  assert.deepEqual(b.owner, ["c1", "c2", "c1"]);
  assert.deepEqual((r.nodes.c2 as Consumer).partitions, [1]);
  const never = sent(traffic).filter((m) => !processed(r).includes(m));
  assert.deepEqual(never, ["alice#1", "alice#2", "alice#3", "dave#2", "alice#4"]);
});

test("broken: no generations — a stale commit moves p0's bookmark back and alice#2 is processed again", () => {
  // c3 joins at t=22. c1's commit from generation 1, sent at t=24, is slowed down and lands at t=35, after the
  // rebalance has set p0's bookmark to 3 from c1's rejoin. c1 crashes at t=37, and p0's next owner starts
  // from the stale bookmark. (The real broker ignores that commit, and alice#2 is processed once.)
  const r = simulate({
    nodes: group(3, { c3: 22 }, () => new NoGenerations()),
    seed: 3,
    until: 90,
    clients: [...traffic, produce(30, "dave", 3), produce(31, "alice", 5), produce(32, "bob", 3)],
    faults: [
      { at: 24, kind: "delay", extra: 8, until: 25 },
      { at: 37, kind: "crash", node: "c1" },
    ],
    invariant: keyOrderHolds,
  });
  assert.equal(r.run.error, undefined);
  const p0 = r.run.steps.map((s) => (s.nodes.broker.state.committed as number[])[0]);
  const back = p0.findIndex((c, i) => i > 0 && c < p0[i - 1]);
  assert.ok(back > 0, "p0's bookmark never moved back");
  assert.deepEqual([p0[back - 1], p0[back], r.run.steps[back].t], [3, 1, 35]);
  const c1 = (r.nodes.c1 as Consumer).done.map(label);
  const c2 = (r.nodes.c2 as Consumer).done.map(label);
  assert.ok(c1.includes("alice#2") && c2.includes("alice#2"), "alice#2 was not processed twice");
});

test("broken: no key, round-robin partitioning — one key's messages are processed out of order", () => {
  const r = simulate({ nodes: group(3, {}, () => new RoundRobinBroker()), seed: 2, until: 60, clients: traffic, invariant: keyOrderHolds });
  assert.equal(r.run.error, undefined);
  assert.match(violated(r) ?? "", /^alice#\d processed after alice#\d/);
});
