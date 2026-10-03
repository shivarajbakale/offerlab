// Building blocks for an architecture: plain data, checked when the design is made.

import type { RetryBudgetSpec } from "./breaker.ts";
import type { ComponentView, DesignView, Kind, Knob, Num, Role, Strategy } from "./types.ts";

/** A setting shown as a slider. Ranges from a positive minimum to 100x it or more use a log scale. */
export function knob(name: string, value: number, [min, max]: [number, number]): Knob {
  return { knob: name, value, min, max, log: min > 0 && max / min >= 100 };
}

export type ClientsSpec = {
  type: "clients";
  to: string;
  /** Static files go here instead (a CDN), when set. */
  staticTo?: string;
  qps: Num;
  /** Share of each kind of request; any of them can be a knob. */
  mix: { read: Num; write: Num; static?: Num };
  users: number;
  /** Distinct keys (pages, records) requested, and how strongly a few are favoured (Zipf exponent). */
  keys: number;
  skew: Num;
  /** How long a user waits for an answer: one value, or one per kind (kinds left out wait 1000 ms). */
  timeoutMs: Num | Partial<Record<Kind, Num>>;
  /** What a client does after an error or timeout, and how many attempts it makes in all. */
  retry: "none" | "immediate" | "backoff";
  attempts: number;
  /**
   * At most this many retries per first attempt over the last 10 s (0.1 = 10%); unlimited when left
   * out. `{ ratio, minPerSec }` also allows `minPerSec` retries a second whatever the traffic (as Finagle does).
   */
  retryBudget?: RetryBudgetSpec;
  /** Size of the answer to each kind of request, in bytes (0: not counted). Drives bandwidth and egress cost. */
  bytes?: Partial<Record<Kind, Num>>;
  /** Users' home regions and the share of users in each, when the design is placed in regions. */
  regions?: Record<string, Num>;
  /** After saving, a share of users reload the page this many ms later (0: never), to see their own write. */
  rereadMs: number;
  rereadShare: number;
  /**
   * Network time from a user to the first component, one way; far users are further away. In a
   * design with regions, `farHopMs` is a far user's distance to their own region (a long last mile),
   * and reaching another region adds `interRegionMs` on top. A CDN edge sits near every user, so its
   * origin fetches pay `hopMs` (plus `interRegionMs` when the origin is in another region), never
   * `farHopMs`; without regions they pay the user's own distance, `farHopMs` for a far user.
   */
  hopMs: number;
  farShare: number;
  farHopMs: number;
  /** A few users sending far more than everyone else: this share of all requests comes from `abusers` users. */
  abuseShare: number;
  abusers: number;
};

export type LbSpec = {
  type: "lb";
  to: string;
  /** Per-user token bucket: a steady rate (requests a second) and a burst; over it, 429 at once. */
  rateLimit?: { perSecond: number; burst: number };
  strategy: Strategy;
  sticky: boolean;
  healthCheckMs: number;
  hopMs: number;
  costPerHour: number;
  /**
   * Routing by region (a global load balancer or DNS): "nearest" sends each user to healthy servers
   * in their own region, else anywhere (active-active); a list sends everyone to the first region
   * in it that has a healthy server (active-passive). Health is as of the last check.
   */
  geo?: "nearest" | string[];
};

/** Retrying a failed or timed-out call: `attempts` in all, waiting `backoffMs` x 2^(n-1) x a random factor of 1 +/- `jitter`. */
export type RetryPolicy = { attempts: number; backoffMs?: number; jitter?: number };

/**
 * A circuit breaker on one downstream: once at least `minCalls` calls in the last `windowMs` have
 * finished and `failureRate` of them failed or timed out, it opens and calls fail at once for
 * `openMs`; then it lets `halfOpenProbes` trial calls through: all fine closes it, any failure opens it again.
 */
export type BreakerOptions = { failureRate?: number; windowMs?: number; minCalls?: number; openMs?: number; halfOpenProbes?: number };

export type CallOptions = {
  /** Give up waiting for one attempt after this long (default: wait as long as it takes). */
  timeoutMs?: Num;
  retry?: RetryPolicy;
  /**
   * At most this many retries per first attempt sent over the last 10 s, per calling replica
   * (`{ ratio, minPerSec }` adds a floor of retries a second). Calls refused at once by a full pool
   * or an open breaker are not counted as first attempts.
   */
  retryBudget?: RetryBudgetSpec;
  breaker?: BreakerOptions;
  /** "skip": when the call fails, is short-circuited or finds its pool full, carry on without it (a degraded answer). */
  fallback?: "skip";
};

/** One step of a request's work at a station: call a component, read through a cache, or drop a key from a cache. */
export type CallStep = string | { cacheAside: string; source: string } | { invalidate: string } | ({ call: string } & CallOptions);

export type StationSpec = {
  type: "station";
  role: Role;
  label: string;
  replicas: Num;
  cores: Num;
  /** Requests it works on at once: threads for an app server, connections for a database. */
  threads: number;
  /** Requests allowed to wait for a worker; one more is rejected. */
  queue: number;
  /** Mean CPU time per request, in ms. */
  serviceMs: Record<Kind, number>;
  cv: number;
  dist: "lognormal" | "exponential";
  /** Steps taken in order, while holding the worker. */
  calls: Record<Kind, CallStep[]>;
  sessions: "none" | "local" | "shared";
  /** Run on this other station's machine, sharing its cores. */
  machine?: string;
  /** Network time from the caller to this component, one way. */
  hopMs: number;
  /** Cache or CDN: keys held, least recently used dropped first. */
  capacity: Num;
  /** Database with replicas: replica lag, and whether a user's reads right after their own write go to the primary. */
  lagMs: Num;
  readYourWrites: boolean;
  /** Database: split the keys over this many independent primaries (each with `replicas` copies). */
  shards: Num;
  costPerHour: number;
  costPerMillion: number;
  /** Region of every replica, or of each replica in turn (within a shard: the primary first). */
  region?: string | string[];
  /** Network card per machine, in Mbps (0: unlimited). Answers share it fairly, each at most `flowMbps`. */
  bandwidthMbps: Num;
  flowMbps: number;
  /** Size of this station's answers per kind, in bytes. Left out: the clients' sizes for answers to users or a CDN, else 0. */
  bytes?: Partial<Record<Kind, Num>>;
  /** Dollars per GB sent from here to users. */
  egressPerGB: number;
  /** Cache or CDN: an entry older than this many ms is a miss and is fetched again (0: never expires). */
  ttlMs: Num;
  /**
   * Bulkheads: at most this many of a replica's workers may wait on each named downstream at once
   * (`default`: on each one not named). A call over the limit fails at once, or skips with a fallback.
   */
  pools?: Record<string, number>;
};

export type QueueSpec = {
  type: "queue";
  label: string;
  /** Workers taking jobs off the queue, each doing one job at a time. */
  consumers: Num;
  /** Mean time one job takes, in ms. */
  workMs: number;
  /**
   * A station (usually external) each job waits on: a slowdown there slows the jobs, and while it
   * is down the jobs fail. Its capacity is not used up by the jobs.
   */
  via?: string;
  /** Each job, after its own work, sends one request of `kind` here and waits for the answer. */
  to?: string;
  kind: Kind;
  /** Jobs created per message: one post fanned out to many followers' timelines. */
  fanout: Num;
  /** Each job becomes visible to consumers only this many ms after it is queued (a delayed job). */
  delayMs: Num;
  cv: number;
  hopMs: number;
  costPerHour: number;
};

export type ComponentSpec = ClientsSpec | LbSpec | StationSpec | QueueSpec;
export type Design = {
  name: string;
  components: Record<string, ComponentSpec>;
  /** One-way network time between two regions, in ms, and the price of sending data between them. */
  interRegionMs: Num;
  interRegionPerGB: number;
};

/** Internet egress from a cloud region, $/GB (AWS's first 10 TB tier is $0.09); from a CDN at volume about $0.02; between regions $0.02. */
export const EGRESS_PER_GB = 0.09;
export const CDN_EGRESS_PER_GB = 0.02;
export const INTER_REGION_PER_GB = 0.02;

export function clients(o: Partial<Omit<ClientsSpec, "type">> & { to: string; qps: Num }): ClientsSpec {
  return {
    type: "clients",
    mix: { read: 0.9, write: 0.1 },
    users: 5000,
    keys: 100_000,
    skew: 1,
    timeoutMs: 1000,
    retry: "none",
    attempts: 3,
    rereadMs: 0,
    rereadShare: 0.2,
    hopMs: 20,
    farShare: 0,
    farHopMs: 120,
    abuseShare: 0,
    abusers: 10,
    ...o,
  };
}

export function loadBalancer(o: Partial<Omit<LbSpec, "type">> & { to: string }): LbSpec {
  return { type: "lb", strategy: "round-robin", sticky: false, healthCheckMs: 1000, hopMs: 0.5, costPerHour: 0.03, ...o };
}

export const cacheAside = (cache: string, source: string): CallStep => ({ cacheAside: cache, source });
export const invalidate = (cache: string): CallStep => ({ invalidate: cache });
/** A call to `to` with a timeout, retries, a retry budget, a circuit breaker or a fallback. */
export const call = (to: string, o: CallOptions = {}): CallStep => ({ call: to, ...o });
/** A call guarded by a circuit breaker (defaults: 50% of at least 20 calls in 10 s; open 5 s; 5 trial calls). */
export const breaker = (to: string, o: BreakerOptions & Omit<CallOptions, "breaker"> = {}): CallStep => {
  const { failureRate, windowMs, minCalls, openMs, halfOpenProbes, ...rest } = o;
  const b = Object.fromEntries(Object.entries({ failureRate, windowMs, minCalls, openMs, halfOpenProbes }).filter(([, v]) => v !== undefined));
  return { call: to, ...rest, breaker: b };
};

type CallsInput = CallStep[] | Partial<Record<Kind, CallStep[]>>;
type StationInput = Partial<Omit<StationSpec, "type" | "calls" | "serviceMs">> & {
  calls?: CallsInput;
  serviceMs?: Partial<Record<Kind, number>>;
};

function station(defaults: Omit<StationSpec, "type">, o: StationInput): StationSpec {
  const { calls, serviceMs, ...rest } = o;
  const c = calls ?? [];
  const steps: Record<Kind, CallStep[]> = Array.isArray(c)
    ? { read: c, write: c, static: [] }
    : { read: c.read ?? [], write: c.write ?? [], static: c.static ?? [] };
  return { type: "station", ...defaults, ...rest, serviceMs: { ...defaults.serviceMs, ...serviceMs }, calls: steps };
}

const BASE: Omit<StationSpec, "type" | "role" | "label" | "serviceMs" | "costPerHour"> = {
  replicas: 1,
  cores: 4,
  threads: 50,
  queue: 100,
  cv: 0.5,
  dist: "lognormal",
  calls: { read: [], write: [], static: [] },
  sessions: "none",
  hopMs: 0.5,
  capacity: 0,
  lagMs: 0,
  readYourWrites: false,
  shards: 1,
  costPerMillion: 0,
  bandwidthMbps: 0,
  flowMbps: 100,
  egressPerGB: EGRESS_PER_GB,
  ttlMs: 0,
};

/** An app server: renders pages (CPU) and calls other components. A 4-core machine costs about $0.17 an hour. */
export function server(o: StationInput & { serviceMs: { read: number; write: number; static?: number } }): StationSpec {
  return station({ ...BASE, role: "app", label: "App server", serviceMs: { read: 6, write: 8, static: 1 }, costPerHour: 0.17 }, o);
}

/**
 * A database. With `replicas` above 1, the first is the primary (all writes) and the others are
 * read replicas that trail it by `lagMs`. A 4-core managed database costs about $0.34 an hour.
 */
export function database(
  o: Omit<StationInput, "serviceMs" | "threads"> & { readMs: number; writeMs: number; connections?: number },
): StationSpec {
  const { readMs, writeMs, connections, ...rest } = o;
  const store = rest.role === "store";
  return station(
    {
      ...BASE,
      role: "database",
      label: store ? "Session store" : "Database",
      threads: connections ?? 20,
      queue: 1000,
      serviceMs: { read: readMs, write: writeMs, static: readMs },
      costPerHour: store ? 0.08 : 0.34,
    },
    rest,
  );
}

/** An in-memory cache (like Redis or Memcached): holds `capacity` keys, a lookup costs a fraction of a ms. */
export function cache(o: Omit<StationInput, "capacity"> & { capacity: Num }): StationSpec {
  return station(
    { ...BASE, role: "cache", label: "Cache", cores: 4, threads: 200, queue: 1000, serviceMs: { read: 0.2, write: 0.2, static: 0.2 }, costPerHour: 0.15 },
    o,
  );
}

/**
 * A CDN: servers near every user that keep copies of static files (and cacheable reads). A miss is
 * fetched from `to` (the origin), which is as far from the edge as it is from the user; writes
 * always pass through to it and do not refresh the edge copy, so with `ttlMs` a copy is at most
 * that old. The edge is near every user, in every region.
 * Priced per request, roughly $0.75 per million, plus $0.02 per GB sent.
 */
export function cdn(o: Omit<StationInput, "calls"> & { to: string; capacity: Num }): StationSpec {
  const { to, ...rest } = o;
  return station(
    {
      ...BASE,
      role: "cdn",
      label: "CDN",
      cores: 64,
      threads: 100_000,
      queue: 0,
      // There is an edge server near every user: about 10 ms away, wherever they are.
      hopMs: 10,
      serviceMs: { read: 0.1, write: 0.1, static: 0.1 },
      costPerHour: 0,
      costPerMillion: 0.75,
      egressPerGB: CDN_EGRESS_PER_GB,
    },
    { ...rest, calls: { read: [to], write: [to], static: [to] } },
  );
}

/** A service outside our control (an email provider, a payment gateway): slow, but not limited by our CPUs. */
export function external(o: { label: string; latencyMs: number; concurrency?: number; hopMs?: number; region?: string | string[] }): StationSpec {
  const n = o.concurrency ?? 1000;
  return station(
    {
      ...BASE,
      role: "external",
      label: o.label,
      cores: n,
      threads: n,
      queue: 10_000,
      hopMs: o.hopMs ?? 10,
      serviceMs: { read: o.latencyMs, write: o.latencyMs, static: o.latencyMs },
      costPerHour: 0,
    },
    o.region ? { region: o.region } : {},
  );
}

/** A message queue (like SQS or RabbitMQ): accepts a job at once; `consumers` work through them. */
export function queue(o: Partial<Omit<QueueSpec, "type">> & { consumers: Num; workMs: number }): QueueSpec {
  return { type: "queue", label: "Job queue", cv: 0.5, hopMs: 0.5, costPerHour: 0.05, kind: "write", fanout: 1, delayMs: 0, ...o };
}

/** Component ids a call step talks to. */
export const stepTargets = (s: CallStep): string[] =>
  typeof s === "string" ? [s] : "call" in s ? [s.call] : "cacheAside" in s ? [s.cacheAside, s.source] : [s.invalidate];

const targetsOf = (c: ComponentSpec): string[] => {
  if (c.type === "station") {
    const all = [...c.calls.read, ...c.calls.write, ...c.calls.static].flatMap(stepTargets);
    return [...new Set(all)];
  }
  if (c.type === "queue") return [...(c.via ? [c.via] : []), ...(c.to ? [c.to] : [])];
  if (c.type === "clients") return c.staticTo ? [c.to, c.staticTo] : [c.to];
  return [c.to];
};

/** The region of a station's replica at `index` within its shard ("" when not placed). */
export const regionOf = (spec: StationSpec, index: number): string =>
  spec.region === undefined ? "" : typeof spec.region === "string" ? spec.region : (spec.region[index % spec.region.length] ?? "");

/** Every region named in the design. */
export function regionsIn(components: Record<string, ComponentSpec>): string[] {
  const out = new Set<string>();
  for (const c of Object.values(components)) {
    if (c.type === "station" && c.region !== undefined) (typeof c.region === "string" ? [c.region] : c.region).forEach((r) => out.add(r));
    if (c.type === "clients" && c.regions) Object.keys(c.regions).forEach((r) => out.add(r));
  }
  return [...out];
}

function checkBudget(b: RetryBudgetSpec, who: string, name: string) {
  const ratio = typeof b === "number" ? b : b.ratio;
  const min = typeof b === "number" ? 0 : (b.minPerSec ?? 0);
  if (!(ratio >= 0 && Number.isFinite(ratio)) || !(min >= 0 && Number.isFinite(min))) {
    throw new Error(`design "${name}": ${who} has retryBudget ${JSON.stringify(b)}; ratio and minPerSec must be numbers 0 or more`);
  }
}

/**
 * Checks the wiring and returns the design. Throws with a readable message when it is wrong.
 * `interRegionMs` (default 80) is the one-way network time between two regions.
 */
export function design(name: string, components: Record<string, ComponentSpec>, opts: { interRegionMs?: Num; interRegionPerGB?: number } = {}): Design {
  const entries = Object.entries(components);
  const entry = entries.filter(([, c]) => c.type === "clients");
  if (entry.length !== 1) throw new Error(`design "${name}": needs exactly one clients(), found ${entry.length}`);
  for (const [id, c] of entries) {
    for (const t of targetsOf(c)) {
      const to = components[t];
      if (!to) throw new Error(`design "${name}": ${id} sends to "${t}", which is not in the design`);
      if (to.type === "clients") throw new Error(`design "${name}": ${id} cannot send to the clients`);
      if (c.type === "lb" && to.type !== "station") throw new Error(`design "${name}": load balancer ${id} must send to a server`);
    }
    if (c.type === "station") {
      for (const s of [...c.calls.read, ...c.calls.write, ...c.calls.static]) {
        if (typeof s === "string" || "call" in s) continue;
        const cacheId = "cacheAside" in s ? s.cacheAside : s.invalidate;
        const cc = components[cacheId];
        if (cc?.type !== "station" || cc.role !== "cache") throw new Error(`design "${name}": ${id} uses "${cacheId}" as a cache, but it is not a cache()`);
      }
      if (c.machine) {
        const host = components[c.machine];
        if (!host || host.type !== "station" || host.machine) {
          throw new Error(`design "${name}": ${id} shares the machine of "${c.machine}", which must be a station with its own machine`);
        }
      }
      const steps = [...c.calls.read, ...c.calls.write, ...c.calls.static];
      const called = new Set(steps.flatMap((s) => (typeof s === "string" ? [s] : "call" in s ? [s.call] : [])));
      for (const p of Object.keys(c.pools ?? {})) {
        if (p === "default" || called.has(p)) continue;
        if (targetsOf(c).includes(p)) throw new Error(`design "${name}": ${id} sets a worker pool for "${p}", but only call steps are pooled; it reaches "${p}" only through cache-aside or invalidate`);
        throw new Error(`design "${name}": ${id} sets a worker pool for "${p}", which it never calls`);
      }
      for (const s of steps) {
        if (typeof s === "string" || !("call" in s)) continue;
        const f = s.breaker?.failureRate;
        if (f !== undefined && !(f > 0 && f <= 1)) throw new Error(`design "${name}": ${id}'s breaker on "${s.call}" has failureRate ${f}; it must be in (0, 1]`);
        if (s.retryBudget !== undefined) checkBudget(s.retryBudget, `${id}'s call to "${s.call}"`, name);
      }
    }
  }
  const cs = entry[0][1] as ClientsSpec;
  if (cs.retryBudget !== undefined) checkBudget(cs.retryBudget, "the clients", name);
  const regions = regionsIn(components);
  for (const [id, c] of entries) {
    if (c.type === "lb" && Array.isArray(c.geo)) {
      for (const r of c.geo) if (!regions.includes(r)) throw new Error(`design "${name}": ${id} fails over to region "${r}", where nothing is placed`);
    }
  }
  return { name, components, interRegionMs: opts.interRegionMs ?? 80, interRegionPerGB: opts.interRegionPerGB ?? INTER_REGION_PER_GB };
}

const isKnob = (x: unknown): x is Knob => typeof x === "object" && x !== null && "knob" in x;

/** The design's knobs, and their values after applying `overrides` (clamped to each range). */
export function resolve(d: Design, overrides: Record<string, number> = {}) {
  const knobs: Knob[] = [];
  const visit = (v: unknown) => {
    if (isKnob(v)) {
      if (!knobs.some((k) => k.knob === v.knob)) knobs.push(v);
    } else if (typeof v === "object" && v !== null) Object.values(v).forEach(visit);
  };
  for (const c of Object.values(d.components)) Object.values(c).forEach(visit);
  visit(d.interRegionMs);
  const values: Record<string, number> = {};
  for (const k of knobs) {
    const o = overrides[k.knob];
    values[k.knob] = o === undefined || Number.isNaN(o) ? k.value : Math.min(k.max, Math.max(k.min, o));
  }
  const num = (x: Num | undefined): number => (x === undefined ? 0 : isKnob(x) ? values[x.knob] : x);
  return { knobs, values, num };
}

const KINDS: Kind[] = ["read", "write", "static"];

/** The clients' timeout for each kind of request, in ms. */
export function timeoutsOf(c: ClientsSpec, num: (x: Num | undefined) => number): Record<Kind, number> {
  const t = c.timeoutMs;
  if (typeof t === "number" || isKnob(t)) {
    const v = num(t);
    return { read: v, write: v, static: v };
  }
  return Object.fromEntries(KINDS.map((k) => [k, t[k] === undefined ? 1000 : num(t[k])])) as Record<Kind, number>;
}

/** Names of the downstreams a station calls through a circuit breaker. */
const breakersOf = (c: StationSpec): string[] => [
  ...new Set([...c.calls.read, ...c.calls.write, ...c.calls.static].flatMap((s) => (typeof s === "object" && "call" in s && s.breaker ? [s.call] : []))),
];

/** What the canvas needs to draw the design. */
export function viewOf(d: Design, overrides: Record<string, number> = {}): DesignView {
  const { knobs, num } = resolve(d, overrides);
  const components: ComponentView[] = Object.entries(d.components).map(([id, c]): ComponentView => {
    const base = { id, targets: targetsOf(c), replicas: 1, cores: 0, threads: 0, queue: 0, costPerHour: 0 };
    if (c.type === "clients") {
      const t = timeoutsOf(c, num);
      const uniform = t.read === t.write && t.write === t.static;
      return {
        ...base,
        type: "clients",
        label: "Users",
        timeoutMs: Math.max(t.read, t.write, t.static),
        ...(uniform ? {} : { timeouts: t }),
        ...(c.staticTo ? { staticTo: c.staticTo } : {}),
      };
    }
    if (c.type === "lb") {
      return {
        ...base,
        type: "lb",
        label: c.rateLimit ? "Load balancer + rate limit" : "Load balancer",
        sticky: c.sticky,
        strategy: c.strategy,
        healthCheckMs: c.healthCheckMs,
        costPerHour: c.costPerHour,
        ...(c.rateLimit ? { rateLimit: c.rateLimit } : {}),
        ...(c.geo ? { geo: c.geo } : {}),
      };
    }
    if (c.type === "queue") {
      return {
        ...base,
        type: "queue",
        label: c.label,
        consumers: Math.max(1, Math.round(num(c.consumers))),
        costPerHour: c.costPerHour,
        fanout: num(c.fanout),
        ...(num(c.delayMs) > 0 ? { delayMs: num(c.delayMs) } : {}),
      };
    }
    const copies = Math.max(1, Math.round(num(c.replicas)));
    const shards = Math.max(1, Math.round(num(c.shards)));
    const breakers = breakersOf(c);
    return {
      ...base,
      type: "station",
      role: c.role,
      label: c.label,
      replicas: copies * shards,
      ...(num(c.shards) > 1 ? { shards: Math.round(num(c.shards)) } : {}),
      cores: num(c.cores),
      threads: c.threads,
      queue: c.queue,
      sessions: c.sessions,
      costPerHour: c.costPerHour,
      ...(c.costPerMillion ? { costPerMillion: c.costPerMillion } : {}),
      ...(c.machine ? { machine: c.machine } : {}),
      ...(num(c.capacity) > 0 || c.role === "cache" || c.role === "cdn" ? { capacity: num(c.capacity) } : {}),
      ...(c.role === "database" && num(c.replicas) > 1 ? { lagMs: num(c.lagMs), readYourWrites: c.readYourWrites } : {}),
      ...(c.region !== undefined ? { regions: Array.from({ length: copies * shards }, (_, j) => regionOf(c, j % copies)) } : {}),
      ...(num(c.bandwidthMbps) > 0 ? { bandwidthMbps: num(c.bandwidthMbps) } : {}),
      ...(num(c.ttlMs) > 0 ? { ttlMs: num(c.ttlMs) } : {}),
      ...(breakers.length ? { breakers } : {}),
      ...(c.pools ? { pools: c.pools } : {}),
      egressPerGB: c.egressPerGB,
    };
  });
  const regions = regionsIn(d.components);
  return { name: d.name, components, knobs, ...(regions.length ? { regions, interRegionMs: num(d.interRegionMs), interRegionPerGB: d.interRegionPerGB } : {}) };
}

/** The name of every machine of a station, as fault targets and callouts use them. */
export function replicaNames(c: ComponentView): string[] {
  const shards = c.shards ?? 1;
  const copies = Math.max(1, Math.round(c.replicas / shards));
  const names: string[] = [];
  for (let g = 0; g < shards; g++) {
    for (let i = 0; i < copies; i++) names.push((shards > 1 ? `${c.id}-s${g + 1}` : c.id) + (copies > 1 ? `-${i + 1}` : ""));
  }
  return names;
}
