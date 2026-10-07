/**
 * 022. Gossip Failure Detection (SWIM)
 * Level: Staff
 * Group: Replication
 *
 * Problem: Every node in a cluster needs to know which other nodes are still alive, so it
 *   can stop sending them work. Having every node heartbeat every other node costs n²
 *   messages per interval, and a single bad network link makes a healthy node look dead.
 *
 * Approach: SWIM (random probes, indirect probes, suspicion, gossip)
 *   Each round, every node pings one peer, walking through its peers in a shuffled order.
 *   If no ack comes back in time, it asks k other nodes to ping that peer on its behalf.
 *   If none of them gets an ack either, the peer becomes "suspect". A suspect that does not
 *   prove it is alive within a suspicion timeout becomes "dead". Every change is spread by
 *   riding along on the pings and acks that are sent anyway, and a node that hears it is
 *   suspected answers by raising its incarnation number and spreading "alive".
 *
 * Cost: O(n) messages per round for the whole cluster (a constant per node); news reaches
 *   everyone in O(log n) rounds; detection takes a probe round plus the suspicion timeout.
 *
 * Pattern: failure detection, epidemic (gossip) dissemination
 * Key insight: Separate noticing a failure from telling everyone about it. Noticing needs
 *   only one random probe per node per round, and indirect probes check the peer along other
 *   network paths. Telling everyone is free, because the news rides on probe traffic.
 *   Suspicion plus incarnation numbers lets a falsely accused node clear its own name.
 * Tradeoffs: A longer suspicion timeout means fewer healthy nodes declared dead but slower
 *   detection of real crashes. More indirect helpers make false positives rarer at the
 *   price of more messages per failed probe. Membership is eventually consistent: for a
 *   while, different nodes disagree about who is alive.
 * Staff notes: Failure detectors can never be perfect on an asynchronous network: a slow
 *   node and a dead one look the same. A node that was declared dead must rejoin with a new
 *   incarnation or identity. HashiCorp's Lifeguard extensions make a node that is itself
 *   overloaded slower to accuse others. Phi-accrual detectors output a suspicion level from
 *   heartbeat arrival history instead of a yes/no timeout. Membership from gossip is good
 *   for routing and load balancing, but it is not consensus: never use it alone to pick a
 *   single leader or lock owner (see 020 and 023).
 * Interview signals: "cluster membership", "detect dead nodes", "thousands of nodes",
 *   "no central coordinator", "peer-to-peer", "heartbeats don't scale", "service discovery".
 * Real world: HashiCorp's memberlist library implements SWIM with extensions, and Serf and
 *   Consul use it for membership and failure detection. Cassandra spreads cluster state by
 *   gossip and uses a phi-accrual failure detector.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type Ctx, type Fault, type NodeId, type SimResult } from "../../kernel/sim.ts";

// Messages take 1–2 ticks in the scenarios, so a direct ack takes at most 4 and a relayed one
// at most 8. A probe (direct wait plus indirect wait) always finishes inside one period.
const PERIOD = 15;
const ACK_TIMEOUT = 5;
const INDIRECT_TIMEOUT = 9;
// Four rounds, the same multiple memberlist uses by default for a small cluster. A refutation
// needs a round or two to reach the suspect and a round or two to spread back; with only two
// rounds, about a quarter of slow-node runs ended with the healthy node declared dead.
const SUSPICION_TIMEOUT = 4 * PERIOD;
const HELPERS = 2;
// Each piece of news rides on this many messages. Fewer, and a refutation can die out before
// it reaches every node that holds the suspicion.
const RETRANSMIT = 5;

type Status = "alive" | "suspect" | "dead";
type Member = { status: Status; inc: number; suspectedAt: number };
type Update = { node: NodeId; status: Status; inc: number };
type News = Update & { left: number };

// @why Every node runs this same code. Each one keeps its own opinion of who is alive; nobody is in charge.
export class SwimNode extends SimNode {
  // @why This node's view of every other node. Views differ for a while, and gossip makes them agree.
  members: Record<NodeId, Member> = {};
  // @why A counter only this node may raise. A bigger number about a node always beats an older rumour about it.
  incarnation = 0;
  // @why Recent changes still to be passed on, each with how many more messages it should ride on.
  news: News[] = [];
  // @why Peers left to probe in this pass. Every live peer is probed once per pass, so a crash is noticed within one pass.
  order: NodeId[] = [];
  // @why The probe under way: who, which ping number, and whether helpers were asked yet. Null once it ends.
  probe: { target: NodeId; seq: number; helpers: boolean } | null = null;
  // @why Numbers pings, so a late ack from an older probe is never mistaken for an answer to this one.
  seq = 0;
  // @why Pings sent on someone else's behalf: the ack for my ping number goes back to them under theirs.
  relays: Record<number, { to: NodeId; seq: number }> = {};
  firstProbe: number | null;

  constructor(firstProbe: number | null = null) {
    super();
    // @why Lets a scenario spread the first probes out, so each run tells the same story.
    this.firstProbe = firstProbe;
  }

  state() {
    const view: Record<NodeId, string> = {};
    for (const [id, m] of Object.entries(this.members)) view[id] = m.inc ? `${m.status} #${m.inc}` : m.status;
    return {
      incarnation: this.incarnation,
      view,
      probe: this.probe ? `${this.probe.target}, waiting for ${this.probe.helpers ? "helpers" : "ack"}` : "none",
      news: this.news.map((n) => `${n.node} ${n.status}${n.inc ? ` #${n.inc}` : ""}`),
      role: "member",
      summary: this.summary(),
    };
  }

  // @why The picture's words under this node: whom it doubts, and what it is checking right now.
  private summary() {
    const ids = (st: Status) => Object.keys(this.members).filter((id) => this.members[id].status === st);
    const parts: string[] = [];
    if (ids("suspect").length) parts.push(`suspects ${ids("suspect").join(", ")}`);
    if (ids("dead").length) parts.push(`thinks ${ids("dead").join(", ")} dead`);
    if (!parts.length) parts.push("all others look alive");
    if (this.probe) parts.push(`checking ${this.probe.target}${this.probe.helpers ? " via helpers" : ""}`);
    if (this.incarnation) parts.push(`proved alive (#${this.incarnation})`);
    return parts.slice(0, 2).join(" · ");
  }

  // @why Everyone starts from the same member list and believes all of it is alive.
  onStart(ctx: Ctx) {
    for (const peer of ctx.peers) this.members[peer] = { status: "alive", inc: 0, suspectedAt: 0 };
    ctx.setTimer("Probe", (ctx.now === 0 ? this.firstProbe : null) ?? 1 + Math.floor(ctx.rand() * PERIOD));
  }

  // @why One probe per node per round: the cost per node stays constant however big the cluster gets.
  onProbe(ctx: Ctx) {
    ctx.setTimer("Probe", PERIOD);
    // @why Suspects are checked once a round: one that stayed silent for the whole suspicion timeout is now dead.
    this.expireSuspects(ctx);
    const target = this.nextTarget(ctx);
    if (!target) return;
    this.probe = { target, seq: ++this.seq, helpers: false };
    ctx.say(`${ctx.id} checks on ${target}: "are you alive?" (a ping)`);
    ctx.send(target, "Ping", { seq: this.seq, updates: this.outgoing() });
    ctx.setTimer("PingTimeout", ACK_TIMEOUT);
  }

  // @why Answering proves this node is alive; the ack also carries news back the other way.
  onPing(ctx: Ctx, body: { seq: number; updates: Update[] }, from: NodeId) {
    this.merge(ctx, body.updates);
    const updates = this.outgoing();
    ctx.say(`${ctx.id} answers ${from}: "I'm alive"${updates.length ? `, and passes on news: ${newsText(updates)}` : ""}`);
    ctx.send(from, "Ack", { seq: body.seq, updates });
  }

  onAck(ctx: Ctx, body: { seq: number; updates: Update[] }, from: NodeId) {
    this.merge(ctx, body.updates);
    // @why An ack for a ping this node sent as a helper: pass it back to whoever asked.
    const relay = this.relays[body.seq];
    if (relay) {
      delete this.relays[body.seq];
      ctx.say(`${ctx.id} got ${from}'s reply and passes it back to ${relay.to}`);
      return ctx.send(relay.to, "Ack", { seq: relay.seq, updates: this.outgoing() });
    }
    // @why Only an ack for the current probe counts; an old one says nothing about the peer right now.
    if (!this.probe || this.probe.seq !== body.seq) return ctx.say(`${ctx.id} gets a late reply from ${from}; that check is already over`);
    const { target } = this.probe;
    // @why The probe is over: the peer is alive. Later acks for the same ping number are ignored.
    this.probe = null;
    ctx.cancelTimer("PingTimeout");
    ctx.cancelTimer("IndirectTimeout");
    ctx.say(
      from === target
        ? `good: ${ctx.id} hears back from ${target}: it is alive`
        : `good: ${ctx.id} hears, through ${from}, that ${target} is alive. Only the direct path was bad`,
    );
  }

  // @why No direct ack may just mean the link between us is bad. Ask others to try along their own paths.
  onPingTimeout(ctx: Ctx) {
    const probe = this.probe!;
    const helpers = this.pick(
      ctx,
      Object.keys(this.members).filter((id) => id !== probe.target && this.members[id].status !== "dead"),
      HELPERS,
    );
    if (!helpers.length) return this.probeFailed(ctx);
    probe.helpers = true;
    ctx.say(`${ctx.id} got no reply from ${probe.target}. Maybe only the wire between them is bad, so it asks ${helpers.join(" and ")} to try`);
    for (const h of helpers) ctx.send(h, "PingReq", { target: probe.target, seq: probe.seq, updates: this.outgoing() });
    ctx.setTimer("IndirectTimeout", INDIRECT_TIMEOUT);
  }

  // @why A helper pings the target with its own ping number and remembers whom the ack is really for.
  onPingReq(ctx: Ctx, body: { target: NodeId; seq: number; updates: Update[] }, from: NodeId) {
    this.merge(ctx, body.updates);
    this.relays[++this.seq] = { to: from, seq: body.seq };
    ctx.say(`${ctx.id} pings ${body.target} for ${from}, along a different path`);
    ctx.send(body.target, "Ping", { seq: this.seq, updates: this.outgoing() });
  }

  // @why Nobody, along any path, got an answer. Still not proof of death, so only suspect it.
  onIndirectTimeout(ctx: Ctx) {
    ctx.say(`${ctx.id} got no reply from ${this.probe!.target}, not even through helpers`);
    this.probeFailed(ctx);
  }

  // @why The probe ends without an ack: suspect the target and clear the probe.
  protected probeFailed(ctx: Ctx) {
    const target = this.probe!.target;
    this.probe = null;
    this.suspect(ctx, target);
  }

  protected suspect(ctx: Ctx, id: NodeId) {
    const m = this.members[id];
    if (m.status !== "alive") return ctx.say(`${ctx.id} already ${m.status === "dead" ? "lists" : "suspects"} ${id}${m.status === "dead" ? " as dead" : ""}`);
    ctx.say(`${ctx.id} now suspects ${id} is dead, but gives it ${SUSPICION_TIMEOUT} ticks to prove it is alive`);
    this.apply(ctx, { node: id, status: "suspect", inc: m.inc });
  }

  protected declareDead(ctx: Ctx, id: NodeId) {
    const m = this.members[id];
    if (m.status === "dead") return;
    ctx.say(`${ctx.id} declares ${id} dead and stops sending it work`);
    this.apply(ctx, { node: id, status: "dead", inc: m.inc });
  }

  // @why A suspect gets SUSPICION_TIMEOUT ticks to refute. A slow node usually manages; a crashed one never does.
  private expireSuspects(ctx: Ctx) {
    for (const [id, m] of Object.entries(this.members)) {
      if (m.status === "suspect" && ctx.now - m.suspectedAt >= SUSPICION_TIMEOUT) {
        ctx.say(`${ctx.id} has heard no "I'm alive" from ${id} in ${ctx.now - m.suspectedAt} ticks`);
        this.declareDead(ctx, id);
      }
    }
  }

  // @why Updates from any message are applied by the same rules, so it does not matter which path news took.
  protected merge(ctx: Ctx, updates: Update[]) {
    for (const u of updates) {
      if (u.node === ctx.id) {
        this.hearAboutMe(ctx, u);
        continue;
      }
      const m = this.members[u.node];
      if (!m || !this.overrides(u, m)) continue;
      ctx.say(
        u.status === "alive"
          ? `good: ${ctx.id} hears by gossip that ${u.node} proved it is alive (#${u.inc}), and stops suspecting it`
          : `${ctx.id} hears by gossip that ${u.node} is ${u.status === "dead" ? "dead" : "suspected"}`,
      );
      this.apply(ctx, u);
    }
  }

  // @why Only the accused can clear its name: a bigger incarnation beats every rumour about the old one.
  private hearAboutMe(ctx: Ctx, u: Update) {
    if (u.status === "alive" || u.inc < this.incarnation) return;
    if (u.status === "dead") return ctx.say(`bad: ${ctx.id} hears it was declared dead, though it is running. It would have to rejoin`);
    this.incarnation = u.inc + 1;
    ctx.say(`good: ${ctx.id} hears it is suspected and spreads "I'm alive", with a new number (#${this.incarnation}) that beats the rumour`);
    this.addNews({ node: ctx.id, status: "alive", inc: this.incarnation });
  }

  // @why The precedence rules. Dead is final. Otherwise a newer incarnation wins, and at the same incarnation suspect beats alive.
  private overrides(u: Update, m: Member) {
    if (m.status === "dead") return false;
    if (u.status === "dead") return true;
    if (u.status === "suspect") return u.inc > m.inc || (u.inc === m.inc && m.status === "alive");
    return u.inc > m.inc;
  }

  // @why A change is recorded here and queued to be passed on, so whoever learns news also spreads it.
  private apply(ctx: Ctx, u: Update) {
    const m = this.members[u.node];
    if (u.status === "suspect" && m.status !== "suspect") m.suspectedAt = ctx.now;
    m.status = u.status;
    m.inc = u.inc;
    this.addNews(u);
  }

  private addNews(u: Update) {
    this.news = [...this.news.filter((n) => n.node !== u.node), { ...u, left: RETRANSMIT }];
  }

  // @why News rides on messages sent anyway, a few times each. Every node that hears it repeats it, so it spreads like an epidemic.
  protected outgoing(): Update[] {
    const out = this.news.map(({ node, status, inc }) => ({ node, status, inc }));
    for (const n of this.news) n.left--;
    this.news = this.news.filter((n) => n.left > 0);
    return out;
  }

  // @why A shuffled pass over the live peers: random, so probes don't pile onto one node, yet every peer gets its turn.
  private nextTarget(ctx: Ctx): NodeId | undefined {
    const live = (id: NodeId) => this.members[id]?.status !== "dead";
    this.order = this.order.filter(live);
    if (!this.order.length) this.order = this.pick(ctx, Object.keys(this.members).filter(live), Infinity);
    return this.order.shift();
  }

  private pick(ctx: Ctx, from: NodeId[], k: number): NodeId[] {
    const pool = [...from];
    const out: NodeId[] = [];
    while (pool.length && out.length < k) out.push(pool.splice(Math.floor(ctx.rand() * pool.length), 1)[0]);
    return out;
  }

}

const newsText = (us: Update[]) => us.map((u) => `${u.node} ${u.status === "suspect" ? "suspected" : u.status}`).join(", ");

// @why Accuracy, checked after every event: no running node is listed as dead. SWIM makes a false death rare, not impossible.
export function noLiveNodeDeclaredDead(nodes: Record<NodeId, SimNode>, up: Record<NodeId, boolean>): string | null {
  for (const [observer, node] of Object.entries(nodes)) {
    if (!up[observer]) continue;
    for (const [subject, m] of Object.entries((node as SwimNode).members)) {
      if (m.status === "dead" && up[subject]) return `${observer} lists ${subject} as dead, but ${subject} is running`;
    }
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: the first idea only. One missed direct ack and the peer is dead: no helpers, no suspicion.
class DirectPingsOnly extends SwimNode {
  onPingTimeout(ctx: Ctx) {
    const target = this.probe!.target;
    this.probe = null;
    ctx.say(`bad: ${ctx.id} got no reply from ${target}, asks nobody else, and throws it out at once. One bad wire can remove a healthy server`);
    this.declareDead(ctx, target);
  }
}

// Broken on purpose: no indirect probes. Suspicion and refutation still work, but one missed direct ack is enough to suspect.
class NoIndirectProbes extends SwimNode {
  onPingTimeout(ctx: Ctx) {
    ctx.say(`bad: ${ctx.id} got no reply from ${this.probe!.target} and asks nobody else to check, so one bad wire is enough to suspect it`);
    this.probeFailed(ctx);
  }
}

// Broken on purpose: when the indirect probes fail too, the peer is dead at once, with no chance to refute.
class NoSuspicion extends SwimNode {
  onIndirectTimeout(ctx: Ctx) {
    const target = this.probe!.target;
    this.probe = null;
    ctx.say(`bad: ${ctx.id} got no reply from ${target}, even through helpers, and declares it dead at once, with no chance to prove it is alive`);
    this.declareDead(ctx, target);
  }
}

// Broken on purpose: messages carry no news, so whatever a node learns stays with it.
class NoGossip extends SwimNode {
  protected outgoing() {
    return [];
  }
  protected declareDead(ctx: Ctx, id: NodeId) {
    super.declareDead(ctx, id);
    ctx.say(`bad: but its messages carry no news, so nobody else hears it. They keep sending ${id} work until each finds out alone`);
  }
}

// Probes start spread out, so the rounds are easy to follow.
const FIRST: Record<NodeId, number> = { n1: 2, n2: 5, n3: 8, n4: 11, n5: 14 };
const cluster = (make = (first: number | null) => new SwimNode(first)) =>
  Object.fromEntries(Object.keys(FIRST).map((id) => [id, () => make(FIRST[id])]));
const statusOf = (r: SimResult, observer: NodeId, subject: NodeId) => (r.nodes[observer] as SwimNode).members[subject]?.status;
const liveOthers = (r: SimResult, subject: NodeId) => Object.keys(r.nodes).filter((id) => id !== subject && r.up[id]);
const everListed = (r: SimResult, subject: NodeId, status: Status) =>
  r.run.steps.some((s) => Object.entries(s.nodes).some(([id, v]) => id !== subject && (v.state.view as Record<string, string>)?.[subject]?.startsWith(status)));
const violated = (r: SimResult) => r.run.steps.some((s) => s.violation);

// n4 crashes at t=35. The run without gossip stops at the same moment as the one with it.
// By then, with gossip, every live node lists n4 as dead.
const CRASH: Fault[] = [{ at: 35, kind: "crash", node: "n4" }];
const CRASH_UNTIL = 140;
// n3 is too slow to answer for a while: the next pings sent to it, from anyone, get no reply.
const SLOW_N3: Fault[] = [{ at: 30, kind: "drop", to: "n3", type: "Ping", count: 4 }];
// Only the n1–n3 link is cut. Everyone else can still reach both of them.
const BAD_LINK: Fault[] = [{ at: 0, kind: "partition", groups: [["n1"], ["n3"]] }];
const BAD_LINK_SEED = 54;

test("crash: every live node learns that the crashed node is dead within a few rounds", () => {
  const r = simulate({ nodes: cluster(), seed: 2, until: CRASH_UNTIL, latency: [1, 2], faults: CRASH, invariant: noLiveNodeDeclaredDead });
  assert.equal(r.run.error, undefined);
  for (const id of liveOthers(r, "n4")) assert.equal(statusOf(r, id, "n4"), "dead", id);
  assert.ok(!violated(r));
});

test("bad link: indirect probes save a healthy node from being declared dead", () => {
  const r = simulate({
    nodes: cluster(),
    seed: BAD_LINK_SEED,
    until: 150,
    latency: [1, 2],
    faults: BAD_LINK,
    invariant: noLiveNodeDeclaredDead,
  });
  assert.equal(r.run.error, undefined);
  assert.ok(r.run.steps.some((s) => s.msg?.type === "PingReq" && s.msg.from === "n1"));
  assert.ok(!everListed(r, "n3", "suspect") && !everListed(r, "n3", "dead"));
  assert.ok(!everListed(r, "n1", "suspect") && !everListed(r, "n1", "dead"));
  assert.ok(!violated(r));
});

test("refute: a slow node suspected by others proves it is alive", () => {
  const r = simulate({
    nodes: cluster(),
    seed: 3,
    until: 150,
    latency: [1, 2],
    faults: SLOW_N3,
    invariant: noLiveNodeDeclaredDead,
  });
  assert.equal(r.run.error, undefined);
  assert.ok(everListed(r, "n3", "suspect"));
  assert.ok(!everListed(r, "n3", "dead"));
  assert.ok((r.nodes.n3 as SwimNode).incarnation >= 1);
  for (const id of liveOthers(r, "n3")) assert.equal(statusOf(r, id, "n3"), "alive", id);
  assert.ok(!violated(r));
});

test("broken: direct pings only — one bad link gets a healthy node declared dead", () => {
  const r = simulate({
    nodes: cluster((f) => new DirectPingsOnly(f)),
    seed: BAD_LINK_SEED,
    until: 150,
    latency: [1, 2],
    faults: BAD_LINK,
    invariant: noLiveNodeDeclaredDead,
  });
  assert.equal(r.run.error, undefined);
  assert.ok(r.run.steps.some((s) => s.violation?.includes("n3 as dead")));
  // Both ends of the bad link lose: n1 gets n3 declared dead, and n3 gets n1 declared dead.
  for (const id of liveOthers(r, "n3")) assert.equal(statusOf(r, id, "n3"), "dead", id);
  for (const id of liveOthers(r, "n1")) assert.equal(statusOf(r, id, "n1"), "dead", id);
});

test("broken: no indirect probes — a bad link gets a healthy node suspected, and here declared dead", () => {
  // Suspicion and refutation still work. But n1 can never hear from n3 directly, so n3's
  // refutation has to reach n1 by gossip before n1's suspicion timeout runs out.
  const r = simulate({
    nodes: cluster((f) => new NoIndirectProbes(f)),
    seed: BAD_LINK_SEED,
    until: 150,
    latency: [1, 2],
    faults: BAD_LINK,
    invariant: noLiveNodeDeclaredDead,
  });
  assert.equal(r.run.error, undefined);
  assert.ok(!r.run.steps.some((s) => s.msg?.type === "PingReq"));
  assert.ok(everListed(r, "n3", "suspect") && everListed(r, "n1", "suspect"));
  assert.ok(r.run.steps.some((s) => s.violation === "n1 lists n3 as dead, but n3 is running"));
});

test("broken: no suspicion — a slow node is declared dead the moment a probe fails", () => {
  const r = simulate({
    nodes: cluster((f) => new NoSuspicion(f)),
    seed: 3,
    until: 150,
    latency: [1, 2],
    faults: SLOW_N3,
    invariant: noLiveNodeDeclaredDead,
  });
  assert.equal(r.run.error, undefined);
  assert.ok(r.run.steps.some((s) => s.violation?.includes("n3 as dead")));
  for (const id of liveOthers(r, "n3")) assert.equal(statusOf(r, id, "n3"), "dead", id);
});

test("broken: no gossip — only the node that noticed knows the crash", () => {
  const r = simulate({
    nodes: cluster((f) => new NoGossip(f)),
    seed: 2,
    until: CRASH_UNTIL,
    latency: [1, 2],
    faults: CRASH,
    invariant: noLiveNodeDeclaredDead,
  });
  assert.equal(r.run.error, undefined);
  const knows = liveOthers(r, "n4").filter((id) => statusOf(r, id, "n4") === "dead");
  // n3 noticed and declared n4 dead. n1, n2 and n5 have each had to probe n4 themselves:
  // they only suspect it so far, and nobody will tell them it is dead.
  assert.deepEqual(knows, ["n3"]);
  for (const id of ["n1", "n2", "n5"]) assert.equal(statusOf(r, id, "n4"), "suspect", id);
});

