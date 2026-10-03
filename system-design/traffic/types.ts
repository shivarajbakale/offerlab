// Shared format of a traffic run: produced by the traffic engine, drawn by the visualizer.
// Plain data only, so a run can cross from the web worker to the page.

/** A page read, a write, or a static file (image, script, stylesheet). */
export type Kind = "read" | "write" | "static";

/** A named setting the reader can change with a slider. */
export type Knob = { knob: string; value: number; min: number; max: number; log: boolean };
export type Num = number | Knob;

export type Strategy = "round-robin" | "least-connections" | "two-choices";
export type Role = "app" | "database" | "store" | "cache" | "cdn" | "external";
export type Outcome = "ok" | "rejected" | "failed";

/**
 * A fault injected at a time (ms) on the machine a replica runs on: kill it, restart it (empty),
 * or slow it down by `factor` for `durationMs`.
 */
export type TrafficFault =
  | { at: number; kind: "kill" | "restart"; target: string }
  | { at: number; kind: "slow"; target: string; factor: number; durationMs: number }
  /** Every machine placed in `region` goes down (or comes back, empty) at once. */
  | { at: number; kind: "killRegion" | "restartRegion"; region: string };

/** A circuit breaker's state: calls pass, fail at once, or a few trial calls pass. */
export type BreakerState = "closed" | "open" | "half-open";
/** Users grouped for metrics: heavy users (`abuseShare`), far-away users (`farShare`), and everyone else. A user can be heavy and far. */
export type UserClass = "normal" | "heavy" | "far";

/** One component as the canvas draws it, with knobs already resolved to numbers. */
export type ComponentView = {
  id: string;
  type: "clients" | "lb" | "station" | "queue";
  role?: Role;
  label: string;
  /** Components this one sends requests to. */
  targets: string[];
  replicas: number;
  cores: number;
  threads: number;
  queue: number;
  sessions?: "none" | "local" | "shared";
  sticky?: boolean;
  strategy?: Strategy;
  healthCheckMs?: number;
  /** Clients: the longest timeout; `timeouts` when it differs by kind. */
  timeoutMs?: number;
  timeouts?: Partial<Record<Kind, number>>;
  /** Region of each replica (one entry per machine, in replicaNames order), when placed in regions. */
  regions?: string[];
  /** Load balancer routing by region: the user's own region first, or regions in a fixed order (active-passive). */
  geo?: "nearest" | string[];
  /** Network card speed per machine, Mbps. */
  bandwidthMbps?: number;
  /** Cache or CDN: entries older than this are refetched. */
  ttlMs?: number;
  /** Queue: jobs wait this long before consumers may take them. */
  delayMs?: number;
  /** Calls this station guards with a circuit breaker, and its worker limits per downstream (bulkheads). */
  breakers?: string[];
  pools?: Record<string, number>;
  /** Dollars per GB sent to users from here. */
  egressPerGB?: number;
  /** Station sharing another station's machine (both use the same CPU cores). */
  machine?: string;
  /** Cache or CDN: how many keys it holds. */
  capacity?: number;
  /** Database with replicas: how far replicas trail the primary, in ms. */
  lagMs?: number;
  readYourWrites?: boolean;
  /** Queue: workers taking jobs off it, and jobs created per message. */
  consumers?: number;
  fanout?: number;
  /** Database split into this many shards; `replicas` counts every machine. */
  shards?: number;
  rateLimit?: { perSecond: number; burst: number };
  /** Clients: where static files go, when not to the main entry. */
  staticTo?: string;
  /** Rough price in dollars: per machine-hour, or per million requests for a CDN. */
  costPerHour: number;
  costPerMillion?: number;
};

export type DesignView = {
  name: string;
  components: ComponentView[];
  knobs: Knob[];
  /** Regions any component is placed in, and the one-way network time between two of them (ms). */
  regions?: string[];
  interRegionMs?: number;
  interRegionPerGB?: number;
};

/** Requests of one kind, or from one class of users, during a frame. Counts are real requests. */
export type GroupFrame = { sent: number; ok: number; errors: number; timeouts: number; p50: number; p99: number };

/** A station's calls to one downstream component during a frame. */
export type LinkFrame = {
  calls: number;
  failed: number;
  timedOut: number;
  retries: number;
  /** Calls a open circuit breaker failed at once, without sending them. */
  shortCircuited: number;
  /** Calls refused at once because the workers set aside for this downstream were all busy. */
  poolFull: number;
  /** Breaker state on each replica of the calling station, at the end of the frame. */
  breaker?: BreakerState[];
};

/** What the clients saw during one frame. Counts are real requests (already multiplied by the scale). */
export type ClientFrame = {
  sent: number;
  /** Extra attempts made after a failure or timeout. */
  retries: number;
  ok: number;
  rejected: number;
  failed: number;
  timedOut: number;
  /** Requests whose final answer was a rate limit's 429; also counted in `rejected`. */
  limited: number;
  /** Every 429 a rate limit sent, retried or not. */
  throttled: number;
  /** Requests the servers finished after the client had given up on them. */
  wasted: number;
  /** Users who had to sign in again because their session was lost. */
  loggedOut: number;
  /** Successful reads, and those that returned an older value than the latest write. */
  reads: number;
  stale: number;
  /** Reads, right after a user's own write, that did not show that write. */
  ownReads: number;
  staleOwn: number;
  /** Average number of requests in flight (sent, not yet answered or given up). */
  inSystem: number;
  /** Latency percentiles of successful requests; -1 when none succeeded in the frame. */
  p50: number;
  p99: number;
  /** Latency (ms) of every successful simulated request that finished in this frame; and of static files only. */
  latencies: number[];
  staticLatencies: number[];
  /** For each entry of `latencies`: kind (0 read, 1 write, 2 static), +4 for a heavy user, +8 for a far one. */
  tags: number[];
  /** Latency (ms, from the first attempt) of every simulated request that ended in an error or timeout in this frame, and its tag as in `tags`. */
  failLatencies: number[];
  failTags: number[];
  /** Answered, but a downstream call was skipped by a fallback (a degraded answer). Also counted in `ok`. */
  degraded: number;
  /** Per request kind (only kinds this design sends), and per user class. */
  byKind: Partial<Record<Kind, GroupFrame>>;
  byClass: Record<UserClass, GroupFrame>;
};

/** One station (all its replicas) during one frame. */
export type StationFrame = {
  /** Share of CPU core time in use, 0..1. */
  util: number;
  /** Share of workers (threads, connections) in use, 0..1. */
  threads: number;
  /** Requests waiting for a worker at the end of the frame. */
  queue: number;
  arrivals: number;
  done: number;
  rejected: number;
  failed: number;
  up: boolean[];
  /** How many times slower than normal the machine runs (1 = normal). */
  slow: number;
  /** CPU use of each replica, 0..1 (for a database, the primary first). */
  replicaUtil: number[];
  /** Cache and CDN lookups. */
  hits?: number;
  misses?: number;
  /**
   * Queue: visible jobs waiting, the age of the oldest of them (ms, from its first enqueue or due
   * time; a retry does not reset it), and jobs finished. For a queue, `failed` counts attempts that failed and were put back.
   */
  backlog?: number;
  oldestMs?: number;
  processed?: number;
  /**
   * Queue: every job not finished and not being worked on: the visible `backlog` plus jobs still on
   * their way, delayed and not due yet, or hidden for the visibility timeout after a failed attempt.
   */
  backlogTotal?: number;
  /** Queue with `delayMs`: jobs not visible yet (not due, or hidden after a failed attempt; not counted in `backlog`). */
  scheduled?: number;
  /** Every request that reached it, including those refused because it was down. */
  calls: number;
  /** Network card: share of its bandwidth in use, 0..1 (average over replicas), and bytes sent. */
  nic?: number;
  bytesOut?: number;
  /** Bytes sent to users (internet egress) and to another region. */
  egress?: number;
  crossRegion?: number;
  /** Retries this station made of its own calls to downstreams (service-level retries). */
  retries?: number;
  /** Calls to each downstream, for stations with call options or worker pools. */
  links?: Record<string, LinkFrame>;
};

export type Frame = { t: number; clients: ClientFrame; stations: Record<string, StationFrame> };

/** One visit of a tracked request to a station replica. Times in ms; -1 means it never got there. */
export type Hop = {
  station: string;
  at: string;
  arrive: number;
  start: number;
  cpuStart: number;
  cpuEnd: number;
  end: number;
  outcome: Outcome;
};

export type Journey = {
  id: number;
  kind: Kind;
  user: number;
  sent: number;
  end: number;
  outcome: Outcome | "timeout" | "pending";
  hops: Hop[];
};

export type TrafficRun = {
  label: string;
  passed: boolean | null;
  design: DesignView;
  knobs: Record<string, number>;
  seconds: number;
  frames: Frame[];
  journeys: Journey[];
  /** Real requests each simulated request stands for. */
  scale: number;
  /** Machines too small to split at this scale, so pooled into one faster or slower core. */
  approximate: string[];
  faults: TrafficFault[];
  events: number;
  truncated: boolean;
  error?: string;
  /**
   * With `drain: true`: what was still held once every event had run (all should be 0): workers,
   * CPU cores, waiting requests, network transfers, bulkhead slots, breaker trial calls, queue
   * consumers and requests in flight.
   */
  leftover?: Record<string, number>;
};

export type TrafficTrace = { runs: TrafficRun[]; error?: string };
