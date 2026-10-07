/**
 * 019. Vector Clocks
 * Level: Staff
 * Group: Replication
 *
 * Problem: Any of several replicas may accept a write, so two clients can update the same key
 *   without seeing each other's change, on different replicas or on the same one. When versions
 *   meet, a replica must decide whether one replaces the other or whether both must be kept,
 *   and there is no shared clock to say which came first.
 *
 * Approach: Dotted version vectors with siblings
 *   A client reads the value together with a vector clock (one counter per replica), called
 *   its "context", and sends that context back with its write. The replica taking the write
 *   gives it a dot: its own name and the next number from its own write counter. A stored
 *   version keeps the dot and the client's context apart. Replicas gossip their versions. A
 *   version replaces another only if its context includes the other's dot, which means its
 *   writer had read the other. Otherwise both are kept as siblings until a client reads them
 *   and writes back a merge.
 *
 * Cost: one counter per replica plus one dot per stored value; comparing is O(replicas); a read
 *   can return several siblings, which the client must merge.
 *
 * Pattern: causality tracking (eventual consistency)
 * Key insight: The dot names the write; the context records which writes its writer had seen.
 *   If a writer's context includes another value's dot, it saw that value and may replace it.
 *   If neither includes the other's dot, neither writer saw the other, and only the
 *   application knows how to combine them.
 * Tradeoffs: Any replica can take writes, even during a partition, and a concurrent update is
 *   never silently lost (unlike last-write-wins). The price is metadata on every value and
 *   conflicts that every client has to know how to merge.
 * Staff notes: Vector clocks detect conflicts; they do not resolve them. CRDTs (data types
 *   such as counters and sets that come with a built-in merge) resolve them automatically.
 *   Last-write-wins is fine when losing one of two concurrent updates is acceptable, such as
 *   a cache entry or a "last seen" time. Keep one entry per replica, not per client, or the
 *   clock grows with the number of clients. A plain per-replica version vector (dot folded into
 *   the clock) mistakes two blind writes through the same replica for ordered ones and loses
 *   the first; in Dynamo-style stores one replica coordinates most writes for a key, so that
 *   is the common path, not a corner case. Keeping the dot apart fixes it. The Dynamo paper
 *   also trims the oldest clock entries past a size limit, at the price of comparisons that
 *   are no longer exact.
 * Interview signals: "multi-master", "writes in several regions", "always writable",
 *   "offline edits that sync later", "shopping cart", "detect concurrent updates",
 *   "conflict resolution".
 * Real world: Amazon's 2007 Dynamo paper used vector clocks and handed conflicting versions
 *   to the application to merge, with the shopping cart as its example. Riak returns
 *   siblings to clients when configured to, and later added dotted version vectors.
 *   Cassandra chose last-write-wins timestamps instead. The DynamoDB service is a different
 *   system from the paper and does not return siblings.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type ClientOp, type Ctx, type NodeId, type SimResult } from "../../kernel/sim.ts";

const GOSSIP_EVERY = 6;

// @why One counter per replica. Context {n1:2} means "had seen the first 2 writes that went through n1".
type Clock = Record<NodeId, number>;
// @why The name of one write: the replica that took it and that replica's count. n1:2 is the second write through n1.
type Dot = { node: NodeId; n: number };
// @why The dot says which write this is; the context says which writes its writer had seen. Kept apart, so one can't be mistaken for the other.
type Version = { value: string; dot: Dot; context: Clock };

/** True if clock `a` has seen everything `b` has: at least as big in every entry. */
export function covers(a: Clock, b: Clock): boolean {
  return Object.entries(b).every(([id, n]) => (a[id] ?? 0) >= n);
}

/** The smallest clock that covers both: the biggest of each entry. */
export function mergeClocks(...clocks: Clock[]): Clock {
  const out: Clock = {};
  for (const c of clocks) for (const [id, n] of Object.entries(c)) out[id] = Math.max(out[id] ?? 0, n);
  return out;
}

/** True if a writer whose context is `context` had seen the write named `dot`. */
export const includes = (context: Clock, dot: Dot) => (context[dot.node] ?? 0) >= dot.n;
/** A value's whole clock: what its writer had seen, plus the write itself. */
export const clockOf = (v: Version): Clock => mergeClocks(v.context, { [v.dot.node]: v.dot.n });
const sameDot = (a: Dot, b: Dot) => a.node === b.node && a.n === b.n;

export const showClock = (c: Clock) =>
  `{${Object.keys(c)
    .sort()
    .map((id) => `${id}:${c[id]}`)
    .join(", ")}}`;
const showDot = (d: Dot) => `${d.node}:${d.n}`;
const showVersion = (v: Version) => `${v.value} ${showClock(clockOf(v))}`;

// @why Every replica runs this same code, and any of them accepts writes; no replica puts the others' writes in one order.
export class VClockReplica extends SimNode {
  // @why On disk, so a restart does not forget values, or the dots this replica has already handed out.
  static durable = ["siblings", "counter", "everHeld", "clientSaw"];
  // @why Every value no stored writer had seen. One entry normally; more than one means concurrent writes the client must merge.
  siblings: Version[] = [];
  // @why How many writes this replica has taken. Each new write gets the next number as its dot, so no two writes share a dot.
  counter = 0;
  // @why Only for the lost-update check: every version this replica has accepted.
  everHeld: Version[] = [];
  // @why Only for the lost-update check: for each write stamped here, the context its client actually sent.
  clientSaw: Record<string, Clock> = {};
  firstGossip: number;

  constructor(firstGossip: number) {
    super();
    // @why Lets a scenario stagger when each replica first gossips, so the story plays out the same way every run.
    this.firstGossip = firstGossip;
  }

  state() {
    const vals = this.siblings.map((v) => v.value);
    const summary =
      vals.length === 0
        ? "empty"
        : vals.length === 1
          ? `holds ${vals[0]} · clock ${showClock(clockOf(this.siblings[0]))}`
          : `${vals.length} siblings: ${vals.join(" | ")} · waiting for a merge`;
    return {
      role: "copy",
      summary,
      values: this.siblings.map((v) => v.value),
      dots: this.siblings.map((v) => showDot(v.dot)),
      clocks: this.siblings.map((v) => showClock(clockOf(v))),
    };
  }

  // @why Without a timer, a write would stay on the one replica that took it.
  onStart(ctx: Ctx) {
    ctx.setTimer("Gossip", this.firstGossip);
  }

  // @why Hand back every sibling and one clock that covers them all: the client needs that clock to say "I saw all of these" when it writes.
  onRead(ctx: Ctx, _body: unknown, from: NodeId) {
    const values = this.siblings.map((v) => v.value).sort();
    const context = mergeClocks(...this.siblings.map(clockOf));
    ctx.say(
      values.length
        ? `A client reads from ${ctx.id} and gets ${values.join(" and ")}, plus the context ${showClock(context)}: a note of which writes it has now seen. It must send this back with its next write`
        : `A client reads from ${ctx.id} and gets nothing yet, with an empty context {}. Any write it makes next has seen nothing`,
    );
    ctx.send(from, "ReadResult", { values, context });
  }

  // @why `context` is the clock the client read. It records what the writer actually saw, not what this replica happens to hold.
  onWrite(ctx: Ctx, body: { value: string; context: Clock }, from: NodeId) {
    const v = this.stamp(ctx, body.value, body.context);
    this.clientSaw[showDot(v.dot)] = body.context;
    this.keep(ctx, v);
    ctx.send(from, "WriteAck", { dot: v.dot, clock: clockOf(v) });
  }

  // @why Push every sibling to every peer, again and again. A peer that missed one round, or was down, catches up on the next.
  onGossip(ctx: Ctx) {
    if (this.siblings.length) {
      for (const peer of ctx.peers) ctx.send(peer, "Sync", { versions: this.siblings });
      ctx.say(`${ctx.id} gossips: it sends ${this.siblings.map((v) => v.value).join(" and ")} to ${ctx.peers.join(" and ")}, so every copy ends up with every write`);
    } else ctx.say(`${ctx.id} has nothing to share yet`);
    ctx.setTimer("Gossip", GOSSIP_EVERY);
  }

  onSync(ctx: Ctx, body: { versions: Version[] }, from: NodeId) {
    // Narration only: notice whether keep() had anything to say.
    let said = false;
    const c: Ctx = { ...ctx, say: (text) => ((said = true), ctx.say(text)) };
    for (const v of body.versions) this.keep(c, v);
    if (!said) ctx.say(`${ctx.id} already has everything ${from} sent (${body.versions.map((v) => v.value).join(" and ")}), so nothing changes`);
  }

  // @why A fresh dot for every write, kept apart from the client's context, so the version says both "which write" and "what its writer saw".
  protected stamp(ctx: Ctx, value: string, context: Clock): Version {
    const v: Version = { value, dot: { node: ctx.id, n: ++this.counter }, context };
    ctx.say(
      `A client writes ${value} to ${ctx.id}. ${ctx.id} names this write ${showDot(v.dot)} (its write number ${v.dot.n}) and keeps the client's context ${showClock(context)}${Object.keys(context).length ? ", which says what the client had read" : ": the client had read nothing first"}`,
    );
    return v;
  }

  // @why The one test for "may replace": the newer writer's context includes the older write's dot. A client's context only includes writes it read.
  protected hasSeen(later: Version, earlier: Version): boolean {
    return includes(later.context, earlier.dot);
  }

  protected why(later: Version, earlier: Version[]): string {
    return `its writer's context ${showClock(later.context)} includes ${earlier.map((s) => showDot(s.dot)).join(" and ")}, so the writer had seen ${earlier.length > 1 ? "them" : "it"} and chose to change ${earlier.length > 1 ? "them" : "it"}`;
  }

  // @why The whole decision: replace only what the new writer had seen, ignore what a stored writer had seen, and keep both otherwise.
  protected keep(ctx: Ctx, v: Version) {
    // @why The same dot is the same write arriving again.
    if (this.siblings.some((s) => sameDot(s.dot, v.dot))) return;
    const newer = this.siblings.find((s) => this.hasSeen(s, v));
    if (newer) return ctx.say(`${ctx.id} ignores the older ${showVersion(v)} that arrived: it already holds ${showVersion(newer)}, whose writer had seen it`);
    const replaced = this.siblings.filter((s) => this.hasSeen(v, s));
    const concurrent = this.siblings.filter((s) => !this.hasSeen(v, s));
    // @why Only a value whose writer saw yours may replace it: that writer chose to change it.
    this.siblings = [...concurrent, v];
    this.everHeld.push(v);
    if (replaced.length) ctx.say(`${ctx.id} replaces ${replaced.map(showVersion).join(" and ")} with ${showVersion(v)}: ${this.why(v, replaced)}`);
    else if (concurrent.length)
      ctx.say(
        `good: ${ctx.id} keeps ${showVersion(v)} next to ${concurrent.map(showVersion).join(" and ")}. Neither writer had seen the other's write, so both are kept as siblings for a client to merge. Nothing is lost`,
      );
    else ctx.say(`${ctx.id} stores ${showVersion(v)}`);
  }
}

// @why Checked after every event: a replica may drop a value only for one whose client had really seen it. Anything else is a silently lost update.
// It trusts what each client sent, not the clocks the replicas computed, so a replica that stamps a wrong clock is caught too.
export function noUpdateLostSilently(nodes: Record<NodeId, SimNode>): string | null {
  const saw: Record<string, Clock> = {};
  for (const node of Object.values(nodes)) Object.assign(saw, (node as VClockReplica).clientSaw);
  const sawOf = (v: Version) => saw[showDot(v.dot)] ?? v.context;
  for (const [id, node] of Object.entries(nodes)) {
    const r = node as VClockReplica;
    const lost = r.everHeld.find((h) => !r.siblings.some((s) => sameDot(s.dot, h.dot) || includes(sawOf(s), h.dot)));
    if (lost) return `${id} dropped ${lost.value} (dot ${showDot(lost.dot)}), though no writer of a value it still holds had seen it`;
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: keeps whichever value arrived last and throws the other away.
class LastArrivalWins extends VClockReplica {
  protected keep(ctx: Ctx, v: Version) {
    if (this.siblings.some((s) => sameDot(s.dot, v.dot))) return;
    const gone = this.siblings.filter((s) => s.value !== v.value);
    this.siblings = [v];
    this.everHeld.push(v);
    ctx.say(
      gone.length
        ? `bad: ${ctx.id} overwrites ${gone.map((s) => s.value).join(" and ")} with ${v.value}, just because ${v.value} arrived last. The user who wrote ${gone.map((s) => s.value).join(" and ")} was told "saved", and the change is now silently gone here`
        : `${ctx.id} stores ${v.value}`,
    );
  }
}

type Timed = Version & { ts: number };

// Broken on purpose: stamps each write with its own wall clock and keeps only the latest timestamp.
class LastTimestampWins extends VClockReplica {
  offset: number;
  constructor(firstGossip: number, offset: number) {
    super(firstGossip);
    this.offset = offset;
  }
  protected stamp(ctx: Ctx, value: string, context: Clock): Version {
    const ts = ctx.now + this.offset;
    ctx.say(
      `A client writes ${value} to ${ctx.id}. ${ctx.id}'s wall clock reads ${ts}, so ${value} gets timestamp ${ts}${this.offset < 100 ? ` (this clock runs ${100 - this.offset} ticks behind the others)` : ""}`,
    );
    const v: Timed = { value, dot: { node: ctx.id, n: ++this.counter }, context, ts };
    return v;
  }
  protected keep(ctx: Ctx, v: Version) {
    if (this.siblings.some((s) => sameDot(s.dot, v.dot))) return;
    this.everHeld.push(v);
    const t = v as Timed;
    const cur = this.siblings[0] as Timed | undefined;
    if (!cur || t.ts > cur.ts) {
      this.siblings = [t];
      ctx.say(cur ? `${ctx.id} replaces ${cur.value} (timestamp ${cur.ts}) with ${t.value} (timestamp ${t.ts}): the later timestamp wins` : `${ctx.id} stores ${t.value} (timestamp ${t.ts})`);
    } else
      ctx.say(
        includes(t.context, cur.dot)
          ? `bad: ${ctx.id} keeps ${cur.value} (timestamp ${cur.ts}) and throws away ${t.value} (timestamp ${t.ts}), because the later timestamp wins. But ${t.value} is the newer write: its writer had read ${cur.value}. A slow clock just erased the user's latest change`
          : `bad: ${ctx.id} keeps ${cur.value} (timestamp ${cur.ts}) and throws away ${t.value} (timestamp ${t.ts}), because the later timestamp wins. One of two concurrent writes is silently lost`,
      );
  }
}

// Broken on purpose: stamps a write with everything the replica holds, not what the writer read.
class ServerClock extends VClockReplica {
  protected stamp(ctx: Ctx, value: string, context: Clock): Version {
    const all = mergeClocks(context, ...this.siblings.map(clockOf));
    const v: Version = { value, dot: { node: ctx.id, n: ++this.counter }, context: all };
    if (showClock(all) === showClock(context))
      ctx.say(`A client writes ${value} to ${ctx.id}. ${ctx.id} names it ${showDot(v.dot)}, with context ${showClock(all)}: everything ${ctx.id} holds, which so far matches what the client had seen`);
    else
      ctx.say(
        `bad: A client writes ${value} to ${ctx.id}. ${ctx.id} names it ${showDot(v.dot)} but gives it the context ${showClock(all)}, everything ${ctx.id} holds, though the client had seen only ${showClock(context)}. The stamp now claims the writer saw values it never read`,
      );
    return v;
  }
  protected why(later: Version, earlier: Version[]): string {
    return `its stamped context ${showClock(later.context)} includes ${earlier.map((s) => showDot(s.dot)).join(" and ")}, so it looks as if the writer had seen ${earlier.length > 1 ? "them" : "it"}, though the client never read ${earlier.map((s) => s.value).join(" or ")}`;
  }
}

// Broken on purpose: a plain version vector. It merges the dot into one clock and replaces whatever that clock covers.
class NoDot extends VClockReplica {
  protected hasSeen(later: Version, earlier: Version): boolean {
    return covers(clockOf(later), clockOf(earlier));
  }
  protected why(later: Version, earlier: Version[]): string {
    return `its one merged clock ${showClock(clockOf(later))} covers ${earlier.map((s) => showClock(clockOf(s))).join(" and ")}, so it looks as if its writer had seen ${earlier.length > 1 ? "them" : "it"}, though nobody checked`;
  }
}

const FIRST_GOSSIP: Record<NodeId, number> = { n1: 3, n2: 5, n3: 7 };
const cluster = (make = (first: number, _id: NodeId): VClockReplica => new VClockReplica(first)) =>
  Object.fromEntries(Object.entries(FIRST_GOSSIP).map(([id, first]) => [id, () => make(first, id)]));
const write = (at: number, to: NodeId, value: string, context: Clock = {}): ClientOp => ({ at, to, type: "Write", body: { value, context } });
const read = (at: number, to: NodeId): ClientOp => ({ at, to, type: "Read", body: {} });
const valuesOn = (r: SimResult, id: NodeId) => (r.nodes[id] as VClockReplica).siblings.map((v) => v.value).sort();
const run = (clients: ClientOp[], until: number, make?: (first: number, id: NodeId) => VClockReplica) =>
  simulate({ nodes: cluster(make), seed: 1, until, latency: [1, 1], clients, invariant: noUpdateLostSilently });
const ids = ["n1", "n2", "n3"];
const lost = (r: SimResult, prefix: string) => r.run.steps.some((s) => s.violation?.startsWith(prefix));

test("sequential: a write that saw the previous one replaces it everywhere", () => {
  // A client writes milk on n1, later reads it from n2 (getting context {n1:1}), and writes
  // "milk, eggs" back to n2 with that context.
  const r = run([write(1, "n1", "milk"), read(6, "n2"), write(8, "n2", "milk, eggs", { n1: 1 })], 20);
  assert.equal(r.run.error, undefined);
  const result = r.inbox.find((m) => m.type === "ReadResult")!;
  assert.deepEqual(result.body, { values: ["milk"], context: { n1: 1 } });
  for (const id of ids) {
    assert.deepEqual((r.nodes[id] as VClockReplica).siblings, [{ value: "milk, eggs", dot: { node: "n2", n: 1 }, context: { n1: 1 } }], id);
  }
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("concurrent: writes on two replicas without seeing each other become siblings", () => {
  const r = run([write(1, "n1", "milk"), write(2, "n2", "eggs")], 20);
  assert.equal(r.run.error, undefined);
  for (const id of ids) assert.deepEqual(valuesOn(r, id), ["eggs", "milk"], id);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("resolve: a client reads both siblings and writes a merged value that replaces them", () => {
  const r = run([write(1, "n1", "milk"), write(2, "n2", "eggs"), read(10, "n3"), write(12, "n3", "eggs, milk", { n1: 1, n2: 1 })], 25);
  assert.equal(r.run.error, undefined);
  const result = r.inbox.find((m) => m.type === "ReadResult")!;
  assert.deepEqual(result.body, { values: ["eggs", "milk"], context: { n1: 1, n2: 1 } });
  for (const id of ids) {
    assert.deepEqual((r.nodes[id] as VClockReplica).siblings, [{ value: "eggs, milk", dot: { node: "n3", n: 1 }, context: { n1: 1, n2: 1 } }], id);
  }
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("stale read: a write based on an old read becomes a sibling, not an overwrite", () => {
  // The second client reads n2 at t=2, before milk has reached it, so its context is empty.
  // Its later write of eggs has not seen milk, and must not replace it.
  const r = run([write(1, "n1", "milk"), read(2, "n2"), write(6, "n2", "eggs", {})], 20);
  assert.equal(r.run.error, undefined);
  const result = r.inbox.find((m) => m.type === "ReadResult")!;
  assert.deepEqual(result.body, { values: [], context: {} });
  for (const id of ids) assert.deepEqual(valuesOn(r, id), ["eggs", "milk"], id);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("blind writes through one replica: both are kept as siblings", () => {
  // Two clients that never read write milk and then eggs, both through n1.
  const r = run([write(1, "n1", "milk"), write(2, "n1", "eggs")], 20);
  assert.equal(r.run.error, undefined);
  for (const id of ids) assert.deepEqual(valuesOn(r, id), ["eggs", "milk"], id);
  const n1 = (r.nodes.n1 as VClockReplica).siblings;
  assert.deepEqual(n1.map((v) => showDot(v.dot)).sort(), ["n1:1", "n1:2"]);
  assert.ok(!r.run.steps.some((s) => s.violation));
});

test("broken: last write wins by arrival — a concurrent update silently disappears", () => {
  const r = run([write(1, "n1", "milk"), write(2, "n2", "eggs")], 20, (first) => new LastArrivalWins(first));
  assert.equal(r.run.error, undefined);
  // The client was told eggs was stored...
  assert.ok(r.inbox.some((m) => m.type === "WriteAck" && m.from === "n2"));
  // ...but no replica has it any more.
  for (const id of ids) assert.deepEqual(valuesOn(r, id), ["milk"], id);
  assert.ok(lost(r, "n2 dropped eggs"));
});

test("broken: last write wins by timestamp — n2's wall clock runs behind, so a newer write is thrown away", () => {
  // n2's wall clock is 10 ticks behind n1's. A client reads milk from n2 and writes "milk, eggs"
  // back: the newer write, which saw milk. Its timestamp is still lower than milk's.
  const offsets: Record<NodeId, number> = { n1: 100, n2: 90, n3: 100 };
  const r = run([write(1, "n1", "milk"), read(6, "n2"), write(8, "n2", "milk, eggs", { n1: 1 })], 20, (first, id) => new LastTimestampWins(first, offsets[id]));
  assert.equal(r.run.error, undefined);
  assert.ok(r.inbox.some((m) => m.type === "WriteAck" && m.from === "n2"));
  for (const id of ids) assert.deepEqual(valuesOn(r, id), ["milk"], id);
  assert.ok(lost(r, "n2 dropped milk, eggs"));
});

test("broken: server's clock instead of the client's context — an update the writer never saw is overwritten", () => {
  // Same history as "stale read", but n2 stamps eggs as if the writer had seen milk.
  const r = run([write(1, "n1", "milk"), read(2, "n2"), write(6, "n2", "eggs", {})], 20, (first) => new ServerClock(first));
  assert.equal(r.run.error, undefined);
  for (const id of ids) assert.deepEqual(valuesOn(r, id), ["eggs"], id);
  // The stored clock claims eggs saw milk; only the client's real context shows it did not.
  assert.deepEqual(clockOf((r.nodes.n1 as VClockReplica).siblings[0]), { n1: 1, n2: 1 });
  assert.ok(lost(r, "n2 dropped milk"));
});

test("broken: no dot — blind writes through one replica look ordered, and milk is lost", () => {
  // Same history as "blind writes", but each value keeps one merged clock: eggs gets {n1:2},
  // which covers milk's {n1:1}, although eggs' writer never saw milk.
  const r = run([write(1, "n1", "milk"), write(2, "n1", "eggs")], 20, (first) => new NoDot(first));
  assert.equal(r.run.error, undefined);
  assert.equal(r.inbox.filter((m) => m.type === "WriteAck").length, 2);
  for (const id of ids) assert.deepEqual(valuesOn(r, id), ["eggs"], id);
  assert.ok(lost(r, "n1 dropped milk"));
});
