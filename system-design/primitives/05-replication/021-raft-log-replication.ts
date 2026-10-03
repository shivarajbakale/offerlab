/**
 * 021. Raft Log Replication
 * Level: Staff
 * Group: Replication
 *
 * Problem: Several servers must apply the same writes in the same order, and a write the
 *   client was told is done must never be lost or changed, even when the leader crashes or
 *   is cut off and another node takes over.
 *
 * Approach: Majority-committed log with a consistency check
 *   The leader (elected as in 020) appends each client write to its log, tagged with its
 *   term, and sends it to every follower. Each AppendEntries names the entry just before the
 *   new ones (prevLogIndex, prevLogTerm). A follower accepts only if its own log has that
 *   entry, and then overwrites anything after it that disagrees. On a refusal the leader backs
 *   up one entry and tries again. An entry from the leader's own term is committed once a
 *   majority stores it; only then is the client told "done". Votes go only to a candidate
 *   whose log is at least as up to date as the voter's, so every new leader already holds
 *   every committed entry.
 *
 * Cost: one majority round trip per write; O(n) messages per write and per heartbeat;
 *   needs a majority up; a lagging follower may need one round trip per entry to back up.
 *
 * Pattern: consensus (replicated log)
 * Key insight: A committed entry is on a majority, and a winning candidate needs votes from a
 *   majority, so at least one voter holds the entry. That voter refuses any candidate whose
 *   log is behind its own, so whoever wins already has the entry and never overwrites it.
 * Tradeoffs: Every write waits for the fastest majority. With 2f followers, the leader needs f
 *   of them, so a write is never faster than the f-th fastest follower's round trip: the
 *   slowest member of the fastest majority. The minority side of a partition keeps a leader that cannot
 *   commit anything (consistency over availability). Backing up one entry per round trip is
 *   simple but slow for a follower that is far behind.
 * Staff notes: A leader commits only entries from its own term by counting replicas; older
 *   entries become committed indirectly once a current-term entry after them commits (the
 *   Raft paper's figure 8 shows why). Leaders therefore append a no-op entry when elected.
 *   Real systems also add snapshots (log compaction), batching and pipelining, faster backing
 *   up using the conflicting term, pre-vote, membership changes, and linearizable reads via
 *   a heartbeat round or a lease. Applying committed entries to a state machine is left out.
 * Interview signals: "strongly consistent replication", "no lost acknowledged writes",
 *   "replicated state machine", "consensus", "metadata store", "survive f of 2f+1 failures".
 * Real world: etcd and Consul replicate their key-value stores with Raft. CockroachDB and
 *   TiKV run one Raft group per range of data. Kafka's KRaft mode keeps cluster metadata in
 *   a Raft-based log.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type ClientOp, type Ctx, type NodeId, type SimResult } from "../../kernel/sim.ts";

const HEARTBEAT = 5;
const ELECTION_MIN = 15;
const ELECTION_SPREAD = 15;

type Role = "follower" | "candidate" | "leader";
// @why The term records which leader created the entry. Two logs whose entries at the same index have the same term agree on everything up to there.
type Entry = { term: number; cmd: string };
type AppendEntries = { term: number; prevLogIndex: number; prevLogTerm: number; entries: Entry[]; leaderCommit: number };
type AppendReply = { term: number; success: boolean; prevLogIndex: number; matchIndex: number };

const show = (log: Entry[]) => log.map((e) => `${e.term}:${e.cmd}`).join(" ");

// @why Every node runs this same code; its role decides which messages it acts on right now.
export class RaftNode extends SimNode {
  // @why On disk. Forgetting the vote allows two leaders in a term (020); forgetting the log would erase entries a majority was counted on to keep.
  static durable = ["currentTerm", "votedFor", "log"];
  // @why The newest term this node knows of. A bigger term in any message tells it that it is out of date.
  currentTerm = 0;
  // @why Who this node voted for in the current term; one vote per term is what makes a majority unique.
  votedFor: NodeId | null = null;
  role: Role = "follower";
  // @why Candidate only: who has voted for it so far, so it knows when it has a majority.
  votes: NodeId[] = [];
  // @why Who this node believes leads; for display and for telling a client where to go.
  leader: NodeId | null = null;
  // @why The ordered list of writes. Indexes start at 1, so log[i - 1] is entry #i.
  log: Entry[] = [];
  // @why The highest entry this node knows is committed. Not on disk: a restarted node relearns it from the leader.
  commitIndex = 0;
  // @why Leader only: the next entry to send each follower. It starts optimistic and backs up on every refusal.
  nextIndex: Record<NodeId, number> = {};
  // @why Leader only: the highest entry each follower is known to store, which is what the leader counts to commit.
  matchIndex: Record<NodeId, number> = {};
  // @why Leader only: which client to tell "done" for each entry, once it commits.
  waiting: Record<number, NodeId> = {};
  firstTimeout: number | null;

  constructor(firstTimeout: number | null = null) {
    super();
    // @why Lets a scenario pick who times out first, so the story plays out the same way every run.
    this.firstTimeout = firstTimeout;
  }

  state() {
    const leading = this.role === "leader";
    return {
      role: this.role,
      term: this.currentTerm,
      votedFor: this.votedFor,
      leader: this.leader,
      log: show(this.log),
      commitIndex: this.commitIndex,
      nextIndex: leading ? { ...this.nextIndex } : null,
      matchIndex: leading ? { ...this.matchIndex } : null,
    };
  }

  // @why Without a running timer a follower would wait forever for a leader that may never exist.
  onStart(ctx: Ctx) {
    this.resetElectionTimer(ctx, ctx.now === 0 ? this.firstTimeout : null);
  }

  // ---- election: as in 020, plus the log check in votes ----

  // @why Silence for a whole timeout is the only sign of a dead leader: there is no shared clock and no failure detector.
  onElectionTimeout(ctx: Ctx) {
    // @why A fresh term, so this election can never be confused with an earlier one.
    this.currentTerm++;
    this.role = "candidate";
    // @why A candidate counts toward its own majority.
    this.votedFor = ctx.id;
    this.votes = [ctx.id];
    this.leader = null;
    ctx.say(`${ctx.id} heard no leader, so it runs for term ${this.currentTerm} with log [${show(this.log)}]`);
    // @why Voters compare these against their own log; see logOk.
    const ask = { term: this.currentTerm, lastLogIndex: this.log.length, lastLogTerm: this.lastTerm() };
    for (const peer of ctx.peers) ctx.send(peer, "RequestVote", ask);
    // @why If this election splits, the timer fires again and starts the next one.
    this.resetElectionTimer(ctx);
  }

  onRequestVote(ctx: Ctx, body: { term: number; lastLogIndex: number; lastLogTerm: number }, from: NodeId) {
    // @why A bigger term means a newer election is under way; catch up before deciding how to vote.
    if (body.term > this.currentTerm) this.stepDown(ctx, body.term);
    // @why One vote per term: only for the current term, and only if this node has not already voted for someone else.
    const freeVote = body.term === this.currentTerm && (this.votedFor === null || this.votedFor === from);
    // @why A committed entry is on a majority, and the winner needs a majority of votes, so some voter has it. That voter's refusal keeps out any candidate missing it.
    const upToDate = this.logOk(body.lastLogIndex, body.lastLogTerm);
    const granted = freeVote && upToDate;
    if (granted) {
      this.votedFor = from;
      // @why A node that just voted should not immediately start a competing election of its own.
      this.resetElectionTimer(ctx);
    }
    ctx.say(
      granted
        ? `${ctx.id} votes for ${from} in term ${body.term}`
        : `${ctx.id} refuses ${from}: ${
            body.term < this.currentTerm
              ? "its term is stale"
              : !freeVote
                ? `already voted for ${this.votedFor}`
                : `its log (last entry #${body.lastLogIndex}, term ${body.lastLogTerm}) is behind mine (#${this.log.length}, term ${this.lastTerm()})`
          }`,
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

  // ---- log replication ----

  onWrite(ctx: Ctx, body: { cmd: string }, from: NodeId) {
    // @why Only the leader orders writes. A follower answering would create a second, competing order.
    if (this.role !== "leader") {
      ctx.say(`${ctx.id} is not the leader and turns ${body.cmd} away`);
      return ctx.send(from, "NotLeader", { leader: this.leader });
    }
    this.log.push({ term: this.currentTerm, cmd: body.cmd });
    this.waiting[this.log.length] = from;
    ctx.say(`${ctx.id} appends ${body.cmd} as #${this.log.length} in term ${this.currentTerm} and sends it to the followers`);
    this.replicate(ctx);
    this.advanceCommit(ctx);
  }

  // @why Each heartbeat also resends whatever a follower hasn't confirmed, so lost messages and restarted followers are repaired.
  onHeartbeat(ctx: Ctx) {
    this.replicate(ctx);
    ctx.setTimer("Heartbeat", HEARTBEAT);
  }

  protected replicate(ctx: Ctx) {
    for (const peer of ctx.peers) this.sendAppend(ctx, peer);
  }

  protected sendAppend(ctx: Ctx, peer: NodeId) {
    const prevLogIndex = this.nextIndex[peer] - 1;
    // @why The entry just before the new ones. The follower accepts only if it has this exact entry, which proves everything before it matches too.
    const msg: AppendEntries = {
      term: this.currentTerm,
      prevLogIndex,
      prevLogTerm: prevLogIndex > 0 ? this.log[prevLogIndex - 1].term : 0,
      entries: this.log.slice(prevLogIndex),
      leaderCommit: this.commitIndex,
    };
    ctx.send(peer, "AppendEntries", msg);
  }

  onAppendEntries(ctx: Ctx, body: AppendEntries, from: NodeId) {
    const reply = (success: boolean, matchIndex = 0) =>
      ctx.send(from, "AppendReply", { term: this.currentTerm, success, prevLogIndex: body.prevLogIndex, matchIndex } satisfies AppendReply);
    // @why A message from an older term comes from a replaced leader; answering with the newer term makes it step down.
    if (body.term < this.currentTerm) return reply(false);
    // @why Two leaders in one term can only happen if safety is already broken; this one keeps leading so the failure stays visible.
    if (body.term === this.currentTerm && this.role === "leader") return;
    // @why A leader for this term exists, so a candidate in the same term gives up and follows it.
    if (body.term > this.currentTerm || this.role === "candidate") this.stepDown(ctx, body.term);
    this.leader = from;
    this.resetElectionTimer(ctx);

    if (!this.matches(body.prevLogIndex, body.prevLogTerm)) {
      ctx.say(
        body.prevLogIndex > this.log.length
          ? `${ctx.id} refuses: it has no #${body.prevLogIndex} (its log ends at #${this.log.length})`
          : `${ctx.id} refuses: its #${body.prevLogIndex} is from term ${this.log[body.prevLogIndex - 1].term}, not ${body.prevLogTerm}`,
      );
      return reply(false);
    }
    const before = show(this.log);
    this.store(body.prevLogIndex, body.entries);
    const last = body.prevLogIndex + body.entries.length;
    // @why Only up to the last entry this message vouched for. Entries past it may be leftovers from an old leader that the leader hasn't overwritten yet.
    const commit = Math.min(body.leaderCommit, last);
    if (commit > this.commitIndex) this.commitIndex = commit;
    const now = show(this.log);
    if (now !== before) ctx.say(`${ctx.id} log [${before}] → [${now}], committed through #${this.commitIndex}`);
    reply(true, last);
  }

  onAppendReply(ctx: Ctx, body: AppendReply, from: NodeId) {
    // @why This is how a leader that was cut off learns it has been replaced: someone answers with a bigger term.
    if (body.term > this.currentTerm) return this.stepDown(ctx, body.term);
    // @why Ignore replies to an older term's messages, or ones that arrive after this node stopped leading.
    if (this.role !== "leader" || body.term !== this.currentTerm) return;
    if (body.success) {
      // @why Replies can arrive out of order; an older, smaller one must not move the leader backwards.
      this.matchIndex[from] = Math.max(this.matchIndex[from], body.matchIndex);
      this.nextIndex[from] = Math.max(this.nextIndex[from], body.matchIndex + 1);
      return this.advanceCommit(ctx);
    }
    // @why Only the refusal of the latest probe counts; repeated heartbeats would otherwise back up past the real match.
    if (body.prevLogIndex !== this.nextIndex[from] - 1 || this.nextIndex[from] <= 1) return;
    this.nextIndex[from]--;
    ctx.say(`${from} failed the check at #${body.prevLogIndex}, so ${ctx.id} backs up and checks #${this.nextIndex[from] - 1} next`);
    // @why Retry at once rather than waiting a heartbeat, so a far-behind follower is repaired in round trips, not heartbeats.
    this.sendAppend(ctx, from);
  }

  // @why Commit the highest entry that a majority stores, but only if it is from this term; older ones then commit along with it.
  protected advanceCommit(ctx: Ctx) {
    for (let n = this.log.length; n > this.commitIndex; n--) {
      if (this.log[n - 1].term !== this.currentTerm) break;
      const holders = [ctx.id, ...ctx.peers.filter((p) => this.matchIndex[p] >= n)];
      if (holders.length * 2 > ctx.peers.length + 1) {
        ctx.say(`${holders.join(", ")} store #${n}, a majority, so ${ctx.id} commits through #${n}`);
        this.commit(ctx, n);
        return;
      }
    }
  }

  // @why The client hears "done" only now, so every acknowledged write is on a majority.
  protected commit(ctx: Ctx, upTo: number) {
    for (let i = this.commitIndex + 1; i <= upTo; i++) {
      const client = this.waiting[i];
      if (client === undefined) continue;
      ctx.send(client, "WriteOk", { index: i, cmd: this.log[i - 1].cmd });
      delete this.waiting[i];
    }
    this.commitIndex = upTo;
  }

  // @why The voter's rule: the later last term wins, and with equal last terms the longer log wins.
  protected logOk(lastLogIndex: number, lastLogTerm: number) {
    return lastLogTerm > this.lastTerm() || (lastLogTerm === this.lastTerm() && lastLogIndex >= this.log.length);
  }

  // @why The consistency check: index 0 is the empty start every log shares.
  protected matches(prevLogIndex: number, prevLogTerm: number) {
    return prevLogIndex === 0 || (prevLogIndex <= this.log.length && this.log[prevLogIndex - 1].term === prevLogTerm);
  }

  // @why Keep entries that already agree (a late, repeated message must not cut newer ones), but cut everything from the first disagreement: it came from a leader that lost.
  protected store(prevLogIndex: number, entries: Entry[]) {
    entries.forEach((e, k) => {
      const i = prevLogIndex + k;
      if (i < this.log.length && this.log[i].term === e.term) return;
      this.log.length = i;
      this.log.push(e);
    });
  }

  protected becomeLeader(ctx: Ctx) {
    this.role = "leader";
    this.leader = ctx.id;
    // @why The leader doesn't know what followers hold, so it assumes they match it and backs up when told otherwise.
    for (const peer of ctx.peers) {
      this.nextIndex[peer] = this.log.length + 1;
      this.matchIndex[peer] = 0;
    }
    this.waiting = {};
    // @why A leader's own election timer would make it start an election against itself.
    ctx.cancelTimer("ElectionTimeout");
    // @why Announce at once, so the other candidates stop their elections.
    this.onHeartbeat(ctx);
  }

  // @why Index 0 has term 0: an empty log is behind any log with an entry.
  private lastTerm() {
    return this.log.at(-1)?.term ?? 0;
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
    // @why A deposed leader can't promise anything about its uncommitted entries; their clients never hear "done".
    this.waiting = {};
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

// @why Checked after every event across the whole run: once any node has committed entry #i, no node may ever hold a different committed #i.
export function committedNeverChange() {
  const committed: Entry[] = [];
  return (nodes: Record<NodeId, SimNode>): string | null => {
    for (const [id, node] of Object.entries(nodes)) {
      const n = node as RaftNode;
      for (let i = 0; i < n.commitIndex; i++) {
        const e = n.log[i];
        if (!e) return `${id} says #${i + 1} is committed but has no #${i + 1} in its log`;
        const first = committed[i];
        if (!first) committed[i] = { ...e };
        else if (first.term !== e.term || first.cmd !== e.cmd) {
          return `#${i + 1} was committed as ${first.cmd} (term ${first.term}) but ${id} has ${e.cmd} (term ${e.term}) committed there`;
        }
      }
    }
    return null;
  };
}

// --- helpers for the scenarios ---

// Broken on purpose: the leader counts a write as committed the moment it appends it, like 017's asynchronous leader.
class CommitAlone extends RaftNode {
  protected advanceCommit(ctx: Ctx) {
    if (this.role !== "leader" || this.log.length <= this.commitIndex) return;
    ctx.say(`${ctx.id} commits through #${this.log.length} on its own say-so and tells the client "done"`);
    this.commit(ctx, this.log.length);
  }
}

// Broken on purpose: votes for any candidate in a newer term, without comparing logs.
class VotesIgnoreLog extends RaftNode {
  protected logOk() {
    return true;
  }
}

// Broken on purpose: accepts every AppendEntries without checking the entry before the new ones; entries that don't fit go on the end of its log.
class NoConsistencyCheck extends RaftNode {
  onAppendEntries(ctx: Ctx, body: AppendEntries, from: NodeId) {
    if (body.term >= this.currentTerm && body.prevLogIndex > this.log.length) {
      ctx.say(`${ctx.id} has no #${body.prevLogIndex} but skips the check and tells ${from} it holds everything through #${body.prevLogIndex + body.entries.length}`);
    }
    super.onAppendEntries(ctx, body, from);
  }
  protected matches() {
    return true;
  }
  protected store(prevLogIndex: number, entries: Entry[]) {
    if (prevLogIndex <= this.log.length) super.store(prevLogIndex, entries);
    else this.log.push(...entries);
  }
}

const cluster = (size: number, first: Record<NodeId, number> = {}, make = (t: number | null) => new RaftNode(t)) =>
  Object.fromEntries(Array.from({ length: size }, (_, i) => `n${i + 1}`).map((id) => [id, () => make(first[id] ?? null)]));
const write = (at: number, to: NodeId, cmd: string): ClientOp => ({ at, to, type: "Write", body: { cmd } });
const logOf = (r: SimResult, id: NodeId) => (r.nodes[id] as RaftNode).log.map((e) => `${e.term}:${e.cmd}`);
const commitOf = (r: SimResult, id: NodeId) => (r.nodes[id] as RaftNode).commitIndex;
const acked = (r: SimResult) => r.inbox.filter((m) => m.type === "WriteOk").map((m) => (m.body as { cmd: string }).cmd);
const violation = (r: SimResult) => r.run.steps.find((s) => s.violation)?.violation;
const leaderAtEnd = (r: SimResult) =>
  Object.entries(r.nodes)
    .filter(([id, n]) => r.up[id] && (n as RaftNode).role === "leader")
    .map(([id]) => id);

const LEADER_CHANGE_SEED = 7;
const NEW_LEADER_3 = "n5";
const NEW_LEADER_4 = "n3";

test("commit: an entry is committed once a majority stores it", () => {
  // n3 is down for the whole story, so n1 and n2 (2 of 3) must be enough.
  const r = simulate({
    nodes: cluster(3, { n1: 5 }),
    seed: 1,
    until: 60,
    faults: [{ at: 15, kind: "crash", node: "n3" }],
    clients: [write(20, "n1", "x=1"), write(25, "n1", "y=2")],
    invariant: committedNeverChange(),
  });
  assert.equal(r.run.error, undefined);
  assert.equal(violation(r), undefined);
  assert.deepEqual(acked(r), ["x=1", "y=2"]);
  for (const id of ["n1", "n2"]) {
    assert.deepEqual(logOf(r, id), ["1:x=1", "1:y=2"], id);
    assert.equal(commitOf(r, id), 2, id);
  }
  assert.deepEqual(logOf(r, "n3"), []);
  // The leader commits only after a follower has the entry too, never at the moment it appends it.
  const firstCommit = r.run.steps.find((s) => (s.nodes.n1.state.commitIndex as number) >= 1)!;
  assert.ok(firstCommit.t > 20);
  assert.equal(firstCommit.nodes.n2.state.log, "1:x=1");
});

test("repair: a follower that missed entries is brought up to date by backing up", () => {
  // n5 is down while a, b and c are written. A new leader assumes n5 is in step with it, is
  // told no three times, and backs up one entry each time until the logs match.
  const r = simulate({
    nodes: cluster(5, { n1: 5 }),
    seed: 2,
    until: 140,
    faults: [
      { at: 12, kind: "crash", node: "n5" },
      { at: 30, kind: "crash", node: "n1" },
      { at: 70, kind: "recover", node: "n5" },
    ],
    clients: [write(15, "n1", "a=1"), write(16, "n1", "b=2"), write(17, "n1", "c=3")],
    invariant: committedNeverChange(),
  });
  assert.equal(r.run.error, undefined);
  assert.equal(violation(r), undefined);
  const [leader] = leaderAtEnd(r);
  assert.ok(["n2", "n3", "n4"].includes(leader));
  assert.deepEqual(logOf(r, "n5"), ["1:a=1", "1:b=2", "1:c=3"]);
  assert.equal(commitOf(r, "n5"), 3);
  const refusals = r.run.steps.filter(
    (s) => s.kind === "deliver" && s.msg?.type === "AppendReply" && s.msg.from === "n5" && !(s.msg.body as { success: boolean }).success,
  );
  // Refused at #3, #2 and #1; a heartbeat may repeat a probe, so count distinct ones.
  assert.deepEqual([...new Set(refusals.map((s) => (s.msg!.body as { prevLogIndex: number }).prevLogIndex))], [3, 2, 1]);
});

test("minority leader: writes to a cut-off leader never commit, and are replaced after heal", () => {
  const r = simulate({
    nodes: cluster(5, { n1: 5 }),
    seed: 3,
    until: 200,
    faults: [
      { at: 30, kind: "partition", groups: [["n1", "n2"], ["n3", "n4", "n5"]] },
      { at: 120, kind: "heal" },
    ],
    clients: [write(15, "n1", "a=1"), write(35, "n1", "b=2"), write(90, NEW_LEADER_3, "c=3")],
    invariant: committedNeverChange(),
  });
  assert.equal(r.run.error, undefined);
  assert.equal(violation(r), undefined);
  assert.deepEqual(acked(r), ["a=1", "c=3"]);
  const cut = r.run.steps.filter((s) => s.t > 40 && s.t < 120);
  assert.ok(cut.some((s) => s.nodes.n2.state.log === "1:a=1 1:b=2" && s.nodes.n1.state.commitIndex === 1));
  const term = (r.nodes[NEW_LEADER_3] as RaftNode).currentTerm;
  for (const id of ["n1", "n2", "n3", "n4", "n5"]) {
    assert.deepEqual(logOf(r, id), ["1:a=1", `${term}:c=3`], id);
    assert.equal(commitOf(r, id), 2, id);
  }
  assert.equal((r.nodes.n1 as RaftNode).role, "follower");
});

const LEADER_CHANGE_FAULTS = [
  { at: 12, kind: "crash", node: "n3" },
  { at: 25, kind: "crash", node: "n1" },
  { at: 25, kind: "recover", node: "n3" },
] as const;

test("leader change: committed entries survive the old leader's crash", () => {
  // x=1 is committed on n1 and n2 while n3 is down. n1 dies, n3 comes back and runs first,
  // but n2 refuses it because n3's log lacks x=1. n2 is elected instead and x=1 survives.
  const r = simulate({
    nodes: cluster(3, { n1: 5 }),
    seed: LEADER_CHANGE_SEED,
    until: 120,
    faults: [...LEADER_CHANGE_FAULTS],
    clients: [write(15, "n1", "x=1"), write(80, "n2", "y=2")],
    invariant: committedNeverChange(),
  });
  assert.equal(r.run.error, undefined);
  assert.equal(violation(r), undefined);
  const refused = r.run.steps.some(
    (s) => s.kind === "deliver" && s.msg?.type === "Vote" && s.msg.from === "n2" && s.msg.to === "n3" && !(s.msg.body as { granted: boolean }).granted,
  );
  assert.ok(refused);
  assert.deepEqual(leaderAtEnd(r), ["n2"]);
  assert.deepEqual(acked(r), ["x=1", "y=2"]);
  for (const id of ["n2", "n3"]) {
    assert.equal(logOf(r, id)[0], "1:x=1", id);
    assert.equal(commitOf(r, id), 2, id);
  }
});

test("broken: commit on the leader alone — a committed write is lost after failover", () => {
  const r = simulate({
    nodes: cluster(3, { n1: 5 }, (t) => new CommitAlone(t)),
    seed: 4,
    until: 130,
    faults: [
      { at: 18, kind: "partition", groups: [["n1"], ["n2", "n3"]] },
      { at: 100, kind: "heal" },
    ],
    clients: [write(20, "n1", "x=1"), write(70, NEW_LEADER_4, "y=2")],
    invariant: committedNeverChange(),
  });
  assert.equal(r.run.error, undefined);
  assert.ok(acked(r).includes("x=1"));
  assert.match(violation(r) ?? "", /^#1 was committed as x=1/);
  for (const id of ["n1", "n2", "n3"]) assert.ok(!logOf(r, id).includes("1:x=1"), id);
});

test("broken: votes ignore the log — a stale node is elected and erases committed entries", () => {
  const r = simulate({
    nodes: cluster(3, { n1: 5 }, (t) => new VotesIgnoreLog(t)),
    seed: LEADER_CHANGE_SEED,
    until: 120,
    faults: [...LEADER_CHANGE_FAULTS],
    clients: [write(15, "n1", "x=1"), write(80, "n3", "y=2")],
    invariant: committedNeverChange(),
  });
  assert.equal(r.run.error, undefined);
  assert.deepEqual(leaderAtEnd(r), ["n3"]);
  assert.ok(acked(r).includes("x=1"));
  assert.match(violation(r) ?? "", /^#1 was committed as x=1/);
  for (const id of ["n2", "n3"]) assert.ok(!logOf(r, id).includes("1:x=1"), id);
});

test("broken: no consistency check — a follower that missed entries is told it is in step", () => {
  const r = simulate({
    nodes: cluster(5, { n1: 5 }, (t) => new NoConsistencyCheck(t)),
    seed: 2,
    until: 140,
    faults: [
      { at: 12, kind: "crash", node: "n5" },
      { at: 30, kind: "crash", node: "n1" },
      { at: 70, kind: "recover", node: "n5" },
    ],
    clients: [write(15, "n1", "a=1"), write(16, "n1", "b=2"), write(17, "n1", "c=3")],
    invariant: committedNeverChange(),
  });
  assert.equal(r.run.error, undefined);
  assert.deepEqual(logOf(r, "n5"), []);
  assert.match(violation(r) ?? "", /^n5 says #1 is committed/);
});
