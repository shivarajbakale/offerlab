/**
 * 025. Saga With Compensation
 * Level: Senior
 * Group: Transactions & Messaging
 *
 * Problem: Placing an order touches three services, each with its own database: inventory
 *   sets a book aside, payments charges the customer, shipping sends the parcel. Either all
 *   three happen or, in effect, none do. One database transaction can't span three databases,
 *   and locking all three until everyone agrees (two-phase commit) ties every service to the
 *   slowest or deadest one.
 *
 * Approach: Orchestrated saga with compensations
 *   An orchestrator runs the steps one at a time. Each step is a local transaction inside one
 *   service that commits on its own. The orchestrator writes every outcome to a durable log
 *   before acting on it. If a step fails, it runs the compensations of the steps that already
 *   succeeded (release the book, refund the charge), newest first. Every request carries the
 *   saga id; services remember what they have applied, keyed by saga id and request (o1/Charge,
 *   o1/Refund), so the orchestrator can resend any request whose reply it never got without
 *   anything happening twice.
 *
 * Cost: one round trip per step, and one more per compensation on failure; no locks held
 *   between steps.
 *
 * Pattern: distributed transaction without locks (saga)
 * Key insight: Give up "all at once" and keep "all or nothing in the end". Every step commits
 *   right away, and every step except the last has a compensation: a new forward action that
 *   cancels its effect in business terms. A durable log plus idempotent, retried requests make
 *   sure the saga always reaches one of its two ends, completed or fully compensated.
 * Tradeoffs: No locks means no blocking and no coordinator that can freeze everyone, but also
 *   no isolation: other requests see the halfway states (a book held by an order that is about
 *   to be cancelled). Compensations are extra code per step, and some actions (an email sent,
 *   a parcel handed to a courier) can't be cancelled, only followed up.
 * Staff notes: Order steps so that the ones that fail most often, or can't be compensated, come
 *   last. Compensations must themselves be retried until they succeed; a compensation that can
 *   fail for good needs a human. Orchestration (one coordinator holding the log) is easier to
 *   follow and monitor than choreography (each service reacts to the previous one's event), at
 *   the price of a central component. Guard against a compensation arriving before the request
 *   it cancels. Where halfway states hurt, add semantic locks (a "pending" flag other requests
 *   respect) or re-check before the final step.
 * Interview signals: "order spans several services", "microservices", "distributed
 *   transaction", "refund if shipping fails", "can't use 2PC", "eventual consistency",
 *   "long-running business process".
 * Real world: The pattern comes from Garcia-Molina and Salem's 1987 paper "Sagas". Workflow
 *   engines such as Temporal and AWS Step Functions are often used to run orchestrated sagas:
 *   they persist each workflow's progress so it resumes after a crash. Payment APIs such as
 *   Stripe accept an idempotency key so a retried request is not charged twice.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIENT, SimNode, simulate, type ClientOp, type Ctx, type Fault, type NodeId, type SimResult } from "../../kernel/sim.ts";

const RETRY_EVERY = 10;

type Order = { item: string; qty: number; amount: number };
// @why The saga id plus the request type (Charge, Refund) names one request exactly, so a resend is recognizably the same request.
type Request = { sagaId: string; step: string; order: Order };
type Reply = { ok: boolean; reason?: string };
type Status = "running" | "compensating" | "completed" | "cancelled";
type LogEntry = { saga: string; what: "started" | "done" | "failed" | "compensated" | Extract<Status, "completed" | "cancelled">; step?: string; order?: Order; reason?: string };
type Saga = { order: Order; status: Status; done: string[]; compensated: string[] };

// @why The saga, written down once: which service does each step, and which action cancels it.
const STEPS = [
  { name: "reserve", service: "inventory", request: "Reserve", compensate: "Release" },
  { name: "charge", service: "payments", request: "Charge", compensate: "Refund" },
  // @why The last step needs no compensation: once it succeeds there is nothing left that can fail.
  { name: "ship", service: "shipping", request: "Ship", compensate: null },
];

// @why One coordinator decides what happens next for every order, so the whole saga lives in one place you can read.
export class Orchestrator extends SimNode {
  // @why The log is the saga's memory. If it lived in memory, a restart would forget orders halfway through, with the book held and the money taken.
  static durable = ["log"];
  log: LogEntry[] = [];
  // @why When each saga's outstanding request was sent; a request with no answer for a while gets resent.
  waitingSince: Record<string, number> = {};

  state() {
    const sagas: Record<string, string> = {};
    for (const [id, s] of this.sagas()) {
      const next = this.next(id, s);
      sagas[id] = next ? `${s.status}: ${next.type}` : s.status;
    }
    return { sagas, log: this.log.map((e) => [e.saga, e.step, e.what, e.reason].filter(Boolean).join(" ")) };
  }

  // @why Everything the orchestrator knows is rebuilt from the log, so after a restart it knows exactly as much as before.
  sagas(): Map<string, Saga> {
    const out = new Map<string, Saga>();
    for (const e of this.log) {
      if (e.what === "started") out.set(e.saga, { order: e.order!, status: "running", done: [], compensated: [] });
      const s = out.get(e.saga)!;
      if (e.what === "done") s.done.push(e.step!);
      if (e.what === "failed") s.status = "compensating";
      if (e.what === "compensated") s.compensated.push(e.step!);
      if (e.what === "completed" || e.what === "cancelled") s.status = e.what;
    }
    return out;
  }

  status(saga: string): Status | null {
    return this.sagas().get(saga)?.status ?? null;
  }

  // @why After a restart, pick up every unfinished saga where its log says it was.
  onStart(ctx: Ctx) {
    const open = [...this.sagas()].filter(([id, s]) => this.next(id, s));
    if (!open.length) return;
    ctx.say(`orch reads its log: ${open.map(([id, s]) => `${id} still needs ${this.next(id, s)!.type}`).join(", ")}, so it sends that again`);
    for (const [id, s] of open) this.send(ctx, id, s);
    this.armRetry(ctx);
  }

  onPlaceOrder(ctx: Ctx, body: { sagaId: string; order: Order }) {
    // @why A client that retries its order must not start a second saga for the same order.
    if (this.status(body.sagaId)) return;
    // @why Logged before the first request goes out, so no service can ever hold something for an order the log doesn't know.
    this.log.push({ saga: body.sagaId, what: "started", order: body.order });
    ctx.say(`orch logs "${body.sagaId} started" and begins with step 1`);
    this.advance(ctx, body.sagaId);
  }

  onStepResult(ctx: Ctx, body: { sagaId: string; step: string } & Reply) {
    const s = this.sagas().get(body.sagaId);
    // @why A duplicate or late reply, for a step this saga has already moved past; acting on it twice would log it twice.
    if (!s || this.next(body.sagaId, s)?.step !== body.step || s.status !== "running") return;
    // @why The outcome goes in the log before the next request is sent, so a crash right here loses nothing.
    if (body.ok) {
      this.log.push({ saga: body.sagaId, what: "done", step: body.step });
      ctx.say(`orch logs "${body.sagaId} ${body.step} done"`);
    } else {
      this.log.push({ saga: body.sagaId, what: "failed", step: body.step, reason: body.reason });
      ctx.say(
        s.done.length
          ? `${body.step} failed (${body.reason}), so orch logs it and starts undoing what already happened: ${[...s.done].reverse().join(", then ")}`
          : `${body.step} failed (${body.reason}), so orch logs it`,
      );
    }
    this.advance(ctx, body.sagaId);
  }

  onCompensated(ctx: Ctx, body: { sagaId: string; step: string }) {
    const s = this.sagas().get(body.sagaId);
    if (!s || s.status !== "compensating" || this.next(body.sagaId, s)?.step !== body.step) return;
    this.log.push({ saga: body.sagaId, what: "compensated", step: body.step });
    ctx.say(`orch logs "${body.sagaId} ${body.step} compensated"`);
    this.advance(ctx, body.sagaId);
  }

  // @why A lost request and a lost reply look the same from here: silence. The only cure is to ask again.
  onRetry(ctx: Ctx) {
    const stale = [...this.sagas()].filter(([id, s]) => this.next(id, s) && ctx.now - (this.waitingSince[id] ?? 0) >= RETRY_EVERY);
    if (stale.length) ctx.say(`no reply for ${RETRY_EVERY} ticks, so orch resends ${stale.map(([id, s]) => `${this.next(id, s)!.type} for ${id}`).join(", ")}`);
    for (const [id, s] of stale) this.send(ctx, id, s);
    this.armRetry(ctx);
  }

  // @why Do the next thing the log calls for: the next step, the next compensation, or tell the client how it ended.
  protected advance(ctx: Ctx, saga: string) {
    const s = this.sagas().get(saga)!;
    const next = this.next(saga, s);
    if (next) this.send(ctx, saga, s);
    else {
      ctx.say(s.status === "running" ? "every step is done" : "nothing is left to undo");
      this.finish(ctx, saga, s.status === "running" ? "completed" : "cancelled");
    }
    this.armRetry(ctx);
  }

  protected finish(ctx: Ctx, saga: string, outcome: "completed" | "cancelled") {
    this.log.push({ saga, what: outcome });
    delete this.waitingSince[saga];
    ctx.say(`orch logs "${saga} ${outcome}" and tells the client`);
    ctx.send(CLIENT, "OrderResult", { sagaId: saga, outcome });
    this.armRetry(ctx);
  }

  // @why The one request this saga is waiting on, worked out from the log alone.
  protected next(saga: string, s: Saga): { to: NodeId; type: string; step: string } | null {
    if (s.status === "running") {
      const step = STEPS.find((x) => !s.done.includes(x.name));
      return step ? { to: step.service, type: step.request, step: step.name } : null;
    }
    if (s.status === "compensating") {
      // @why Newest first: undo in the reverse order things were done, like unwinding a stack.
      const step = [...STEPS].reverse().find((x) => s.done.includes(x.name) && x.compensate && !s.compensated.includes(x.name));
      return step ? { to: step.service, type: step.compensate!, step: step.name } : null;
    }
    return null;
  }

  private send(ctx: Ctx, saga: string, s: Saga) {
    const next = this.next(saga, s)!;
    const body: Request = { sagaId: saga, step: next.step, order: s.order };
    ctx.send(next.to, next.type, body);
    this.waitingSince[saga] = ctx.now;
  }

  // @why One timer, set for the moment the oldest unanswered request has waited RETRY_EVERY ticks; none while nothing is waiting.
  private armRetry(ctx: Ctx) {
    const deadlines = [...this.sagas()].filter(([id, s]) => this.next(id, s)).map(([id]) => (this.waitingSince[id] ?? 0) + RETRY_EVERY);
    if (deadlines.length) ctx.setTimer("Retry", Math.max(0, Math.min(...deadlines) - ctx.now));
    else ctx.cancelTimer("Retry");
  }
}

// @why What every service shares: apply each request at most once.
export abstract class Service extends SimNode {
  // @why Requests already applied, and the answer given. Kept on disk with the data it protects, in the same local transaction.
  seen: Record<string, Reply> = {};

  // @why A resend of a request already applied gets the same answer again and changes nothing; that is what makes retrying safe.
  protected once(ctx: Ctx, action: string, req: Request, from: NodeId, replyType: string, apply: () => Reply) {
    const key = `${req.sagaId}/${action}`;
    if (key in this.seen) ctx.say(`${ctx.id} has already applied ${key}, so it repeats its answer and changes nothing`);
    else this.seen[key] = apply();
    ctx.send(from, replyType, { sagaId: req.sagaId, step: req.step, ...this.seen[key] });
  }
}

export class Inventory extends Service {
  static durable = ["stock", "held", "seen"];
  // @why How many the shop owns in total, never changed; only used to check nothing went missing.
  owned: Record<string, number>;
  stock: Record<string, number>;
  // @why What each order has set aside, so releasing gives back exactly that order's share.
  held: Record<string, { item: string; qty: number }> = {};

  constructor(stock: Record<string, number> = { book: 2 }) {
    super();
    this.owned = { ...stock };
    this.stock = { ...stock };
  }

  state() {
    return { stock: { ...this.stock }, held: Object.fromEntries(Object.entries(this.held).map(([k, h]) => [k, `${h.qty} ${h.item}`])), seen: Object.keys(this.seen) };
  }

  // @why A local transaction: it commits here and now, without waiting for payments or shipping.
  onReserve(ctx: Ctx, req: Request, from: NodeId) {
    this.once(ctx, "Reserve", req, from, "StepResult", () => this.reserve(ctx, req));
  }

  // @why The compensation for Reserve: put back what this order took, whatever else happened since.
  onRelease(ctx: Ctx, req: Request, from: NodeId) {
    this.once(ctx, "Release", req, from, "Compensated", () => {
      const h = this.held[req.sagaId];
      if (h) {
        this.stock[h.item] += h.qty;
        delete this.held[req.sagaId];
      }
      ctx.say(`inventory puts back the ${h?.qty ?? 0} ${req.order.item} that ${req.sagaId} held: ${this.stock[req.order.item]} on the shelf`);
      return { ok: true };
    });
  }

  protected reserve(ctx: Ctx, req: Request): Reply {
    const { item, qty } = req.order;
    if ((this.stock[item] ?? 0) < qty) {
      ctx.say(`inventory has no ${item} left for ${req.sagaId}: step fails`);
      return { ok: false, reason: "out of stock" };
    }
    this.stock[item] -= qty;
    this.held[req.sagaId] = { item, qty };
    ctx.say(`inventory sets ${qty} ${item} aside for ${req.sagaId} and commits: ${this.stock[item]} left`);
    return { ok: true };
  }
}

export class Payments extends Service {
  static durable = ["balance", "charged", "seen"];
  balance: number;
  // @why How much each order has actually been charged, so a refund gives back exactly that.
  charged: Record<string, number> = {};

  constructor(balance = 100) {
    super();
    this.balance = balance;
  }

  state() {
    return { balance: this.balance, charged: { ...this.charged }, seen: Object.keys(this.seen) };
  }

  onCharge(ctx: Ctx, req: Request, from: NodeId) {
    this.once(ctx, "Charge", req, from, "StepResult", () => this.charge(ctx, req));
  }

  // @why The compensation for Charge is a refund: a new payment the other way, not erasing the charge from history.
  onRefund(ctx: Ctx, req: Request, from: NodeId) {
    this.once(ctx, "Refund", req, from, "Compensated", () => {
      const amount = this.charged[req.sagaId] ?? 0;
      this.balance += amount;
      delete this.charged[req.sagaId];
      ctx.say(`payments refunds ${amount} for ${req.sagaId}: balance ${this.balance}`);
      return { ok: true };
    });
  }

  protected charge(ctx: Ctx, req: Request): Reply {
    const { amount } = req.order;
    if (this.balance < amount) {
      ctx.say(`payments declines ${amount} for ${req.sagaId}: the balance is only ${this.balance}`);
      return { ok: false, reason: "card declined" };
    }
    this.balance -= amount;
    this.charged[req.sagaId] = (this.charged[req.sagaId] ?? 0) + amount;
    ctx.say(`payments charges ${amount} for ${req.sagaId} and commits: balance ${this.balance}`);
    return { ok: true };
  }
}

export class Shipping extends Service {
  static durable = ["shipped", "seen"];
  shipped: string[] = [];

  state() {
    return { shipped: [...this.shipped], seen: Object.keys(this.seen) };
  }

  onShip(ctx: Ctx, req: Request, from: NodeId) {
    this.once(ctx, "Ship", req, from, "StepResult", () => {
      this.shipped.push(req.sagaId);
      ctx.say(`shipping sends the parcel for ${req.sagaId}`);
      return { ok: true };
    });
  }
}

// @why Checked after every event. Halfway states are allowed while a saga runs; lost stock, double charges and unfinished undo are not.
export function sagaInvariant(nodes: Record<NodeId, SimNode>): string | null {
  const orch = nodes.orch as Orchestrator | undefined;
  const inv = nodes.inventory as Inventory | undefined;
  const pay = nodes.payments as Payments | undefined;
  const ship = nodes.shipping as Shipping | undefined;
  if (!orch || !inv || !pay || !ship) return null;
  for (const [item, owned] of Object.entries(inv.owned)) {
    const held = Object.values(inv.held).reduce((n, h) => n + (h.item === item ? h.qty : 0), 0);
    const shelf = inv.stock[item] ?? 0;
    if (shelf + held !== owned) return `inventory owns ${owned} of "${item}", but ${shelf} are on the shelf and ${held} held for orders`;
  }
  const sagas = orch.sagas();
  const touched: [string, string][] = [
    ...Object.entries(inv.held).map(([id, h]): [string, string] => [id, `inventory holds ${h.qty} ${h.item}`]),
    ...Object.entries(pay.charged).map(([id, c]): [string, string] => [id, `payments holds ${c}`]),
    ...ship.shipped.map((id): [string, string] => [id, "shipping sent a parcel"]),
  ];
  for (const [id, what] of touched) if (!sagas.has(id)) return `${what} for ${id}, but the orchestrator has no record of ${id}`;
  for (const [id, s] of sagas) {
    const charged = pay.charged[id] ?? 0;
    if (charged > s.order.amount) return `${id} was charged ${charged} for a ${s.order.amount} order`;
    if (s.status === "cancelled") {
      const h = inv.held[id];
      if (h) return `${id} was cancelled, but inventory still holds ${h.qty} ${h.item} for it`;
      if (charged) return `${id} was cancelled, but payments still keeps ${charged} for it`;
      if (ship.shipped.includes(id)) return `${id} was cancelled, but its parcel was shipped`;
    }
    if (s.status === "completed" && (!inv.held[id] || charged !== s.order.amount || !ship.shipped.includes(id))) {
      return `${id} is marked completed, but not every step took effect`;
    }
  }
  return null;
}

// --- helpers for the scenarios ---

// Broken on purpose: when a step fails, it reports "cancelled" without undoing the steps that succeeded.
class NoCompensation extends Orchestrator {
  onStepResult(ctx: Ctx, body: { sagaId: string; step: string } & Reply) {
    if (body.ok || this.status(body.sagaId) !== "running") return super.onStepResult(ctx, body);
    this.log.push({ saga: body.sagaId, what: "failed", step: body.step, reason: body.reason });
    ctx.say(`${body.step} failed (${body.reason}), so orch gives up and tells the client the order is cancelled`);
    this.finish(ctx, body.sagaId, "cancelled");
  }
}

// Broken on purpose: keeps its log only in memory, so a restart forgets every saga in progress.
class LogInMemory extends Orchestrator {
  static durable: string[] = [];
}

// Broken on purpose: sends each request once and never resends it.
class NoRetry extends Orchestrator {
  onRetry(ctx: Ctx) {
    ctx.say("orch is still waiting for an answer, but it never asks again");
  }
}

// Broken on purpose: charges every Charge request it receives, even one it has already applied.
class NotIdempotentPayments extends Payments {
  onCharge(ctx: Ctx, req: Request, from: NodeId) {
    ctx.send(from, "StepResult", { sagaId: req.sagaId, step: req.step, ...this.charge(ctx, req) });
  }
}

// Broken on purpose: "undoes" a reservation by restoring the stock count it saw before it.
class SnapshotUndoInventory extends Inventory {
  before: Record<string, number> = {};
  onReserve(ctx: Ctx, req: Request, from: NodeId) {
    this.before[req.sagaId] = this.stock[req.order.item];
    super.onReserve(ctx, req, from);
  }
  onRelease(ctx: Ctx, req: Request, from: NodeId) {
    this.once(ctx, "Release", req, from, "Compensated", () => {
      this.stock[req.order.item] = this.before[req.sagaId];
      delete this.held[req.sagaId];
      ctx.say(`inventory undoes ${req.sagaId} by putting the count back to ${this.before[req.sagaId]}, what it was before ${req.sagaId}`);
      return { ok: true };
    });
  }
}

const STOCK = 2;
const BALANCE = 100;
type Parts = { orch?: () => Orchestrator; inventory?: () => Inventory; payments?: () => Payments };
const services = (p: Parts = {}) => ({
  orch: p.orch ?? (() => new Orchestrator()),
  inventory: p.inventory ?? (() => new Inventory({ book: STOCK })),
  payments: p.payments ?? (() => new Payments(BALANCE)),
  shipping: () => new Shipping(),
});
const order = (at: number, sagaId: string, amount: number): ClientOp => ({
  at,
  to: "orch",
  type: "PlaceOrder",
  body: { sagaId, order: { item: "book", qty: 1, amount } },
});
const run = (opts: { parts?: Parts; clients: ClientOp[]; faults?: Fault[]; until?: number }) =>
  simulate({ nodes: services(opts.parts), seed: 1, latency: [2, 2], until: opts.until ?? 60, clients: opts.clients, faults: opts.faults, invariant: sagaInvariant });
const outcome = (r: SimResult, saga: string) =>
  (r.inbox.find((m) => m.type === "OrderResult" && (m.body as { sagaId: string }).sagaId === saga)?.body as { outcome: string } | undefined)?.outcome;
const violations = (r: SimResult) => r.run.steps.filter((s) => s.violation).map((s) => s.violation!);
const inv = (r: SimResult) => r.nodes.inventory as Inventory;
const pay = (r: SimResult) => r.nodes.payments as Payments;
const ship = (r: SimResult) => r.nodes.shipping as Shipping;
// The first reply from payments to the orchestrator is lost on the way.
const lostCharge: Fault = { at: 0, kind: "drop", from: "payments", to: "orch", type: "StepResult", count: 1 };
// The orchestrator is down from t=8 to t=12, while the payment service's reply is on its way.
const orchCrash: Fault[] = [
  { at: 8, kind: "crash", node: "orch" },
  { at: 12, kind: "recover", node: "orch" },
];

test("success: every step completes", () => {
  const r = run({ clients: [order(1, "o1", 30)] });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), "completed");
  assert.equal(inv(r).stock.book, STOCK - 1);
  assert.equal(pay(r).balance, BALANCE - 30);
  assert.deepEqual(ship(r).shipped, ["o1"]);
  assert.deepEqual(violations(r), []);
});

test("payment fails: inventory is released by its compensation", () => {
  const r = run({ clients: [order(1, "o1", 150)] });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), "cancelled");
  // While the refusal travels back, the book is held: other orders can see this halfway state.
  assert.ok(r.run.steps.some((s) => (s.nodes.inventory.state.stock as Record<string, number>).book === STOCK - 1));
  assert.equal(inv(r).stock.book, STOCK);
  assert.deepEqual(inv(r).held, {});
  assert.equal(pay(r).balance, BALANCE);
  assert.deepEqual(ship(r).shipped, []);
  assert.deepEqual(violations(r), []);
});

test("orchestrator crash: it restarts and resumes from its log", () => {
  const r = run({ clients: [order(1, "o1", 30)], faults: orchCrash });
  assert.equal(r.run.error, undefined);
  // The payment service's reply arrived while the orchestrator was down.
  assert.ok(r.run.steps.some((s) => s.kind === "drop" && s.msg?.type === "StepResult" && s.dropReason === "crashed"));
  assert.equal(outcome(r, "o1"), "completed");
  assert.equal(pay(r).balance, BALANCE - 30);
  assert.deepEqual(ship(r).shipped, ["o1"]);
  assert.deepEqual(violations(r), []);
});

test("retry: a lost reply is retried and the service applies it only once", () => {
  const r = run({ clients: [order(1, "o1", 30)], faults: [lostCharge] });
  assert.equal(r.run.error, undefined);
  const charges = r.run.steps.filter((s) => s.kind === "deliver" && s.msg?.type === "Charge");
  assert.equal(charges.length, 2);
  assert.equal(outcome(r, "o1"), "completed");
  assert.equal(pay(r).balance, BALANCE - 30);
  assert.deepEqual(violations(r), []);
});

test("no isolation: a second order is turned away by a book the first order is about to give back", () => {
  // One book in stock. o1 holds it while its payment is being refused; o2 asks in that window.
  const r = run({
    parts: { inventory: () => new Inventory({ book: 1 }) },
    clients: [order(1, "o1", 150), order(4, "o2", 30)],
  });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), "cancelled");
  assert.equal(outcome(r, "o2"), "cancelled");
  // The book is back on the shelf at the end, yet nobody bought it.
  assert.equal(inv(r).stock.book, 1);
  assert.deepEqual(violations(r), []);
});

test("broken: no compensation — inventory stays reserved after the payment fails", () => {
  const r = run({ parts: { orch: () => new NoCompensation() }, clients: [order(1, "o1", 150)] });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), "cancelled");
  assert.equal(inv(r).stock.book, STOCK - 1);
  assert.deepEqual(inv(r).held, { o1: { item: "book", qty: 1 } });
  assert.ok(violations(r).some((v) => v.startsWith("o1 was cancelled, but inventory still holds")));
});

test("broken: non-idempotent service — a retried charge is applied twice", () => {
  const r = run({ parts: { payments: () => new NotIdempotentPayments(BALANCE) }, clients: [order(1, "o1", 30)], faults: [lostCharge] });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), "completed");
  assert.equal(pay(r).balance, BALANCE - 60);
  assert.ok(violations(r).some((v) => v.startsWith("o1 was charged 60 for a 30 order")));
});

test("broken: log in memory — a restarted orchestrator forgets the order halfway through", () => {
  const r = run({ parts: { orch: () => new LogInMemory() }, clients: [order(1, "o1", 30)], faults: orchCrash });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), undefined);
  assert.equal(pay(r).balance, BALANCE - 30);
  assert.equal(inv(r).stock.book, STOCK - 1);
  assert.deepEqual(ship(r).shipped, []);
  assert.ok(violations(r).some((v) => v.includes("but the orchestrator has no record of o1")));
});

test("broken: no retry — one lost reply leaves the order stuck halfway forever", () => {
  const r = run({ parts: { orch: () => new NoRetry() }, clients: [order(1, "o1", 30)], faults: [lostCharge] });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), undefined);
  assert.equal((r.nodes.orch as Orchestrator).status("o1"), "running");
  assert.equal(pay(r).balance, BALANCE - 30);
  assert.equal(inv(r).stock.book, STOCK - 1);
  assert.deepEqual(ship(r).shipped, []);
});

test("broken: undo by restoring the old value — another order's reservation is wiped out", () => {
  // o1 reserves (2 → 1), then o2 reserves (1 → 0). o1's payment fails, and "undo" puts the
  // count back to the 2 it saw before o1, erasing o2's reservation: the shop now sells 3 of 2 books.
  const r = run({
    parts: { inventory: () => new SnapshotUndoInventory({ book: STOCK }) },
    clients: [order(1, "o1", 150), order(2, "o2", 30)],
  });
  assert.equal(r.run.error, undefined);
  assert.equal(outcome(r, "o1"), "cancelled");
  assert.equal(outcome(r, "o2"), "completed");
  assert.equal(inv(r).stock.book, STOCK);
  assert.deepEqual(ship(r).shipped, ["o2"]);
  assert.ok(violations(r).some((v) => v.startsWith('inventory owns 2 of "book"')));
});
