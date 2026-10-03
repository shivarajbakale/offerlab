/**
 * 024. Two-Phase Commit
 * Level: Senior
 * Group: Transactions & Messaging
 *
 * Problem: One business action touches several services, each with its own database: take an
 *   item from inventory, charge the card, record the order. Either all of them must happen or
 *   none. If the card is declined after the item was already taken, the data is wrong.
 *
 * Approach: Prepare, then decide
 *   A coordinator first asks every participant to prepare: check it can do its part, lock what
 *   it needs, write "prepared" to disk and vote yes or no. Only if every vote is yes does the
 *   coordinator write "commit" to its own disk and tell everyone to commit; otherwise it tells
 *   everyone to abort. A participant that voted yes must wait for that decision.
 *
 * Cost: two round trips and several disk writes per transaction; locks held from prepare to
 *   decision; blocks if the coordinator dies after prepare.
 *
 * Pattern: atomic commitment
 * Key insight: A yes vote is a promise the participant can always keep, so after a yes the
 *   decision belongs to the coordinator alone. The single moment the coordinator writes its
 *   decision to disk is the moment the whole transaction commits.
 * Tradeoffs: You get all-or-nothing across services, but every participant holds its locks
 *   for two round trips, and if the coordinator dies between prepare and decision the
 *   participants are stuck holding them until it comes back. Throughput and availability
 *   both pay for atomicity.
 * Staff notes: The coordinator is a single point of failure for every transaction in flight;
 *   real deployments replicate its log (in Spanner each participant is a Paxos group and one
 *   of them coordinates). Presumed abort: a coordinator with no record of a transaction answers
 *   "abort", so real systems need not force abort decisions to disk (this model logs them anyway, for clarity). Watch for transactions stuck in prepared; they
 *   hold locks that block unrelated work. Across independently owned microservices, prefer a
 *   saga (025): no service should hold locks on behalf of another team's coordinator.
 * Interview signals: "atomic across databases", "all or nothing across services",
 *   "distributed transaction", "XA", "cross-shard transaction", "money must not be lost".
 * Real world: The X/Open XA standard, used by Java's JTA transaction managers; PostgreSQL's
 *   PREPARE TRANSACTION and COMMIT PREPARED; MySQL's XA transactions; Google Spanner uses
 *   two-phase commit across Paxos-replicated groups for transactions that span them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIENT, SimNode, simulate, type ClientOp, type Ctx, type Fault, type NodeId, type SimResult } from "../../kernel/sim.ts";

const VOTE_TIMEOUT = 15;
const ASK_EVERY = 10;

type Outcome = "commit" | "abort";
type Status = "idle" | "prepared" | "committed" | "aborted";

// @why One node runs the transaction: it asks for votes, makes the one decision, and tells everyone.
export class Coordinator extends SimNode {
  // @why On disk. The decision is the transaction's fate; forgetting it in a crash means answering differently afterwards.
  static durable = ["tx", "decision"];
  // @why The transaction in progress. On disk, so a restart knows a transaction began and still needs an ending.
  tx: string | null = null;
  // @why Kept only in memory: a vote is cheap to lose, because without every vote the answer is abort anyway.
  votes: Record<NodeId, boolean> = {};
  decision: Outcome | null = null;

  state() {
    return { tx: this.tx, votes: { ...this.votes }, decision: this.decision };
  }

  // @why A restart is where the log earns its keep: a logged decision is sent again; a transaction with none is aborted.
  onStart(ctx: Ctx) {
    if (this.decision) {
      ctx.say(`coordinator restarts, reads "${this.decision}" for ${this.tx} from its log, and sends it again`);
      this.announce(ctx);
    } else if (this.tx) {
      ctx.say(`coordinator restarts: ${this.tx} began but has no decision, and the votes were in memory, so it aborts`);
      this.decide(ctx, "abort");
    } else if (ctx.now > 0) {
      ctx.say("coordinator restarts and finds nothing in its log");
    }
  }

  onBegin(ctx: Ctx, body: { tx: string }) {
    // @why A repeated Begin must not start a second round of votes for the same transaction.
    if (this.tx) return;
    this.tx = body.tx;
    ctx.say(`coordinator starts ${body.tx} and asks inventory, payments and orders to prepare`);
    // @why Phase one: nobody does anything final yet. Everyone is only asked whether they can, and to promise.
    for (const peer of ctx.peers) ctx.send(peer, "Prepare", { tx: body.tx });
    // @why A participant that never answers must not hold the others up forever. Before deciding, abort is always safe.
    ctx.setTimer("VoteTimeout", VOTE_TIMEOUT);
  }

  onVote(ctx: Ctx, body: { tx: string; yes: boolean }, from: NodeId) {
    // @why Late votes, and votes after the decision, change nothing: the decision is final.
    if (body.tx !== this.tx || this.decision) return;
    this.votes[from] = body.yes;
    // @why One no is enough: that participant can't do its part, so nobody may do theirs.
    if (!body.yes) {
      ctx.say(`${from} votes no, so ${this.tx} must abort`);
      return this.decide(ctx, "abort");
    }
    // @why Commit only when every participant has promised. Silence is not a yes.
    if (ctx.peers.every((p) => this.votes[p] === true)) {
      ctx.say(`every participant voted yes, so ${this.tx} commits`);
      this.decide(ctx, "commit");
    }
  }

  onVoteTimeout(ctx: Ctx) {
    if (this.decision) return;
    ctx.say(`not every vote came back in time, so the coordinator aborts ${this.tx}`);
    this.decide(ctx, "abort");
  }

  // @why A prepared participant asks "what happened?". Only the coordinator can answer, because only it saw every vote.
  onStatus(ctx: Ctx, body: { tx: string }, from: NodeId) {
    if (body.tx === this.tx && this.decision) return this.send(ctx, from, body.tx, this.decision);
    // @why Still counting votes: there is no answer yet, and guessing would be wrong.
    if (body.tx === this.tx) return;
    // @why No record at all means no commit was ever logged, so abort is the only answer that can be true (presumed abort).
    ctx.say(`coordinator has no record of ${body.tx}, so it presumes abort`);
    this.send(ctx, from, body.tx, "abort");
  }

  protected decide(ctx: Ctx, outcome: Outcome) {
    // @why Phase two starts here. Writing the decision to disk before telling anyone is the instant the transaction commits or aborts.
    this.decision = outcome;
    ctx.cancelTimer("VoteTimeout");
    ctx.say(`coordinator writes "${outcome}" for ${this.tx} to its log on disk, then tells everyone`);
    this.announce(ctx);
    ctx.send(CLIENT, "Outcome", { tx: this.tx, outcome });
  }

  protected announce(ctx: Ctx) {
    for (const peer of ctx.peers) this.send(ctx, peer, this.tx!, this.decision!);
  }

  private send(ctx: Ctx, to: NodeId, tx: string, outcome: Outcome) {
    ctx.send(to, outcome === "commit" ? "Commit" : "Abort", { tx });
  }
}

// @why Each service runs this: inventory, payments and orders each own one thing the transaction needs.
export class Participant extends SimNode {
  // @why On disk. A participant that voted yes must still remember its promise, and its lock, after a restart.
  static durable = ["tx", "status", "lockedBy", "available"];
  tx: string | null = null;
  status: Status = "idle";
  // @why The transaction holding this participant's unit. While it is set, nobody else may take the unit.
  lockedBy: string | null = null;
  // @why Units this service can give: items in stock, money on the card, free order slots. Zero means it must vote no.
  available: number;

  constructor(available = 1) {
    super();
    this.available = available;
  }

  state() {
    return { status: this.status, lockedBy: this.lockedBy, available: this.available };
  }

  // @why After a restart, a prepared participant is still bound by its promise, so it goes back to asking for the decision.
  onStart(ctx: Ctx) {
    if (this.status === "prepared") ctx.setTimer("AskCoordinator", ASK_EVERY);
  }

  onPrepare(ctx: Ctx, body: { tx: string }, from: NodeId) {
    // @why A repeated Prepare gets the same vote again: a promise is not made twice.
    if (body.tx === this.tx && this.status !== "idle") return ctx.send(from, "Vote", { tx: body.tx, yes: this.status !== "aborted" });
    this.tx = body.tx;
    if (this.available < 1) {
      // @why A participant that votes no knows the outcome already: abort. It may roll back on its own.
      this.status = "aborted";
      ctx.say(`${ctx.id} can't do its part of ${body.tx}, so it votes no and rolls back`);
      return ctx.send(from, "Vote", { tx: body.tx, yes: false });
    }
    // @why The lock is what makes yes a promise it can keep: nothing else can take the unit before the decision.
    this.lockedBy = body.tx;
    this.status = "prepared";
    ctx.say(`${ctx.id} locks its unit, writes "prepared" to disk and votes yes`);
    ctx.send(from, "Vote", { tx: body.tx, yes: true });
    ctx.setTimer("AskCoordinator", ASK_EVERY);
  }

  // @why Having voted yes, it can't decide alone: the others might have voted no, or the coordinator might have logged commit.
  onAskCoordinator(ctx: Ctx) {
    if (this.status !== "prepared") return;
    ctx.say(`${ctx.id} is still prepared for ${this.tx}, holds its lock, and asks the coordinator what was decided`);
    ctx.send("coordinator", "Status", { tx: this.tx });
    ctx.setTimer("AskCoordinator", ASK_EVERY);
  }

  onCommit(ctx: Ctx, body: { tx: string }) {
    // @why Commit can arrive twice (resent after a restart); doing the work twice would take two units.
    if (body.tx !== this.tx || this.status !== "prepared") return;
    ctx.say(`${ctx.id} commits ${body.tx} and releases its lock`);
    this.finish(ctx, "committed");
  }

  onAbort(ctx: Ctx, body: { tx: string }) {
    if (body.tx !== this.tx || this.status === "committed" || this.status === "aborted") return;
    ctx.say(`${ctx.id} rolls back ${body.tx} and releases its lock`);
    this.finish(ctx, "aborted");
  }

  // @why Another order wants the same unit. While a transaction holds the lock, the answer is "busy", however long that takes.
  onTake(ctx: Ctx, _body: unknown, from: NodeId) {
    if (this.lockedBy) {
      ctx.say(`another order wants ${ctx.id}'s unit, but ${this.lockedBy} holds the lock: busy`);
      return ctx.send(from, "Busy", { lockedBy: this.lockedBy });
    }
    if (this.available < 1) return ctx.send(from, "SoldOut", {});
    this.available--;
    ctx.say(`another order takes ${ctx.id}'s unit`);
    ctx.send(from, "Taken", {});
  }

  protected finish(ctx: Ctx, status: "committed" | "aborted") {
    // @why Committing is when the unit is really used; aborting just hands it back by releasing the lock.
    if (status === "committed") this.available--;
    this.status = status;
    this.lockedBy = null;
    ctx.cancelTimer("AskCoordinator");
  }
}

// @why Atomicity, checked after every event: no transaction committed at one participant and aborted at another, and no unit given away twice.
export function allOrNothing(nodes: Record<NodeId, SimNode>): string | null {
  const parts = Object.entries(nodes).filter(([, n]) => n instanceof Participant) as [NodeId, Participant][];
  for (const [id, p] of parts) if (p.available < 0) return `${id} has ${p.available} units: it gave away a unit it had promised`;
  const committed = parts.filter(([, p]) => p.status === "committed").map(([id]) => id);
  const aborted = parts.filter(([, p]) => p.status === "aborted").map(([id]) => id);
  if (committed.length && aborted.length) {
    const tx = parts.find(([, p]) => p.tx)?.[1].tx;
    return `${tx} is committed at ${committed.join(", ")} but aborted at ${aborted.join(", ")}: atomicity is lost`;
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: skips the vote and tells everyone to commit straight away.
class SendCommitOnly extends Coordinator {
  onBegin(ctx: Ctx, body: { tx: string }) {
    this.tx = body.tx;
    this.decision = "commit";
    ctx.say(`coordinator skips the vote and tells everyone to commit ${body.tx}`);
    this.announce(ctx);
    ctx.send(CLIENT, "Outcome", { tx: body.tx, outcome: "commit" });
  }
}

// Broken on purpose: does its part when told to commit, without ever having promised it could.
class CommitWithoutPrepare extends Participant {
  onCommit(ctx: Ctx, body: { tx: string }) {
    if (this.status !== "idle") return;
    this.tx = body.tx;
    if (this.available < 1) {
      this.status = "aborted";
      return ctx.say(`${ctx.id} is told to commit but can't do its part, and the others have already done theirs`);
    }
    ctx.say(`${ctx.id} is told to commit and does its part`);
    this.finish(ctx, "committed");
  }
}

// Broken on purpose: votes yes without locking anything.
class NoLock extends Participant {
  onPrepare(ctx: Ctx, body: { tx: string }, from: NodeId) {
    this.tx = body.tx;
    this.status = "prepared";
    ctx.say(`${ctx.id} has a unit, so it votes yes, but locks nothing`);
    ctx.send(from, "Vote", { tx: body.tx, yes: true });
  }
}

// Broken on purpose: keeps its decision only in memory, so a restart forgets it.
class ForgetfulCoordinator extends Coordinator {
  static durable: string[] = [];
}

// Broken on purpose: after two unanswered questions, it stops waiting and commits on its own.
class Impatient extends Participant {
  asked = 0;
  onAskCoordinator(ctx: Ctx) {
    if (this.status !== "prepared") return;
    if (this.asked >= 2) {
      ctx.say(`${ctx.id} has waited long enough: it voted yes, so it guesses commit and commits on its own`);
      return this.finish(ctx, "committed");
    }
    this.asked++;
    super.onAskCoordinator(ctx);
  }
}

const PARTICIPANTS = ["inventory", "payments", "orders"] as const;
type Make = { coordinator?: () => Coordinator; participant?: (id: string, available: number) => Participant };
const cluster = (available: Partial<Record<string, number>> = {}, make: Make = {}) => ({
  coordinator: make.coordinator ?? (() => new Coordinator()),
  ...Object.fromEntries(
    PARTICIPANTS.map((id) => [id, () => (make.participant ?? ((_id: string, a: number) => new Participant(a)))(id, available[id] ?? 1)]),
  ),
});
const begin: ClientOp = { at: 1, to: "coordinator", type: "Begin", body: { tx: "T1" } };
const run = (nodes: ReturnType<typeof cluster>, until: number, faults: Fault[] = [], clients: ClientOp[] = []) =>
  simulate({ nodes, seed: 1, until, latency: [2, 2], faults, clients: [begin, ...clients], invariant: allOrNothing });
const statuses = (r: SimResult) => PARTICIPANTS.map((id) => (r.nodes[id] as Participant).status);
const violated = (r: SimResult, prefix: string) => r.run.steps.some((s) => s.violation?.startsWith(prefix));
const clean = (r: SimResult) => !r.run.steps.some((s) => s.violation);

test("commit: all vote yes and everyone commits", () => {
  const r = run(cluster(), 30);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(statuses(r), ["committed", "committed", "committed"]);
  for (const id of PARTICIPANTS) assert.equal((r.nodes[id] as Participant).lockedBy, null, id);
  assert.equal((r.nodes.coordinator as Coordinator).decision, "commit");
  assert.ok(r.inbox.some((m) => m.type === "Outcome" && (m.body as { outcome: Outcome }).outcome === "commit"));
  assert.ok(clean(r));
});

test("abort: one votes no and everyone rolls back", () => {
  const r = run(cluster({ payments: 0 }), 30);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(statuses(r), ["aborted", "aborted", "aborted"]);
  for (const id of PARTICIPANTS) assert.equal((r.nodes[id] as Participant).lockedBy, null, id);
  // Rolling back gives the reserved unit back: inventory still has its item.
  assert.equal((r.nodes.inventory as Participant).available, 1);
  assert.equal((r.nodes.coordinator as Coordinator).decision, "abort");
  assert.ok(clean(r));
});

test("blocked: the coordinator crashes after prepare; participants hold their locks and wait", () => {
  // Prepare reaches everyone at t=3; the coordinator dies at t=2, so the yes votes (t=5) are lost.
  // Another order for the same item at t=30 is turned away, because inventory's unit is locked.
  const r = run(cluster(), 60, [{ at: 2, kind: "crash", node: "coordinator" }], [{ at: 30, to: "inventory", type: "Take" }]);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(statuses(r), ["prepared", "prepared", "prepared"]);
  for (const id of PARTICIPANTS) assert.equal((r.nodes[id] as Participant).lockedBy, "T1", id);
  assert.ok(r.inbox.some((m) => m.type === "Busy" && m.from === "inventory"));
  assert.ok(clean(r));
});

test("recovery: the coordinator restarts, reads its log, and finishes the decision", () => {
  // The coordinator logs "commit" at t=5. The Commit to orders is lost and the coordinator dies
  // at t=6, so orders is stuck in prepared until the coordinator restarts at t=20 and resends.
  const r = run(cluster(), 40, [
    { at: 0, kind: "drop", from: "coordinator", to: "orders", type: "Commit", count: 1 },
    { at: 6, kind: "crash", node: "coordinator" },
    { at: 20, kind: "recover", node: "coordinator" },
  ]);
  assert.equal(r.run.error, undefined);
  const at15 = r.run.steps.filter((s) => s.t <= 15).at(-1)!;
  assert.equal(at15.nodes.orders.state.status, "prepared");
  assert.equal(at15.nodes.inventory.state.status, "committed");
  assert.deepEqual(statuses(r), ["committed", "committed", "committed"]);
  assert.ok(clean(r));
});

test("restart before deciding: no decision in the log, so the coordinator aborts", () => {
  const r = run(cluster(), 40, [
    { at: 2, kind: "crash", node: "coordinator" },
    { at: 20, kind: "recover", node: "coordinator" },
  ]);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(statuses(r), ["aborted", "aborted", "aborted"]);
  for (const id of PARTICIPANTS) assert.equal((r.nodes[id] as Participant).lockedBy, null, id);
  assert.ok(clean(r));
});

test("broken: no prepare — the coordinator just says commit, and payments can't", () => {
  const r = run(cluster({ payments: 0 }, { coordinator: () => new SendCommitOnly(), participant: (_id, a) => new CommitWithoutPrepare(a) }), 30);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(statuses(r), ["committed", "aborted", "committed"]);
  // The client was told the order went through.
  assert.ok(r.inbox.some((m) => m.type === "Outcome" && (m.body as { outcome: Outcome }).outcome === "commit"));
  assert.ok(violated(r, "T1 is committed"));
});

test("broken: no locks — another order takes the last unit after inventory voted yes", () => {
  // inventory votes yes at t=3 but locks nothing. Another order takes the unit at t=4, and the
  // Commit at t=7 then takes it a second time.
  const r = run(
    cluster({}, { participant: (id, a) => (id === "inventory" ? new NoLock(a) : new Participant(a)) }),
    30,
    [],
    [{ at: 4, to: "inventory", type: "Take" }],
  );
  assert.equal(r.run.error, undefined);
  assert.ok(r.inbox.some((m) => m.type === "Taken" && m.from === "inventory"));
  assert.equal((r.nodes.inventory as Participant).available, -1);
  assert.ok(violated(r, "inventory has -1"));
});

test("broken: decision not on disk — the restarted coordinator says abort after others committed", () => {
  // Same faults as "recovery", but the restarted coordinator has no record of T1. When orders
  // asks, it presumes abort, while inventory and payments have already committed.
  const r = run(cluster({}, { coordinator: () => new ForgetfulCoordinator() }), 40, [
    { at: 0, kind: "drop", from: "coordinator", to: "orders", type: "Commit", count: 1 },
    { at: 6, kind: "crash", node: "coordinator" },
    { at: 20, kind: "recover", node: "coordinator" },
  ]);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(statuses(r), ["committed", "committed", "aborted"]);
  assert.ok(violated(r, "T1 is committed"));
});

test("broken: a participant gives up waiting and commits on its own — atomicity is lost", () => {
  // payments votes no, so the coordinator decides abort at t=5. The Abort to inventory is lost
  // and the coordinator dies at t=6. inventory voted yes, waits, gives up, and commits.
  const r = run(cluster({ payments: 0 }, { participant: (id, a) => (id === "inventory" ? new Impatient(a) : new Participant(a)) }), 40, [
    { at: 0, kind: "drop", from: "coordinator", to: "inventory", type: "Abort", count: 1 },
    { at: 6, kind: "crash", node: "coordinator" },
  ]);
  assert.equal(r.run.error, undefined);
  assert.deepEqual(statuses(r), ["committed", "aborted", "aborted"]);
  assert.ok(violated(r, "T1 is committed"));
});
