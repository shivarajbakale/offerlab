/**
 * 023. Leases and Fencing Tokens
 * Level: Staff
 * Group: Replication
 *
 * Problem: Several workers can do a job, but only one may do it at a time, for example
 *   writing to a shared file or acting as the database primary. A plain lock fails when its
 *   holder crashes: nobody else can ever take it. And a holder can be paused (a long garbage
 *   collection, a stalled VM) without noticing, then wake up and act as if it still holds
 *   the lock after someone else has taken over.
 *
 * Approach: Leases plus fencing tokens checked by the resource
 *   A lock service grants the lock as a lease: it is valid only until an expiry time, and the
 *   holder must renew it before then. A crashed holder stops renewing, so its lease runs out
 *   and another worker can take over. Every grant also carries a fencing token, a number that
 *   goes up by one with every grant. Workers send their token with every write, and the
 *   storage remembers the highest token it has accepted and rejects any write with a lower
 *   one. A paused worker that wakes up with an old token is turned away by the storage itself.
 *
 * Cost: one round trip to acquire, one renewal per renew interval while holding; the
 *   resource keeps one number and compares it on every write.
 *
 * Pattern: coordination (leases, fencing)
 * Key insight: A process cannot reliably know that its own lease has expired, because it can
 *   be paused between checking the lease and acting on it. So safety cannot rest on the
 *   holder's judgment; the resource has to refuse stale holders, and an increasing token is
 *   what lets it tell stale from current.
 * Tradeoffs: The lease length trades failover speed (short leases) against needless loss of
 *   the lock when renewals are slow (long leases). Fencing only works if every resource the
 *   holder touches checks tokens; a resource that cannot is unprotected.
 * Staff notes: Expiry assumes the lock service's and the holder's clocks run at roughly the
 *   same rate; the holder counts its lease from when it asked, never from when the answer
 *   arrived. A lease is about availability (no lock is held forever); the fencing token is
 *   about safety. Chubby calls its tokens sequencers; with ZooKeeper, the zxid or znode
 *   version can serve as a token. Martin Kleppmann's critique of Redlock has two legs: it hands
 *   out no fencing token, so it cannot stop a paused client from writing; and its safety rests
 *   on timing assumptions (bounded pauses, network delay and clock drift).
 * Interview signals: "only one worker may run this job", "distributed lock", "leader lease",
 *   "a paused process came back and corrupted data", "zombie primary", "fencing".
 * Real world: Google's Chubby lock service issues leases and sequencers. ZooKeeper and etcd
 *   provide sessions or leases that expire when the client stops sending keep-alives, and
 *   Kubernetes leader election uses Lease objects that the leader renews.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type ClientOp, type Ctx, type NodeId, type SimResult } from "../../kernel/sim.ts";

const LEASE = 10;
const RENEW_EVERY = 4;
const RETRY = 3;
const WORK_EVERY = 5;
const PREP = 2;

// @why One place decides who holds the lock, so two workers can never both be granted it at the same moment.
export class LockService extends SimNode {
  // @why On disk. A restarted lock service that handed out token 1 again would let an old holder's writes look new.
  static durable = ["lastToken", "holder", "expiresAt"];
  holder: NodeId | null = null;
  // @why The fencing token of the newest grant. It only ever goes up, so a bigger token always means a newer holder.
  lastToken = 0;
  // @why When the current lease runs out by this service's clock, unless the holder renews it first.
  expiresAt: number | null = null;

  state() {
    return { holder: this.holder, token: this.lastToken, expiresAt: this.expiresAt };
  }

  // @why After a restart the expiry timer is gone; re-arm it so a lease that was running still ends.
  onStart(ctx: Ctx) {
    if (this.expiresAt !== null) ctx.setTimer("LeaseExpiry", Math.max(0, this.expiresAt - ctx.now));
  }

  onAcquire(ctx: Ctx, body: { askedAt: number }, from: NodeId) {
    // @why A lease that has run out frees the lock even if the expiry timer has not fired yet.
    const free = this.holder === null || (this.expiresAt !== null && ctx.now >= this.expiresAt);
    if (!free && this.holder !== from) {
      ctx.say(`lock refuses ${from}: ${this.holder} holds it${this.expiresAt === null ? " with no end" : ` until t=${this.expiresAt}`}`);
      return ctx.send(from, "Busy", { holder: this.holder, until: this.expiresAt });
    }
    // @why Every grant gets a new, bigger token, so the storage can tell this holder from every earlier one.
    if (this.holder !== from || free) this.lastToken++;
    this.holder = from;
    const length = this.leaseLength();
    this.expiresAt = length === null ? null : ctx.now + length;
    if (length !== null) ctx.setTimer("LeaseExpiry", length);
    ctx.say(`lock grants ${from} token ${this.lastToken}${this.expiresAt === null ? ", with no expiry" : `, valid until t=${this.expiresAt}`}`);
    ctx.send(from, "Granted", { token: this.lastToken, ttl: length, askedAt: body.askedAt });
  }

  onRenew(ctx: Ctx, body: { token: number; askedAt: number }, from: NodeId) {
    // @why Only the current holder, with the current token, and only before expiry. A late renewal must not revive a lease someone else now holds.
    const valid = this.holder === from && body.token === this.lastToken && (this.expiresAt === null || ctx.now < this.expiresAt);
    if (!valid) {
      ctx.say(`lock refuses to renew ${from}'s token ${body.token}: ${this.holder ? `${this.holder} holds token ${this.lastToken} now` : "that lease has expired"}`);
      return ctx.send(from, "Lost", { token: body.token });
    }
    const length = this.leaseLength();
    this.expiresAt = length === null ? null : ctx.now + length;
    if (length !== null) ctx.setTimer("LeaseExpiry", length);
    ctx.say(`lock renews ${from}'s token ${body.token} until t=${this.expiresAt}`);
    ctx.send(from, "Renewed", { token: body.token, askedAt: body.askedAt });
  }

  // @why This is what a plain lock lacks: a holder that stops renewing, because it crashed or is cut off, loses the lock on its own.
  onLeaseExpiry(ctx: Ctx) {
    ctx.say(`${this.holder}'s lease (token ${this.lastToken}) ran out without a renewal, so the lock is free`);
    this.holder = null;
    this.expiresAt = null;
  }

  // @why How long a grant or renewal lasts. Short leases fail over fast; long ones survive slow renewals.
  protected leaseLength(): number | null {
    return LEASE;
  }
}

// @why The shared thing the lock protects. It is the last line of defence, because it sees every write, including late ones.
export class Storage extends SimNode {
  static durable = ["value", "writer", "token", "highestToken"];
  value: string | null = null;
  writer: NodeId | null = null;
  // @why The token of the write currently stored.
  token = 0;
  // @why The biggest token ever accepted. Any write with a smaller one comes from a holder that has already been replaced.
  highestToken = 0;
  rejected = 0;

  state() {
    return { value: this.value, writer: this.writer, token: this.token, highestToken: this.highestToken, rejected: this.rejected };
  }

  onWrite(ctx: Ctx, body: { value: string; token: number }, from: NodeId) {
    // @why The fencing check. The writer may honestly believe it holds the lock; the token proves it does not.
    if (body.token < this.highestToken) {
      this.rejected++;
      ctx.say(`storage rejects ${from}'s ${body.value}: token ${body.token} is older than token ${this.highestToken}, which it has already seen`);
      return ctx.send(from, "Rejected", { token: body.token, highestToken: this.highestToken });
    }
    this.accept(ctx, body, from);
  }

  protected accept(ctx: Ctx, body: { value: string; token: number }, from: NodeId) {
    this.highestToken = Math.max(this.highestToken, body.token);
    this.value = body.value;
    this.writer = from;
    this.token = body.token;
    ctx.say(`storage takes ${body.value} from ${from} with token ${body.token}`);
    ctx.send(from, "Accepted", { token: body.token });
  }
}

type Held = { name: string; body?: unknown; from?: NodeId };

// @why A process that wants the lock. It cannot see the lock service's clock, only its own, and it can be frozen without noticing.
export class Worker extends SimNode {
  // @why Nothing on disk: a restarted worker has lost its lease and must ask again; the old lease simply runs out.
  token: number | null = null;
  // @why The worker's own idea of when its lease ends. It is only ever a guess about the lock service's decision.
  leaseUntil: number | null = null;
  pausedUntil: number | null = null;
  // @why What happened while frozen: timers that fired and messages that arrived. They all run at once on waking.
  held: Held[] = [];
  writes = 0;
  // @why The write this worker has decided on, with the token it held when it checked its lease.
  pending: { value: string; token: number } | null = null;
  startAt: number;
  jobs: number;

  constructor(startAt: number, jobs = Infinity) {
    super();
    // @why Lets a scenario choose who asks first, so the story is the same every run.
    this.startAt = startAt;
    // @why How many writes this worker has to do; after that it keeps its lease but writes nothing more.
    this.jobs = jobs;
  }

  state() {
    return {
      token: this.token,
      leaseUntil: this.leaseUntil,
      pausedUntil: this.pausedUntil,
      held: this.held.map((h) => h.name),
      writes: this.writes,
    };
  }

  onStart(ctx: Ctx) {
    ctx.setTimer("TryLock", ctx.now === 0 ? this.startAt : RETRY);
  }

  // @why Keep asking until the lock is free. A Busy reply only means "not yet".
  onTryLock(ctx: Ctx) {
    if (this.frozen(ctx, "TryLock")) return;
    ctx.send("lock", "Acquire", { askedAt: ctx.now });
    ctx.setTimer("TryLock", RETRY);
  }

  onBusy(ctx: Ctx, body: { holder: NodeId; until: number | null }, from: NodeId) {
    if (this.frozen(ctx, "Busy", body, from)) return;
    ctx.say(`${ctx.id} must wait: ${body.holder} holds the lock, so it will ask again`);
  }

  onGranted(ctx: Ctx, body: { token: number; ttl: number | null; askedAt: number }, from: NodeId) {
    if (this.frozen(ctx, "Granted", body, from)) return;
    ctx.cancelTimer("TryLock");
    this.token = body.token;
    // @why Counted from when the worker asked, not when the answer arrived. The lock service started its clock somewhere in between, so this guess ends no later than the real lease.
    this.leaseUntil = body.ttl === null ? null : body.askedAt + body.ttl;
    ctx.say(`${ctx.id} holds token ${body.token}${this.leaseUntil === null ? " for good" : ` and treats its lease as good until t=${this.leaseUntil}`}`);
    // @why Renew well before the lease ends, so one slow renewal does not lose it.
    if (body.ttl !== null) ctx.setTimer("Renew", RENEW_EVERY);
    if (this.writes < this.jobs) ctx.setTimer("Work", 1);
  }

  onRenew(ctx: Ctx) {
    if (this.frozen(ctx, "Renew")) return;
    if (this.token === null) return;
    ctx.send("lock", "Renew", { token: this.token, askedAt: ctx.now });
    ctx.setTimer("Renew", RENEW_EVERY);
  }

  onRenewed(ctx: Ctx, body: { token: number; askedAt: number }, from: NodeId) {
    if (this.frozen(ctx, "Renewed", body, from)) return;
    if (body.token !== this.token) return;
    this.leaseUntil = Math.max(this.leaseUntil ?? 0, body.askedAt + LEASE);
  }

  onLost(ctx: Ctx, body: { token: number }, from: NodeId) {
    if (this.frozen(ctx, "Lost", body, from)) return;
    if (body.token === this.token) this.giveUp(ctx, `${ctx.id} hears its token ${body.token} is no longer valid and stops`);
  }

  // @why Check the lease, then do the work. The gap between the two is where a pause hurts.
  onWork(ctx: Ctx) {
    if (this.frozen(ctx, "Work")) return;
    if (this.token === null) return;
    if (this.leaseUntil !== null && ctx.now >= this.leaseUntil) {
      return this.giveUp(ctx, `${ctx.id}'s own clock says its lease ended at t=${this.leaseUntil}, so it stops working`);
    }
    this.writes++;
    this.pending = { value: `${ctx.id}:${this.writes}`, token: this.token };
    ctx.say(
      `${ctx.id} checks its lease: ${this.leaseUntil === null ? "it holds the lock with no end" : `good until t=${this.leaseUntil}`}. It starts preparing ${this.pending.value}`,
    );
    // @why Preparing a write takes time. The worker does not check its lease again before sending; real code rarely can.
    ctx.setTimer("Send", PREP);
    if (this.writes < this.jobs) ctx.setTimer("Work", WORK_EVERY);
  }

  onSend(ctx: Ctx) {
    if (this.frozen(ctx, "Send")) return;
    if (!this.pending) return;
    // @why The token travels with the write. Without it, the storage could not tell this write from the current holder's.
    ctx.send("storage", "Write", this.pending);
    ctx.say(`${ctx.id} sends ${this.pending.value} with token ${this.pending.token}, without checking its lease again`);
    this.pending = null;
  }

  onAccepted(ctx: Ctx, body: { token: number }, from: NodeId) {
    if (this.frozen(ctx, "Accepted", body, from)) return;
  }

  // @why The storage has seen a newer token, so someone else holds the lock. Stop, rather than keep writing into a wall.
  onRejected(ctx: Ctx, body: { token: number; highestToken: number }, from: NodeId) {
    if (this.frozen(ctx, "Rejected", body, from)) return;
    if (this.token === body.token) this.giveUp(ctx, `${ctx.id} learns from storage that token ${body.highestToken} exists, so it stops`);
    else ctx.say(`${ctx.id}'s write with old token ${body.token} was refused; it had already stopped`);
  }

  // @why A stand-in for a long garbage-collection pause or a stalled VM: the process stops running, then carries on as if no time had passed.
  onPause(ctx: Ctx, body: { ticks: number }) {
    this.pausedUntil = ctx.now + body.ticks;
    ctx.setTimer("Resume", body.ticks);
    ctx.say(`${ctx.id} freezes until t=${this.pausedUntil}: its timers and messages pile up unhandled`);
  }

  // @why On waking, everything that piled up runs in order. Nothing tells the worker's code that time jumped; only a line that reads the clock can notice.
  onResume(ctx: Ctx) {
    const held = this.held;
    this.pausedUntil = null;
    this.held = [];
    ctx.say(`${ctx.id} wakes at t=${ctx.now} and carries on: ${held.map((h) => h.name).join(", ") || "nothing waiting"}`);
    for (const h of held) {
      const fn = (this as unknown as Record<string, (ctx: Ctx, body?: unknown, from?: NodeId) => void>)[`on${h.name}`];
      fn.call(this, ctx, h.body, h.from);
    }
  }

  private frozen(ctx: Ctx, name: string, body?: unknown, from?: NodeId): boolean {
    if (this.pausedUntil === null) return false;
    this.held.push({ name, body, from });
    ctx.say(`${ctx.id} is frozen, so ${name} waits`);
    return true;
  }

  private giveUp(ctx: Ctx, why: string) {
    ctx.say(why);
    this.token = null;
    this.leaseUntil = null;
    this.pending = null;
    ctx.cancelTimer("Renew");
    ctx.cancelTimer("Work");
    ctx.cancelTimer("Send");
    ctx.setTimer("TryLock", RETRY);
  }
}

// @why Fencing, checked after every event: the storage never holds a write from an older holder than one it has already accepted.
export function noStaleWriteWins(nodes: Record<NodeId, SimNode>): string | null {
  const s = nodes.storage as Storage | undefined;
  if (!s || s.token >= s.highestToken) return null;
  return `storage holds a write from token ${s.token} after accepting token ${s.highestToken}: a stale holder overwrote newer data`;
}

// --- helpers for the scenarios ---

// Broken on purpose: storage ignores the token and takes every write, as if there were no token at all.
class NoTokenCheck extends Storage {
  onWrite(ctx: Ctx, body: { value: string; token: number }, from: NodeId) {
    this.accept(ctx, body, from);
  }
}

// Broken on purpose: a plain lock with no expiry; it is held until the holder gives it back.
class LockForever extends LockService {
  protected leaseLength(): number | null {
    return null;
  }
}

const world = (lock = () => new LockService(), storage = () => new Storage(), w2Jobs = Infinity) => ({
  lock,
  storage,
  w1: () => new Worker(1),
  w2: () => new Worker(3, w2Jobs),
});
const pause = (at: number, ticks: number): ClientOp => ({ at, to: "w1", type: "Pause", body: { ticks } });
const grants = (r: SimResult) =>
  r.run.steps
    .filter((s) => s.kind === "deliver" && s.msg?.type === "Granted")
    .map((s) => ({ t: s.t, to: s.node!, token: (s.msg!.body as { token: number }).token }));
const storageOf = (r: SimResult) => r.nodes.storage as Storage;

test("renewal: a worker that keeps renewing keeps the lease", () => {
  const r = simulate({ nodes: world(), seed: 1, until: 80, latency: [1, 1], invariant: noStaleWriteWins });
  assert.equal(r.run.error, undefined);
  // One grant, ever: w1 holds token 1 for eight lease lengths, and w2 is told Busy each time it asks.
  assert.deepEqual(grants(r), [{ t: 3, to: "w1", token: 1 }]);
  assert.equal((r.nodes.lock as LockService).holder, "w1");
  assert.ok((r.nodes.w1 as Worker).writes >= 10);
  assert.equal((r.nodes.w2 as Worker).token, null);
  assert.ok(r.run.steps.filter((s) => s.kind === "deliver" && s.node === "w2" && s.msg?.type === "Busy").length >= 10);
  assert.equal(storageOf(r).writer, "w1");
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("expiry: a crashed holder's lease expires and the other worker takes over", () => {
  // w1's last renewal reaches the lock at t=20, just as w1 crashes, so its lease runs to t=30.
  const r = simulate({
    nodes: world(),
    seed: 2,
    until: 80,
    latency: [1, 1],
    faults: [{ at: 20, kind: "crash", node: "w1" }],
    invariant: noStaleWriteWins,
  });
  assert.equal(r.run.error, undefined);
  const g = grants(r);
  assert.equal(g.length, 2);
  assert.equal(g[1].to, "w2");
  assert.equal(g[1].token, 2);
  assert.ok(g[1].t > 30, `w2 was granted at t=${g[1].t}, before w1's lease ran out`);
  assert.equal((r.nodes.lock as LockService).holder, "w2");
  assert.equal(storageOf(r).writer, "w2");
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("fencing: a paused worker wakes up and writes with its old token; storage rejects it", () => {
  // w1 checks its lease at t=9 and freezes at t=10, before its write goes out. Its lease ends at
  // t=18, w2 gets token 2 and does its two writes, and w1 wakes at t=40 and sends the old write.
  const r = simulate({
    nodes: world(undefined, undefined, 2),
    seed: 3,
    until: 80,
    latency: [1, 1],
    clients: [pause(10, 30)],
    invariant: noStaleWriteWins,
  });
  assert.equal(r.run.error, undefined);
  assert.deepEqual(
    grants(r).map((g) => [g.to, g.token]),
    [
      ["w1", 1],
      ["w2", 2],
    ],
  );
  const late = r.run.steps.find((s) => s.kind === "deliver" && s.node === "storage" && s.t > 40 && s.msg?.from === "w1");
  assert.ok(late, "w1's late write reaches storage");
  assert.equal((late!.msg!.body as { token: number }).token, 1);
  assert.equal(storageOf(r).rejected, 1);
  assert.equal(storageOf(r).writer, "w2");
  assert.equal(storageOf(r).value, "w2:2");
  assert.equal(storageOf(r).highestToken, 2);
  assert.ok(r.run.steps.some((s) => s.kind === "deliver" && s.node === "w1" && s.msg?.type === "Rejected"));
  assert.equal((r.nodes.w1 as Worker).token, null);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("broken: lease without a fencing token — the paused worker overwrites newer data", () => {
  // The same run as "fencing", except that the storage takes every write it is sent.
  const r = simulate({
    nodes: world(undefined, () => new NoTokenCheck(), 2),
    seed: 3,
    until: 80,
    latency: [1, 1],
    clients: [pause(10, 30)],
    invariant: noStaleWriteWins,
  });
  assert.equal(r.run.error, undefined);
  assert.equal(storageOf(r).value, "w1:2");
  assert.equal(storageOf(r).writer, "w1");
  assert.equal(storageOf(r).token, 1);
  assert.equal(storageOf(r).highestToken, 2);
  assert.equal((r.nodes.lock as LockService).holder, "w2");
  assert.ok(r.run.steps.some((s) => s.violation?.startsWith("storage holds a write from token 1")));
});

test("broken: lock without a lease — a crashed holder blocks everyone forever", () => {
  const r = simulate({
    nodes: world(() => new LockForever()),
    seed: 5,
    until: 80,
    latency: [1, 1],
    faults: [{ at: 20, kind: "crash", node: "w1" }],
    invariant: noStaleWriteWins,
  });
  assert.equal(r.run.error, undefined);
  assert.equal(grants(r).length, 1);
  assert.equal((r.nodes.lock as LockService).holder, "w1");
  assert.equal(r.up.w1, false);
  assert.equal((r.nodes.w2 as Worker).token, null);
  assert.ok(r.run.steps.filter((s) => s.kind === "deliver" && s.node === "w2" && s.msg?.type === "Busy").length >= 10);
});
