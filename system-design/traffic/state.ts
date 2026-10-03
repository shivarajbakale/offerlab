// The inside of a traffic run: machines, replicas, stations, requests and their visits, the
// events between them, and small pure helpers. Only the engine uses these; the public format of a
// run is in types.ts.

import type { Breaker, RetryBudget } from "./breaker.ts";
import type { CallOptions, LbSpec, QueueSpec, StationSpec } from "./design.ts";
import type { EventQueue } from "./heap.ts";
import type { Nic } from "./network.ts";
import type { Hop, Journey, Kind, LinkFrame, Outcome, TrafficFault, UserClass } from "./types.ts";

export type Area = { busy: number; area: number; last: number };
export type Machine = Area & { id: string; cores: number; stretch: number; slow: number; slowUntil: number; waiting: Visit[]; up: boolean };
/** Workers a replica lets wait on one downstream at once (a bulkhead). */
export type Pool = { limit: number; used: number };
export type Replica = Area & {
  name: string;
  /** Position within its shard: 0 is the primary. */
  index: number;
  shard: number;
  machine: Machine;
  /** Workers and waiting room of this replica (after scaling). */
  threads: number;
  queueLimit: number;
  region: string;
  queue: Visit[];
  active: Set<Visit>;
  sessions: Set<number>;
  /** Cache and CDN contents: key to the version stored, oldest use first; and when each was filled (with a TTL). */
  lru: Map<number, number>;
  born: Map<number, number> | null;
  nic: Nic<Visit> | null;
  pools: Map<string, Pool>;
  breakers: Map<string, Breaker>;
  budgets: Map<string, RetryBudget>;
  up: boolean;
};
export type Counters = { arrivals: number; done: number; rejected: number; failed: number; hits: number; misses: number; calls: number; retries: number; egress: number; crossRegion: number };
export type LinkCounters = Omit<LinkFrame, "breaker">;
export type Station = {
  id: string;
  spec: StationSpec;
  capacity: number;
  lag: number;
  ttl: number;
  replicas: Replica[];
  /** Replicas grouped by shard. */
  shards: Replica[][];
  rr: number;
  c: Counters;
  /** Per-downstream call counters, for stations with call options or pools. */
  links: Map<string, LinkCounters> | null;
};
export type Lb = { id: string; spec: LbSpec; target: Station; view: boolean[]; rr: number; sticky: Map<number, number>; buckets: Map<number, { tokens: number; last: number }> };
/** A job not visible yet (delayed, on its way, or waiting out a visibility timeout): visible at `t`; `born` is when its age starts. */
export type PendingJob = { t: number; seq: number; born: number };
/**
 * `ready`: visible jobs in the order they became visible (first in, first out), each as the time its
 * age starts (its first enqueue, or its due time if delayed; a retry keeps it). `head` is the index
 * of the next one to take. `pending`: jobs not visible yet, earliest first.
 */
export type Queue = Area & {
  id: string;
  spec: QueueSpec;
  consumers: number;
  fanout: number;
  delay: number;
  ready: number[];
  head: number;
  pending: EventQueue<PendingJob>;
  enqueued: number;
  processed: number;
  failed: number;
};
/** One logical request from a user, across all its attempts. */
export type Call = {
  id: number;
  kind: Kind;
  key: number;
  user: number;
  far: boolean;
  heavy: boolean;
  region: string;
  first: number;
  attempts: number;
  done: boolean;
  expect: number;
  journey: Journey | null;
};
/** One attempt. `value` is the version of the data it read or wrote (-1: none). `job`: sent by a queue consumer, not a user; `born`: that job's age start. */
export type Req = { call: Call; sent: number; done: boolean; value: number; hit: boolean; job: Queue | null; born?: number; limited: boolean; degraded: boolean };
/** One attempt of a station's call to a downstream, while the calling worker waits for it. */
export type Leg = {
  v: Visit;
  target: string;
  opts: CallOptions | null;
  link: LinkCounters | null;
  pool: Pool | null;
  breaker: Breaker | null;
  probe: boolean;
  gen: number;
  /** Set once the caller stops waiting: answered, timed out, or the caller's machine died. */
  done: "" | "reply" | "timeout" | "crash";
};
export type Visit = {
  req: Req;
  station: Station;
  replica: Replica;
  caller: Visit | null;
  /** The caller's call this visit answers, and this visit's own call in progress. */
  parentLeg: Leg | null;
  leg: Leg | null;
  /** Attempts already made at the current step's call. */
  tries: number;
  op: "serve" | "get" | "del";
  next: number;
  aside: { cacheAside: string; source: string } | null;
  phase: "cache" | "source";
  miss: boolean;
  back: number;
  dead: boolean;
  hop: Hop | null;
};

export type Ev =
  | { t: number; seq: number; k: "arrival" }
  | { t: number; seq: number; k: "attempt"; call: Call }
  | { t: number; seq: number; k: "arrive"; v: Visit }
  | { t: number; seq: number; k: "cpu"; v: Visit }
  | { t: number; seq: number; k: "reply"; req: Req; caller: Visit | null; outcome: Outcome; leg: Leg | null }
  | { t: number; seq: number; k: "timeout"; req: Req }
  | { t: number; seq: number; k: "legTimeout"; leg: Leg }
  | { t: number; seq: number; k: "legRetry"; v: Visit; target: string; opts: CallOptions }
  | { t: number; seq: number; k: "nic"; nic: Nic<Visit>; gen: number }
  | { t: number; seq: number; k: "job"; queue: Queue; born: number }
  | { t: number; seq: number; k: "wake"; queue: Queue }
  | { t: number; seq: number; k: "frame" }
  | { t: number; seq: number; k: "health"; lb: Lb }
  | { t: number; seq: number; k: "fault"; f: TrafficFault | { at: number; kind: "heal"; target: string } };

/** Spreads keys over shards (or cache machines) in no particular order, so neighbours in popularity land apart. */
export const hash = (key: number) => Math.imul(key ^ 0x5bd1e995, 2654435761) >>> 0;

export const zero = (): Counters => ({ arrivals: 0, done: 0, rejected: 0, failed: 0, hits: 0, misses: 0, calls: 0, retries: 0, egress: 0, crossRegion: 0 });
export const zeroLink = (): LinkCounters => ({ calls: 0, failed: 0, timedOut: 0, retries: 0, shortCircuited: 0, poolFull: 0 });
export const round = (x: number, d = 1000) => Math.round(x * d) / d;
export const isInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
export const KINDS: Kind[] = ["read", "write", "static"];
export const CLASSES: UserClass[] = ["normal", "heavy", "far"];

/**
 * `total` (a count summed over `n` replicas, already divided by the scale) shared out as whole
 * numbers: the first replicas take one extra when it does not divide evenly. `exact` is false when
 * the total is not whole or a replica had to be raised to `min`.
 */
export function spread(total: number, n: number, min: number): { each: number[]; exact: boolean } {
  const t = Math.round(total);
  const base = Math.floor(t / n);
  const each = Array.from({ length: n }, (_, i) => base + (i < t % n ? 1 : 0));
  return { each: each.map((x) => Math.max(min, x)), exact: isInt(total) && each.every((x) => x >= min) };
}

/** Cumulative Zipf weights over `n` keys: key k (0-based) is requested in proportion to 1/(k+1)^s. */
const zipfCache = new Map<string, Float64Array>();
export function zipf(n: number, s: number): Float64Array {
  const id = `${n}:${s}`;
  let cdf = zipfCache.get(id);
  if (!cdf) {
    cdf = new Float64Array(n);
    let sum = 0;
    for (let k = 0; k < n; k++) cdf[k] = sum += 1 / (k + 1) ** s;
    for (let k = 0; k < n; k++) cdf[k] /= sum;
    zipfCache.set(id, cdf);
  }
  return cdf;
}
export function sampleKey(cdf: Float64Array, u: number): number {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}


export type Group = { sent: number; ok: number; errors: number; timeouts: number; lat: number[] };
export const newGroup = (): Group => ({ sent: 0, ok: 0, errors: 0, timeouts: 0, lat: [] });
