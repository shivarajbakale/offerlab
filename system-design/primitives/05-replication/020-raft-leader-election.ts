/**
 * 020. Raft Leader Election
 * Level: Staff
 * Group: Replication
 *
 * Problem: A replicated system needs exactly one node deciding the order of writes. If two
 *   nodes both act as leader at once (split brain), they accept conflicting writes. Nodes
 *   crash and networks split, so leadership has to be re-decided automatically.
 *
 * Approach: Terms and majority votes
 *   Time is divided into numbered terms. A follower that hears nothing from a leader for a
 *   randomized timeout becomes a candidate for the next term and asks everyone for a vote.
 *   Each node votes at most once per term, and remembers that vote across crashes, so at
 *   most one candidate can collect a majority. The leader sends heartbeats to stop new
 *   elections.
 *
 * Cost: one round trip to elect; O(n) heartbeat messages per interval; needs a majority up.
 *
 * Pattern: consensus
 * Key insight: Two majorities of the same cluster always share a node, and that node votes
 *   only once per term, so two leaders in one term is impossible. Randomized timeouts make
 *   repeated split votes unlikely.
 * Tradeoffs: A cluster of 2f+1 nodes survives f failures, but the minority side of a
 *   partition cannot elect anyone, so it stops taking writes (consistency over
 *   availability). The election timeout trades failover speed against false elections on a
 *   slow network.
 * Staff notes: This file leaves out the log check in votes (see 021), pre-vote, leadership
 *   transfer, snapshots and membership changes. A leader that was partitioned away still
 *   believes it leads until it hears a higher term, so it must not serve reads on its own
 *   authority; use read leases or a quorum read. Pre-vote stops a flapping node from forcing
 *   needless elections by bumping terms. Keep election timeouts well above p99 round-trip
 *   time and GC pauses.
 * Interview signals: "exactly one primary", "automatic failover", "leader election",
 *   "coordination service", "consistent configuration store", "no split brain".
 * Real world: etcd and Consul are built on Raft, and Kubernetes keeps cluster state in etcd.
 *   CockroachDB and TiKV run one Raft group per data range. Kafka's KRaft mode replaced
 *   ZooKeeper with a Raft-based controller quorum.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type Ctx, type Fault, type NodeId, type SimResult } from "../../kernel/sim.ts";

const HEARTBEAT = 5;
const ELECTION_MIN = 15;
const ELECTION_SPREAD = 15;

type Role = "follower" | "candidate" | "leader";

// @why Every node runs this same code; its role decides which messages it acts on right now.
export class RaftNode extends SimNode {
  // @why Kept on disk. If a restart forgot the vote, the node could vote twice in one term and two candidates could both win.
  static durable = ["currentTerm", "votedFor"];
  // @why The newest term this node knows of. A bigger term in any message tells it that it is out of date.
  currentTerm = 0;
  // @why Who this node voted for in the current term; one vote per term is what makes a majority unique.
  votedFor: NodeId | null = null;
  role: Role = "follower";
  // @why Candidate only: who has voted for it so far, so it knows when it has a majority.
  votes: NodeId[] = [];
  // @why Who this node believes leads; only for display and for pointing clients at the leader.
  leader: NodeId | null = null;
  firstTimeout: number | null;

  constructor(firstTimeout: number | null = null) {
    super();
    // @why Lets a scenario pick who times out first, so the story plays out the same way every run.
    this.firstTimeout = firstTimeout;
  }

  state() {
    return { role: this.role, term: this.currentTerm, votedFor: this.votedFor, votes: [...this.votes], leader: this.leader };
  }

  // @why Without a running timer a follower would wait forever for a leader that may never exist.
  onStart(ctx: Ctx) {
    this.resetElectionTimer(ctx, ctx.now === 0 ? this.firstTimeout : null);
  }

  // @why Silence for a whole timeout is the only sign of a dead leader: there is no shared clock and no failure detector.
  onElectionTimeout(ctx: Ctx) {
    // @why A fresh term, so this election can never be confused with an earlier one.
    this.currentTerm++;
    this.role = "candidate";
    // @why A candidate counts toward its own majority.
    this.votedFor = ctx.id;
    this.votes = [ctx.id];
    this.leader = null;
    ctx.say(`${ctx.id} heard no leader, so it runs for term ${this.currentTerm} and votes for itself`);
    for (const peer of ctx.peers) ctx.send(peer, "RequestVote", { term: this.currentTerm });
    // @why If this election splits, the timer fires again and starts the next one.
    this.resetElectionTimer(ctx);
  }

  onRequestVote(ctx: Ctx, body: { term: number }, from: NodeId) {
    // @why A bigger term means a newer election is under way; catch up before deciding how to vote.
    if (body.term > this.currentTerm) this.stepDown(ctx, body.term);
    // @why One vote per term: only for the current term, and only if this node has not already voted for someone else.
    const granted = body.term === this.currentTerm && (this.votedFor === null || this.votedFor === from);
    if (granted) {
      this.votedFor = from;
      // @why A node that just voted should not immediately start a competing election of its own.
      this.resetElectionTimer(ctx);
    }
    ctx.say(
      granted
        ? `${ctx.id} votes for ${from} in term ${body.term}`
        : `${ctx.id} refuses ${from}: ${body.term < this.currentTerm ? "its term is stale" : `already voted for ${this.votedFor}`}`,
    );
    ctx.send(from, "Vote", { term: this.currentTerm, granted });
  }

  onVote(ctx: Ctx, body: { term: number; granted: boolean }, from: NodeId) {
    // @why A bigger term in the reply means this candidacy is already out of date.
    if (body.term > this.currentTerm) return this.stepDown(ctx, body.term);
    // @why Ignore refusals, late votes, and votes from an older election.
    if (this.role !== "candidate" || body.term !== this.currentTerm || !body.granted) return;
    if (!this.votes.includes(from)) this.votes.push(from);
    // @why More than half the whole cluster. Any two such groups share a node, and that node voted only once.
    if (this.votes.length * 2 > ctx.peers.length + 1) {
      ctx.say(`${ctx.id} has votes from ${this.votes.join(", ")}, a majority, so it leads term ${this.currentTerm}`);
      this.becomeLeader(ctx);
    }
  }

  // @why While heartbeats keep arriving, followers keep resetting their timers and nobody starts an election.
  onHeartbeat(ctx: Ctx) {
    for (const peer of ctx.peers) ctx.send(peer, "AppendEntries", { term: this.currentTerm });
    ctx.setTimer("Heartbeat", HEARTBEAT);
  }

  onAppendEntries(ctx: Ctx, body: { term: number }, from: NodeId) {
    // @why A message from an older term comes from a replaced leader; answering with the newer term makes it step down.
    if (body.term < this.currentTerm) return ctx.send(from, "AppendReply", { term: this.currentTerm });
    // @why Two leaders in one term can only happen if safety is already broken; this one keeps leading so the failure stays visible.
    if (body.term === this.currentTerm && this.role === "leader") return;
    // @why A leader for this term exists, so a candidate in the same term gives up and follows it.
    if (body.term > this.currentTerm || this.role === "candidate") this.stepDown(ctx, body.term);
    this.leader = from;
    this.resetElectionTimer(ctx);
  }

  // @why This is how a leader that was cut off learns it has been replaced: someone answers with a bigger term.
  onAppendReply(ctx: Ctx, body: { term: number }) {
    if (body.term > this.currentTerm) this.stepDown(ctx, body.term);
  }

  protected becomeLeader(ctx: Ctx) {
    this.role = "leader";
    this.leader = ctx.id;
    // @why A leader's own election timer would make it start an election against itself.
    ctx.cancelTimer("ElectionTimeout");
    // @why Announce at once, so the other candidates stop their elections.
    this.onHeartbeat(ctx);
  }

  // @why Someone newer exists: adopt their term, forget this term's vote and old leader, and follow.
  private stepDown(ctx: Ctx, term: number) {
    const wasFollower = this.role === "follower";
    const newer = term > this.currentTerm;
    if (term > this.currentTerm) {
      this.currentTerm = term;
      this.votedFor = null;
      this.leader = null;
    }
    this.role = "follower";
    this.votes = [];
    ctx.cancelTimer("Heartbeat");
    if (!wasFollower) {
      ctx.say(newer ? `${ctx.id} sees newer term ${term} and steps down to follower` : `${ctx.id} finds term ${term} already has a leader and follows it`);
      this.resetElectionTimer(ctx);
    }
  }

  // @why Random timeouts make it unlikely that two nodes wake up together; identical ones would split every vote forever.
  protected resetElectionTimer(ctx: Ctx, after: number | null = null) {
    ctx.setTimer("ElectionTimeout", after ?? ELECTION_MIN + Math.floor(ctx.rand() * ELECTION_SPREAD));
  }
}

// @why Election safety, checked after every event: never more than one leader in the same term.
export function oneLeaderPerTerm(nodes: Record<NodeId, SimNode>): string | null {
  const seen = new Map<number, NodeId>();
  for (const [id, node] of Object.entries(nodes)) {
    const n = node as RaftNode;
    if (n.role !== "leader") continue;
    const other = seen.get(n.currentTerm);
    if (other) return `two leaders in term ${n.currentTerm}: ${other} and ${id}`;
    seen.set(n.currentTerm, id);
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: declares itself leader the moment its timer fires, without asking for votes.
class LeaderOnTimeout extends RaftNode {
  onElectionTimeout(ctx: Ctx) {
    this.currentTerm++;
    this.votedFor = ctx.id;
    ctx.say(`${ctx.id} heard no leader and simply declares itself leader of term ${this.currentTerm}`);
    this.becomeLeader(ctx);
  }
}

// Broken on purpose: keeps nothing on disk, so a restart forgets the vote it gave this term.
class ForgetfulNode extends RaftNode {
  static durable: string[] = [];
}

// Broken on purpose: never starts a new term, so a vote, once given, can never be given again.
class NoNewTerms extends RaftNode {
  onElectionTimeout(ctx: Ctx) {
    if (this.currentTerm === 0) return super.onElectionTimeout(ctx);
    this.role = "candidate";
    this.votes = [ctx.id];
    ctx.say(`${ctx.id} heard no leader and asks for votes again, still in term ${this.currentTerm}`);
    for (const peer of ctx.peers) ctx.send(peer, "RequestVote", { term: this.currentTerm });
    this.resetElectionTimer(ctx);
  }
}

// Broken on purpose: the leader never sends heartbeats.
class NoHeartbeats extends RaftNode {
  onHeartbeat(_ctx: Ctx) {}
}

// Broken on purpose: every node waits exactly the same time before starting an election.
class FixedTimeoutNode extends RaftNode {
  protected resetElectionTimer(ctx: Ctx) {
    ctx.setTimer("ElectionTimeout", ELECTION_MIN);
  }
}

const cluster = (size: number, first: Record<NodeId, number> = {}, make = (t: number | null) => new RaftNode(t)) =>
  Object.fromEntries(Array.from({ length: size }, (_, i) => `n${i + 1}`).map((id) => [id, () => make(first[id] ?? null)]));
const leadersUp = (r: SimResult) =>
  Object.entries(r.nodes)
    .filter(([id, n]) => r.up[id] && (n as RaftNode).role === "leader")
    .map(([id]) => id);
const twoLeadersInTerm1 = (r: SimResult) => r.run.steps.some((s) => s.violation?.startsWith("two leaders in term 1"));

test("calm start: the first node to time out wins the election", () => {
  const r = simulate({ nodes: cluster(5, { n1: 5 }), seed: 1, until: 100, invariant: oneLeaderPerTerm });
  assert.deepEqual(leadersUp(r), ["n1"]);
  for (const n of Object.values(r.nodes)) {
    assert.equal((n as RaftNode).leader, "n1");
    assert.equal((n as RaftNode).currentTerm, 1);
  }
});

test("leader crashes: the others elect a new leader in a higher term", () => {
  const r = simulate({
    nodes: cluster(5, { n1: 5 }),
    seed: 2,
    until: 150,
    faults: [{ at: 40, kind: "crash", node: "n1" }],
    invariant: oneLeaderPerTerm,
  });
  const leaders = leadersUp(r);
  assert.equal(leaders.length, 1);
  assert.notEqual(leaders[0], "n1");
  assert.ok((r.nodes[leaders[0]] as RaftNode).currentTerm >= 2);
  // A follower that moves to a newer term forgets the old leader instead of still showing it.
  const firstNewTerm = r.run.steps.find(
    (s) => s.kind === "deliver" && s.msg?.type === "RequestVote" && (s.msg.body as { term: number }).term === 2,
  )!;
  assert.equal(firstNewTerm.nodes[firstNewTerm.node!].state.leader, null);
});

test("split vote: nobody wins term 1, and randomized timeouts settle it later", () => {
  // n1 and n2 both run at t=5. Losing one RequestVote each splits n3 and n4 between them 2-2.
  const faults: Fault[] = [
    { at: 0, kind: "drop", from: "n1", to: "n4", type: "RequestVote", count: 1 },
    { at: 0, kind: "drop", from: "n2", to: "n3", type: "RequestVote", count: 1 },
  ];
  const r = simulate({
    nodes: cluster(4, { n1: 5, n2: 5 }),
    seed: 3,
    until: 200,
    latency: [2, 2],
    faults,
    invariant: oneLeaderPerTerm,
  });
  const leaderTerms = r.run.steps.flatMap((s) =>
    Object.values(s.nodes)
      .filter((v) => v.state.role === "leader")
      .map((v) => v.state.term),
  );
  assert.ok(!leaderTerms.includes(1));
  assert.equal(leadersUp(r).length, 1);
});

test("partition: the majority elects a new leader; the old one is stale until the network heals", () => {
  const r = simulate({
    nodes: cluster(5, { n1: 5 }),
    seed: 4,
    until: 220,
    faults: [
      { at: 40, kind: "partition", groups: [["n1", "n2"], ["n3", "n4", "n5"]] },
      { at: 160, kind: "heal" },
    ],
    invariant: oneLeaderPerTerm,
  });
  const during = r.run.steps.filter((s) => s.t > 100 && s.t < 160);
  assert.ok(during.some((s) => s.nodes.n1.state.role === "leader" && s.nodes.n1.state.term === 1));
  assert.ok(
    during.some((s) =>
      ["n3", "n4", "n5"].some((id) => s.nodes[id].state.role === "leader" && (s.nodes[id].state.term as number) > 1),
    ),
  );
  const leaders = leadersUp(r);
  assert.equal(leaders.length, 1);
  assert.notEqual(leaders[0], "n1");
  assert.equal((r.nodes.n1 as RaftNode).role, "follower");
});

test("broken: leader on timeout, no votes — two leaders in the same term", () => {
  const r = simulate({
    nodes: cluster(3, { n1: 5, n2: 5 }, (t) => new LeaderOnTimeout(t)),
    seed: 5,
    until: 40,
    latency: [2, 2],
    invariant: oneLeaderPerTerm,
  });
  assert.ok(twoLeadersInTerm1(r));
  // Split brain does not heal itself: both still lead term 1 at the end.
  assert.equal(leadersUp(r).length, 2);
});

test("broken: votes not saved to disk — a restarted node votes twice and two leaders win term 1", () => {
  // n1 runs at t=4 and n3 at t=6. n2 votes for n1, restarts at t=7 having forgotten that vote,
  // then votes for n3 in the same term.
  const r = simulate({
    nodes: cluster(3, { n1: 4, n3: 6 }, (t) => new ForgetfulNode(t)),
    seed: 6,
    until: 40,
    latency: [2, 2],
    faults: [
      { at: 7, kind: "crash", node: "n2" },
      { at: 7, kind: "recover", node: "n2" },
    ],
    invariant: oneLeaderPerTerm,
  });
  assert.ok(twoLeadersInTerm1(r));
  assert.equal(leadersUp(r).length, 2);
});

test("broken: fixed timeouts — every election splits and no leader is ever chosen", () => {
  const r = simulate({
    nodes: cluster(3, {}, () => new FixedTimeoutNode()),
    seed: 7,
    until: 120,
    latency: [2, 2],
    invariant: oneLeaderPerTerm,
  });
  assert.ok(!r.run.steps.some((s) => Object.values(s.nodes).some((v) => v.state.role === "leader")));
  assert.ok((r.nodes.n1 as RaftNode).currentTerm >= 5);
});

test("broken: no new terms — after the leader dies, nobody can ever be elected again", () => {
  // Everyone voted for n1 in term 1. With no new term to vote in, those votes are spent forever.
  const r = simulate({
    nodes: cluster(5, { n1: 5 }, (t) => new NoNewTerms(t)),
    seed: 8,
    until: 200,
    faults: [{ at: 40, kind: "crash", node: "n1" }],
    invariant: oneLeaderPerTerm,
  });
  assert.equal(r.run.error, undefined);
  assert.equal(leadersUp(r).length, 0);
  for (const n of Object.values(r.nodes)) assert.equal((n as RaftNode).currentTerm, 1);
});

test("broken: no heartbeats — followers keep deposing a healthy leader", () => {
  const r = simulate({
    nodes: cluster(5, { n1: 5 }, (t) => new NoHeartbeats(t)),
    seed: 9,
    until: 150,
    invariant: oneLeaderPerTerm,
  });
  assert.equal(r.run.error, undefined);
  const terms = new Set(r.run.steps.flatMap((s) => Object.values(s.nodes).filter((v) => v.state.role === "leader").map((v) => v.state.term)));
  assert.ok(terms.size >= 3, `only ${terms.size} leaders over the run`);
});
