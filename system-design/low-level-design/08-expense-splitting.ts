/**
 * 08. Expense Splitting
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design the core of an app like Splitwise. Friends add expenses: who paid, how much,
 *   and how it is shared (equally, by exact amounts, or by percentages). The app shows what
 *   each person is owed or owes, and at the end suggests a short list of payments that settles
 *   everyone up. Not a cent may appear or vanish along the way.
 *
 * Approach: Integer cents, net balances, largest-remainder rounding, greedy settle-up
 *   Store every amount as a whole number of cents. Keep one net balance per person (positive:
 *   owed money; negative: owes money). An expense credits the payer the total and debits each
 *   person their share. Shares are computed so they always add up to the total: an equal split
 *   gives everyone the floor and hands the leftover cents out one each; a percent split floors
 *   each share and gives the leftover cents to the largest fractional parts. To settle, pair
 *   the person owed the most with the person who owes the most, pay the smaller of the two
 *   amounts, and repeat.
 *
 * Cost: an expense is O(people in it); settle-up is O(n) per transfer and at most n - 1
 *   transfers, so O(n^2) for n people with a balance.
 *
 * Pattern: value objects (money as integer cents), invariants, strategy (split kinds), greedy
 * Key insight: Rounding each share on its own loses or invents cents: $10.00 three ways rounds
 *   to $3.33 each, $9.99 in all. Decide the shares together so they add up to the total, and
 *   the ledger keeps its invariant: every balance added up is exactly zero.
 * Tradeoffs: Net balances forget who paid for whom, so settle-up may tell Asha to pay someone
 *   she never shared an expense with; showing pairwise debts keeps that but needs more
 *   payments. Greedy settle-up is fast and uses at most n - 1 payments, but is not always the
 *   fewest possible; the fewest is NP-hard to find in general.
 * Staff notes: Interviewers probe money types (never floats), who gets the leftover cent,
 *   validation (exact shares must add up, percentages to 100), editing or deleting an expense
 *   (recompute from the expense list, or apply the reverse), currencies (one balance per
 *   currency; convert only at settle time), and concurrency (two people adding expenses at once:
 *   store expenses as an append-only list and derive balances from it).
 * Interview signals: "design Splitwise", "split a bill", "who owes whom", "minimize the number
 *   of transactions", "rounding", "money in floating point".
 * Real world: Payment systems generally store money as integer minor units (cents) or a
 *   decimal type; Stripe's API takes amounts as integers in the currency's smallest unit.
 *   Splitwise offers an option to simplify debts within a group. Seat-allocation methods
 *   (largest remainder, also called Hamilton's method) use the same rounding rule as the
 *   percent split here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Split = { kind: "equal" } | { kind: "exact"; cents: Record<string, number> } | { kind: "percent"; pct: Record<string, number> };
export type Transfer = { from: string; to: string; cents: number };

export class Ledger {
  // @why Net position per person, in whole cents: + means others owe them, - means they owe. It always sums to 0.
  balances = new Map<string, number>();
  // @why Every expense accepted, in order. Balances could always be rebuilt from this list.
  expenses: string[] = [];

  /** Returns each person's share, or an error and changes nothing. */
  addExpense(what: string, paidBy: string, totalCents: number, among: string[], split: Split): Record<string, number> | string {
    if (!Number.isInteger(totalCents) || totalCents <= 0) return "amount must be a positive whole number of cents";
    const shares = this.shares(totalCents, among, split);
    if (typeof shares === "string") return shares; // @mark rejected
    // @why The invariant, checked on every expense: the shares add up to exactly what was paid.
    if (among.reduce((sum, p) => sum + shares[p], 0) !== totalCents) return "shares do not add up to the total";
    this.adjust(paidBy, totalCents);
    for (const p of among) this.adjust(p, -shares[p]);
    this.expenses.push(`${what}: ${paidBy} paid ${totalCents}`); // @mark applied
    return shares;
  }

  /** The split strategy: each kind turns a total into whole-cent shares that add up to it. */
  shares(total: number, among: string[], split: Split): Record<string, number> | string {
    if (split.kind === "equal") return this.splitEvenly(total, among);
    if (split.kind === "exact") {
      const sum = among.reduce((s, p) => s + (split.cents[p] ?? 0), 0);
      // @why Exact amounts are the user's numbers. If they do not add up, refuse; never guess who absorbs the difference.
      if (sum !== total) return `exact shares add up to ${sum}, not ${total}`; // @mark exact-mismatch
      return { ...split.cents };
    }
    return this.splitByPercent(total, among, split.pct);
  }

  splitEvenly(total: number, among: string[]): Record<string, number> {
    const base = Math.floor(total / among.length);
    // @why The cents that do not divide evenly: fewer than the number of people.
    let leftover = total - base * among.length; // @mark leftover
    const out: Record<string, number> = {};
    for (const p of among) {
      // @why One extra cent each, to the first people listed, until the leftover is gone.
      out[p] = base + (leftover > 0 ? 1 : 0); // @mark extra-cent
      if (leftover > 0) leftover--;
    }
    return out;
  }

  splitByPercent(total: number, among: string[], pct: Record<string, number>): Record<string, number> | string {
    // @why Percentages to two decimals become whole basis points (1% = 100), so the arithmetic below is exact.
    const bp = among.map((p) => Math.round((pct[p] ?? 0) * 100));
    if (bp.reduce((s, x) => s + x, 0) !== 10_000) return "percentages must add up to 100";
    const out: Record<string, number> = {};
    const rest: number[] = [];
    let given = 0;
    for (let i = 0; i < among.length; i++) {
      out[among[i]] = Math.floor((total * bp[i]) / 10_000);
      rest.push((total * bp[i]) % 10_000);
      given += out[among[i]];
    }
    // @why Largest remainder: the cents lost to flooring go, one each, to the shares that lost the most.
    const order = among.map((_, i) => i).sort((a, b) => rest[b] - rest[a] || a - b);
    for (let k = 0; k < total - given; k++) out[among[order[k]]]++; // @mark largest-remainder
    return out;
  }

  adjust(person: string, cents: number) {
    this.balances.set(person, (this.balances.get(person) ?? 0) + cents);
  }

  /** Greedy: the person owed most is paid by the person who owes most, until everyone is at zero. */
  settleUp(): Transfer[] {
    const left = new Map(this.balances);
    const transfers: Transfer[] = [];
    for (;;) {
      let creditor = "";
      let debtor = "";
      for (const [p, c] of left) {
        if (c > (left.get(creditor) ?? 0)) creditor = p;
        if (c < (left.get(debtor) ?? 0)) debtor = p;
      }
      // @why Nobody is owed, or nobody owes. With a correct ledger both happen together, when every balance is 0.
      if (!creditor || !debtor) break; // @mark settled
      const cents = Math.min(left.get(creditor)!, -left.get(debtor)!);
      // @why The smaller side reaches zero, so every transfer settles at least one person: at most n - 1 transfers.
      transfers.push({ from: debtor, to: creditor, cents }); // @mark transfer
      left.set(creditor, left.get(creditor)! - cents);
      left.set(debtor, left.get(debtor)! + cents);
    }
    this.unsettled = [...left].filter(([, c]) => c !== 0).map(([p, c]) => `${p} ${c}`);
    return transfers;
  }

  // @why Balances still not zero after settling up. Empty for a correct ledger.
  unsettled: string[] = [];

  /** The invariant: all balances added up. */
  sum(): number {
    let s = 0;
    for (const c of this.balances.values()) s += c;
    return s;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: rounds each person's share on its own, and never checks that the shares
// add up to what was paid.
export class RoundEachShareLedger extends Ledger {
  addExpense(what: string, paidBy: string, totalCents: number, among: string[], _split?: Split): Record<string, number> | string {
    const out: Record<string, number> = {};
    for (const p of among) {
      // @why 1000 / 3 = 333.33..., rounded to 333 for each of three people: 999 in all.
      out[p] = Math.round(totalCents / among.length); // @mark round-each
      this.adjust(p, -out[p]);
    }
    this.adjust(paidBy, totalCents);
    this.expenses.push(`${what}: ${paidBy} paid ${totalCents}`);
    return out;
  }
}

/** Apply a list of payments to a copy of the balances; what is left. */
function after(balances: Map<string, number>, transfers: Transfer[]): number[] {
  const b = new Map(balances);
  for (const t of transfers) {
    b.set(t.from, b.get(t.from)! + t.cents);
    b.set(t.to, b.get(t.to)! - t.cents);
  }
  return [...b.values()];
}

const equal: Split = { kind: "equal" };

test("equal split: $10.00 three ways is 334 + 333 + 333 cents, and nothing is lost", () => {
  const ledger = new Ledger();
  const shares = ledger.addExpense("pizza", "Asha", 1000, ["Asha", "Ben", "Cara"], equal);
  assert.deepEqual(shares, { Asha: 334, Ben: 333, Cara: 333 });
  assert.deepEqual([...ledger.balances], [["Asha", 666], ["Ben", -333], ["Cara", -333]]);
  assert.equal(ledger.sum(), 0);
});

test("percent split: 30/30/40 of $9.99 — the two lost cents go to the largest remainders", () => {
  const ledger = new Ledger();
  const shares = ledger.addExpense("taxi", "Cara", 999, ["Asha", "Ben", "Cara"], { kind: "percent", pct: { Asha: 30, Ben: 30, Cara: 40 } });
  // Exact shares would be 299.7, 299.7 and 399.6. Flooring gives 997; the .7s get the two cents.
  assert.deepEqual(shares, { Asha: 300, Ben: 300, Cara: 399 });
  assert.equal(ledger.sum(), 0);
});

test("exact split: shares that do not add up are rejected, and no balance changes", () => {
  const ledger = new Ledger();
  ledger.addExpense("tickets", "Ben", 3000, ["Ben", "Cara"], { kind: "exact", cents: { Ben: 1500, Cara: 1500 } });
  const result = ledger.addExpense("snacks", "Ben", 1000, ["Ben", "Cara"], { kind: "exact", cents: { Ben: 400, Cara: 500 } });
  assert.equal(result, "exact shares add up to 900, not 1000");
  assert.deepEqual([...ledger.balances], [["Ben", 1500], ["Cara", -1500]]);
  assert.equal(ledger.expenses.length, 1);
});

test("settle up: a weekend of mixed expenses settles in two payments", () => {
  const ledger = new Ledger();
  const people = ["Asha", "Ben", "Cara"];
  ledger.addExpense("hotel", "Asha", 30_000, people, equal);
  ledger.addExpense("dinner", "Ben", 10_000, people, equal);
  ledger.addExpense("taxi", "Cara", 4_500, people, { kind: "percent", pct: { Asha: 30, Ben: 30, Cara: 40 } });
  assert.deepEqual([...ledger.balances], [["Asha", 15_316], ["Ben", -4_683], ["Cara", -10_633]]);
  const plan = ledger.settleUp();
  assert.deepEqual(plan, [
    { from: "Cara", to: "Asha", cents: 10_633 },
    { from: "Ben", to: "Asha", cents: 4_683 },
  ]);
  assert.deepEqual(after(ledger.balances, plan), [0, 0, 0]);
  assert.deepEqual(ledger.unsettled, []);
});

test("greedy is not always fewest: four payments where three would do", () => {
  const ledger = new Ledger();
  ledger.addExpense("concert ticket", "Cara", 700, ["Ben"], { kind: "exact", cents: { Ben: 700 } });
  ledger.addExpense("lunch", "Eli", 800, ["Asha", "Dev"], { kind: "exact", cents: { Asha: 300, Dev: 500 } });
  assert.deepEqual([...ledger.balances], [["Cara", 700], ["Ben", -700], ["Eli", 800], ["Asha", -300], ["Dev", -500]]);
  const greedy = ledger.settleUp();
  // Eli is owed the most and Ben owes the most, so greedy pairs them, though Ben's debt is to Cara.
  assert.deepEqual(greedy, [
    { from: "Ben", to: "Eli", cents: 700 },
    { from: "Dev", to: "Cara", cents: 500 },
    { from: "Asha", to: "Cara", cents: 200 },
    { from: "Asha", to: "Eli", cents: 100 },
  ]);
  // Paying back whoever paid for you takes three: {Cara, Ben} and {Eli, Asha, Dev} each sum to zero.
  const fewer = [
    { from: "Ben", to: "Cara", cents: 700 },
    { from: "Asha", to: "Eli", cents: 300 },
    { from: "Dev", to: "Eli", cents: 500 },
  ];
  assert.deepEqual(after(ledger.balances, greedy), [0, 0, 0, 0, 0]);
  assert.deepEqual(after(ledger.balances, fewer), [0, 0, 0, 0, 0]);
});

test("broken: round each share — $10.00 three ways charges $9.99, and a cent is owed by nobody", () => {
  const ledger = new RoundEachShareLedger();
  ledger.addExpense("pizza", "Asha", 1000, ["Asha", "Ben", "Cara"], equal);
  assert.deepEqual([...ledger.balances], [["Asha", 667], ["Ben", -333], ["Cara", -333]]);
  assert.equal(ledger.sum(), 1, "the balances no longer add up to zero");
  const plan = ledger.settleUp();
  assert.deepEqual(plan, [
    { from: "Ben", to: "Asha", cents: 333 },
    { from: "Cara", to: "Asha", cents: 333 },
  ]);
  assert.deepEqual(ledger.unsettled, ["Asha 1"], "after everyone pays, Asha is still owed a cent nobody owes");
  // The other way: $20.00 three ways rounds to 667 each, 2001 in all, a cent invented.
  assert.equal(Math.round(2000 / 3) * 3, 2001);
  // Floats make it worse: in dollars, even simple sums are not exact.
  assert.notEqual(0.1 + 0.2, 0.3);
});
