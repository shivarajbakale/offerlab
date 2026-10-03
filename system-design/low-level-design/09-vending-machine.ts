/**
 * 09. Vending Machine
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design the controller of a vending machine. A customer inserts coins, picks a slot,
 *   and gets the item and any change; or cancels and gets their coins back. The machine must
 *   never hand out an item that was not paid for, never keep money for an item it cannot
 *   give, refuse a sale it cannot make change for, and ignore buttons while the motor is
 *   dropping an item.
 *
 * Approach: The state pattern: one object per state, each handling every event
 *   The machine is always in exactly one state: idle, has-money, dispensing or sold-out. Each
 *   state is a class with the same four methods (insert, select, cancel, finish) and decides
 *   what each event means in that state, including "not now". The machine forwards every
 *   event to its current state. Coins for the current sale are held apart (escrow) until the
 *   sale is committed; change is found by trying the largest coins first and backing off
 *   when the coins in the box cannot make the rest.
 *
 * Cost: every event is O(1) apart from change-making, which tries coin counts per
 *   denomination: tiny for four denominations, exponential in the number of denominations in
 *   the worst case.
 *
 * Pattern: state pattern (finite state machine), escrow, bounded change-making with backtracking
 * Key insight: With a few booleans (hasMoney, dispensing, soldOut) the machine can be in
 *   2^3 = 8 combinations, and every method must check the right ones; one missed check is a
 *   free item. With one state object, impossible combinations cannot be represented, and
 *   each state lists exactly what it allows.
 * Tradeoffs: The state pattern spreads the logic over several small classes, and adding an
 *   event means adding a method to every state; a transition table (state x event -> action)
 *   is more compact and easier to print and check, but the actions live apart from the
 *   states. Largest-coins-first with backtracking always finds change if any combination of
 *   the coins exists, but does not promise the fewest coins.
 * Staff notes: Interviewers probe: what happens on a jam (the item never drops: refund, and
 *   only take the payment when the vend is confirmed or reverse it), power loss mid-sale
 *   (persist the state and the escrow), concurrency (one controller thread; events from the
 *   coin and button hardware go through one queue), testing (drive events, assert the state
 *   and the outputs; one test per arrow in the state diagram), and extensibility (card
 *   payments are another way into has-money, not a new machine).
 * Interview signals: "design a vending machine", "state pattern", "state machine", "make
 *   change", "exact change only", "what if the user presses select twice".
 * Real world: Bill validators, and some coin mechanisms, hold the current sale in escrow and
 *   return the same note or coins on cancel; others pay back equivalent coins from the tubes.
 *   Machines light "exact change only" when their change tubes run
 *   low. The state pattern is one of the original Gang of Four design patterns.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Slot = { name: string; price: number; count: number };

/** One state of the machine. Every state answers every event, even if the answer is "not now". */
export interface State {
  name: string;
  insert(m: VendingMachine, coin: number): void;
  select(m: VendingMachine, code: string): void;
  cancel(m: VendingMachine): void;
  /** The motor reports the item has dropped. */
  finish(m: VendingMachine): void;
}

export class Idle implements State {
  name = "idle";
  insert(m: VendingMachine, coin: number) {
    m.take(coin);
    m.setState(HAS_MONEY);
  }
  select(m: VendingMachine) {
    // @why No money, no sale. This is the whole check: in idle there is no credit to look at.
    m.say("insert coins first"); // @mark idle-select
  }
  cancel(m: VendingMachine) {
    m.say("nothing to return");
  }
  finish() {}
}

export class HasMoney implements State {
  name = "has-money";
  insert(m: VendingMachine, coin: number) {
    m.take(coin);
  }
  select(m: VendingMachine, code: string) {
    const slot = m.slots.get(code);
    if (!slot || slot.count === 0) return m.say(`${code} is empty`);
    if (m.credit < slot.price) return m.say(`${slot.name} costs ${slot.price}, credit is ${m.credit}`); // @mark short
    // @why Change can use the coins just inserted, so they count as being in the box for this check.
    const change = m.makeChange(m.credit - slot.price, m.boxWithEscrow());
    // @why No way to make the change: refuse, keep the credit, stay here. The customer can add coins or cancel.
    if (change === null) return m.say("exact change only"); // @mark no-change
    m.commit(code, change);
    m.setState(DISPENSING); // @mark start-vend
  }
  cancel(m: VendingMachine) {
    // @why The escrow coins go back exactly as inserted. The machine never kept them.
    m.refund(); // @mark refund
    m.setState(IDLE);
  }
  finish() {}
}

export class Dispensing implements State {
  name = "dispensing";
  insert(m: VendingMachine, coin: number) {
    m.returned.push(coin);
    m.say("busy");
  }
  select(m: VendingMachine) {
    // @why The sale is already paid and committed. A second press means nothing until the item drops.
    m.say("busy"); // @mark busy
  }
  cancel(m: VendingMachine) {
    m.say("busy");
  }
  finish(m: VendingMachine) {
    m.tray.push(m.slots.get(m.vending!)!.name); // @mark dropped
    m.vending = null;
    m.setState(m.anyStock() ? IDLE : SOLD_OUT);
  }
}

export class SoldOut implements State {
  name = "sold-out";
  insert(m: VendingMachine, coin: number) {
    // @why Nothing to sell: hand the coin straight back rather than take money for nothing.
    m.returned.push(coin); // @mark sold-out-coin
    m.say("sold out");
  }
  select(m: VendingMachine) {
    m.say("sold out");
  }
  cancel() {}
  finish() {}
}

export const IDLE = new Idle();
export const HAS_MONEY = new HasMoney();
export const DISPENSING = new Dispensing();
export const SOLD_OUT = new SoldOut();
const COINS = [100, 25, 10, 5];

export class VendingMachine {
  // @why Exactly one state at a time. Every event below is forwarded to it.
  state: State = IDLE;
  // @why Cents inserted toward the current sale.
  credit = 0;
  // @why The current sale's coins, held apart from the box until the sale is committed or cancelled.
  escrow: number[] = [];
  // @why Coins the machine owns, by value: what it can give change from.
  box: Record<number, number>;
  slots: Map<string, Slot>;
  // @why The slot being dropped right now, while dispensing.
  vending: string | null = null;
  tray: string[] = [];
  // @why Coins handed back to the customer: change, refunds, refused coins.
  returned: number[] = [];
  messages: string[] = [];

  constructor(slots: Record<string, Slot>, box: Record<number, number>) {
    this.slots = new Map(Object.entries(slots));
    this.box = { ...box };
  }

  insert(coin: number) {
    if (!COINS.includes(coin)) {
      this.returned.push(coin);
      return;
    }
    this.state.insert(this, coin);
  }

  select(code: string) {
    this.state.select(this, code);
  }

  cancel() {
    this.state.cancel(this);
  }

  finish() {
    this.state.finish(this);
  }

  restock(code: string, count: number) {
    this.slots.get(code)!.count += count;
    if (this.state === SOLD_OUT) this.setState(IDLE);
  }

  setState(next: State) {
    this.state = next; // @mark transition
  }

  // --- actions the states use ---

  take(coin: number) {
    this.escrow.push(coin);
    this.credit += coin;
  }

  say(msg: string) {
    this.messages.push(msg);
  }

  refund() {
    this.returned.push(...this.escrow);
    this.escrow = [];
    this.credit = 0;
  }

  boxWithEscrow(): Record<number, number> {
    const box = { ...this.box };
    for (const c of this.escrow) box[c] = (box[c] ?? 0) + 1;
    return box;
  }

  /** The sale goes through: escrow joins the box, change leaves it, the item is reserved. */
  commit(code: string, change: number[]) {
    this.box = this.boxWithEscrow();
    for (const c of change) this.box[c]--;
    this.escrow = [];
    this.credit = 0;
    this.returned.push(...change);
    this.slots.get(code)!.count--;
    this.vending = code;
  }

  anyStock(): boolean {
    for (const s of this.slots.values()) if (s.count > 0) return true;
    return false;
  }

  /** Coins adding up to `amount` from `box`, largest first, backing off when stuck; null if none. */
  makeChange(amount: number, box: Record<number, number>): number[] | null {
    const out: number[] = [];
    const tryFrom = (i: number, left: number): boolean => {
      if (left === 0) return true;
      if (i === COINS.length) return false;
      const c = COINS[i];
      for (let k = Math.min(box[c] ?? 0, Math.floor(left / c)); k >= 0; k--) {
        for (let j = 0; j < k; j++) out.push(c);
        if (tryFrom(i + 1, left - k * c)) return true;
        // @why Stuck with k of this coin: take them back and try one fewer.
        out.length -= k; // @mark back-off
      }
      return false;
    };
    return tryFrom(0, amount) ? out : null; // @mark change
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: booleans instead of a state. Each check is reasonable alone, but select
// never asks "is a sale already in progress?", and payment is taken only when the item drops
// (so a jammed vend costs nothing). Two presses during one vend start two vends.
export class FlagMachine extends VendingMachine {
  hasMoney = false;
  dispensing = false;
  queued: string[] = [];

  insert(coin: number) {
    this.take(coin);
    this.hasMoney = true;
  }

  select(code: string) {
    const slot = this.slots.get(code)!;
    if (!this.hasMoney) return this.say("insert coins first");
    if (this.credit < slot.price) return this.say("not enough");
    // @why Nothing here looks at `dispensing`: the credit is still there until the drop, so a second press passes.
    this.dispensing = true; // @mark flag-vend
    this.queued.push(code);
  }

  finish() {
    const slot = this.slots.get(this.queued.shift()!)!;
    slot.count--;
    this.tray.push(slot.name);
    this.credit -= slot.price; // @mark charge-late
    this.hasMoney = this.credit > 0;
    this.dispensing = this.queued.length > 0;
  }
}

const stock = () => ({ A1: { name: "cola", price: 100, count: 5 }, B2: { name: "chips", price: 65, count: 5 }, C3: { name: "gum", price: 70, count: 1 } });

test("buy: exact money, item out, back to idle", () => {
  const m = new VendingMachine(stock(), { 25: 4, 10: 4, 5: 4 });
  m.insert(25);
  m.insert(25);
  m.insert(25);
  m.insert(25);
  m.select("A1");
  assert.equal(m.state.name, "dispensing");
  m.finish();
  assert.deepEqual(m.tray, ["cola"]);
  assert.deepEqual(m.returned, []);
  assert.equal(m.state.name, "idle");
  assert.equal(m.box[25], 8, "the four quarters joined the box");
});

test("change: $1 for 65-cent chips gives back a quarter and a dime", () => {
  const m = new VendingMachine(stock(), { 25: 4, 10: 4, 5: 4 });
  m.insert(100);
  m.select("B2");
  m.finish();
  assert.deepEqual(m.tray, ["chips"]);
  assert.deepEqual(m.returned, [25, 10]);
});

test("change: no nickels — a quarter leaves 5 cents it cannot make, so it backs off to three dimes", () => {
  const m = new VendingMachine(stock(), { 10: 3 });
  for (let i = 0; i < 4; i++) m.insert(25);
  m.select("C3");
  // 30 cents of change: 25 + 5 is impossible without a nickel; 10 + 10 + 10 works.
  assert.deepEqual(m.returned, [10, 10, 10]);
  assert.equal(m.box[25], 4);
  assert.equal(m.box[10], 0);
});

test("no money: select in idle does nothing", () => {
  const m = new VendingMachine(stock(), {});
  m.select("A1");
  assert.deepEqual(m.messages, ["insert coins first"]);
  assert.equal(m.state.name, "idle");
  assert.equal(m.tray.length, 0);
});

test("not enough: the machine waits for more coins, then sells", () => {
  const m = new VendingMachine(stock(), { 25: 2, 10: 2, 5: 2 });
  m.insert(25);
  m.insert(25);
  m.select("B2");
  assert.deepEqual(m.messages, ["chips costs 65, credit is 50"]);
  m.insert(25);
  m.select("B2");
  m.finish();
  assert.deepEqual(m.tray, ["chips"]);
  assert.deepEqual(m.returned, [10]);
});

test("exact change only: a sale it cannot make change for is refused, and cancel returns the coin", () => {
  const m = new VendingMachine(stock(), {});
  m.insert(100);
  m.select("B2");
  assert.deepEqual(m.messages, ["exact change only"]);
  assert.equal(m.state.name, "has-money", "still holding the credit");
  m.cancel();
  assert.deepEqual(m.returned, [100]);
  assert.equal(m.state.name, "idle");
});

test("busy: pressing select again while dispensing changes nothing", () => {
  const m = new VendingMachine(stock(), {});
  m.insert(100);
  m.select("A1");
  m.select("A1");
  m.finish();
  assert.deepEqual(m.tray, ["cola"]);
  assert.deepEqual(m.messages, ["busy"]);
  assert.equal(m.slots.get("A1")!.count, 4);
});

test("sold out: the last item moves the machine to sold-out, and coins come straight back", () => {
  const m = new VendingMachine({ C3: { name: "gum", price: 70, count: 1 } }, { 10: 3 });
  for (let i = 0; i < 4; i++) m.insert(25);
  m.select("C3");
  m.finish();
  assert.equal(m.state.name, "sold-out");
  m.insert(25);
  assert.deepEqual(m.returned, [10, 10, 10, 25]);
  m.restock("C3", 10);
  assert.equal(m.state.name, "idle");
});

test("broken: boolean flags — select pressed twice while vending gives two colas for one dollar", () => {
  const m = new FlagMachine(stock(), {});
  m.insert(100);
  m.select("A1");
  m.select("A1");
  m.finish();
  m.finish();
  assert.deepEqual(m.tray, ["cola", "cola"]);
  assert.deepEqual(m.escrow, [100], "one dollar inserted");
  assert.equal(m.credit, -100, "the machine now says the customer owes a dollar it can never collect");
});
