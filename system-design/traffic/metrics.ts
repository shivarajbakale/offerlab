// Summaries of a run over a time window, for scenario asserts and the metrics strip.

import { percentile } from "./dist.ts";
import type { Frame, Kind, TrafficRun, UserClass } from "./types.ts";

/**
 * Requests of one kind, or from one class of users: per second, shares of finished ones, latency of
 * the successful ones (`p50`, `p99`) and of those that ended in an error or timeout (`failP50`,
 * `failP99`, counted from the first attempt). A percentile of no requests is NaN, so an assert
 * like `p99 < 30` fails rather than passing when nothing succeeded.
 */
export type GroupSummary = { sent: number; ok: number; errors: number; timeouts: number; errorRate: number; timeoutRate: number; p50: number; p99: number; failP50: number; failP99: number };

/** The p-th percentile of an ascending list; NaN for an empty one (no request to measure). */
const pct = (sorted: number[], p: number) => (sorted.length ? percentile(sorted, p) : NaN);

/** A station's calls to one downstream, per second; `openShare` is the share of the time its breakers were open (0..1). */
export type LinkSummary = { calls: number; failed: number; timedOut: number; retries: number; shortCircuited: number; poolFull: number; openShare: number };

const KINDS: Kind[] = ["read", "write", "static"];

export type Summary = {
  /** Per second. */
  sent: number;
  ok: number;
  /** Shares of finished requests, 0..1. */
  errorRate: number;
  rejectedRate: number;
  failedRate: number;
  timeoutRate: number;
  /** Share of finished requests turned away by a rate limit. */
  limitedRate: number;
  /** Latency of successful requests; NaN when none succeeded in the window. */
  p50: number;
  p99: number;
  mean: number;
  /** Latency of requests that ended in an error or timeout, from their first attempt; NaN when none did. */
  failP50: number;
  failP99: number;
  /** Static files only. */
  staticP50: number;
  staticP99: number;
  util: Record<string, number>;
  /** Per replica, primary first for a database. */
  replicaUtil: Record<string, number[]>;
  threads: Record<string, number>;
  queue: Record<string, number>;
  /** Average requests in flight. */
  inSystem: number;
  /** Totals over the window. */
  loggedOut: number;
  wasted: number;
  /** Extra attempts per second. */
  retries: number;
  /** Share of successful reads that returned old data; and of reads right after the user's own write. */
  staleRate: number;
  staleOwnRate: number;
  /** Cache and CDN: share of lookups that found the key. */
  hitRate: Record<string, number>;
  /**
   * Queues at the end of the window: visible jobs waiting, and the oldest visible job's age (ms,
   * counted from its first enqueue, or its due time if delayed; retries do not reset it).
   * `backlogTotal` adds the jobs not visible yet: on their way, not due, or hidden after a failed attempt.
   */
  backlog: Record<string, number>;
  oldestMs: Record<string, number>;
  backlogTotal: Record<string, number>;
  /** Rough running cost, in dollars; `egressPerHour` is the part spent on sending data (included in `costPerHour`). */
  costPerHour: number;
  costPerMillion: number;
  egressPerHour: number;
  /** Per request kind (kinds the design sends) and per user class (heavy users, far users, everyone else; a user can be heavy and far). */
  byKind: Partial<Record<Kind, GroupSummary>>;
  byClass: Record<UserClass, GroupSummary>;
  /** Share of successful answers that skipped a failed call (a fallback). */
  degradedRate: number;
  /** Requests reaching each station a second, including those refused because it was down. */
  calls: Record<string, number>;
  /** Network cards: share of bandwidth in use. Bytes a second sent to users, and between regions. */
  nicUtil: Record<string, number>;
  egressBytes: number;
  crossRegionBytes: number;
  /** Retries stations made to their downstreams, and calls failed at once by an open breaker, per second. */
  serviceRetries: number;
  shortCircuited: number;
  /** Calls with options or worker pools, keyed "caller>callee". */
  links: Record<string, LinkSummary>;
  /** Queues with a delay: jobs not due yet (or hidden after a failed attempt), at the end of the window; and averaged over it. */
  scheduled: Record<string, number>;
  scheduledAvg: Record<string, number>;
};

function groupSummary(fs: Frame[], secs: number, get: (f: Frame) => { sent: number; ok: number; errors: number; timeouts: number } | undefined, tag: (t: number) => boolean): GroupSummary {
  let sent = 0;
  let ok = 0;
  let errors = 0;
  let timeouts = 0;
  const lat: number[] = [];
  const fail: number[] = [];
  for (const f of fs) {
    const g = get(f);
    if (g) {
      sent += g.sent;
      ok += g.ok;
      errors += g.errors;
      timeouts += g.timeouts;
    }
    const tags = f.clients.tags ?? [];
    for (let i = 0; i < tags.length; i++) if (tag(tags[i])) lat.push(f.clients.latencies[i]);
    const ft = f.clients.failTags ?? [];
    for (let i = 0; i < ft.length; i++) if (tag(ft[i])) fail.push(f.clients.failLatencies[i]);
  }
  lat.sort((a, b) => a - b);
  fail.sort((a, b) => a - b);
  const finished = Math.max(1, ok + errors);
  return { sent: sent / secs, ok: ok / secs, errors: errors / secs, timeouts: timeouts / secs, errorRate: errors / finished, timeoutRate: timeouts / finished, p50: pct(lat, 0.5), p99: pct(lat, 0.99), failP50: pct(fail, 0.5), failP99: pct(fail, 0.99) };
}

/** Frames that end after `fromS` and at or before `toS` seconds. */
export function framesIn(run: TrafficRun, fromS = 0, toS = Infinity): Frame[] {
  return run.frames.filter((f) => f.t > fromS * 1000 && f.t <= toS * 1000);
}

export function summary(run: TrafficRun, fromS = 0, toS = Infinity): Summary {
  const fs = framesIn(run, fromS, toS);
  const secs = Math.max(1e-9, fs.length / 10);
  const total = (get: (f: Frame) => number) => fs.reduce((n, f) => n + get(f), 0);
  const ok = total((f) => f.clients.ok);
  const rejected = total((f) => f.clients.rejected);
  const failed = total((f) => f.clients.failed);
  const timedOut = total((f) => f.clients.timedOut);
  const finished = Math.max(1, ok + rejected + failed + timedOut);
  const lat = fs.flatMap((f) => f.clients.latencies).sort((a, b) => a - b);
  const avg = (get: (f: Frame) => number) => (fs.length ? total(get) / fs.length : 0);
  const per = (key: "util" | "threads" | "queue") =>
    Object.fromEntries(Object.keys(fs[0]?.stations ?? {}).map((id) => [id, avg((f) => f.stations[id][key])]));
  const ids = Object.keys(fs[0]?.stations ?? {});
  const perSec = (get: (f: Frame) => number) => total(get) / secs;
  const egress = Object.fromEntries(ids.map((id) => [id, perSec((f) => f.stations[id].egress ?? 0)]));
  const crossRegion = Object.fromEntries(ids.map((id) => [id, perSec((f) => f.stations[id].crossRegion ?? 0)]));
  const links: Record<string, LinkSummary> = {};
  for (const id of ids) {
    for (const t of Object.keys(fs[0].stations[id].links ?? {})) {
      const l = (f: Frame) => f.stations[id].links?.[t];
      const states = fs.flatMap((f) => l(f)?.breaker ?? []);
      links[`${id}>${t}`] = {
        calls: perSec((f) => l(f)?.calls ?? 0),
        failed: perSec((f) => l(f)?.failed ?? 0),
        timedOut: perSec((f) => l(f)?.timedOut ?? 0),
        retries: perSec((f) => l(f)?.retries ?? 0),
        shortCircuited: perSec((f) => l(f)?.shortCircuited ?? 0),
        poolFull: perSec((f) => l(f)?.poolFull ?? 0),
        openShare: states.length ? states.filter((s) => s !== "closed").length / states.length : 0,
      };
    }
  }
  const kinds = Object.keys(fs[0]?.clients.byKind ?? {}) as Kind[];
  return {
    sent: total((f) => f.clients.sent) / secs,
    ok: ok / secs,
    errorRate: (rejected + failed + timedOut) / finished,
    rejectedRate: rejected / finished,
    failedRate: failed / finished,
    timeoutRate: timedOut / finished,
    limitedRate: total((f) => f.clients.limited) / finished,
    p50: pct(lat, 0.5),
    p99: pct(lat, 0.99),
    mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : NaN,
    ...(() => {
      const fl = fs.flatMap((f) => f.clients.failLatencies ?? []).sort((a, b) => a - b);
      return { failP50: pct(fl, 0.5), failP99: pct(fl, 0.99) };
    })(),
    ...(() => {
      const st = fs.flatMap((f) => f.clients.staticLatencies).sort((a, b) => a - b);
      return { staticP50: pct(st, 0.5), staticP99: pct(st, 0.99) };
    })(),
    util: per("util"),
    replicaUtil: Object.fromEntries(
      Object.keys(fs[0]?.stations ?? {}).map((id) => [
        id,
        (fs[0].stations[id].replicaUtil ?? []).map((_, k) => avg((f) => f.stations[id].replicaUtil?.[k] ?? 0)),
      ]),
    ),
    threads: per("threads"),
    queue: per("queue"),
    inSystem: avg((f) => f.clients.inSystem),
    loggedOut: total((f) => f.clients.loggedOut),
    wasted: total((f) => f.clients.wasted),
    retries: total((f) => f.clients.retries) / secs,
    staleRate: total((f) => f.clients.stale) / Math.max(1, total((f) => f.clients.reads)),
    staleOwnRate: total((f) => f.clients.staleOwn) / Math.max(1, total((f) => f.clients.ownReads)),
    hitRate: Object.fromEntries(
      Object.keys(fs[0]?.stations ?? {})
        .filter((id) => fs[0].stations[id].hits !== undefined)
        .map((id) => {
          const hits = total((f) => f.stations[id].hits ?? 0);
          return [id, hits / Math.max(1, hits + total((f) => f.stations[id].misses ?? 0))];
        }),
    ),
    backlog: Object.fromEntries(Object.entries(fs.at(-1)?.stations ?? {}).flatMap(([id, x]) => (x.backlog === undefined ? [] : [[id, x.backlog]]))),
    oldestMs: Object.fromEntries(Object.entries(fs.at(-1)?.stations ?? {}).flatMap(([id, x]) => (x.oldestMs === undefined ? [] : [[id, x.oldestMs]]))),
    backlogTotal: Object.fromEntries(Object.entries(fs.at(-1)?.stations ?? {}).flatMap(([id, x]) => (x.backlogTotal === undefined ? [] : [[id, x.backlogTotal]]))),
    ...cost(run, ok / secs, Object.fromEntries(ids.map((id) => [id, total((f) => f.stations[id].arrivals) / secs])), { egress, crossRegion }),
    byKind: Object.fromEntries(kinds.map((k) => [k, groupSummary(fs, secs, (f) => f.clients.byKind?.[k], (t) => (t & 3) === KINDS.indexOf(k))])),
    byClass: {
      normal: groupSummary(fs, secs, (f) => f.clients.byClass?.normal, (t) => (t & 12) === 0),
      heavy: groupSummary(fs, secs, (f) => f.clients.byClass?.heavy, (t) => (t & 4) !== 0),
      far: groupSummary(fs, secs, (f) => f.clients.byClass?.far, (t) => (t & 8) !== 0),
    },
    degradedRate: total((f) => f.clients.degraded ?? 0) / Math.max(1, ok),
    calls: Object.fromEntries(ids.map((id) => [id, perSec((f) => f.stations[id].calls ?? 0)])),
    nicUtil: Object.fromEntries(ids.filter((id) => fs[0].stations[id].nic !== undefined).map((id) => [id, avg((f) => f.stations[id].nic ?? 0)])),
    egressBytes: Object.values(egress).reduce((a, b) => a + b, 0),
    crossRegionBytes: Object.values(crossRegion).reduce((a, b) => a + b, 0),
    serviceRetries: perSec((f) => Object.values(f.stations).reduce((n, x) => n + (x.retries ?? 0), 0)),
    shortCircuited: Object.values(links).reduce((n, l) => n + l.shortCircuited, 0),
    links,
    scheduled: Object.fromEntries(Object.entries(fs.at(-1)?.stations ?? {}).flatMap(([id, x]) => (x.scheduled === undefined ? [] : [[id, x.scheduled]]))),
    // The last frame's count jumps with every arrival; this is the steady figure (Little's law: arrivals x delay).
    scheduledAvg: Object.fromEntries(ids.filter((id) => fs[0].stations[id].scheduled !== undefined).map((id) => [id, avg((f) => f.stations[id].scheduled ?? 0)])),
  };
}

/** Consumers mostly wait on other services, so about 50 share one $0.085-an-hour machine. */
export const CONSUMER_COST_PER_HOUR = 0.085 / 50;

/**
 * Machines cost per hour whatever the traffic; a CDN costs per request it serves. Data sent to
 * users costs per GB (each component's `egressPerGB`: $0.09 from our servers, $0.02 from a CDN),
 * and so does data sent between two of our stations in different regions ($0.02; an answer to a
 * user or to a CDN edge is not inter-region, wherever they are). Cost per million is the hourly cost divided by the
 * millions of requests answered in an hour. `bytes` are bytes a second per station.
 */
export function cost(
  run: TrafficRun,
  okPerSecond: number,
  arrivals: Record<string, number>,
  bytes: { egress?: Record<string, number>; crossRegion?: Record<string, number> } = {},
): { costPerHour: number; costPerMillion: number; egressPerHour: number } {
  let perHour = 0;
  let egressPerHour = 0;
  const gbPerHour = (bytesPerSecond: number) => (bytesPerSecond * 3600) / 1e9;
  for (const c of run.design.components) {
    if (c.type === "queue") perHour += c.costPerHour + (c.consumers ?? 0) * CONSUMER_COST_PER_HOUR;
    // A station sharing another's machine adds no machine of its own.
    else if (!c.machine) perHour += c.costPerHour * c.replicas;
    if (c.costPerMillion) perHour += (c.costPerMillion * (arrivals[c.id] ?? 0) * 3600) / 1e6;
    egressPerHour += gbPerHour(bytes.egress?.[c.id] ?? 0) * (c.egressPerGB ?? 0);
    egressPerHour += gbPerHour(bytes.crossRegion?.[c.id] ?? 0) * (run.design.interRegionPerGB ?? 0);
  }
  perHour += egressPerHour;
  return { costPerHour: perHour, costPerMillion: okPerSecond > 0 ? perHour / ((okPerSecond * 3600) / 1e6) : Infinity, egressPerHour };
}

/** The station whose CPUs or network card were busiest over the window; ties go to the one listed first. */
export function bottleneck(run: TrafficRun, fromS = 0, toS = Infinity): string {
  const s = summary(run, fromS, toS);
  const busy = Object.fromEntries(Object.entries(s.util).map(([id, u]) => [id, Math.max(u, s.nicUtil[id] ?? 0)]));
  const stations = new Set(run.design.components.filter((c) => c.type === "station").map((c) => c.id));
  let best = "";
  for (const [id, u] of Object.entries(busy)) if (stations.has(id) && (!best || u > busy[best] + 1e-9)) best = id;
  return best;
}
