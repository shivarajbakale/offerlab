/**
 * 018. Quorum Reads and Writes
 * Level: Senior
 * Group: Replication
 *
 * Problem: Keep N copies of the data so that losing a server loses neither data nor
 *   availability. Waiting for every copy on each write stalls as soon as one copy is down,
 *   but reading a single copy can miss a write that skipped it.
 *
 * Approach: Overlapping quorums with versions
 *   A coordinator stamps each write with the next version number and sends it to all N
 *   replicas, but tells the client "done" after only W of them confirm. A read asks all N and
 *   answers after R reply, choosing the reply with the highest version. With R + W > N, the
 *   R replicas that answer always include at least one of the W that stored the latest
 *   acknowledged write. Any replica that answered with an older version is sent the newest
 *   value (read repair).
 *
 * Cost: one round trip per read or write; N messages out and up to N back for each; latency
 *   set by the W-th (or R-th) fastest replica, so with W, R < N one slow replica slows nothing.
 *
 * Pattern: replication
 * Key insight: Any W replicas and any R replicas out of N must share at least one replica
 *   when R + W > N, so a read always hears from someone who has the latest acknowledged write.
 *   The version number tells the coordinator which reply that is.
 * Tradeoffs: W and R tune the balance. W=N, R=1 makes reads cheap but stops all writes when
 *   one replica is down. W=1, R=1 is fast and always available but reads can miss acknowledged
 *   writes. W=2, R=2 with N=3 survives one down replica for both reads and writes and still
 *   overlaps. A write that fails (fewer than W acks) may still be stored on some replicas.
 * Staff notes: A single coordinator counter is a simplification. Real Dynamo-style stores take
 *   versions from client or server timestamps (last write wins, which trusts clocks) or from
 *   vector clocks (see 019). R + W > N alone is not linearizability: concurrent writes,
 *   partially applied failed writes and sloppy quorums all break it. Sloppy quorum lets a
 *   write land on stand-in nodes when the home replicas are unreachable, and hinted handoff
 *   forwards it home later; that keeps writes available but weakens the overlap guarantee.
 *   Read repair only fixes keys that are read, so a background anti-entropy process is
 *   still needed for cold data.
 * Interview signals: "tunable consistency", "leaderless replication", "always writable",
 *   "multi-datacenter", "survive a replica failure without failover", "N, R, W".
 * Real world: Amazon's Dynamo paper (2007) describes N, R and W, sloppy quorums, hinted
 *   handoff and read repair. Apache Cassandra exposes per-request consistency levels such as
 *   ONE, QUORUM and ALL. Riak lets clients set n_val, r and w.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type ClientOp, type Ctx, type Fault, type NodeId, type SimResult } from "../../kernel/sim.ts";

const N = 3;
// @why How long the coordinator waits for W acks or R replies before telling the client it failed.
const TIMEOUT = 10;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const show = (s: Stored) => `${s.value ?? "(nothing)"} (version ${s.version})`;

type Stored = { value: string | null; version: number };
type PendingWrite = { id: number; key: string; value: string; version: number; acks: NodeId[]; client: NodeId; deadline: number; done: boolean };
type PendingRead = {
  id: number;
  key: string;
  replies: (Stored & { node: NodeId })[];
  client: NodeId;
  deadline: number;
  answer: Stored | null;
  mustSee: number;
};

// @why A replica only stores and returns versioned values; all the quorum logic lives in the coordinator.
export class Replica extends SimNode {
  // @why On disk, so a replica that restarts still has what it acked; an ack for data that a restart wipes is a lie.
  static durable = ["kv"];
  // @why Each value keeps the version it was written with, so a reader can tell an old copy from a new one.
  kv: Record<string, Stored> = {};

  state() {
    const held = Object.entries(this.kv).map(([k, v]) => `${k}=${v.value} v${v.version}`);
    return { role: "copy", summary: held.length ? `has ${held.join(" ")}` : "empty", kv: { ...this.kv } };
  }

  // Narration only: after a restart, say what survived on disk.
  onStart(ctx: Ctx) {
    if (ctx.now === 0) return;
    const held = Object.entries(this.kv).map(([k, v]) => `${k}=${show(v)}`);
    ctx.say(`${ctx.id} is back up with only what was on its disk: ${held.join(", ") || "nothing"}. Anything written while it was down, it missed`);
  }

  onStore(ctx: Ctx, body: { id: number; key: string; value: string; version: number }, from: NodeId) {
    this.keepIfNewer(ctx, body.key, body);
    // @why The ack is what the coordinator counts toward W.
    ctx.send(from, "Stored", { id: body.id });
  }

  // @why Read repair: the coordinator pushes the newest value to a replica that answered with an older one.
  onRepair(ctx: Ctx, body: { key: string; value: string; version: number }) {
    this.keepIfNewer(ctx, body.key, body, true);
  }

  onFetch(ctx: Ctx, body: { id: number; key: string }, from: NodeId) {
    const have = this.kv[body.key] ?? { value: null, version: 0 };
    ctx.say(`${ctx.id} answers the coordinator: it has ${body.key}=${show(have)}`);
    // @why The version travels with the value; without it the coordinator could not pick the newest reply.
    ctx.send(from, "Fetched", { id: body.id, ...have });
  }

  // @why Messages can arrive late and out of order. Never letting a lower version replace a higher one keeps a slow old write from undoing a newer one.
  protected keepIfNewer(ctx: Ctx, key: string, incoming: { value: string; version: number }, repair = false) {
    const have = this.kv[key]?.version ?? 0;
    if (incoming.version <= have) {
      return ctx.say(
        incoming.version < have
          ? `good: A late, older copy reaches ${ctx.id}: ${key}=${show(incoming)}. ${ctx.id} already has version ${have}, which is newer, so it ignores the old one`
          : `${ctx.id} already has ${key} at version ${have}, so it keeps it`,
      );
    }
    this.kv[key] = { value: incoming.value, version: incoming.version };
    ctx.say(
      repair
        ? `good: Read repair: ${ctx.id} was behind and now saves ${key}=${show(incoming)}, so all copies agree again`
        : `${ctx.id} saves its copy of ${key}=${show(incoming)} and tells the coordinator "stored"`,
    );
  }
}

// @why The node clients talk to. It fans every request out to all N replicas and answers once enough of them reply.
export class Coordinator extends SimNode {
  // @why `clock` on disk so a restarted coordinator never reuses a version; `nextId` so old replies can't match new requests; `acked` because a promise made to a client stays made.
  static durable = ["clock", "nextId", "acked"];
  // @why The last version handed out. Each write gets the next number, so a bigger version always means a later write.
  clock = 0;
  nextId = 0;
  // @why How many replica acks a write needs before the client is told "done".
  w: number;
  // @why How many replica replies a read needs before it answers. R + W > N makes every read set share a replica with every write set.
  r: number;
  writes: PendingWrite[] = [];
  reads: PendingRead[] = [];
  // @why For the checker only: the newest version of each key already acknowledged to a client.
  acked: Record<string, number> = {};
  // @why For the checker only: what the last read returned, and which version it was obliged to see.
  lastRead: { key: string; version: number; mustSee: number } | null = null;

  constructor(w: number, r: number) {
    super();
    this.w = w;
    this.r = r;
  }

  state() {
    const open = this.writes.filter((p) => !p.done).length + this.reads.filter((p) => !p.answer).length;
    return {
      role: "coordinator",
      summary: `waits for ${this.w} of ${N} on write · ${this.r} of ${N} on read${open ? ` (${open} open)` : ""}`,
      W: this.w,
      R: this.r,
      clock: this.clock,
      acked: { ...this.acked },
      writes: this.writes.map((p) => `${p.key}=${p.value} v${p.version}: ${p.acks.length}/${this.w} acks${p.done ? ", answered" : ""}`),
      reads: this.reads.map((p) => `${p.key}: ${p.replies.length}/${this.r} replies${p.answer ? `, answered v${p.answer.version}` : ""}`),
    };
  }

  onWrite(ctx: Ctx, body: { key: string; value: string }, from: NodeId) {
    // @why Stamping here, once, gives every copy of this write the same version.
    const version = ++this.clock;
    this.writes.push({ id: this.nextId++, key: body.key, value: body.value, version, acks: [], client: from, deadline: ctx.now + TIMEOUT, done: false });
    ctx.say(
      `The client writes ${body.key}=${body.value}. The coordinator stamps it version ${version} and sends a copy to all ${N} servers; it will say "saved" once ${this.w} of them confirm (W=${this.w})`,
    );
    // @why Send to every replica, not just W of them: the extra copies are free insurance if one of the W is slow or lost.
    for (const peer of ctx.peers) ctx.send(peer, "Store", { id: this.writes.at(-1)!.id, key: body.key, value: body.value, version });
    this.armExpiry(ctx);
  }

  onStored(ctx: Ctx, body: { id: number }, from: NodeId) {
    const p = this.writes.find((x) => x.id === body.id);
    // @why A late ack for a write that already timed out changes nothing.
    if (!p || p.acks.includes(from)) return;
    p.acks.push(from);
    // @why W acks, not N: the write survives on W replicas, and a down replica can't hold it up.
    if (!p.done && p.acks.length >= this.w) {
      p.done = true;
      const newer = this.acked[p.key] ?? 0;
      this.acked[p.key] = Math.max(newer, p.version);
      ctx.say(
        newer > p.version
          ? `${p.acks.length} of ${N} servers confirm the late ${p.key}=${p.value} (version ${p.version}), so the client is told "saved". It is older than version ${newer}, already confirmed, so a correct copy keeps version ${newer}`
          : `good: ${p.acks.length} of ${N} copies of ${p.key}=${p.value} are saved (${p.acks.join(", ")}), which is the ${this.w} it needs, so the coordinator tells the client "saved"${p.acks.length < N ? ". It does not wait for the last copy" : ""}`,
      );
      ctx.send(p.client, "WriteAck", { key: p.key, version: p.version });
    } else if (!p.done) {
      ctx.say(`${from} confirms ${p.key}=${p.value}: ${p.acks.length} of the ${this.w} confirmations needed. The client keeps waiting`);
    } else {
      ctx.say(`${from} also confirms ${p.key}=${p.value}, after the client was already told "saved"`);
    }
    if (p.acks.length === N) this.writes = this.writes.filter((x) => x !== p);
  }

  onRead(ctx: Ctx, body: { key: string }, from: NodeId) {
    const p: PendingRead = {
      id: this.nextId++,
      key: body.key,
      replies: [],
      client: from,
      deadline: ctx.now + TIMEOUT,
      answer: null,
      mustSee: this.acked[body.key] ?? 0,
    };
    this.reads.push(p);
    ctx.say(
      `The client reads ${body.key}. The coordinator asks all ${N} servers and will answer after ${plural(this.r, "reply").replace("replys", "replies")} (R=${this.r}), taking the highest version it hears`,
    );
    for (const peer of ctx.peers) ctx.send(peer, "Fetch", { id: p.id, key: body.key });
    this.armExpiry(ctx);
  }

  onFetched(ctx: Ctx, body: { id: number; value: string | null; version: number }, from: NodeId) {
    const p = this.reads.find((x) => x.id === body.id);
    if (!p) return;
    p.replies.push({ node: from, value: body.value, version: body.version });
    if (!p.answer && p.replies.length >= this.r) {
      const { best, why } = this.pick(p.replies);
      p.answer = { value: best.value, version: best.version };
      this.lastRead = { key: p.key, version: best.version, mustSee: p.mustSee };
      const seen = p.replies.map((x) => `${x.node} has v${x.version}`).join(", ");
      const missed = best.version < p.mustSee;
      const because = p.replies.length === 1 ? "the only reply it waited for" : why;
      ctx.say(
        missed
          ? `bad: The coordinator has the ${this.r === 1 ? "1 reply" : `${this.r} replies`} it needs (${seen}) and answers ${p.key}=${show(best)}, ${because}. Version ${p.mustSee} was already confirmed as saved, so the user sees old data and their change looks lost`
          : `good: The coordinator has the ${this.r === 1 ? "1 reply" : `${this.r} replies`} it needs (${seen}) and answers ${p.key}=${show(best)}, ${because}`,
      );
      ctx.send(p.client, "ReadResult", { key: p.key, value: best.value, version: best.version });
      this.readRepair(ctx, p, p.replies);
    } else if (p.answer) {
      // @why A reply that arrives after the answer is still worth checking: it may come from the stalest replica of all.
      const late = p.replies.at(-1)!;
      if (late.version >= p.answer.version) ctx.say(`${from}'s late reply (version ${late.version}) is not older than the answer, so nothing needs fixing`);
      this.readRepair(ctx, p, [late]);
    } else {
      ctx.say(`${from} replies with ${p.key}=${show(body)}: ${p.replies.length} of the ${this.r} replies needed. Still waiting`);
    }
    if (p.replies.length === N) this.reads = this.reads.filter((x) => x !== p);
  }

  // @why Replies can disagree. The highest version is the latest write, so that is the answer.
  protected pick(replies: (Stored & { node: NodeId })[]): { best: Stored; why: string } {
    return { best: replies.reduce((a, b) => (b.version > a.version ? b : a)), why: "the highest version among them" };
  }

  // @why Without repair, a replica that missed a write keeps the old value until it is overwritten, and every read that lands on it has to be outvoted.
  protected readRepair(ctx: Ctx, p: PendingRead, replies: (Stored & { node: NodeId })[]) {
    const a = p.answer!;
    const stale = replies.filter((x) => x.version < a.version);
    for (const x of stale) ctx.send(x.node, "Repair", { key: p.key, value: a.value, version: a.version });
    if (stale.length)
      ctx.say(
        `${stale.map((x) => x.node).join(", ")} answered with an older version, so the coordinator sends it ${p.key}=${show(a)}. This is read repair: a read fixes a stale copy for free`,
      );
  }

  // @why Without a deadline, a write or read that can never reach its quorum would leave the client waiting forever.
  onExpire(ctx: Ctx) {
    const overdue = this.writes.some((x) => x.deadline <= ctx.now && !x.done) || this.reads.some((x) => x.deadline <= ctx.now && !x.answer);
    if (!overdue) ctx.say(`The coordinator checks for requests past their ${TIMEOUT}-tick deadline: none`);
    for (const p of this.writes.filter((x) => x.deadline <= ctx.now)) {
      if (!p.done) {
        ctx.say(
          `bad: After ${TIMEOUT} ticks only ${p.acks.length} of the ${this.w} confirmations for ${p.key}=${p.value} arrived${p.acks.length ? ` (${p.acks.join(", ")})` : ""}, so the client is told the write FAILED. One down server blocked it${p.acks.length ? `, yet ${p.acks.join(" and ")} already saved it and keep it` : ""}`,
        );
        ctx.send(p.client, "WriteFailed", { key: p.key, acks: p.acks.length, needed: this.w });
      }
    }
    for (const p of this.reads.filter((x) => x.deadline <= ctx.now)) {
      if (!p.answer) {
        ctx.say(`bad: After ${TIMEOUT} ticks only ${p.replies.length} of the ${this.r} replies for ${p.key} arrived, so the client is told the read FAILED`);
        ctx.send(p.client, "ReadFailed", { key: p.key, replies: p.replies.length, needed: this.r });
      }
    }
    this.writes = this.writes.filter((x) => x.deadline > ctx.now);
    this.reads = this.reads.filter((x) => x.deadline > ctx.now);
    this.armExpiry(ctx);
  }

  // @why One timer for all requests: it is set for the earliest deadline still open.
  private armExpiry(ctx: Ctx) {
    const next = Math.min(...this.writes.map((x) => x.deadline), ...this.reads.map((x) => x.deadline));
    if (Number.isFinite(next)) ctx.setTimer("Expire", next - ctx.now);
    else ctx.cancelTimer("Expire");
  }
}

// @why The quorum promise, checked after every event: a read that starts after a write was acknowledged returns that write or a newer one.
export function readsSeeAckedWrites(nodes: Record<NodeId, SimNode>): string | null {
  for (const node of Object.values(nodes)) {
    if (!(node instanceof Coordinator) || !node.lastRead) continue;
    const { key, version, mustSee } = node.lastRead;
    if (version < mustSee) return `a read of ${key} returned version ${version}, but version ${mustSee} was acknowledged before the read began`;
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: answers reads correctly but never sends the newest value back to stale replicas.
class NoReadRepair extends Coordinator {
  protected readRepair(ctx: Ctx, p: PendingRead, replies: (Stored & { node: NodeId })[]) {
    const stale = replies.filter((x) => x.version < p.answer!.version).map((x) => x.node);
    if (stale.length)
      ctx.say(
        `bad: ${stale.join(", ")} answered with an older version, and nobody fixes it. It stays stale, so every later read that lands on it has to be outvoted, and one more failure could make it the only answer`,
      );
  }
}

// Broken on purpose: answers with whichever reply arrived first, ignoring the versions.
class FirstReplyWins extends Coordinator {
  protected pick(replies: (Stored & { node: NodeId })[]) {
    return { best: replies[0], why: `just because it arrived first (from ${replies[0].node}), ignoring versions` };
  }
}

// Broken on purpose: stores whatever arrives, even a copy older than the one it holds.
class NoVersionCheck extends Replica {
  protected keepIfNewer(ctx: Ctx, key: string, incoming: { value: string; version: number }) {
    const had = this.kv[key];
    this.kv[key] = { value: incoming.value, version: incoming.version };
    ctx.say(
      had && had.version > incoming.version
        ? `bad: A late, older copy reaches ${ctx.id}, and it overwrites ${key}=${show(had)} with ${key}=${show(incoming)} just because it arrived last. The newer write is gone from ${ctx.id}`
        : `${ctx.id} saves its copy of ${key}=${show(incoming)} and tells the coordinator "stored"`,
    );
  }
}

const cluster = (make: () => Coordinator, replica: () => Replica = () => new Replica()) => ({
  coord: make,
  r1: replica,
  r2: replica,
  r3: replica,
});
const write = (at: number, key: string, value: string): ClientOp => ({ at, to: "coord", type: "Write", body: { key, value } });
const read = (at: number, key: string): ClientOp => ({ at, to: "coord", type: "Read", body: { key } });
const versionOf = (r: SimResult, id: NodeId, key = "x") => (r.nodes[id] as Replica).kv[key]?.version ?? 0;
const stale = (r: SimResult) => r.run.steps.some((s) => s.violation?.startsWith("a read of x returned"));
// x=old is copied everywhere first. Then the copy of x=new meant for r1 is lost on the network.
const lostCopyToR1: Fault[] = [{ at: 6, kind: "drop", from: "coord", to: "r1", type: "Store", count: 1 }];
const oldThenNewThenRead = [write(1, "x", "old"), write(7, "x", "new"), read(15, "x")];

test("overlap: with W=2 and R=2, a read after an acknowledged write always sees it", () => {
  const r = simulate({
    nodes: cluster(() => new Coordinator(2, 2)),
    seed: 1,
    until: 40,
    latency: [2, 2],
    faults: lostCopyToR1,
    clients: oldThenNewThenRead,
    invariant: readsSeeAckedWrites,
  });
  assert.equal(r.run.error, undefined);
  const acks = r.inbox.filter((m) => m.type === "WriteAck");
  assert.equal(acks.length, 2);
  const result = r.inbox.find((m) => m.type === "ReadResult")!;
  assert.deepEqual(result.body, { key: "x", value: "new", version: 2 });
  // r1 was stale when the read began; it was in the read set, and the version outvoted it.
  const atRead = r.run.steps.find((s) => s.t >= 15)!;
  assert.equal((atRead.nodes.r1.state.kv as Record<string, Stored>).x.version, 1);
  assert.equal(versionOf(r, "r1"), 2);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("replica down: with W=2, writes still succeed while one replica is down", () => {
  const r = simulate({
    nodes: cluster(() => new Coordinator(2, 2)),
    seed: 2,
    until: 40,
    latency: [2, 2],
    faults: [{ at: 0, kind: "crash", node: "r3" }],
    clients: [write(2, "x", "1"), read(10, "x")],
    invariant: readsSeeAckedWrites,
  });
  assert.equal(r.run.error, undefined);
  assert.equal(r.inbox.filter((m) => m.type === "WriteAck").length, 1);
  assert.ok(!r.inbox.some((m) => m.type === "WriteFailed"));
  assert.deepEqual(r.inbox.find((m) => m.type === "ReadResult")!.body, { key: "x", value: "1", version: 1 });
  assert.equal(versionOf(r, "r3"), 0);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

// r3 has x=old, is down while x=new is written, and comes back still holding x=old.
const readRepairStory = {
  seed: 3,
  until: 40,
  latency: [2, 2] as [number, number],
  faults: [
    { at: 6, kind: "crash", node: "r3" },
    { at: 12, kind: "recover", node: "r3" },
  ] as Fault[],
  clients: [write(1, "x", "old"), write(7, "x", "new"), read(14, "x")],
  invariant: readsSeeAckedWrites,
};

test("read repair: a stale replica is fixed by the next read", () => {
  const r = simulate({ nodes: cluster(() => new Coordinator(2, 2)), ...readRepairStory });
  assert.equal(r.run.error, undefined);
  const before = r.run.steps.find((s) => s.t >= 14)!;
  assert.equal((before.nodes.r3.state.kv as Record<string, Stored>).x.version, 1);
  assert.equal(versionOf(r, "r3"), 2);
  assert.equal((r.nodes.r3 as Replica).kv.x.value, "new");
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("broken: R + W ≤ N — with W=2 and R=1, a read misses an acknowledged write", () => {
  // The same lost message as in "overlap", but R=1: 2 + 1 is not more than 3, so one reply is
  // enough, and it can come from the replica the write missed.
  const r = simulate({
    nodes: cluster(() => new Coordinator(2, 1)),
    seed: 1,
    until: 40,
    latency: [2, 2],
    faults: lostCopyToR1,
    clients: oldThenNewThenRead,
    invariant: readsSeeAckedWrites,
  });
  assert.equal(r.run.error, undefined);
  const ackNew = r.inbox.findIndex((m) => m.type === "WriteAck" && (m.body as { version: number }).version === 2);
  const result = r.inbox.findIndex((m) => m.type === "ReadResult");
  assert.ok(ackNew >= 0 && result > ackNew);
  assert.deepEqual(r.inbox[result].body, { key: "x", value: "old", version: 1 });
  assert.ok(stale(r));
});

test("broken: wait for all — one replica down blocks every write", () => {
  const r = simulate({
    nodes: cluster(() => new Coordinator(3, 1)),
    seed: 4,
    until: 40,
    latency: [2, 2],
    faults: [{ at: 0, kind: "crash", node: "r3" }],
    clients: [write(2, "x", "1")],
    invariant: readsSeeAckedWrites,
  });
  assert.equal(r.run.error, undefined);
  assert.ok(!r.inbox.some((m) => m.type === "WriteAck"));
  assert.ok(r.inbox.some((m) => m.type === "WriteFailed"));
});

test("broken: no read repair — a stale replica stays stale", () => {
  const r = simulate({ nodes: cluster(() => new NoReadRepair(2, 2)), ...readRepairStory });
  assert.equal(r.run.error, undefined);
  assert.deepEqual(r.inbox.find((m) => m.type === "ReadResult")!.body, { key: "x", value: "new", version: 2 });
  assert.equal(versionOf(r, "r3"), 1);
  assert.equal((r.nodes.r3 as Replica).kv.x.value, "old");
});

test("broken: first reply wins — the read ignores versions and returns x=old after x=new was acknowledged", () => {
  // The same run as "overlap", W=2 and R=2, so the read set does include a fresh replica.
  // But r1's stale reply arrives first, and the coordinator answers with it.
  const r = simulate({
    nodes: cluster(() => new FirstReplyWins(2, 2)),
    seed: 1,
    until: 40,
    latency: [2, 2],
    faults: lostCopyToR1,
    clients: oldThenNewThenRead,
    invariant: readsSeeAckedWrites,
  });
  assert.equal(r.run.error, undefined);
  assert.deepEqual(r.inbox.find((m) => m.type === "ReadResult")!.body, { key: "x", value: "old", version: 1 });
  assert.ok(stale(r));
});

// x=old is written first, but its copies are held up on the network for 5 extra ticks. x=new is
// written a tick later and reaches every replica first; the old copies arrive at t=8.
const lateCopyStory = {
  seed: 5,
  until: 40,
  latency: [2, 2] as [number, number],
  faults: [{ at: 0, kind: "delay", extra: 5, until: 2 }] as Fault[],
  clients: [write(1, "x", "old"), write(2, "x", "new"), read(12, "x")],
  invariant: readsSeeAckedWrites,
};

test("late write: an old copy that arrives after a newer one is ignored", () => {
  const r = simulate({ nodes: cluster(() => new Coordinator(2, 2)), ...lateCopyStory });
  assert.equal(r.run.error, undefined);
  for (const id of ["r1", "r2", "r3"]) assert.equal(versionOf(r, id), 2, id);
  assert.deepEqual(r.inbox.find((m) => m.type === "ReadResult")!.body, { key: "x", value: "new", version: 2 });
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("broken: no version check — a late old copy overwrites a newer value", () => {
  const r = simulate({ nodes: cluster(() => new Coordinator(2, 2), () => new NoVersionCheck()), ...lateCopyStory });
  assert.equal(r.run.error, undefined);
  for (const id of ["r1", "r2", "r3"]) assert.equal(versionOf(r, id), 1, id);
  assert.deepEqual(r.inbox.find((m) => m.type === "ReadResult")!.body, { key: "x", value: "old", version: 1 });
  assert.ok(stale(r));
});
