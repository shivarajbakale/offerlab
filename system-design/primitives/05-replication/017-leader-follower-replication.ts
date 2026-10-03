/**
 * 017. Leader-Follower Replication
 * Level: Senior
 * Group: Replication
 *
 * Problem: One database server is a single point of failure and a ceiling on read traffic.
 *   Copies on other servers fix both, but the copies must stay in step with the original.
 *
 * Approach: Asynchronous log shipping
 *   All writes go to the leader, which applies each one, numbers it and acknowledges the
 *   client straight away. Every few ticks it ships each follower the entries that follower
 *   has not yet confirmed; followers apply them in sequence order, ignore duplicates and
 *   confirm how far they got. Reads can go to any follower.
 *
 * Cost: writes O(1) on the leader; follower lag of one flush interval plus network time.
 *
 * Pattern: replication
 * Key insight: Acknowledging before followers have the write makes writes fast, but it means
 *   followers lag behind, and a write the leader acknowledged can vanish if the leader dies
 *   before shipping it. Read-your-writes fixes the lag for one client by having the follower
 *   wait until it has caught up to that client's last write.
 * Tradeoffs: Asynchronous replication gives low write latency and tolerates slow followers,
 *   at the cost of stale reads and possible loss of acknowledged writes on failover.
 *   Synchronous replication (wait for followers before acking) removes the loss but makes
 *   every write as slow as the slowest follower it waits for.
 * Staff notes: Many production setups are semi-synchronous: wait for one follower, ship to
 *   the rest asynchronously. Treat replication lag as a first-class metric and alert on it.
 *   Failover needs a rule for which follower is promoted (the most caught-up one) and
 *   fencing so the old leader cannot keep accepting writes (see 023). Read-your-writes needs
 *   the client to carry its last write position, for example in a session token.
 * Interview signals: "read-heavy", "read replicas", "scale reads", "eventual consistency is
 *   fine", "users must see their own updates", "failover".
 * Real world: MySQL and PostgreSQL streaming replication with read replicas; Amazon RDS read
 *   replicas; MongoDB replica sets; Redis primary-replica replication.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type ClientOp, type Ctx, type NodeId } from "../../kernel/sim.ts";

const FLUSH_EVERY = 4;

type Entry = { seq: number; key: string; value: string };
type PendingRead = { key: string; minSeq: number; from: NodeId };

// @why Every server runs this same code; its role decides whether it takes writes or copies them.
export class Replica extends SimNode {
  // @why On disk, so a restarted server resumes where it was instead of coming back empty and never catching up.
  static durable = ["log", "applied", "kv"];
  role: "leader" | "follower";
  // @why The ordered list of writes. Applying the same list in the same order is what keeps every copy identical.
  log: Entry[] = [];
  // @why The number of the last write applied here; the gap to the leader's number is the replication lag.
  applied = 0;
  kv: Record<string, string> = {};
  // @why Leader only: how far each follower has confirmed, so the leader knows what it still has to resend.
  acked: Record<NodeId, number> = {};
  // @why Follower only: entries that arrived before an earlier one; applying them now would skip a write.
  early = new Map<number, Entry>();
  // @why Follower only: reads that need a write this follower hasn't applied yet.
  waiting: PendingRead[] = [];

  constructor(role: "leader" | "follower") {
    super();
    this.role = role;
  }

  state() {
    return this.role === "leader"
      ? { role: this.role, applied: this.applied, acked: { ...this.acked }, kv: { ...this.kv } }
      : { role: this.role, applied: this.applied, kv: { ...this.kv }, waiting: this.waiting.length };
  }

  // @why The flush timer drives replication; without it the leader would never ship anything.
  onStart(ctx: Ctx) {
    if (this.role === "leader") ctx.setTimer("Flush", FLUSH_EVERY);
  }

  // @why Only the leader takes writes. Two servers numbering writes on their own would produce two different logs.
  onWrite(ctx: Ctx, body: { key: string; value: string }, from: NodeId) {
    if (this.role !== "leader") return ctx.send(from, "Error", { reason: "not the leader" });
    // @why The next number fixes this write's place in the order, for every copy.
    this.apply({ seq: this.applied + 1, key: body.key, value: body.value });
    ctx.say(`leader applies ${body.key}=${body.value} as #${this.applied} and acks right away`);
    // @why Acking before any follower has the write is what makes writes fast, and what risks losing them.
    ctx.send(from, "Ack", { seq: this.applied });
  }

  // @why Every few ticks, send each follower everything it hasn't confirmed. Resending is what lets a follower that missed messages catch up.
  onFlush(ctx: Ctx) {
    const shipped: string[] = [];
    for (const peer of ctx.peers) {
      const batch = this.log.filter((e) => e.seq > (this.acked[peer] ?? 0));
      if (!batch.length) continue;
      ctx.send(peer, "Replicate", { entries: batch });
      shipped.push(`#${batch[0].seq}..#${batch.at(-1)!.seq} to ${peer}`);
    }
    if (shipped.length) ctx.say(`leader ships ${shipped.join(", ")}`);
    ctx.setTimer("Flush", FLUSH_EVERY);
  }

  // @why Without confirmations the leader couldn't tell a follower that has everything from one that missed a batch. Acks can arrive late and out of order, so an older, smaller ack must not move the leader backwards.
  onReplicateAck(_ctx: Ctx, body: { applied: number }, from: NodeId) {
    this.acked[from] = Math.max(this.acked[from] ?? 0, body.applied);
  }

  onReplicate(ctx: Ctx, body: { entries: Entry[] }, from: NodeId) {
    // @why Resends repeat entries; skipping the ones already applied makes duplicates harmless.
    for (const e of body.entries) if (e.seq > this.applied) this.early.set(e.seq, e);
    // @why Apply strictly in number order, so every follower passes through exactly the leader's states.
    while (this.early.has(this.applied + 1)) {
      this.apply(this.early.get(this.applied + 1)!);
      this.early.delete(this.applied);
    }
    // @why Reads that were waiting for this follower to catch up can be answered now.
    const ready = this.waiting.filter((r) => r.minSeq <= this.applied);
    this.waiting = this.waiting.filter((r) => r.minSeq > this.applied);
    for (const r of ready) this.answer(ctx, r);
    // @why Tell the leader how far this follower has got, so it stops resending those entries.
    ctx.send(from, "ReplicateAck", { applied: this.applied });
  }

  // @why `minSeq` is the client's last write. Answering before reaching it would show the client data older than its own write.
  onRead(ctx: Ctx, body: { key: string; minSeq?: number }, from: NodeId) {
    const read = { key: body.key, minSeq: body.minSeq ?? 0, from };
    if (this.applied >= read.minSeq) return this.answer(ctx, read);
    ctx.say(`${ctx.id} has only #${this.applied} but the client needs #${read.minSeq}: hold the read`);
    this.waiting.push(read);
  }

  private apply(e: Entry) {
    this.log.push(e);
    this.kv[e.key] = e.value;
    this.applied = e.seq;
  }

  private answer(ctx: Ctx, r: PendingRead) {
    ctx.say(`${ctx.id} answers ${r.key}=${this.kv[r.key] ?? "(missing)"} as of #${this.applied}`);
    ctx.send(r.from, "ReadResult", { key: r.key, value: this.kv[r.key] ?? null, asOf: this.applied });
  }
}

// @why The whole point of replication: a follower may be behind, but what it has must be exactly the start of the leader's log.
export function followersMatchLeader(nodes: Record<NodeId, SimNode>): string | null {
  const leader = Object.values(nodes).find((n) => (n as Replica).role === "leader") as Replica | undefined;
  if (!leader) return null;
  for (const [id, node] of Object.entries(nodes)) {
    const f = node as Replica;
    if (f === leader) continue;
    const same = f.log.length <= leader.log.length && f.log.every((e, i) => JSON.stringify(e) === JSON.stringify(leader.log[i]));
    if (!same) return `${id}'s log is not a prefix of the leader's: the copies have diverged`;
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: ships each write once and never resends it.
class ShipOnce extends Replica {
  shipped = 0;
  onFlush(ctx: Ctx) {
    const batch = this.log.filter((e) => e.seq > this.shipped);
    if (batch.length) {
      for (const peer of ctx.peers) ctx.send(peer, "Replicate", { entries: batch });
      ctx.say(`leader ships #${batch[0].seq}..#${batch.at(-1)!.seq} once and never again`);
      this.shipped = this.applied;
    }
    ctx.setTimer("Flush", FLUSH_EVERY);
  }
}

// Broken on purpose: applies entries the moment they arrive, in whatever order that is.
class ApplyOnArrival extends Replica {
  onReplicate(ctx: Ctx, body: { entries: Entry[] }, from: NodeId) {
    for (const e of body.entries) {
      this.log.push(e);
      this.kv[e.key] = e.value;
      this.applied = Math.max(this.applied, e.seq);
    }
    ctx.say(`${ctx.id} applies ${body.entries.map((e) => `#${e.seq} ${e.key}=${e.value}`).join(", ")} as they arrive`);
    ctx.send(from, "ReplicateAck", { applied: this.applied });
  }
}

// Broken on purpose: keeps everything in memory, so a restart starts from nothing.
class InMemory extends Replica {
  static durable: string[] = [];
}

const cluster = (make = (role: "leader" | "follower") => new Replica(role)) => ({
  n1: () => make("leader"),
  n2: () => make("follower"),
  n3: () => make("follower"),
});
const write = (at: number, key: string, value: string): ClientOp => ({ at, to: "n1", type: "Write", body: { key, value } });

test("async replication: followers lag behind the leader, then catch up", () => {
  const { run, nodes } = simulate({
    nodes: cluster(),
    seed: 1,
    invariant: followersMatchLeader,
    until: 20,
    clients: [write(1, "x", "1"), write(2, "x", "2"), write(6, "y", "3")],
  });
  const lagged = run.steps.some((s) => (s.nodes.n2.state.applied as number) < (s.nodes.n1.state.applied as number));
  assert.ok(lagged);
  for (const id of ["n2", "n3"]) assert.deepEqual((nodes[id] as Replica).kv, { x: "2", y: "3" });
  assert.ok(!run.steps.some((s) => s.violation));
});

test("stale read: a follower answers with old data right after a write", () => {
  const { run, inbox } = simulate({
    nodes: cluster(),
    seed: 1,
    invariant: followersMatchLeader,
    until: 20,
    clients: [write(1, "x", "new"), { at: 2, to: "n2", type: "Read", body: { key: "x" } }],
  });
  const read = inbox.find((m) => m.type === "ReadResult")!;
  assert.deepEqual(read.body, { key: "x", value: null, asOf: 0 });
  assert.ok(!run.steps.some((s) => s.violation));
});

test("read-your-writes: the follower holds the read until it has the client's write", () => {
  const { run, inbox } = simulate({
    nodes: cluster(),
    seed: 1,
    invariant: followersMatchLeader,
    until: 20,
    clients: [write(1, "x", "new"), { at: 2, to: "n2", type: "Read", body: { key: "x", minSeq: 1 } }],
  });
  const read = inbox.find((m) => m.type === "ReadResult")!;
  assert.deepEqual(read.body, { key: "x", value: "new", asOf: 1 });
  assert.ok(read.deliverAt > FLUSH_EVERY);
  assert.ok(!run.steps.some((s) => s.violation));
});

test("leader crashes before shipping: the acknowledged write exists only on the dead leader", () => {
  const { run, inbox, nodes } = simulate({
    nodes: cluster(),
    seed: 1,
    invariant: followersMatchLeader,
    until: 20,
    clients: [write(1, "x", "1")],
    faults: [{ at: 3, kind: "crash", node: "n1" }],
  });
  assert.ok(inbox.some((m) => m.type === "Ack"));
  for (const id of ["n2", "n3"]) assert.equal((nodes[id] as Replica).applied, 0);
  assert.ok(!run.steps.some((s) => s.violation));
});

test("follower restarts: it keeps its data and catches up on what it missed", () => {
  const { run, nodes } = simulate({
    nodes: cluster(),
    seed: 1,
    invariant: followersMatchLeader,
    until: 40,
    clients: [write(1, "x", "1"), write(2, "y", "2"), write(10, "x", "3"), write(12, "z", "4")],
    faults: [
      { at: 8, kind: "crash", node: "n2" },
      { at: 20, kind: "recover", node: "n2" },
    ],
  });
  assert.deepEqual((nodes.n2 as Replica).kv, (nodes.n1 as Replica).kv);
  assert.equal((nodes.n2 as Replica).applied, 4);
  assert.ok(!run.steps.some((s) => s.violation));
});

test("leader restarts: its log survives on disk and the followers converge", () => {
  const { run, nodes } = simulate({
    nodes: cluster(),
    seed: 1,
    invariant: followersMatchLeader,
    until: 40,
    clients: [write(1, "x", "1"), write(14, "x", "2")],
    faults: [
      { at: 8, kind: "crash", node: "n1" },
      { at: 12, kind: "recover", node: "n1" },
    ],
  });
  for (const id of ["n1", "n2", "n3"]) assert.deepEqual((nodes[id] as Replica).kv, { x: "2" }, id);
  assert.ok(!run.steps.some((s) => s.violation));
});

test("broken: ship each write once — a follower that was down never catches up", () => {
  // #1 and #2 reach n2 by t=7. n2 is down at t=8 when #3 is shipped, so #3 is lost for good,
  // and #4 waits forever behind the gap.
  const { nodes } = simulate({
    nodes: cluster((role) => (role === "leader" ? new ShipOnce(role) : new Replica(role))),
    seed: 1,
    until: 30,
    clients: [write(1, "x", "1"), write(2, "y", "2"), write(6, "x", "3"), write(14, "z", "4")],
    faults: [
      { at: 8, kind: "crash", node: "n2" },
      { at: 12, kind: "recover", node: "n2" },
    ],
  });
  assert.equal((nodes.n2 as Replica).applied, 2);
  assert.notDeepEqual((nodes.n2 as Replica).kv, (nodes.n1 as Replica).kv);
});

test("broken: data only in memory — a restarted follower comes back empty and stays behind", () => {
  // n2 confirms #1 and #2, then is down from t=8 to t=12 (long enough to miss the leader's
  // resend at t=8) and restarts empty. The leader believes n2 already has #1 and #2, so it
  // only ever sends #3, which n2 can't apply without them.
  const { nodes } = simulate({
    nodes: cluster((role) => new InMemory(role)),
    seed: 1,
    until: 30,
    clients: [write(1, "x", "1"), write(2, "y", "2"), write(14, "z", "3")],
    faults: [
      { at: 8, kind: "crash", node: "n2" },
      { at: 12, kind: "recover", node: "n2" },
    ],
  });
  assert.equal((nodes.n2 as Replica).applied, 0);
  assert.deepEqual((nodes.n2 as Replica).kv, {});
});

test("broken: apply as it arrives — a late old batch overwrites newer data on the followers", () => {
  // The batch shipped at t=4 (x=1) is held up on the wire until after t=14. Meanwhile the
  // batch shipped at t=8 (x=1, then x=2) arrives first. Applying the late batch on arrival
  // puts x back to 1, so the followers disagree with the leader for good.
  const { run, nodes } = simulate({
    nodes: cluster((role) => (role === "leader" ? new Replica(role) : new ApplyOnArrival(role))),
    seed: 1,
    invariant: followersMatchLeader,
    until: 30,
    clients: [write(1, "x", "1"), write(6, "x", "2")],
    faults: [{ at: 0, kind: "delay", extra: 10, until: 5 }],
  });
  assert.equal(run.error, undefined);
  assert.equal((nodes.n1 as Replica).kv.x, "2");
  for (const id of ["n2", "n3"]) assert.equal((nodes[id] as Replica).kv.x, "1", id);
  assert.ok(run.steps.some((s) => s.violation?.startsWith("n2's log")));
});
