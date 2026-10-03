/**
 * 07. Delayed Job Scheduler
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design an in-process scheduler. Callers say "run this job in 5 minutes" or "run this
 *   every hour", and can cancel a job they scheduled. A loop wakes up and runs whatever is due.
 *   It must hold many jobs, find the due ones without looking at all of them, keep recurring
 *   jobs on their schedule however late the loop wakes, and be testable without waiting for
 *   real time to pass.
 *
 * Approach: A min-heap ordered by run time, an injected clock, lazy cancellation
 *   Keep jobs in a binary min-heap keyed by (runAt, id), so the soonest job is always on top.
 *   A tick asks the clock for now, pops jobs while the top is due, and runs them. A recurring
 *   job's next run is its last scheduled time plus its period, never "now plus period", so
 *   lateness does not add up; slots missed while asleep are skipped, not replayed. Cancel only
 *   marks the job; the tick throws marked jobs away when they reach the top, and the heap is
 *   rebuilt if marked jobs ever outnumber live ones. Time comes from a Clock object passed in,
 *   so tests use a fake clock they move by hand.
 *
 * Cost: schedule O(log n); a tick O(1) when nothing is due plus O(log n) per job it pops;
 *   cancel O(1); the occasional rebuild O(n). Memory O(n), counting cancelled jobs not yet popped.
 *
 * Pattern: priority queue (binary heap), dependency injection (clock), lazy deletion
 * Key insight: The loop only ever needs the soonest job, which is exactly what a min-heap
 *   gives in O(1), so most ticks cost one comparison however many jobs wait. And a recurring
 *   schedule is a grid fixed in advance (100, 200, 300...): compute the next point on the grid,
 *   not "now plus the period", or every late wake-up pushes the whole schedule later.
 * Tradeoffs: Lazy cancellation makes cancel O(1) but keeps dead jobs in memory until popped or
 *   compacted; an indexed heap (each job knows its position) removes in O(log n) instead.
 *   Skipping missed slots suits "refresh the cache every minute"; billing "every day, no
 *   matter what" may need missed runs replayed instead. A timing wheel makes schedule and
 *   cancel O(1) for short, bounded delays, at the cost of a fixed time resolution.
 * Staff notes: Interviewers probe: how the loop knows how long to sleep (until the top's
 *   runAt, and wake early when a sooner job is scheduled), what happens on a slow job (run
 *   jobs on a worker pool, not the timer loop), cancelling a job while it runs, many
 *   schedulers on many machines (claim jobs with a conditional update in shared storage), and
 *   how to test it (an injected clock, never sleep in tests).
 * Interview signals: "design a job scheduler", "run this later", "cron", "setTimeout at scale",
 *   "recurring jobs", "cancel a scheduled job", "how would you test time".
 * Real world: Java's ScheduledThreadPoolExecutor keeps tasks in a heap-based delay queue; its
 *   scheduleAtFixedRate keeps a grid (next = previous scheduled time + period) and, after a
 *   stall, runs the missed executions back to back rather than skipping them;
 *   scheduleWithFixedDelay waits a delay after each run ends. By default a cancelled task
 *   stays in the queue until its delay elapses unless setRemoveOnCancelPolicy(true) is set.
 *   Go's runtime keeps timers in a 4-ary heap. Kafka uses hierarchical timing wheels for its
 *   many short request timeouts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export interface Clock {
  now(): number;
}

export type Job = { id: number; name: string; runAt: number; everyMs: number; cancelled: boolean };
export type Run = { name: string; due: number; at: number };

export class Scheduler {
  // @viz hide:clock
  // @why Min-heap: every job runs no later than its two children, so the soonest job is always heap[0].
  heap: Job[] = [];
  // @why Live jobs by id, so cancel finds a job in O(1) without searching the heap.
  jobs = new Map<number, Job>();
  // @why Cancelled jobs still in the heap. Lazy deletion leaves them there until they reach the top.
  dead = 0;
  // @why Every run: which job, the time it was due, the time it actually ran.
  ran: Run[] = [];
  // @why Jobs looked at by tick() so far: the work the loop does to find what is due.
  looked = 0;
  nextId = 1;
  clock: Clock;

  constructor(clock: Clock) {
    // @why The clock is passed in, never read from the system: tests move a fake clock by hand.
    this.clock = clock;
  }

  /** Run once after delayMs, or every everyMs after that if everyMs > 0. Returns the job id. */
  schedule(name: string, delayMs: number, everyMs = 0): number {
    const job = { id: this.nextId++, name, runAt: this.clock.now() + delayMs, everyMs, cancelled: false };
    this.jobs.set(job.id, job);
    this.push(job);
    return job.id;
  }

  cancel(id: number): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    // @why Lazy: just mark it. Finding and removing it from the middle of the heap would cost O(n).
    job.cancelled = true; // @mark cancel
    this.jobs.delete(id);
    this.dead++;
    // @why If dead jobs outnumber live ones, rebuild without them, so memory stays O(live jobs).
    if (this.dead > this.heap.length / 2) this.compact();
    return true;
  }

  /** Run every job that is due now. */
  tick() {
    const now = this.clock.now();
    for (;;) {
      this.looked++;
      const top = this.heap[0];
      // @why The soonest job is not due, so no job is: one look, however many jobs wait.
      if (!top || top.runAt > now) break; // @mark not-due
      this.pop();
      if (top.cancelled) {
        // @why A cancelled job reached the top: drop it now. This is where lazy deletion pays its debt.
        this.dead--; // @mark drop-cancelled
        continue;
      }
      this.ran.push({ name: top.name, due: top.runAt, at: now }); // @mark run
      if (top.everyMs > 0) {
        top.runAt = this.nextRun(top, now);
        this.push(top); // @mark reschedule
      } else {
        this.jobs.delete(top.id);
      }
    }
  }

  /** The next point on the job's grid after now: last due time plus whole periods. */
  nextRun(job: Job, now: number): number {
    let next = job.runAt + job.everyMs;
    // @why Woke up so late that slots passed: skip them and land on the grid, rather than run a burst of catch-up runs.
    while (next <= now) next += job.everyMs; // @mark skip-missed
    return next; // @mark on-grid
  }

  /** When the loop should wake next, or null if nothing is scheduled. */
  nextWakeup(): number | null {
    while (this.heap.length > 0 && this.heap[0].cancelled) {
      this.pop();
      this.dead--;
    }
    return this.heap.length > 0 ? this.heap[0].runAt : null;
  }

  push(job: Job) {
    this.heap.push(job);
    let i = this.heap.length - 1;
    // @why Sift up: swap with the parent while sooner than it. At most log2(n) swaps.
    while (i > 0 && this.before(this.heap[i], this.heap[(i - 1) >> 1])) {
      const p = (i - 1) >> 1;
      [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
      i = p;
    }
  }

  pop(): Job {
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  siftDown(i: number) {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.heap.length && this.before(this.heap[l], this.heap[m])) m = l;
      if (r < this.heap.length && this.before(this.heap[r], this.heap[m])) m = r;
      if (m === i) return;
      [this.heap[i], this.heap[m]] = [this.heap[m], this.heap[i]];
      i = m;
    }
  }

  compact() {
    this.heap = this.heap.filter((j) => !j.cancelled); // @mark compact
    this.dead = 0;
    // @why Rebuild the heap bottom-up: O(n), cheaper than n pushes.
    for (let i = (this.heap.length >> 1) - 1; i >= 0; i--) this.siftDown(i);
  }

  /** Sooner first; equal times run in the order they were scheduled (lower id first). */
  before(a: Job, b: Job): boolean {
    return a.runAt < b.runAt || (a.runAt === b.runAt && a.id < b.id);
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: an unsorted list. Every tick looks at every job to find the due ones.
export class ListScheduler extends Scheduler {
  list: Job[] = [];

  schedule(name: string, delayMs: number, everyMs = 0): number {
    const job = { id: this.nextId++, name, runAt: this.clock.now() + delayMs, everyMs, cancelled: false };
    this.list.push(job);
    return job.id;
  }

  tick() {
    const now = this.clock.now();
    for (const job of [...this.list]) {
      // @why Looks at every job, due or not, on every tick.
      this.looked++; // @mark scan
      if (job.runAt > now) continue;
      this.ran.push({ name: job.name, due: job.runAt, at: now });
      this.list.splice(this.list.indexOf(job), 1);
    }
  }
}

// Broken on purpose: the next run is "now plus the period", so every late wake-up moves the
// whole schedule later, and the lateness adds up.
export class DriftingScheduler extends Scheduler {
  nextRun(job: Job, now: number): number {
    return now + job.everyMs; // @mark drift
  }
}

// A clock the test moves by hand. Nothing here ever reads the real time.
class FakeClock implements Clock {
  t = 0;
  now(): number {
    return this.t;
  }
}

const dues = (s: Scheduler) => s.ran.map((r) => r.due);

test("order: jobs run soonest first, whatever order they were scheduled in", () => {
  const clock = new FakeClock();
  const s = new Scheduler(clock);
  s.schedule("c", 300);
  s.schedule("a", 100);
  s.schedule("b", 200);
  s.schedule("a2", 100);
  clock.t = 150;
  s.tick();
  assert.deepEqual(s.ran.map((r) => r.name), ["a", "a2"], "a and a2 are due; equal times run in scheduling order");
  clock.t = 300;
  s.tick();
  assert.deepEqual(s.ran.map((r) => r.name), ["a", "a2", "b", "c"]);
  assert.equal(s.heap.length, 0);
});

test("idle ticks: with nothing due, a tick looks at one job, however many wait", () => {
  const clock = new FakeClock();
  const s = new Scheduler(clock);
  for (let i = 0; i < 30; i++) s.schedule(`report-${i}`, 3_600_000);
  for (let sec = 1; sec <= 20; sec++) {
    clock.t = sec * 1000;
    s.tick();
  }
  assert.equal(s.looked, 20, "one look per tick");
  assert.equal(s.ran.length, 0);
});

test("recurring: runs stay on the grid when the loop wakes 5 ms late every time", () => {
  const clock = new FakeClock();
  const s = new Scheduler(clock);
  s.schedule("report", 100, 100);
  // The loop sleeps until the next job is due, and the operating system wakes it 5 ms late.
  for (let i = 0; i < 10; i++) {
    clock.t = s.nextWakeup()! + 5;
    s.tick();
  }
  assert.deepEqual(dues(s), [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
  assert.deepEqual(s.ran.map((r) => r.at - r.due), [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], "each run is 5 ms late, never more");
});

test("missed slots: after a long pause the job runs once and goes back on the grid", () => {
  const clock = new FakeClock();
  const s = new Scheduler(clock);
  s.schedule("refresh-cache", 100, 100);
  // The process was paused (a long garbage collection, a laptop asleep) from 90 ms to 350 ms.
  clock.t = 350;
  s.tick();
  assert.deepEqual(s.ran, [{ name: "refresh-cache", due: 100, at: 350 }], "one run, not three back to back");
  assert.equal(s.nextWakeup(), 400, "200 and 300 are skipped; 400 is the next slot");
});

test("cancel: a cancelled job stays in the heap until it reaches the top, then is dropped", () => {
  const clock = new FakeClock();
  const s = new Scheduler(clock);
  s.schedule("send-reminder", 100);
  const id = s.schedule("expire-cart", 200);
  s.schedule("charge-card", 300);
  s.cancel(id);
  assert.equal(s.heap.length, 3, "still in the heap: cancel only marked it");
  clock.t = 300;
  s.tick();
  assert.deepEqual(s.ran.map((r) => r.name), ["send-reminder", "charge-card"]);
  assert.equal(s.dead, 0);
});

test("cancel recurring: cancelling between runs stops a recurring job", () => {
  const clock = new FakeClock();
  const s = new Scheduler(clock);
  const id = s.schedule("heartbeat", 100, 100);
  clock.t = 100;
  s.tick();
  s.cancel(id);
  clock.t = 500;
  s.tick();
  assert.deepEqual(dues(s), [100]);
  assert.equal(s.heap.length, 0);
});

test("compact: when cancelled jobs outnumber live ones, the heap is rebuilt without them", () => {
  const clock = new FakeClock();
  const s = new Scheduler(clock);
  const ids: number[] = [];
  for (let i = 1; i <= 8; i++) ids.push(s.schedule(`job-${i}`, i * 100));
  for (const id of ids.slice(0, 5)) s.cancel(id);
  // The fifth cancel makes 5 dead of 8, more than half: rebuild.
  assert.equal(s.heap.length, 3);
  assert.equal(s.dead, 0);
  assert.equal(s.nextWakeup(), 600);
});

test("broken: scan the list every tick — 20 idle ticks look at 30 jobs each", () => {
  const clock = new FakeClock();
  const s = new ListScheduler(clock);
  for (let i = 0; i < 30; i++) s.schedule(`report-${i}`, 3_600_000);
  for (let sec = 1; sec <= 20; sec++) {
    clock.t = sec * 1000;
    s.tick();
  }
  assert.equal(s.looked, 600, "30 jobs x 20 ticks, to run nothing");
  assert.equal(s.ran.length, 0);
});

test("broken: next run = now + period — 5 ms of lateness per run adds up", () => {
  const clock = new FakeClock();
  const s = new DriftingScheduler(clock);
  s.schedule("report", 100, 100);
  for (let i = 0; i < 10; i++) {
    clock.t = s.nextWakeup()! + 5;
    s.tick();
  }
  assert.deepEqual(dues(s), [100, 205, 310, 415, 520, 625, 730, 835, 940, 1045]);
  assert.equal(s.ran[9].at, 1050, "the tenth run, due at 1000, ran 50 ms late");
});
