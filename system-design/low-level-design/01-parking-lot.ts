/**
 * 01. Parking Lot
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design the software for a parking lot. Spots come in three sizes (small, compact,
 *   large) and vehicles in three (motorcycle, car, van); a vehicle fits a spot its size or
 *   bigger. Drivers get a ticket on the way in and pay by the hour on the way out. Several
 *   entry gates admit cars at the same time.
 *
 * Approach: Free lists per spot size, smallest fit first, claim in one step
 *   Keep a list of free spot ids for each size. To park, try the vehicle's own size first,
 *   then each bigger size, and take a spot off the first list that has one: taking it off the
 *   list is what claims it, so finding and claiming are one step. A ticket remembers the spot
 *   and the entry time; leaving puts the spot back on its list and charges each started hour
 *   at the vehicle's rate.
 *
 * Cost: park and leave are O(1) (at most three lists to look at); O(spots) memory.
 *
 * Pattern: object modeling, free lists, atomic claim (check-then-act)
 * Key insight: Give each vehicle the smallest spot that fits, or small vehicles use up the big
 *   spots that only big vehicles can use. And never let "find a free spot" and "take it" be two
 *   steps another gate can run between: the claim must be one atomic step.
 * Tradeoffs: Smallest-fit can turn a car away from a full compact row while large spots sit
 *   free for vans that may never come; lots often let cars spill into large spots (as here) and
 *   reserve a few for vans. Free lists cost memory per spot but make parking O(1); scanning all
 *   spots needs nothing extra but is O(spots) per car.
 * Staff notes: In a real system the lot lives in a database, and the atomic claim is a
 *   conditional write: UPDATE spots SET plate = ? WHERE id = ? AND plate IS NULL, then check one
 *   row changed (or SELECT ... FOR UPDATE SKIP LOCKED to pick a free row). Interviewers look for
 *   clear entities (Lot, Spot, Vehicle, Ticket), a pricing rule kept apart from parking (a
 *   strategy), and the concurrency question asked unprompted.
 * Interview signals: "design a parking lot", "object-oriented design", "spot sizes", "two
 *   gates", "pricing per hour", "what if two cars arrive at once".
 * Real world: Garage systems show free counts per level from exactly these per-size counters;
 *   ticketing and reservation systems (seats, hotel rooms) use the same claim-in-one-step rule.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Size = "small" | "compact" | "large";
export type Vehicle = { plate: string; kind: "motorcycle" | "car" | "van" };
export type Spot = { id: string; size: Size; plate: string | null };
export type Ticket = { id: number; plate: string; kind: Vehicle["kind"]; spot: string; enteredMin: number };

// Spot sizes from smallest to largest, the spot size each vehicle needs, and its hourly rate.
const SIZES: Size[] = ["small", "compact", "large"];
const NEEDS: Record<Vehicle["kind"], Size> = { motorcycle: "small", car: "compact", van: "large" };
const RATE: Record<Vehicle["kind"], number> = { motorcycle: 1, car: 3, van: 5 };

export class ParkingLot {
  // @viz hide:layout,size,id,byId
  // @why Every spot, in the order they are painted on the ground (nearest the entrance first).
  spots: Spot[] = [];
  // @why Free spot ids for each size. Parking takes one off a list; leaving puts it back. No scanning.
  free: Record<Size, string[]> = { small: [], compact: [], large: [] };
  // @why Tickets of the vehicles parked now, by ticket number.
  tickets = new Map<number, Ticket>();
  nextTicket = 1;
  // @why The same spots, by id, so finding a spot from its id is one lookup, not a walk.
  byId = new Map<string, Spot>();

  constructor(layout: Spot["size"][]) {
    for (let i = 0; i < layout.length; i++) {
      // @why Ids say the size and the position: L1 is the large spot nearest the entrance.
      const id = `${layout[i][0].toUpperCase()}${i + 1}`;
      const spot: Spot = { id, size: layout[i], plate: null };
      this.spots.push(spot);
      this.byId.set(id, spot);
      this.free[layout[i]].push(id);
    }
  }

  park(v: Vehicle, nowMin: number): Ticket | null {
    // @why Smallest spot that fits first, then each bigger size: a motorcycle never takes a van's spot while a small one is free.
    for (const size of SIZES.slice(SIZES.indexOf(NEEDS[v.kind]))) {
      const list = this.free[size];
      if (list.length === 0) continue; // @mark fits
      // @why Taking the id off the free list is the claim. Nobody else can be handed this spot now.
      const id = list.pop()!; // @mark claim
      this.spotById(id).plate = v.plate;
      const ticket = { id: this.nextTicket++, plate: v.plate, kind: v.kind, spot: id, enteredMin: nowMin };
      this.tickets.set(ticket.id, ticket);
      return ticket;
    }
    // @why No spot of its size or bigger is free. Smaller free spots cannot help.
    return null; // @mark full
  }

  leave(ticketId: number, nowMin: number): number {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`no ticket ${ticketId}`);
    const spot = this.spotById(ticket.spot);
    spot.plate = null;
    this.free[spot.size].push(spot.id); // @mark release
    this.tickets.delete(ticketId);
    // @why Every started hour is charged, at least one, at the vehicle's rate (not the spot's: a car in a large spot pays a car's price).
    const hours = Math.max(1, Math.ceil((nowMin - ticket.enteredMin) / 60));
    return hours * RATE[ticket.kind]; // @mark fee
  }

  spotById(id: string): Spot {
    return this.byId.get(id)!;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: takes the first free spot that fits, walking from the entrance, whatever its size.
export class FirstFreeSpotLot extends ParkingLot {
  park(v: Vehicle, nowMin: number): Ticket | null {
    const need = SIZES.indexOf(NEEDS[v.kind]);
    const spot = this.spots.find((s) => s.plate === null && SIZES.indexOf(s.size) >= need); // @mark first-free
    if (!spot) return null; // @mark first-free-full
    spot.plate = v.plate;
    this.free[spot.size] = this.free[spot.size].filter((id) => id !== spot.id);
    const ticket = { id: this.nextTicket++, plate: v.plate, kind: v.kind, spot: spot.id, enteredMin: nowMin };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }
}

// Broken on purpose: a gate first looks for a free spot, then claims it in a second call. Another
// gate can look in between and be shown the same spot.
export class FindThenClaimLot extends ParkingLot {
  find(v: Vehicle): string | null {
    for (const size of SIZES.slice(SIZES.indexOf(NEEDS[v.kind]))) {
      const list = this.free[size];
      // @why Only looks: the spot stays on the free list until claim() runs.
      if (list.length > 0) return list[list.length - 1]; // @mark peek
    }
    return null;
  }

  claim(id: string, v: Vehicle, nowMin: number): Ticket {
    const spot = this.spotById(id);
    spot.plate = v.plate; // @mark overwrite
    const size = spot.size;
    this.free[size] = this.free[size].filter((x) => x !== id);
    const ticket = { id: this.nextTicket++, plate: v.plate, kind: v.kind, spot: id, enteredMin: nowMin };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }
}

const moto = (plate: string): Vehicle => ({ plate, kind: "motorcycle" });
const car = (plate: string): Vehicle => ({ plate, kind: "car" });
const van = (plate: string): Vehicle => ({ plate, kind: "van" });
// Nearest the entrance: one large spot, one compact, two small.
const LAYOUT: Size[] = ["large", "compact", "small", "small"];

test("smallest fit: each vehicle takes the smallest spot it fits", () => {
  const lot = new ParkingLot(LAYOUT);
  assert.equal(lot.park(moto("M-1"), 0)?.spot, "S4");
  assert.equal(lot.park(car("C-1"), 0)?.spot, "C2");
  assert.equal(lot.park(van("V-1"), 0)?.spot, "L1");
  assert.deepEqual(lot.free, { small: ["S3"], compact: [], large: [] });
});

test("spill over: with the compact spot taken, a car takes the large one; then a van is turned away", () => {
  const lot = new ParkingLot(LAYOUT);
  lot.park(car("C-1"), 0);
  assert.equal(lot.park(car("C-2"), 5)?.spot, "L1");
  // Two small spots are free, but a van fits neither.
  assert.equal(lot.park(van("V-1"), 10), null);
  assert.equal(lot.free.small.length, 2);
});

test("fees: every started hour, at the vehicle's rate", () => {
  const lot = new ParkingLot(LAYOUT);
  const t1 = lot.park(car("C-1"), 0)!;
  const t2 = lot.park(car("C-2"), 0)!;
  const t3 = lot.park(moto("M-1"), 30)!;
  assert.equal(t2.spot, "L1");
  assert.equal(lot.leave(t1.id, 59), 3, "59 minutes is one hour");
  assert.equal(lot.leave(t2.id, 61), 6, "61 minutes is two hours, at the car rate though the spot is large");
  assert.equal(lot.leave(t3.id, 40), 1, "10 minutes still pays one hour");
});

test("leave: a freed spot goes back on its list and is used again", () => {
  const lot = new ParkingLot(LAYOUT);
  const t = lot.park(van("V-1"), 0)!;
  assert.equal(lot.park(van("V-2"), 10), null);
  lot.leave(t.id, 70);
  assert.equal(lot.park(van("V-2"), 75)?.spot, "L1");
});

test("two gates: parking claims the spot in one step, so two cars never share one", () => {
  const lot = new ParkingLot(LAYOUT);
  const a = lot.park(car("C-A"), 0)!;
  const b = lot.park(car("C-B"), 0)!;
  assert.notEqual(a.spot, b.spot);
  assert.deepEqual([a.spot, b.spot], ["C2", "L1"]);
});

test("broken: first free spot — motorcycles take the large spot, and the van is turned away", () => {
  const lot = new FirstFreeSpotLot(LAYOUT);
  assert.equal(lot.park(moto("M-1"), 0)?.spot, "L1", "the first free spot from the entrance is the large one");
  assert.equal(lot.park(moto("M-2"), 1)?.spot, "C2");
  // The only spot a van fits is taken.
  assert.equal(lot.park(van("V-1"), 2), null);
  assert.equal(lot.free.small.length, 2, "both small spots are still free");
  // The correct lot parks all three.
  const good = new ParkingLot(LAYOUT);
  assert.deepEqual([good.park(moto("M-1"), 0)?.spot, good.park(moto("M-2"), 1)?.spot, good.park(van("V-1"), 2)?.spot], ["S4", "S3", "L1"]);
});

test("broken: find, then claim — two gates hand the same spot to two cars", () => {
  const lot = new FindThenClaimLot(["compact", "large"]);
  // Gate A and gate B each look for a spot before either claims one.
  const seenByA = lot.find(car("C-A"))!;
  const seenByB = lot.find(car("C-B"))!;
  assert.equal(seenByA, seenByB);
  const a = lot.claim(seenByA, car("C-A"), 0);
  const b = lot.claim(seenByB, car("C-B"), 0);
  assert.equal(a.spot, b.spot, "two tickets for one spot");
  assert.equal(lot.spotById(a.spot).plate, "C-B", "car A's spot now records car B");
  assert.equal(lot.free.large.length, 1, "while the large spot stays empty");
});
