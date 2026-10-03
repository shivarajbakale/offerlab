/**
 * 18. Payments Ledger
 * Level: Staff
 * Group: Architectures
 *
 * Problem: Record every movement of money so that none is ever created, lost or moved twice,
 *   and keep up with 2,000 payments a second when one merchant's on-sale takes over a third of
 *   them. Speed matters; correctness matters more.
 *
 * Approach: Make the ledger append-only and everything else derived from it
 *   1. Double-entry in one transaction, and both balances updated in place: the hot merchant's
 *   balance row is locked by every payment to it, one at a time. 2. Append the two entries (plus
 *   the idempotency key) and update only the payer's balance; a projector adds the merchant's
 *   entries up in batches. 3. Pay merchants out per payment, and the bank cannot keep up; batch
 *   payouts on a delayed queue, one per merchant per window.
 *
 * Cost: the hot merchant's row takes ~500 payments a second (2 ms lock hold); at 2,000 a second
 *   with 38% to one merchant its row is full and over 85% of all payments fail; derived
 *   balances carry 2,000 a second with the ledger ~70% busy and every balance row nearly idle;
 *   a bank call per payment fails every payment; batched payouts make 1 to 2 bank calls a second.
 *
 * Pattern: double-entry ledger, append-only log with derived views, idempotency keys, batching
 * Key insight: A credit to a merchant needs no check (money in is always allowed), so its
 *   balance does not have to be updated inside the payment. Write the entries, which are the
 *   truth, and add them into balances later in batches: the hot row is then touched a few times a
 *   second instead of hundreds. Debits do need a check, but the payers are spread out.
 * Tradeoffs: The merchant's balance is late by the projector's lag, so anything that spends it
 *   (a payout, a refund) must read the entries or wait for the projector. More moving parts to
 *   reconcile: the projector, the queue and the bank all need checks that their totals match.
 * Staff notes: Never update a balance without writing the entry that explains it, in the same
 *   transaction. Store amounts as integers in the smallest unit (cents). Idempotency keys belong
 *   in the same transaction as the entries, with a unique constraint, so a retry either finds the
 *   first result or does the whole thing once. Reconcile daily against the bank's statements.
 * Interview signals: "payments", "wallet", "ledger", "double-entry", "exactly once", "idempotency",
 *   "hot account", "reconciliation", "settlement".
 * Real world: Double-entry bookkeeping is centuries old; payment companies run ledgers built on
 *   it (Square, Uber and Stripe have written about theirs). Stripe's API takes an Idempotency-Key
 *   header and returns the first request's result for a retry with the same key.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// 2,000 requests a second: 90% are payments (writes), 10% are balance lookups (reads). The key is
// the merchant being paid: 10,000 merchants, and one big on-sale (Zipf skew 1.5) gives the top
// merchant about 38% of all payments. A client that gets no answer in a second tries again,
// after 100 ms, then 200 ms (with jitter), three attempts in all.
const payers = () =>
  clients({
    to: "lb",
    qps: knob("qps", 2000, [10, 20_000]),
    mix: { read: 0.1, write: 0.9 },
    keys: 10_000,
    skew: 1.5,
    retry: "backoff",
    attempts: 3,
  });
const app = (write: string[]) => ({
  lb: loadBalancer({ to: "app" }),
  app: server({ replicas: 4, cores: 4, threads: 200, queue: 500, serviceMs: { read: 1, write: 2 }, calls: { read: ["ledger"], write } }),
});
// The ledger database: 8 cores. A payment's transaction inserts two entries (debit the payer,
// credit the merchant) and the idempotency key, updates the payer's balance with an overdraft
// check, and commits: 3 ms of CPU. A balance lookup is 1 ms.
const ledger = () => database({ label: "Ledger", cores: 8, readMs: 1, writeMs: 3 });
// Merchant balance rows, as their row locks see them. Updating a row locks it until the commit,
// so updates to one row go one at a time: we model the rows as 16 single lanes (one core each),
// each merchant's row on one lane. A lock is held ~2 ms (the update, then the commit's flush to
// disk), so one row takes at most ~500 updates a second. The lanes are inside the ledger
// database, not machines of their own, so they cost nothing extra.
const balanceRows = () =>
  database({ label: "Merchant balance rows (locks)", shards: 16, cores: 1, readMs: 0.1, writeMs: 2, costPerHour: 0 });

// @why Stage 1: one transaction does it all: two entries, the payer's balance, and the merchant's
// @why balance row, which stays locked until the commit.
export const inPlace = design("1. Both balances updated in the payment", {
  users: payers(),
  ...app(["ledger", "rows"]),
  ledger: ledger(),
  rows: balanceRows(),
});

// @why Stage 2: the payment writes the entries, the idempotency key and the payer's balance, and
// @why returns. A projector reads new entries in batches of ~100, adds them up per merchant, and
// @why applies each sum in one update, recording the last entry it applied.
const projector = (consumers: number) =>
  queue({ label: "Balance projector", consumers: knob("projectors", consumers, [1, 50]), workMs: 20, to: "rows", fanout: 0.01 });
export const derived = design("2. Append entries, derive balances", {
  users: payers(),
  ...app(["ledger", "projector"]),
  ledger: ledger(),
  projector: projector(2),
  rows: balanceRows(),
});

// The bank's transfer API: ~300 ms a call, and it accepts at most 50 at once from us.
const bank = () => external({ label: "Bank transfer API", latencyMs: 300, concurrency: 50 });

// @why Stage 3, the naive way: pay the merchant out on every payment, one bank transfer per sale.
export const payoutEach = design("3. A bank transfer per payment", {
  users: payers(),
  ...app(["ledger", "projector", "bank"]),
  ledger: ledger(),
  projector: projector(2),
  rows: balanceRows(),
  bank: bank(),
});

// @why Stage 3: payouts go on a delayed queue: one payout per merchant per window (here one per
// @why ~1,000 payments), due when the window closes. A consumer sends each to the bank.
export const batchedPayouts = design("3. Batch payouts per window", {
  users: payers(),
  ...app(["ledger", "projector", "payouts"]),
  ledger: ledger(),
  projector: projector(2),
  rows: balanceRows(),
  // The window is a day in real systems; 5 seconds here so you can watch jobs come due.
  payouts: queue({ label: "Payouts (delayed)", consumers: 2, workMs: 10, to: "bank", fanout: 0.001, delayMs: knob("window", 5000, [1000, 9000]) }),
  bank: bank(),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const sortDown = (xs: number[]) => [...xs].sort((a, b) => b - a);

test("in place: 600 payments a second, the hot merchant's row 42% locked", () => {
  const s = summary(run(inPlace, { ...S, knobs: { qps: 600 } }), 3);
  assert.equal(s.errorRate, 0);
  const [hot] = sortDown(s.replicaUtil.rows);
  assert.ok(hot > 0.35 && hot < 0.5, `hot row ${hot}`);
  assert.ok(s.util.ledger < 0.25, `ledger ${s.util.ledger}`);
  assert.ok(Math.abs(s.costPerHour - 1.05) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: both balances in place — at 2,000 a second the hot merchant's row is a single lane, full", () => {
  const r = run(inPlace, S);
  const s = summary(r, 3);
  const [hot, ...rest] = sortDown(s.replicaUtil.rows);
  assert.ok(hot > 0.98, `hot row ${hot}`);
  assert.ok(rest.every((x) => x < 0.4), `other rows ${rest}`);
  // The ledger's 8 cores are mostly idle: the limit is one row's lock, not the machine.
  assert.ok(s.util.ledger < 0.5, `ledger ${s.util.ledger}`);
  // Workers wait on the locked row, so payments to every other merchant fail too, and clients
  // retrying make it worse.
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.85, `errors ${s.errorRate}`);
  assert.ok(s.retries > 3000, `retries ${s.retries}`);
  // Payments that committed after their client gave up: each retry of one would pay twice.
  assert.ok(s.wasted > 5000 && s.wasted < 9000, `committed after timeout ${s.wasted}`);
});

test("derived: entries appended, balances projected in batches, 2,000 a second", () => {
  const s = summary(run(derived, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.ledger > 0.65 && s.util.ledger < 0.75, `ledger ${s.util.ledger}`);
  assert.ok(Math.max(...s.replicaUtil.rows) < 0.01, `rows ${s.replicaUtil.rows}`);
  // The hot merchant's row: ~18 updates a second instead of 684 (the simulator models one
  // update per batch; really each batch updates every merchant in it).
  assert.ok(s.calls.rows > 12 && s.calls.rows < 25, `row updates ${s.calls.rows}`);
  assert.ok(s.p50 < 52, `p50 ${s.p50}`);
  assert.ok(s.backlog.projector < 5, `projector backlog ${s.backlog.projector}`);
  assert.ok(Math.abs(s.costPerHour - 1.1) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: a slow ledger — no payment fails, and hundreds commit after their client gave up", () => {
  const r = run(derived, { ...S, faults: [{ at: 4000, kind: "slow", target: "ledger", factor: 3, durationMs: 2000 }] });
  const s = summary(r);
  assert.equal(s.errorRate, 0);
  assert.ok(s.wasted > 400 && s.wasted < 650, `committed after timeout ${s.wasted}`);
  assert.ok(summary(r, 4, 7).p99 > 1000, `p99 ${summary(r, 4, 7).p99}`);
});

test("broken: a bank transfer per payment — 50 calls at a time, 300 ms each, and every payment fails", () => {
  const r = run(payoutEach, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "bank");
  assert.ok(s.threads.bank > 0.98, `bank slots ${s.threads.bank}`);
  assert.ok(s.errorRate > 0.99, `errors ${s.errorRate}`);
  assert.ok(s.threads.app > 0.95, `app workers ${s.threads.app}`);
});

test("payouts: batched per window, one bank call a second or two", () => {
  const s = summary(run(batchedPayouts, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.calls.bank > 1 && s.calls.bank < 2, `bank calls ${s.calls.bank}`);
  assert.ok(Math.abs(s.costPerHour - 1.16) < 0.02, `cost ${s.costPerHour}`);
  assert.ok(s.scheduled.payouts > 4 && s.scheduled.payouts < 20, `waiting for their window ${s.scheduled.payouts}`);
  assert.ok(s.threads.bank < 0.05, `bank slots ${s.threads.bank}`);
  assert.ok(s.util.ledger > 0.65 && s.util.ledger < 0.75, `ledger ${s.util.ledger}`);
});
