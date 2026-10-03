// Discrete-event traffic simulation. Requests flow from the clients through load balancers and
// stations (app servers, caches, databases, CDNs). At a station a request waits for a worker, then
// for a CPU core, does its work, then takes its next steps (calls to other components) in order
// while still holding the worker, and finally sends its answer (through the network card, when the
// station has one). Recorded as one frame per 100 ms of simulated time, plus the journeys of a
// sample of requests.

import { Breaker, BREAKER_DEFAULTS, RetryBudget } from "./breaker.ts";
import { exponential, lognormal, makeRng, percentile } from "./dist.ts";
import {
  regionOf,
  resolve,
  stepTargets,
  timeoutsOf,
  viewOf,
  type CallOptions,
  type CallStep,
  type ClientsSpec,
  type Design,
  type StationSpec,
} from "./design.ts";
import { EventQueue } from "./heap.ts";
import { Nic } from "./network.ts";
import {
  CLASSES,
  KINDS,
  hash,
  newGroup,
  round,
  sampleKey,
  spread,
  zero,
  zeroLink,
  zipf,
  type Area,
  type Call,
  type Ev,
  type Group,
  type Lb,
  type Leg,
  type Machine,
  type PendingJob,
  type Queue,
  type Replica,
  type Req,
  type Station,
  type Visit,
} from "./state.ts";
import type { ClientFrame, Frame, GroupFrame, Journey, Kind, LinkFrame, Outcome, StationFrame, TrafficFault, TrafficRun, UserClass } from "./types.ts";

export const FRAME_MS = 100;
/** Above this many requests in a run, one simulated request stands for several real ones. */
export const MAX_REQUESTS = 25_000;
export const MAX_EVENTS = 600_000;
const TRACKED = 200;
/** A failed queue job is retried this long after it was taken (a queue's visibility timeout). */
export const REDELIVER_MS = 1000;

export type RunOptions = {
  seconds?: number;
  seed?: number;
  knobs?: Record<string, number>;
  faults?: TrafficFault[];
  /** Real requests per simulated request. Chosen automatically when left out. */
  scale?: number;
  /** After the last arrival, keep going until every event has run and report what is still held in `leftover`. */
  drain?: boolean;
};

/** Set by the visualizer to collect runs, change knobs and skip runs; untouched under `node --test`. */
export const hooks: {
  count: number;
  onRun: ((run: TrafficRun) => void) | null;
  overrides: ((index: number) => { knobs?: Record<string, number>; faults?: TrafficFault[] }) | null;
  skip: ((index: number) => boolean) | null;
} = { count: 0, onRun: null, overrides: null, skip: null };

function emptyRun(d: Design, seconds: number, knobs: Record<string, number>): TrafficRun {
  return {
    label: "",
    passed: null,
    design: viewOf(d, knobs),
    knobs: resolve(d, knobs).values,
    seconds,
    frames: [],
    journeys: [],
    scale: 1,
    approximate: [],
    faults: [],
    events: 0,
    truncated: false,
  };
}


export function run(d: Design, opts: RunOptions = {}): TrafficRun {
  const index = hooks.count++;
  const seconds = opts.seconds ?? 30;
  if (hooks.skip?.(index)) return emptyRun(d, seconds, opts.knobs ?? {});
  const extra = hooks.overrides?.(index) ?? {};
  const end = seconds * 1000;
  const faults = [...(opts.faults ?? []), ...(extra.faults ?? [])].sort((a, b) => a.at - b.at);
  const { values, num } = resolve(d, { ...opts.knobs, ...extra.knobs });
  const rand = makeRng(opts.seed ?? 1);
  const entries = Object.entries(d.components);
  const cs = entries.find(([, c]) => c.type === "clients")![1] as ClientsSpec;
  const qps = Math.max(0, num(cs.qps));
  const scale = Math.max(1, Math.round(opts.scale ?? Math.ceil((qps * seconds) / MAX_REQUESTS)));
  const users = Math.max(1, Math.round(cs.users / scale));
  // Heavy users shrink with the scale too, so each keeps its real request rate.
  const heavyUsers = Math.max(1, Math.round(cs.abusers / scale));
  const mixW = { read: Math.max(0, num(cs.mix.read)), write: Math.max(0, num(cs.mix.write)), static: Math.max(0, num(cs.mix.static)) };
  const mixSum = mixW.read + mixW.write + mixW.static || 1;
  const cdf = zipf(cs.keys, num(cs.skew));
  const timeouts = timeoutsOf(cs, num);
  const clientBytes = Object.fromEntries(KINDS.map((k) => [k, Math.max(0, num(cs.bytes?.[k]))])) as Record<Kind, number>;
  const interRegion = Math.max(0, num(d.interRegionMs));
  // Users' home regions, as a cumulative table of shares.
  const homes = cs.regions ? Object.entries(cs.regions).map(([r, w]) => [r, Math.max(0, num(w))] as const) : [];
  const homeSum = homes.reduce((n, [, w]) => n + w, 0) || 1;
  // Kinds this design sends, for per-kind metrics: those in the mix, and reads when users reload after a write.
  const kinds = KINDS.filter((k) => mixW[k] > 0 || (k === "read" && cs.rereadMs > 0 && mixW.write > 0));
  const approximate: string[] = [];
  if (cs.abuseShare > 0 && cs.abusers % scale !== 0) approximate.push("heavy users");
  const clientBudget = cs.retryBudget !== undefined ? new RetryBudget(cs.retryBudget, scale) : null;

  // --- build the machines, stations, queues and load balancers ---
  const machines: Machine[] = [];
  const newMachine = (id: string, cores: number): Machine => {
    // Each machine keeps 1/scale of its cores. When that is not a whole number, round it and
    // stretch every service time so the machine's total capacity stays the same.
    const exact = cores / scale;
    const kept = Math.max(1, Math.round(exact));
    const stretch = kept / exact;
    if (Math.abs(stretch - 1) > 1e-9) approximate.push(id);
    const m: Machine = { id, cores: kept, stretch, slow: 1, slowUntil: 0, waiting: [], up: true, busy: 0, area: 0, last: 0 };
    machines.push(m);
    return m;
  };
  const stations = new Map<string, Station>();
  const replicaByName = new Map<string, Replica>();
  const ordered = entries
    .filter((e): e is [string, StationSpec] => e[1].type === "station")
    .sort((a, b) => Number(Boolean(a[1].machine)) - Number(Boolean(b[1].machine)));
  for (const [id, spec] of ordered) {
    const n = Math.max(1, Math.round(num(spec.replicas)));
    const groups = Math.max(1, Math.round(num(spec.shards)));
    const total = n * groups;
    // Workers and waiting room shrink by the scale too, shared out over the replicas so the total
    // stays right; when the total is not a whole number the results are approximate, and the run says so.
    const threads = spread((spec.threads * total) / scale, total, 1);
    const waiting = spread((spec.queue * total) / scale, total, 0);
    if (!threads.exact || !waiting.exact) approximate.push(`${id} workers`);
    const steps = [...spec.calls.read, ...spec.calls.write, ...spec.calls.static];
    const callSteps = steps.filter((s): s is string | ({ call: string } & CallOptions) => typeof s === "string" || "call" in s);
    const linked = Boolean(spec.pools) || callSteps.some((s) => typeof s !== "string");
    // Bulkheads, breakers and retry budgets, per downstream; counts of calls shrink with the scale.
    const poolSize = new Map<string, number[]>();
    for (const t of new Set(callSteps.flatMap(stepTargets))) {
      const limit = spec.pools?.[t] ?? spec.pools?.default;
      if (limit === undefined) continue;
      const p = spread((limit * total) / scale, total, 1);
      if (!p.exact) approximate.push(`${id} pool for ${t}`);
      poolSize.set(t, p.each);
    }
    const breakerOf = new Map<string, CallOptions>();
    for (const s of callSteps) if (typeof s !== "string" && s.breaker && !breakerOf.has(s.call)) breakerOf.set(s.call, s);
    for (const [t, o] of breakerOf) {
      const b = { ...BREAKER_DEFAULTS, ...o.breaker };
      if (b.minCalls % scale !== 0 || b.halfOpenProbes % scale !== 0) approximate.push(`${id} breaker on ${t}`);
    }
    const nicCap = (Math.max(0, num(spec.bandwidthMbps)) * 1000) / scale;
    if (nicCap > 0 && nicCap < spec.flowMbps * 1000) approximate.push(`${id} bandwidth`);
    const st: Station = {
      id,
      spec,
      capacity: Math.max(0, Math.round(num(spec.capacity))),
      lag: Math.max(0, num(spec.lagMs)),
      ttl: Math.max(0, num(spec.ttlMs)),
      replicas: [],
      shards: [],
      rr: 0,
      c: zero(),
      links: linked ? new Map(callSteps.flatMap(stepTargets).map((t) => [t, zeroLink()])) : null,
    };
    for (let g = 0; g < groups; g++) st.shards.push([]);
    for (let j = 0; j < total; j++) {
      const g = Math.floor(j / n);
      const i = j % n;
      const name = (groups > 1 ? `${id}-s${g + 1}` : id) + (n > 1 ? `-${i + 1}` : "");
      const machine = spec.machine ? stations.get(spec.machine)!.replicas[0].machine : newMachine(name, num(spec.cores));
      const r: Replica = {
        name,
        index: i,
        shard: g,
        machine,
        threads: threads.each[j],
        queueLimit: waiting.each[j],
        region: regionOf(spec, i),
        queue: [],
        active: new Set(),
        sessions: new Set(),
        lru: new Map(),
        born: st.ttl > 0 ? new Map() : null,
        nic: nicCap > 0 ? new Nic<Visit>(nicCap, spec.flowMbps * 1000) : null,
        pools: new Map([...poolSize].map(([t, each]) => [t, { limit: each[j], used: 0 }])),
        breakers: new Map(
          [...breakerOf].map(([t, o]) => {
            const b = { ...BREAKER_DEFAULTS, ...o.breaker };
            const cfg = { failureRate: b.failureRate, windowMs: b.windowMs, openMs: b.openMs, minCalls: Math.max(1, Math.round(b.minCalls / scale)), probes: Math.max(1, Math.round(b.halfOpenProbes / scale)) };
            return [t, new Breaker(cfg)];
          }),
        ),
        budgets: new Map(callSteps.flatMap((s) => (typeof s !== "string" && s.retryBudget !== undefined ? [[s.call, new RetryBudget(s.retryBudget, scale)] as const] : []))),
        up: true,
        busy: 0,
        area: 0,
        last: 0,
      };
      st.shards[g].push(r);
      // Caches and CDNs start warm, as they would be in a system that has been running: holding
      // the most popular keys. A restart is what empties them. With a TTL, the warm entries' ages
      // are spread over the TTL so they do not all expire together.
      if (spec.role === "cache" || spec.role === "cdn") {
        for (let k = Math.min(st.capacity, cs.keys) - 1; k >= 0; k--) {
          if (spec.role !== "cdn" && hash(k) % n !== i) continue;
          r.lru.set(k, 0);
          r.born?.set(k, (-st.ttl * (hash(k) % 1000)) / 1000);
        }
      }
      st.replicas.push(r);
      replicaByName.set(name, r);
    }
    stations.set(id, st);
  }
  const queues = new Map<string, Queue>();
  for (const [id, c] of entries) {
    if (c.type !== "queue") continue;
    if (num(c.consumers) % scale !== 0) approximate.push(`${id} consumers`);
    queues.set(id, {
      id,
      spec: c,
      consumers: Math.max(1, Math.round(num(c.consumers) / scale)),
      fanout: Math.max(0, num(c.fanout)),
      delay: Math.max(0, num(c.delayMs)),
      ready: [],
      head: 0,
      pending: new EventQueue<PendingJob>(),
      enqueued: 0,
      processed: 0,
      failed: 0,
      busy: 0,
      area: 0,
      last: 0,
    });
  }
  const lbs = new Map<string, Lb>();
  for (const [id, c] of entries) {
    if (c.type !== "lb") continue;
    const target = stations.get(c.to)!;
    lbs.set(id, { id, spec: c, target, view: target.replicas.map(() => true), rr: 0, sticky: new Map(), buckets: new Map() });
  }
  const replicasOn = (m: Machine) => [...stations.values()].flatMap((s) => s.replicas.filter((r) => r.machine === m));

  // --- the data: commit times of every write, per key. Version n = the nth write. ---
  const commits = new Map<number, number[]>();
  const latest = (key: number) => commits.get(key)?.length ?? 0;
  const versionAt = (key: number, t: number) => {
    const ts = commits.get(key);
    if (!ts) return 0;
    let lo = 0;
    let hi = ts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const lastWrite = new Map<number, number>();

  // --- state ---
  const q = new EventQueue<Ev>();
  let seq = 0;
  let now = 0;
  let events = 0;
  let nextId = 0;
  const frames: Frame[] = [];
  const journeys: Journey[] = [];
  const loggedIn = new Set<number>();
  const newClientFrame = () => ({
    sent: 0,
    retries: 0,
    ok: 0,
    rejected: 0,
    failed: 0,
    timedOut: 0,
    limited: 0,
    throttled: 0,
    wasted: 0,
    loggedOut: 0,
    reads: 0,
    stale: 0,
    ownReads: 0,
    staleOwn: 0,
    degraded: 0,
    latencies: [] as number[],
    staticLatencies: [] as number[],
    tags: [] as number[],
    failLatencies: [] as number[],
    failTags: [] as number[],
    byKind: Object.fromEntries(kinds.map((k) => [k, newGroup()])) as Partial<Record<Kind, Group>>,
    byClass: { normal: newGroup(), heavy: newGroup(), far: newGroup() } as Record<UserClass, Group>,
  });
  let cf = newClientFrame();
  const inSystem: Area = { busy: 0, area: 0, last: 0 };
  const expected = (qps * seconds) / scale;
  const stride = Math.max(1, Math.floor(expected / TRACKED));

  const change = (o: Area, delta: number) => {
    o.area += o.busy * (now - o.last);
    o.last = now;
    o.busy += delta;
  };
  const flush = (o: Area) => change(o, 0);
  const push = (e: Ev) => q.push(e);
  /** The metric groups a user's request belongs to: its kind and its user classes. */
  const groupsOf = (call: Call): Group[] => {
    const out: Group[] = [];
    const k = cf.byKind[call.kind];
    if (k) out.push(k);
    if (call.heavy) out.push(cf.byClass.heavy);
    if (call.far) out.push(cf.byClass.far);
    if (!call.heavy && !call.far) out.push(cf.byClass.normal);
    return out;
  };

  // --- routing ---
  /** Region a visit's requests leave from: a CDN edge is in the user's own region. */
  const regionAt = (v: Visit) => (v.station.spec.role === "cdn" ? v.req.call.region : v.replica.region);

  const pickReplica = (st: Station, req: Req, from: string): Replica => {
    const reps = st.replicas;
    if (reps.length === 1) return reps[0];
    const { kind, key, user } = req.call;
    // A cache spread over several machines: each key lives on one of them.
    if (st.spec.role === "cache") return reps[hash(key) % reps.length];
    if (st.spec.role === "database") {
      // Each key belongs to one shard; within it, the first copy is the primary.
      const group = st.shards[hash(key) % st.shards.length];
      if (kind === "write" || group.length === 1) return group[0];
      const window = Math.max(1000, 2 * st.lag);
      if (st.spec.readYourWrites && now - (lastWrite.get(user) ?? -Infinity) < window) return group[0];
      let up = group.slice(1).filter((r) => r.up);
      // Reads stay in the caller's own region when a copy is there: a replica, else the primary.
      if (from) {
        const local = up.filter((r) => r.region === from);
        if (local.length) up = local;
        else if (group[0].up && group[0].region === from) return group[0];
      }
      return up.length ? up[st.rr++ % up.length] : group[0];
    }
    return reps[st.rr++ % reps.length];
  };

  const pick = (lb: Lb, req: Req, from: string): number => {
    let live = lb.view.flatMap((ok, i) => (ok ? [i] : []));
    if (live.length === 0) return -1;
    const user = req.call.user;
    if (lb.spec.sticky) {
      const s = lb.sticky.get(user);
      if (s !== undefined && lb.view[s]) return s;
    }
    const geo = lb.spec.geo;
    if (geo) {
      // Active-active: the caller's own region if it has a healthy server. Active-passive: the first region in the list that has one.
      const order = geo === "nearest" ? [from] : geo;
      for (const g of order) {
        const here = live.filter((i) => lb.target.replicas[i].region === g);
        if (here.length) {
          live = here;
          break;
        }
      }
    }
    const load = (i: number) => lb.target.replicas[i].busy + lb.target.replicas[i].queue.length;
    let i: number;
    if (lb.spec.strategy === "least-connections") i = live.reduce((b, x) => (load(x) < load(b) ? x : b));
    else if (lb.spec.strategy === "two-choices") {
      const a = live[Math.floor(rand() * live.length)];
      const b = live[Math.floor(rand() * live.length)];
      i = load(b) < load(a) ? b : a;
    } else i = live[lb.rr++ % live.length];
    if (lb.spec.sticky) lb.sticky.set(user, i);
    return i;
  };

  /** Sends `req` to component `target`, arriving after the network hop (plus `extra` ms). */
  const send = (target: string, req: Req, caller: Visit | null, op: Visit["op"], extra = 0, leg: Leg | null = null) => {
    let hop = extra;
    const from = caller ? regionAt(caller) : req.job ? "" : req.call.region;
    const qu = queues.get(target);
    if (qu) {
      // A queue accepts the job at once and answers; consumers do the work later.
      hop += qu.spec.hopMs;
      // One message can create several jobs (fan-out); a fractional fan-out rounds at random.
      const f = qu.fanout;
      const jobs = Math.floor(f) + (rand() < f - Math.floor(f) ? 1 : 0);
      // A job is visible to consumers once it has reached the queue and any delay has passed; its age starts then.
      const due = now + hop + qu.delay;
      for (let j = 0; j < jobs; j++) qu.pending.push({ t: due, seq: seq++, born: due });
      qu.enqueued += jobs;
      if (jobs > 0) push({ t: now + hop + qu.delay, seq: seq++, k: "wake", queue: qu });
      push({ t: now + 2 * hop, seq: seq++, k: "reply", req, caller, outcome: "ok", leg });
      return;
    }
    let st = stations.get(target)!;
    let replica: Replica;
    const lb = lbs.get(target);
    if (lb) {
      hop += lb.spec.hopMs;
      st = lb.target;
      const limit = lb.spec.rateLimit;
      if (limit && !req.job) {
        // Token bucket per user: refill at the steady rate, up to the burst; each request takes one.
        const b = lb.buckets.get(req.call.user) ?? { tokens: limit.burst, last: now };
        b.tokens = Math.min(limit.burst, b.tokens + ((now - b.last) * limit.perSecond) / 1000);
        b.last = now;
        lb.buckets.set(req.call.user, b);
        if (b.tokens < 1) {
          req.limited = true;
          cf.throttled++;
          push({ t: now + 2 * hop, seq: seq++, k: "reply", req, caller, outcome: "rejected", leg });
          return;
        }
        b.tokens -= 1;
      }
      const i = pick(lb, req, from);
      if (i < 0) {
        // No healthy server behind the load balancer: it answers 503 itself.
        push({ t: now + 2 * hop, seq: seq++, k: "reply", req, caller, outcome: "rejected", leg });
        return;
      }
      replica = st.replicas[i];
    } else replica = pickReplica(st, req, from);
    hop += st.spec.hopMs;
    // Crossing between regions adds the distance between them, both ways.
    if (from && replica.region && from !== replica.region) hop += interRegion;
    const v: Visit = { req, station: st, replica, caller, parentLeg: leg, leg: null, tries: 0, op, next: 0, aside: null, phase: "cache", miss: false, back: hop, dead: false, hop: null };
    const j = req.call.journey;
    if (j && op === "serve") {
      v.hop = { station: st.id, at: replica.name, arrive: now + hop, start: -1, cpuStart: -1, cpuEnd: -1, end: -1, outcome: "ok" };
      j.hops.push(v.hop);
    }
    push({ t: now + hop, seq: seq++, k: "arrive", v });
  };

  const reply = (v: Visit, outcome: Outcome) => {
    if (v.hop) {
      v.hop.end = now;
      v.hop.outcome = outcome;
    }
    push({ t: now + v.back, seq: seq++, k: "reply", req: v.req, caller: v.caller, outcome, leg: v.parentLeg });
  };

  // --- a visit's life at a station ---
  const arrive = (v: Visit) => {
    const { replica: r, station: st } = v;
    st.c.calls++;
    if (!r.up) {
      // Nothing is listening on a dead machine: the connection is refused.
      st.c.failed++;
      return reply(v, "failed");
    }
    st.c.arrivals++;
    if (r.busy < r.threads) start(v);
    else if (r.queue.length < r.queueLimit) r.queue.push(v);
    else {
      st.c.rejected++;
      reply(v, "rejected");
    }
  };

  const start = (v: Visit) => {
    const r = v.replica;
    change(r, 1);
    r.active.add(v);
    if (v.hop) v.hop.start = now;
    if (v.station.spec.sessions === "local") {
      const u = v.req.call.user;
      if (!r.sessions.has(u)) {
        if (loggedIn.has(u)) cf.loggedOut++;
        r.sessions.add(u);
        loggedIn.add(u);
      }
    }
    cpu(v);
  };

  const cpu = (v: Visit) => {
    const m = v.replica.machine;
    if (m.busy < m.cores) {
      change(m, 1);
      if (v.hop) v.hop.cpuStart = now;
      const s = v.station.spec;
      const mean = s.serviceMs[v.req.call.kind];
      const work = s.dist === "exponential" ? exponential(rand, mean) : lognormal(rand, mean, s.cv);
      push({ t: now + work * m.stretch * m.slow, seq: seq++, k: "cpu", v });
    } else m.waiting.push(v);
  };

  /** Stores `key` as the most recently used; `fill` marks a fresh copy (its TTL starts now). */
  const touch = (r: Replica, key: number, version: number, capacity: number, fill: boolean) => {
    const lru = r.lru;
    lru.delete(key);
    lru.set(key, version);
    if (fill) r.born?.set(key, now);
    while (lru.size > capacity) {
      const old = lru.keys().next().value as number;
      lru.delete(old);
      r.born?.delete(old);
    }
  };
  /** Whether a cache or CDN replica holds a copy of `key` that has not expired; an expired one is dropped. */
  const holds = (r: Replica, st: Station, key: number): boolean => {
    if (!r.lru.has(key)) return false;
    if (r.born && now - (r.born.get(key) ?? now) > st.ttl) {
      r.lru.delete(key);
      r.born.delete(key);
      return false;
    }
    return true;
  };

  const cpuDone = (v: Visit) => {
    if (v.dead) return;
    const m = v.replica.machine;
    change(m, -1);
    const w = m.waiting.shift();
    if (w) cpu(w);
    if (v.hop) v.hop.cpuEnd = now;
    const st = v.station;
    const { req } = v;
    const { key, kind } = req.call;
    const role = st.spec.role;
    if (role === "cache") {
      const lru = v.replica.lru;
      if (v.op === "del") {
        lru.delete(key);
        v.replica.born?.delete(key);
      } else if (holds(v.replica, st, key)) {
        st.c.hits++;
        req.hit = true;
        req.value = lru.get(key)!;
        touch(v.replica, key, req.value, st.capacity, false);
      } else {
        st.c.misses++;
        req.hit = false;
      }
      return finish(v, "ok");
    }
    if (role === "cdn" && kind !== "write") {
      if (holds(v.replica, st, key)) {
        st.c.hits++;
        // A read answered from the edge returns the version the edge copy was made from.
        const version = v.replica.lru.get(key)!;
        if (kind === "read") req.value = version;
        touch(v.replica, key, version, st.capacity, false);
        return finish(v, "ok");
      }
      st.c.misses++;
      v.miss = true;
    }
    if (role === "database") {
      if (kind === "write") {
        const ts = commits.get(key) ?? [];
        ts.push(now);
        commits.set(key, ts);
        lastWrite.set(req.call.user, now);
        req.value = ts.length;
      } else if (kind === "read") {
        req.value = v.replica.index === 0 ? latest(key) : versionAt(key, now - st.lag);
      }
    }
    proceed(v);
  };

  /** Takes the station's next step for this request, or finishes it. */
  const proceed = (v: Visit) => {
    const steps: CallStep[] = v.station.spec.calls[v.req.call.kind];
    if (v.next >= steps.length) return finish(v, "ok");
    const s = steps[v.next++];
    if (typeof s === "string" || "call" in s) {
      const target = typeof s === "string" ? s : s.call;
      const o = typeof s === "string" ? null : s;
      v.tries = 0;
      callOut(v, target, o);
    } else if ("cacheAside" in s) {
      v.aside = s;
      v.req.hit = false;
      // Read-your-writes: right after a user's own write, their reads skip the cache and go to
      // the primary, since a cache entry may have been filled from a lagging replica.
      const src = stations.get(s.source);
      const window = src ? Math.max(1000, 2 * src.lag) : 0;
      if (src?.spec.readYourWrites && now - (lastWrite.get(v.req.call.user) ?? -Infinity) < window) {
        v.phase = "source";
        send(s.source, v.req, v, "serve");
        return;
      }
      v.phase = "cache";
      send(s.cacheAside, v.req, v, "get");
    } else send(s.invalidate, v.req, v, "del");
  };

  // --- calls to downstreams: bulkheads, circuit breakers, timeouts and retries ---
  /** One attempt of a call step: refused at once by a full pool or an open breaker, else sent. */
  const callOut = (v: Visit, target: string, o: CallOptions | null) => {
    const r = v.replica;
    const link = v.station.links?.get(target) ?? null;
    const pool = r.pools.get(target) ?? null;
    if (pool && pool.used >= pool.limit) {
      if (link) link.poolFull++;
      return callFailed(v, target, o, "pool");
    }
    const breaker = r.breakers.get(target) ?? null;
    let probe = false;
    if (breaker) {
      const a = breaker.admit(now);
      if (a === "short") {
        if (link) link.shortCircuited++;
        return callFailed(v, target, o, "short");
      }
      probe = a === "probe";
    }
    // Only a first attempt actually sent counts toward the retry budget: one refused at once by a
    // full pool or an open breaker never reached the downstream and must not buy retries.
    if (v.tries === 0) r.budgets.get(target)?.first(now);
    if (pool) pool.used++;
    if (link) link.calls++;
    const leg: Leg = { v, target, opts: o, link, pool, breaker, probe, gen: breaker?.gen ?? 0, done: "" };
    v.leg = leg;
    const limit = o?.timeoutMs === undefined ? 0 : num(o.timeoutMs);
    if (limit > 0) push({ t: now + limit, seq: seq++, k: "legTimeout", leg });
    // An edge fetching a miss from the origin is as far from it as the user is. With regions, the
    // edge sits in the user's region: it pays the ordinary `hopMs` to reach our servers there, and
    // send() adds `interRegionMs` when the origin is elsewhere. A far user's `farHopMs` is then their
    // own long last mile, which the edge near them removes, so it is not paid again. Without
    // regions, `farHopMs` is the only measure of how far the origin is, and the fetch pays it.
    const call = v.req.call;
    const edgeHop = call.far && !call.region ? cs.farHopMs : cs.hopMs;
    send(target, v.req, v, "serve", v.station.spec.role === "cdn" ? edgeHop : 0, leg);
  };

  /** The caller stops waiting on a call: frees its pool slot and tells the breaker how it went. */
  const closeLeg = (leg: Leg, ok: boolean, why: Leg["done"]) => {
    leg.done = why;
    if (leg.v.leg === leg) leg.v.leg = null;
    if (leg.pool) leg.pool.used--;
    if (!leg.breaker) return;
    // A crash wipes the breaker anyway; only give back its trial slot.
    if (why === "crash") {
      if (leg.probe) leg.breaker.inFlight--;
    } else leg.breaker.record(now, ok, leg.probe, leg.gen);
  };

  const legReply = (leg: Leg, outcome: Outcome) => {
    if (leg.done) {
      // The caller had given up on this attempt; the work behind it was wasted.
      if (leg.done === "timeout" && outcome === "ok") cf.wasted++;
      return;
    }
    closeLeg(leg, outcome === "ok", "reply");
    const v = leg.v;
    if (v.dead) return;
    if (outcome === "ok") return proceed(v);
    if (leg.link) leg.link.failed++;
    callFailed(v, leg.target, leg.opts, outcome);
  };

  const legTimeout = (leg: Leg) => {
    if (leg.done) return;
    closeLeg(leg, false, "timeout");
    if (leg.link) leg.link.timedOut++;
    callFailed(leg.v, leg.target, leg.opts, "timeout");
  };

  /** A call attempt failed: retry it if the policy and budget allow, else skip it (fallback) or fail the request. */
  const callFailed = (v: Visit, target: string, o: CallOptions | null, why: Outcome | "timeout" | "pool" | "short") => {
    const retry = o?.retry;
    if (retry && why !== "pool" && why !== "short" && v.tries + 1 < retry.attempts) {
      const budget = v.replica.budgets.get(target);
      if (!budget || budget.tryRetry(now)) {
        v.tries++;
        v.station.c.retries++;
        const link = v.station.links?.get(target);
        if (link) link.retries++;
        const base = (retry.backoffMs ?? 0) * 2 ** (v.tries - 1);
        const j = retry.jitter ?? 0.5;
        const delay = base > 0 && j > 0 ? base * (1 - j + 2 * j * rand()) : base;
        push({ t: now + delay, seq: seq++, k: "legRetry", v, target, opts: o! });
        return;
      }
    }
    if (o?.fallback === "skip") {
      v.req.degraded = true;
      return proceed(v);
    }
    finish(v, "failed");
  };

  /** Bytes in the answer `v` sends back: the station's own sizes, else the clients' for an answer to a user or a CDN. */
  const bytesOf = (v: Visit): number => {
    const kind = v.req.call.kind;
    const own = v.station.spec.bytes?.[kind];
    if (own !== undefined) return Math.max(0, num(own));
    if ((!v.caller && !v.req.job) || v.caller?.station.spec.role === "cdn") return clientBytes[kind];
    return 0;
  };

  /** The work is done: send the answer, through the network card when there is one, then free the worker. */
  const finish = (v: Visit, outcome: Outcome) => {
    if (outcome === "ok" && v.op === "serve") {
      const bytes = bytesOf(v);
      if (bytes > 0) {
        const st = v.station;
        // An answer to a user is internet egress, wherever the user lives: users are not in a cloud
        // region. Inter-region transfer is only between two of our stations placed in different
        // regions. A CDN edge is in every region, and origin-to-CDN traffic is billed (if at all) as
        // CDN origin fetches, not inter-region, so an answer to an edge is neither.
        if (!v.caller && !v.req.job) st.c.egress += bytes;
        const to = v.caller && v.caller.station.spec.role !== "cdn" ? v.caller.replica.region : "";
        if (to && v.replica.region && to !== v.replica.region) st.c.crossRegion += bytes;
        const nic = v.replica.nic;
        if (nic) {
          nic.add(now, v, bytes * 8);
          scheduleNic(nic);
          return;
        }
      }
    }
    release(v, outcome);
  };

  const scheduleNic = (nic: Nic<Visit>) => {
    const t = nic.next();
    if (Number.isFinite(t)) push({ t, seq: seq++, k: "nic", nic, gen: nic.gen });
  };

  /** Releases the worker and answers the caller. */
  const release = (v: Visit, outcome: Outcome) => {
    const r = v.replica;
    r.active.delete(v);
    change(r, -1);
    if (outcome === "ok") v.station.c.done++;
    else v.station.c.failed++;
    // A CDN miss fills the edge with what the origin answered; an answer that carries no version (a
    // static file, or an origin that reads no database) is stored as version 0, the initial data. Not a degraded answer (a fallback
    // skipped part of it): like a response sent with Cache-Control: no-store, it is not kept, so the
    // next request asks the origin again instead of being served the degraded copy as a normal hit.
    if (outcome === "ok" && v.miss && v.replica.up && !v.req.degraded) touch(v.replica, v.req.call.key, Math.max(0, v.req.value), v.station.capacity, true);
    const next = r.queue.shift();
    if (next) start(next);
    reply(v, outcome);
  };

  const onReply = (req: Req, p: Visit | null, outcome: Outcome, leg: Leg | null) => {
    if (!p) {
      if (!req.job) return attemptDone(req, outcome);
      // A job whose request failed is counted as failed and redelivered after the visibility timeout.
      return outcome === "ok" ? jobFinished(req.job) : redeliver(req.job, req.born ?? now);
    }
    if (leg) return legReply(leg, outcome);
    if (p.dead) return;
    const step = p.station.spec.calls[req.call.kind][p.next - 1];
    if (p.aside && p.phase === "cache") {
      // A cache that is down or busy counts as a miss: read the source instead.
      if (outcome === "ok" && req.hit) {
        p.aside = null;
        return proceed(p);
      }
      p.phase = "source";
      return send(p.aside.source, req, p, "serve");
    }
    if (p.aside && p.phase === "source") {
      if (outcome !== "ok") return finish(p, "failed");
      const cacheSt = stations.get(p.aside.cacheAside)!;
      const r = cacheSt.replicas[hash(req.call.key) % cacheSt.replicas.length];
      if (r.up && req.value >= 0) touch(r, req.call.key, req.value, cacheSt.capacity, true);
      p.aside = null;
      return proceed(p);
    }
    // Failing to drop a cache key is not worth failing the user's request over.
    if (outcome !== "ok" && !(typeof step === "object" && "invalidate" in step)) return finish(p, "failed");
    proceed(p);
  };

  // --- the client side ---
  const newAttempt = (call: Call) => {
    call.attempts++;
    const req: Req = { call, sent: now, done: false, value: -1, hit: false, job: null, limited: false, degraded: false };
    push({ t: now + timeouts[call.kind], seq: seq++, k: "timeout", req });
    const entry = call.kind === "static" && cs.staticTo ? cs.staticTo : cs.to;
    const toCdn = stations.get(entry)?.spec.role === "cdn";
    send(entry, req, null, "serve", toCdn ? 0 : call.far ? cs.farHopMs : cs.hopMs);
  };

  const newCall = (kind: Kind, key: number, user: number, far: boolean, region: string, expect: number) => {
    const id = nextId++;
    let journey: Journey | null = null;
    if (id % stride === 0 && journeys.length < TRACKED) {
      journey = { id, kind, user, sent: now, end: -1, outcome: "pending", hops: [] };
      journeys.push(journey);
    }
    // Heavy users are numbered first (see arrival()).
    const heavy = cs.abuseShare > 0 && user < heavyUsers;
    const call: Call = { id, kind, key, user, far, heavy, region, first: now, attempts: 0, done: false, expect, journey };
    cf.sent++;
    for (const g of groupsOf(call)) g.sent++;
    clientBudget?.first(now);
    change(inSystem, 1);
    newAttempt(call);
  };

  const finalize = (call: Call, outcome: Outcome | "timeout", req: Req) => {
    call.done = true;
    change(inSystem, -1);
    const groups = groupsOf(call);
    if (outcome === "ok") {
      const ms = round(now - call.first, 10);
      cf.ok++;
      cf.latencies.push(ms);
      cf.tags.push(KINDS.indexOf(call.kind) + (call.heavy ? 4 : 0) + (call.far ? 8 : 0));
      for (const g of groups) {
        g.ok++;
        g.lat.push(ms);
      }
      if (req.degraded) cf.degraded++;
      if (call.kind === "static") cf.staticLatencies.push(ms);
      if (call.kind === "read" && req.value >= 0) {
        cf.reads++;
        // Stale: older than what had already been written when the user asked.
        if (req.value < versionAt(call.key, call.first)) cf.stale++;
        if (call.expect > 0) {
          cf.ownReads++;
          if (req.value < call.expect) cf.staleOwn++;
        }
      }
      if (call.kind === "write" && cs.rereadMs > 0 && req.value > 0 && rand() < cs.rereadShare) {
        const { key, user, far, heavy, region } = call;
        const expect = req.value;
        push({ t: now + cs.rereadMs, seq: seq++, k: "attempt", call: { id: -1, kind: "read", key, user, far, heavy, region, first: 0, attempts: 0, done: false, expect, journey: null } });
      }
    } else {
      cf.failLatencies.push(round(now - call.first, 10));
      cf.failTags.push(KINDS.indexOf(call.kind) + (call.heavy ? 4 : 0) + (call.far ? 8 : 0));
      for (const g of groups) {
        g.errors++;
        if (outcome === "timeout") g.timeouts++;
      }
      if (outcome === "rejected") {
        cf.rejected++;
        if (req.limited) cf.limited++;
      } else if (outcome === "failed") cf.failed++;
      else cf.timedOut++;
    }
    if (call.journey) {
      call.journey.end = now;
      call.journey.outcome = outcome;
    }
  };

  const retryOrFinal = (call: Call, outcome: Outcome | "timeout", req: Req) => {
    if (cs.retry !== "none" && call.attempts < cs.attempts && (!clientBudget || clientBudget.tryRetry(now))) {
      cf.retries++;
      // Backoff waits 100 ms, then 200, 400, ... each scaled by a random factor (jitter) so
      // clients that failed together do not all come back together.
      const delay = cs.retry === "immediate" ? 0 : 100 * 2 ** (call.attempts - 1) * (0.5 + rand());
      push({ t: now + delay, seq: seq++, k: "attempt", call });
      return;
    }
    finalize(call, outcome, req);
  };

  const attemptDone = (req: Req, outcome: Outcome) => {
    const call = req.call;
    if (req.done || call.done) {
      if (outcome === "ok") cf.wasted++;
      return;
    }
    req.done = true;
    if (outcome === "ok") finalize(call, "ok", req);
    else retryOrFinal(call, outcome, req);
  };

  const timeout = (req: Req) => {
    if (req.done || req.call.done) return;
    req.done = true;
    retryOrFinal(req.call, "timeout", req);
  };

  const arrival = () => {
    const u = rand() * mixSum;
    const kind: Kind = u < mixW.read ? "read" : u < mixW.read + mixW.write ? "write" : "static";
    const key = sampleKey(cdf, rand());
    // A few heavy users (abusers) send `abuseShare` of all traffic; everyone else shares the rest.
    const heavy = Math.min(heavyUsers, users);
    const user = rand() < cs.abuseShare ? Math.floor(rand() * heavy) : heavy + Math.floor(rand() * Math.max(1, users - heavy));
    const far = rand() < cs.farShare;
    let region = "";
    if (homes.length) {
      let x = rand() * homeSum;
      region = homes[homes.length - 1][0];
      for (const [r, w] of homes) if ((x -= w) < 0) {
        region = r;
        break;
      }
    }
    newCall(kind, key, user, far, region, 0);
    const gap = exponential(rand, (1000 * scale) / qps);
    if (now + gap < end) push({ t: now + gap, seq: seq++, k: "arrival" });
  };

  // --- queues ---
  /** Jobs whose time has come join the end of the visible line, in the order they became visible. */
  const promote = (qu: Queue) => {
    for (let p = qu.pending.peek(); p && p.t <= now; p = qu.pending.peek()) qu.ready.push(qu.pending.pop()!.born);
  };
  const visible = (qu: Queue) => qu.ready.length - qu.head;
  /** Age of the oldest visible job (ms). Retried jobs rejoin at the back, so the oldest need not be first. */
  const oldest = (qu: Queue) => {
    let min = Infinity;
    for (let i = qu.head; i < qu.ready.length; i++) if (qu.ready[i] < min) min = qu.ready[i];
    return min === Infinity ? 0 : now - min;
  };
  const startJobs = (qu: Queue) => {
    promote(qu);
    while (qu.busy < qu.consumers && qu.head < qu.ready.length) {
      const born = qu.ready[qu.head++];
      change(qu, 1);
      const via = qu.spec.via ? stations.get(qu.spec.via)!.replicas[0].machine.slow : 1;
      push({ t: now + lognormal(rand, qu.spec.workMs, qu.spec.cv) * via, seq: seq++, k: "job", queue: qu, born });
    }
    // Drop the taken part of the line once it is most of the array, so it does not grow forever.
    if (qu.head > 1024 && qu.head * 2 > qu.ready.length) {
      qu.ready = qu.ready.slice(qu.head);
      qu.head = 0;
    }
  };
  /** A consumer finished its own work: send the job's request on, or it is done. */
  const jobDone = (qu: Queue, born: number) => {
    if (qu.spec.via && !stations.get(qu.spec.via)!.replicas[0].up) return redeliver(qu, born);
    if (!qu.spec.to) return jobFinished(qu);
    const key = Math.floor(rand() * cs.keys);
    const call: Call = { id: -2, kind: qu.spec.kind, key, user: -1, far: false, heavy: false, region: "", first: now, attempts: 1, done: false, expect: 0, journey: null };
    send(qu.spec.to, { call, sent: now, done: false, value: -1, hit: false, job: qu, born, limited: false, degraded: false }, null, "serve");
  };
  /**
   * The job failed: like a real queue that was never told "done", it becomes visible again after
   * a visibility timeout and is retried, at the back of the line. It keeps its age: a real queue's
   * "age of oldest message" counts from when the message was first sent. The consumer is free meanwhile.
   */
  const redeliver = (qu: Queue, born: number) => {
    qu.failed++;
    const at = now + REDELIVER_MS;
    qu.pending.push({ t: at, seq: seq++, born });
    push({ t: at, seq: seq++, k: "wake", queue: qu });
    change(qu, -1);
    startJobs(qu);
  };
  const jobFinished = (qu: Queue) => {
    change(qu, -1);
    qu.processed++;
    startJobs(qu);
  };

  // --- faults ---
  const fault = (f: Ev & { k: "fault" }) => {
    const ff = f.f;
    if ("region" in ff) {
      const here = [...replicaByName.values()].filter((r) => r.region === ff.region);
      if (!here.length) throw new Error(`fault region "${ff.region}" has no servers in it`);
      for (const m of new Set(here.map((r) => r.machine))) {
        if (ff.kind === "killRegion") crash(m);
        else restart(m);
      }
      return;
    }
    const r = replicaByName.get(ff.target);
    if (!r) throw new Error(`fault target "${ff.target}" is not a server; use one of ${[...replicaByName.keys()].join(", ")}`);
    const m = r.machine;
    if (ff.kind === "slow") {
      m.slow = ff.factor;
      m.slowUntil = Math.max(m.slowUntil, now + ff.durationMs);
      push({ t: now + ff.durationMs, seq: seq++, k: "fault", f: { at: now + ff.durationMs, kind: "heal", target: ff.target } });
      return;
    }
    if (ff.kind === "heal") {
      // Overlapping slowdowns: normal speed returns only when the last one ends.
      if (now >= m.slowUntil) m.slow = 1;
      return;
    }
    if (ff.kind === "restart") return restart(m);
    crash(m);
  };

  /** Back up, but empty: whatever was in memory (sessions, cached keys, breakers) is gone. Restarting a running server stops it first. */
  const restart = (m: Machine) => {
    if (m.up) crash(m);
    m.up = true;
    for (const rep of replicasOn(m)) rep.up = true;
  };

  const crash = (m: Machine) => {
    if (!m.up) return;
    m.up = false;
    change(m, -m.busy);
    m.waiting = [];
    for (const rep of replicasOn(m)) {
      rep.up = false;
      const lost = [...rep.queue, ...rep.active];
      rep.queue = [];
      rep.active.clear();
      change(rep, -rep.busy);
      rep.sessions.clear();
      rep.lru.clear();
      rep.born?.clear();
      rep.nic?.clear(now);
      // Its calls in flight are abandoned: their pool slots and trial calls are given back first.
      for (const v of lost) if (v.leg) closeLeg(v.leg, false, "crash");
      for (const b of rep.breakers.values()) b.reset();
      for (const b of rep.budgets.values()) b.reset();
      // The process is gone, so its open connections are reset and callers see an error at once.
      for (const v of lost) {
        v.dead = true;
        v.station.c.failed++;
        reply(v, "failed");
      }
    }
  };

  const health = (lb: Lb) => {
    lb.view = lb.target.replicas.map((r) => r.up);
    if (now + lb.spec.healthCheckMs <= end) push({ t: now + lb.spec.healthCheckMs, seq: seq++, k: "health", lb });
  };

  const groupFrame = (g: Group): GroupFrame => {
    const sorted = [...g.lat].sort((a, b) => a - b);
    return { sent: g.sent * scale, ok: g.ok * scale, errors: g.errors * scale, timeouts: g.timeouts * scale, p50: sorted.length ? percentile(sorted, 0.5) : -1, p99: sorted.length ? percentile(sorted, 0.99) : -1 };
  };

  const frame = () => {
    const util = new Map<Machine, number>();
    for (const m of machines) {
      flush(m);
      util.set(m, m.area / (m.cores * FRAME_MS));
      m.area = 0;
    }
    const out: Record<string, StationFrame> = {};
    for (const st of stations.values()) {
      let u = 0;
      let th = 0;
      let queued = 0;
      let slow = 1;
      let nicUse = 0;
      let bits = 0;
      const each: number[] = [];
      for (const r of st.replicas) {
        flush(r);
        th += r.area / (r.threads * FRAME_MS);
        r.area = 0;
        u += util.get(r.machine)!;
        each.push(round(util.get(r.machine)!));
        queued += r.queue.length;
        slow = Math.max(slow, r.machine.slow);
        if (r.nic) {
          r.nic.advance(now);
          nicUse += r.nic.area / FRAME_MS;
          bits += r.nic.sent;
          r.nic.area = 0;
          r.nic.sent = 0;
        }
      }
      const n = st.replicas.length;
      const lookups = st.spec.role === "cache" || st.spec.role === "cdn";
      const links: Record<string, LinkFrame> = {};
      for (const [t, l] of st.links ?? []) {
        const breaker = st.replicas[0].breakers.has(t) ? st.replicas.map((r) => r.breakers.get(t)!.state(now)) : undefined;
        links[t] = { calls: l.calls * scale, failed: l.failed * scale, timedOut: l.timedOut * scale, retries: l.retries * scale, shortCircuited: l.shortCircuited * scale, poolFull: l.poolFull * scale, ...(breaker ? { breaker } : {}) };
        // Reset in place: calls in flight still hold this object.
        Object.assign(l, zeroLink());
      }
      out[st.id] = {
        util: round(u / n),
        threads: round(th / n),
        queue: queued * scale,
        arrivals: st.c.arrivals * scale,
        done: st.c.done * scale,
        rejected: st.c.rejected * scale,
        failed: st.c.failed * scale,
        up: st.replicas.map((r) => r.up),
        slow,
        replicaUtil: each,
        calls: st.c.calls * scale,
        ...(lookups ? { hits: st.c.hits * scale, misses: st.c.misses * scale } : {}),
        ...(st.replicas[0].nic ? { nic: round(nicUse / n), bytesOut: round((bits / 8) * scale, 1) } : {}),
        ...(st.c.egress ? { egress: st.c.egress * scale } : {}),
        ...(st.c.crossRegion ? { crossRegion: st.c.crossRegion * scale } : {}),
        ...(st.c.retries ? { retries: st.c.retries * scale } : {}),
        ...(st.links ? { links } : {}),
      };
      st.c = zero();
    }
    for (const qu of queues.values()) {
      flush(qu);
      promote(qu);
      out[qu.id] = {
        util: round(qu.area / (qu.consumers * FRAME_MS)),
        threads: 0,
        queue: 0,
        arrivals: qu.enqueued * scale,
        done: qu.processed * scale,
        rejected: 0,
        failed: qu.failed * scale,
        up: [true],
        slow: 1,
        replicaUtil: [],
        calls: qu.enqueued * scale,
        // Visible jobs only: those still on their way, delayed and not due yet, or hidden after a failed attempt are not counted.
        backlog: visible(qu) * scale,
        oldestMs: round(oldest(qu), 1),
        // Every job not finished and not being worked on, hidden ones included.
        backlogTotal: (visible(qu) + qu.pending.size) * scale,
        processed: qu.processed * scale,
        ...(qu.delay > 0 ? { scheduled: qu.pending.size * scale } : {}),
      };
      qu.area = 0;
      qu.enqueued = 0;
      qu.processed = 0;
      qu.failed = 0;
    }
    flush(inSystem);
    const sorted = [...cf.latencies].sort((a, b) => a - b);
    const x = (n: number) => n * scale;
    const clients: ClientFrame = {
      sent: x(cf.sent),
      retries: x(cf.retries),
      ok: x(cf.ok),
      rejected: x(cf.rejected),
      failed: x(cf.failed),
      timedOut: x(cf.timedOut),
      limited: x(cf.limited),
      throttled: x(cf.throttled),
      wasted: x(cf.wasted),
      loggedOut: x(cf.loggedOut),
      reads: x(cf.reads),
      stale: x(cf.stale),
      ownReads: x(cf.ownReads),
      staleOwn: x(cf.staleOwn),
      inSystem: round((inSystem.area / FRAME_MS) * scale, 100),
      // -1: nothing succeeded in this frame, so there is no latency to show.
      p50: sorted.length ? percentile(sorted, 0.5) : -1,
      p99: sorted.length ? percentile(sorted, 0.99) : -1,
      latencies: cf.latencies,
      staticLatencies: cf.staticLatencies,
      tags: cf.tags,
      failLatencies: cf.failLatencies,
      failTags: cf.failTags,
      degraded: x(cf.degraded),
      byKind: Object.fromEntries(kinds.map((k) => [k, groupFrame(cf.byKind[k]!)])),
      byClass: Object.fromEntries(CLASSES.map((c) => [c, groupFrame(cf.byClass[c])])) as Record<UserClass, GroupFrame>,
    };
    inSystem.area = 0;
    frames.push({ t: now, clients, stations: out });
    cf = newClientFrame();
    if (now + FRAME_MS <= end) push({ t: now + FRAME_MS, seq: seq++, k: "frame" });
  };

  // --- run ---
  if (qps > 0) push({ t: exponential(rand, (1000 * scale) / qps), seq: seq++, k: "arrival" });
  push({ t: FRAME_MS, seq: seq++, k: "frame" });
  for (const f of faults) push({ t: f.at, seq: seq++, k: "fault", f });
  for (const lb of lbs.values()) push({ t: lb.spec.healthCheckMs, seq: seq++, k: "health", lb });

  let truncated = false;
  let error: string | undefined;
  try {
    for (let e = q.pop(); e; e = q.pop()) {
      if (e.t > end && !opts.drain) break;
      if (++events > MAX_EVENTS) {
        truncated = true;
        break;
      }
      now = e.t;
      switch (e.k) {
        case "arrival":
          arrival();
          break;
        case "attempt":
          // A user's reload after a write starts a new call; a retry continues the old one.
          if (e.call.id < 0) newCall(e.call.kind, e.call.key, e.call.user, e.call.far, e.call.region, e.call.expect);
          else newAttempt(e.call);
          break;
        case "arrive":
          arrive(e.v);
          break;
        case "cpu":
          cpuDone(e.v);
          break;
        case "reply":
          onReply(e.req, e.caller, e.outcome, e.leg);
          break;
        case "timeout":
          timeout(e.req);
          break;
        case "legTimeout":
          legTimeout(e.leg);
          break;
        case "legRetry":
          if (!e.v.dead) callOut(e.v, e.target, e.opts);
          break;
        case "nic":
          if (e.gen !== e.nic.gen) break;
          for (const v of e.nic.finished(now)) if (!v.dead) release(v, "ok");
          scheduleNic(e.nic);
          break;
        case "job":
          jobDone(e.queue, e.born);
          break;
        case "wake":
          startJobs(e.queue);
          break;
        case "frame":
          frame();
          break;
        case "health":
          health(e.lb);
          break;
        case "fault":
          fault(e);
          break;
      }
    }
  } catch (err) {
    error = (err as Error).message;
  }

  let leftover: Record<string, number> | undefined;
  if (opts.drain) {
    const reps = [...stations.values()].flatMap((s) => s.replicas);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    leftover = {
      workers: sum(reps.map((r) => r.busy)),
      active: sum(reps.map((r) => r.active.size)),
      waiting: sum(reps.map((r) => r.queue.length)) + sum(machines.map((m) => m.waiting.length)),
      cores: sum(machines.map((m) => m.busy)),
      nic: sum(reps.map((r) => r.nic?.size ?? 0)),
      pools: sum(reps.flatMap((r) => [...r.pools.values()].map((p) => p.used))),
      probes: sum(reps.flatMap((r) => [...r.breakers.values()].map((b) => b.inFlight))),
      consumers: sum([...queues.values()].map((qu) => qu.busy)),
      backlog: sum([...queues.values()].map((qu) => visible(qu) + qu.pending.size)),
      inFlight: inSystem.busy,
    };
  }

  const result: TrafficRun = {
    label: "",
    passed: null,
    design: viewOf(d, values),
    knobs: values,
    seconds,
    frames,
    journeys,
    scale,
    approximate,
    faults,
    events,
    truncated,
    ...(error ? { error } : {}),
    ...(leftover ? { leftover } : {}),
  };
  hooks.onRun?.(result);
  return result;
}
