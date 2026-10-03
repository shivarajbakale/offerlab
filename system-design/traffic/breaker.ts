// Protections a caller keeps for each downstream it calls: a circuit breaker (stop calling a
// dependency that keeps failing) and a retry budget (retries may be at most a share of first
// attempts). Plain state machines over simulated time, no randomness of their own.

import type { BreakerState } from "./types.ts";

export type BreakerConfig = { failureRate: number; windowMs: number; minCalls: number; openMs: number; probes: number };

export const BREAKER_DEFAULTS = { failureRate: 0.5, windowMs: 10_000, minCalls: 20, openMs: 5000, halfOpenProbes: 5 };

/** A sliding window of timestamps, oldest first, dropped once older than `windowMs`. */
class Window {
  private ts: number[] = [];
  private head = 0;
  private windowMs: number;
  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }
  add(t: number) {
    this.ts.push(t);
  }
  count(now: number): number {
    while (this.head < this.ts.length && this.ts[this.head] <= now - this.windowMs) this.head++;
    // Compact now and then so a long run does not keep every timestamp.
    if (this.head > 1024 && this.head * 2 > this.ts.length) {
      this.ts = this.ts.slice(this.head);
      this.head = 0;
    }
    return this.ts.length - this.head;
  }
  clear() {
    this.ts = [];
    this.head = 0;
  }
}

/**
 * Closed: calls pass and their outcomes are counted over the last `windowMs`. Once at least
 * `minCalls` have finished and `failureRate` of them failed, it opens: calls fail at once for
 * `openMs`. Then half-open: up to `probes` trial calls pass; if all succeed it closes, and the
 * first failure opens it again. Trial calls answered after the breaker moved on are ignored.
 */
export class Breaker {
  private calls: Window;
  private fails: Window;
  private openUntil = 0;
  private open = false;
  /** Trial calls let through in this half-open spell, still in flight, and succeeded. */
  private sent = 0;
  inFlight = 0;
  private passed = 0;
  /** Bumped on every state change, so a trial call from an earlier spell does not count. */
  gen = 0;
  private cfg: BreakerConfig;

  constructor(cfg: BreakerConfig) {
    this.cfg = cfg;
    this.calls = new Window(cfg.windowMs);
    this.fails = new Window(cfg.windowMs);
  }

  state(now: number): BreakerState {
    if (!this.open) return "closed";
    return now < this.openUntil ? "open" : "half-open";
  }

  /** Whether a call may go now: "go", "probe" (a half-open trial) or "short" (fail at once). */
  admit(now: number): "go" | "probe" | "short" {
    const s = this.state(now);
    if (s === "closed") return "go";
    if (s === "open" || this.sent >= this.cfg.probes) return "short";
    this.sent++;
    this.inFlight++;
    return "probe";
  }

  /** A call let through has finished. `probe` and `gen` are what admit() returned and the generation then. */
  record(now: number, ok: boolean, probe: boolean, gen: number): void {
    if (probe) this.inFlight--;
    if (gen !== this.gen) return;
    if (probe) {
      if (!ok) return this.trip(now);
      if (++this.passed >= this.cfg.probes) {
        this.open = false;
        this.gen++;
        this.calls.clear();
        this.fails.clear();
      }
      return;
    }
    if (this.open) return;
    this.calls.add(now);
    if (!ok) this.fails.add(now);
    const n = this.calls.count(now);
    if (n >= this.cfg.minCalls && this.fails.count(now) >= this.cfg.failureRate * n) this.trip(now);
  }

  private trip(now: number) {
    this.open = true;
    this.openUntil = now + this.cfg.openMs;
    this.sent = 0;
    this.passed = 0;
    this.gen++;
    this.calls.clear();
    this.fails.clear();
  }

  /** The process restarted: a breaker lives in memory, so it starts closed. */
  reset(): void {
    this.open = false;
    this.sent = 0;
    this.passed = 0;
    this.gen++;
    this.calls.clear();
    this.fails.clear();
  }
}

/** A retry budget: a share of first attempts, optionally with a floor of retries per second. */
export type RetryBudgetSpec = number | { ratio: number; minPerSec?: number };

/**
 * A retry budget like Finagle's RetryBudget: over the last 10 s, retries may be at most `ratio` of
 * first attempts, plus `minPerSec` retries a second (Finagle's `minRetriesPerSec`, default 10
 * there). The plain number form has no minimum, so a quiet caller gets almost no retries.
 * gRPC's retry throttling is a different mechanism: a token bucket (`maxTokens`, `tokenRatio`)
 * that each failure drains by 1 and each success refills by `tokenRatio`; retries stop while the
 * bucket is at or below half. Under normal load a budget never binds; in an outage it stops every
 * layer from multiplying the load by its retry count. Counts are of simulated requests, so the
 * caller passes `minPerSec` already divided by the run's scale.
 */
export class RetryBudget {
  private firsts = new Window(10_000);
  private retries = new Window(10_000);
  private ratio: number;
  private floor: number;
  constructor(spec: RetryBudgetSpec, scale = 1) {
    this.ratio = typeof spec === "number" ? spec : spec.ratio;
    // Retries a 10 s window may spend whatever the traffic.
    this.floor = typeof spec === "number" ? 0 : ((spec.minPerSec ?? 0) * 10) / scale;
  }
  first(now: number) {
    this.firsts.add(now);
  }
  /** Spends one retry if the budget allows it. */
  tryRetry(now: number): boolean {
    if (this.retries.count(now) >= this.ratio * this.firsts.count(now) + this.floor) return false;
    this.retries.add(now);
    return true;
  }
  reset() {
    this.firsts.clear();
    this.retries.clear();
  }
}
