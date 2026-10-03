/**
 * 04. Elevator Scheduler
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design the controller for an elevator. People press buttons (on a floor, or inside
 *   the car) at any time; the car must serve every request, never move with its doors open,
 *   never go outside the building, and not waste travel. The rule that picks the next floor
 *   should be swappable, so it can be tuned or tested on its own.
 *
 * Approach: An elevator state machine driven by ticks, and a Scheduler interface; LOOK as the
 *   rule
 *   The Elevator owns its state (floor, direction, idle / moving / doors open) and the pending
 *   stops, and advances one tick at a time: close the doors, or open them at a stop, or move one
 *   floor. Which floor to head for is asked of a Scheduler. LOOK keeps going in the current
 *   direction while any stop lies ahead, takes the nearest one ahead, and turns only when
 *   nothing is left that way. SCAN is the same but always runs to the end of the shaft before
 *   turning. First come, first served (FCFS) is the broken baseline.
 *
 * Cost: next() is O(pending stops) per tick (a sorted set per direction makes it O(log n));
 *   memory O(pending stops).
 *
 * Pattern: state machine, strategy (scheduler), simulation by discrete ticks
 * Key insight: Serving requests in the order they arrived makes the car cross the building
 *   back and forth. Serving them in the order of the floors, one direction at a time, visits
 *   every stop in one or two sweeps, and no request waits more than about two sweeps of the
 *   building, so nobody starves.
 * Tradeoffs: LOOK makes a call just behind the car wait for a whole sweep; nearest-first
 *   (shortest seek) travels less on average but can starve a far floor forever while near calls
 *   keep coming. SCAN's run to the end of the shaft is travel nobody asked for; LOOK is SCAN
 *   without it.
 * Staff notes: Interviewers probe the state machine (what states, which transitions are
 *   legal), hall calls with a direction (an "up" call on floor 4 is not served by a car going
 *   down), several cars (a dispatcher assigns each hall call to one car: by estimated time of
 *   arrival, with the scheduler per car unchanged), concurrency (buttons arrive from other
 *   threads: a lock or a queue of events into one control loop), and testing (ticks make the
 *   simulation deterministic; assert travel and service order).
 * Interview signals: "design an elevator system", "which floor next", "multiple elevators",
 *   "state machine", "starvation", "SCAN vs LOOK".
 * Real world: SCAN and LOOK are the classic disk-arm scheduling algorithms (the "elevator
 *   algorithm"), named after this exact problem. Building elevator dispatch is usually more
 *   involved (destination dispatch, traffic modes for rush hour), but each car still sweeps
 *   in one direction at a time.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Direction = "up" | "down" | "idle";
export type CarState = "idle" | "moving" | "doorsOpen";
type Event = { t: number; ok: boolean; row: string; label: string };
type Point = { t: number; v: number };

/** Picks the floor the car should head for next, or null when nothing is pending. */
export interface Scheduler {
  next(car: Elevator): number | null;
}

export class Elevator {
  // @viz timeline:history,floors,lanes,ok=served hide:scheduler,top
  // @why The highest floor. Floors run 0..top; a request outside them is refused, never queued.
  top: number;
  floor: number;
  direction: Direction = "idle";
  // @why The state machine: idle, moving or doorsOpen. The car only moves from idle or moving, never with the doors open.
  state: CarState = "idle";
  // @why Floors still to visit, in the order they were requested. Only FCFS cares about that order.
  pending: number[] = [];
  served: number[] = [];
  // @why Floors travelled in total: the cost a scheduler is judged by.
  traveled = 0;
  t = 0;
  scheduler: Scheduler;
  // @why For the picture only: the car's floor over time, and calls and stops on two rows.
  floors: Point[] = [];
  history: Event[] = [];
  lanes = ["call", "stop"];

  constructor(top: number, start: number, scheduler: Scheduler) {
    this.top = top;
    this.floor = start;
    this.scheduler = scheduler;
    this.floors.push({ t: 0, v: start });
  }

  /** Adds a stop. Returns false for a floor the building does not have: refused, never queued. */
  request(floor: number): boolean {
    if (floor < 0 || floor > this.top) {
      this.history.push({ t: this.t, ok: false, row: "call", label: `no floor ${floor}: refused` });
      return false; // @mark refuse
    }
    // @why Pressing a lit button again changes nothing.
    if (this.pending.includes(floor)) return true;
    this.pending.push(floor);
    this.history.push({ t: this.t, ok: true, row: "call", label: `call to floor ${floor}` }); // @mark call
    return true;
  }

  /** One tick. Returns false when there is nothing left to do. */
  step(): boolean {
    if (this.state === "doorsOpen") {
      this.t++;
      // @why Doors close before anything else: a car never moves with them open.
      this.state = "idle"; // @mark close
      return true;
    }
    const target = this.scheduler.next(this);
    if (target === null) {
      this.direction = "idle";
      return false;
    }
    this.t++;
    if (target === this.floor) {
      if (this.pending.includes(target)) {
        this.pending = this.pending.filter((f) => f !== target);
        this.served.push(target);
        this.history.push({ t: this.t, ok: true, row: "stop", label: `doors open at ${target}` });
        this.state = "doorsOpen"; // @mark open
      } else {
        // @why SCAN only: the end of the shaft, with nobody to serve here. Turn round.
        this.direction = this.direction === "up" ? "down" : "up"; // @mark turn
      }
      return true;
    }
    this.direction = target > this.floor ? "up" : "down";
    this.state = "moving";
    this.floor += this.direction === "up" ? 1 : -1;
    this.traveled++; // @mark move
    this.floors.push({ t: this.t, v: this.floor });
    return true;
  }
}

/** LOOK: keep going while anything lies ahead; take the nearest stop ahead; turn when nothing is left that way. */
export class Look implements Scheduler {
  next(car: Elevator): number | null {
    if (car.pending.length === 0) return null;
    const above = car.pending.filter((f) => f >= car.floor);
    const below = car.pending.filter((f) => f <= car.floor);
    // @why Going up (or idle): the nearest stop above, so no stop on the way is passed by.
    if (car.direction !== "down" && above.length > 0) {
      return Math.min(...above); // @mark ahead
    }
    if (car.direction === "down" && below.length > 0) return Math.max(...below);
    // @why Nothing left in this direction: turn at once, at the last stop, not at the end of the shaft.
    return above.length > 0 ? Math.min(...above) : Math.max(...below); // @mark reverse
  }
}

/** SCAN: like LOOK, but runs to the end of the shaft before turning if anyone waits behind. */
export class Scan extends Look {
  next(car: Elevator): number | null {
    if (car.pending.length === 0) return null;
    const above = car.pending.some((f) => f >= car.floor);
    const below = car.pending.some((f) => f <= car.floor);
    // @why Stops only behind: SCAN still finishes the sweep to the top (or bottom) floor first.
    if (car.direction === "up" && !above && below) {
      return car.top; // @mark toEnd
    }
    if (car.direction === "down" && !below && above) return 0;
    return super.next(car);
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: always heads for the oldest request, whatever lies on the way.
export class FirstComeFirstServed implements Scheduler {
  next(car: Elevator): number | null {
    if (car.pending.length === 0) return null;
    // @why Arrival order, not floor order: floors on the way are passed by, and the car crosses the building again and again.
    return car.pending[0]; // @mark oldest
  }
}

/** Runs a fresh LOOK car from `start` through `calls` and returns the floors it travelled. */
function lookTravel(start: number, calls: number[]): number {
  const car = new Elevator(9, start, new Look());
  for (const f of calls) car.request(f);
  while (car.step()) {
    // one tick at a time
  }
  return car.traveled;
}

test("look: one sweep up serves every call in floor order", () => {
  const car = new Elevator(9, 0, new Look());
  for (const f of [8, 1, 7, 2, 6]) car.request(f);
  while (car.step()) {
    // one tick at a time
  }
  assert.deepEqual(car.served, [1, 2, 6, 7, 8]);
  assert.equal(car.traveled, 8, "0 to 8, once");
});

test("look: a call that arrives on the way is picked up without a detour", () => {
  const car = new Elevator(9, 0, new Look());
  car.request(8);
  for (let i = 0; i < 3; i++) car.step();
  assert.equal(car.floor, 3);
  car.request(5);
  while (car.step()) {
    // one tick at a time
  }
  assert.deepEqual(car.served, [5, 8]);
  assert.equal(car.traveled, 8);
});

test("look: with nothing left ahead, the car turns at the last call", () => {
  const car = new Elevator(9, 5, new Look());
  car.request(7);
  car.request(2);
  while (car.step()) {
    // one tick at a time
  }
  assert.deepEqual(car.served, [7, 2]);
  assert.equal(car.traveled, 7, "5 to 7, then 7 to 2");
  assert.equal(Math.max(...car.floors.map((p) => p.v)), 7, "never above the highest call");
  // An idle car looks up first: from 5 with calls at 9 and 4 it travels 4 + 5 = 9, not 1 + 5 = 6.
  assert.equal(lookTravel(5, [9, 4]), 9);
});

test("scan: runs to the end of the shaft before turning", () => {
  const car = new Elevator(9, 5, new Scan());
  car.request(7);
  car.request(2);
  while (car.step()) {
    // one tick at a time
  }
  assert.deepEqual(car.served, [7, 2]);
  assert.equal(car.traveled, 11, "5 to 7, on to 9, then 9 to 2");
});

test("state machine: a call at the car's floor opens the doors without moving; a floor outside is refused", () => {
  const car = new Elevator(9, 4, new Look());
  car.request(4);
  car.step();
  assert.equal(car.state, "doorsOpen");
  car.step();
  assert.equal(car.state, "idle", "the doors close before anything else happens");
  assert.equal(car.traveled, 0);
  assert.equal(car.request(12), false, "a floor the building does not have is refused");
  assert.deepEqual(car.pending, []);
});

test("broken: first come, first served — the car zig-zags 30 floors for 8 floors of work", () => {
  const car = new Elevator(9, 0, new FirstComeFirstServed());
  for (const f of [8, 1, 7, 2, 6]) car.request(f);
  car.step();
  assert.equal(car.floor, 1);
  assert.deepEqual(car.served, [], "passes floor 1, where someone is waiting, without stopping");
  while (car.step()) {
    // one tick at a time
  }
  assert.deepEqual(car.served, [8, 1, 7, 2, 6]);
  assert.equal(car.traveled, 30, "8 + 7 + 6 + 5 + 4");
  // LOOK serves the same five calls in 8 floors.
});
