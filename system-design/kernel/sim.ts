// Deterministic discrete-event simulation of message-passing nodes.
// One SimStep is recorded per event (start, delivery, drop, timer, fault), so a run can be
// replayed step by step. The same options and seed always give the same run.

import type { DropReason, Fault, InFlight, Msg, NodeId, NodeView, SimRun, SimStep, StepKind } from "./types.ts";

export type * from "./types.ts";

export const CLIENT: NodeId = "client";
export const MAX_EVENTS = 5000;

/** What a handler can do. A fresh Ctx is passed to every handler call. */
export interface Ctx {
  readonly id: NodeId;
  readonly now: number;
  /** Every other node in the cluster (not the client). */
  readonly peers: NodeId[];
  send(to: NodeId, type: string, body?: unknown): void;
  /** Fires `on<name>(ctx)` after `after` ticks. Setting a timer again replaces it. */
  setTimer(name: string, after: number): void;
  cancelTimer(name: string): void;
  /** Seeded random number in [0, 1). */
  rand(): number;
  /** Narration for the current step. */
  say(text: string): void;
}

/**
 * Base class for a protocol node. A message of type `Foo` is handled by
 * `onFoo(ctx, body, from)`; a timer named `Bar` fires `onBar(ctx)`.
 */
export abstract class SimNode {
  /** Fields kept across a crash, as if written to disk. Everything else resets on recover. */
  static durable: string[] = [];
  /** Plain-data snapshot drawn by the visualizer. */
  abstract state(): Record<string, unknown>;
  /** Runs at time 0, and again after every recover. */
  onStart(_ctx: Ctx): void {}
}

export type SimOptions = {
  /** Factories, so a recovered node can be rebuilt from scratch. */
  nodes: Record<NodeId, () => SimNode>;
  seed: number;
  /** Events after this time are not run. */
  until: number;
  /** Per-message latency range in ticks, inclusive. Default [1, 3]. */
  latency?: [min: number, max: number];
  faults?: Fault[];
  clients?: { at: number; to: NodeId; type: string; body?: unknown }[];
  /** Checked after every event; a returned string is recorded as a violation. */
  invariant?: (nodes: Record<NodeId, SimNode>, up: Record<NodeId, boolean>) => string | null;
};

export type SimResult = {
  run: SimRun;
  /** Live node objects at the end of the run. */
  nodes: Record<NodeId, SimNode>;
  up: Record<NodeId, boolean>;
  /** Messages delivered to the client, in arrival order. */
  inbox: InFlight[];
};

/** Set by the visualizer to collect runs and inject chaos; untouched under `node --test`. */
export const hooks: {
  count: number;
  onRun: ((run: SimRun) => void) | null;
  extraFaults: ((index: number) => Fault[]) | null;
} = { count: 0, onRun: null, extraFaults: null };

/** Small seeded PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Event =
  | { t: number; seq: number; kind: "deliver"; msg: InFlight }
  | { t: number; seq: number; kind: "timer"; node: NodeId; name: string; gen: number }
  | { t: number; seq: number; kind: "fault"; fault: Fault };

type DropRule = { from?: NodeId; to?: NodeId; type?: string; left: number };

export function simulate(opts: SimOptions): SimResult {
  const index = hooks.count++;
  const faults = [...(opts.faults ?? []), ...(hooks.extraFaults?.(index) ?? [])];
  const [latMin, latMax] = opts.latency ?? [1, 3];
  const rand = makeRng(opts.seed);
  const ids = Object.keys(opts.nodes);
  const nodes: Record<NodeId, SimNode> = {};
  const up: Record<NodeId, boolean> = {};
  const steps: SimStep[] = [];
  const run: SimRun = { label: "", passed: null, steps, truncated: false };
  const inbox: InFlight[] = [];
  const queue: Event[] = [];
  const timers = new Map<NodeId, Map<string, number>>(ids.map((id) => [id, new Map()]));
  const dropRules: DropRule[] = [];
  let partitions: NodeId[][] = [];
  let delay = { extra: 0, until: -1 };
  let seq = 0;
  let msgId = 0;
  let gen = 0;
  let now = 0;
  let notes: string[] = [];

  const known = (id: NodeId) => id === CLIENT || id in nodes;

  // Earliest event first; ties go to whichever was queued first.
  const pop = (): Event | undefined => {
    let best = -1;
    for (let i = 0; i < queue.length; i++) {
      const e = queue[i];
      const b = queue[best];
      if (best < 0 || e.t < b.t || (e.t === b.t && e.seq < b.seq)) best = i;
    }
    return best < 0 ? undefined : queue.splice(best, 1)[0];
  };

  const sendMsg = (msg: Msg, at: number, latency: number) => {
    // The body is copied now, so later changes by the sender do not travel with the message.
    const m: InFlight = { ...msg, body: structuredClone(msg.body), id: msgId++, sentAt: at, deliverAt: at + latency };
    queue.push({ t: m.deliverAt, seq: seq++, kind: "deliver", msg: m });
  };

  const ctxFor = (id: NodeId): Ctx => ({
    id,
    now,
    peers: ids.filter((p) => p !== id),
    send: (to, type, body) => {
      if (!known(to)) throw new Error(`send to unknown node "${to}"`);
      const extra = now < delay.until ? delay.extra : 0;
      sendMsg({ from: id, to, type, body }, now, latMin + Math.floor(rand() * (latMax - latMin + 1)) + extra);
    },
    setTimer: (name, after) => {
      if (!Number.isFinite(after) || after < 0) throw new Error("timer delay must be a finite number ≥ 0");
      const g = ++gen;
      timers.get(id)!.set(name, g);
      queue.push({ t: now + after, seq: seq++, kind: "timer", node: id, name, gen: g });
    },
    cancelTimer: (name) => {
      timers.get(id)!.delete(name);
    },
    rand,
    say: (text) => {
      notes.push(text);
    },
  });

  const record = (kind: StepKind, extra: Partial<SimStep> = {}) => {
    const view: Record<NodeId, NodeView> = {};
    for (const id of ids) view[id] = { up: up[id], state: structuredClone(nodes[id].state()) };
    const inFlight = queue
      .flatMap((e) => (e.kind === "deliver" ? [structuredClone(e.msg)] : []))
      .sort((a, b) => a.deliverAt - b.deliverAt || a.id - b.id);
    const step: SimStep = { t: now, kind, ...extra, nodes: view, inFlight, partitions: partitions.map((g) => [...g]) };
    if (notes.length) step.note = notes.join(" · ");
    notes = [];
    const violation = opts.invariant?.(nodes, up);
    if (violation) step.violation = violation;
    steps.push(step);
  };

  /** Calls `nodes[id][method](ctx, ...args)` and records the step, with the error if it threw. */
  const runHandler = (kind: StepKind, id: NodeId, method: string, args: unknown[], extra: Partial<SimStep>) => {
    const node = nodes[id];
    const fn = (node as unknown as Record<string, unknown>)[method];
    let error: string | undefined;
    if (typeof fn !== "function") error = `${node.constructor.name} has no handler ${method}()`;
    else {
      try {
        fn.apply(node, [ctxFor(id), ...args]);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
    record(kind, { node: id, handler: method, className: node.constructor.name, ...extra, ...(error ? { error } : {}) });
    if (error) run.error = `${id}.${method}: ${error}`;
  };

  const cut = (a: NodeId, b: NodeId) => {
    if (a === CLIENT || b === CLIENT) return false;
    const ga = partitions.findIndex((g) => g.includes(a));
    const gb = partitions.findIndex((g) => g.includes(b));
    return ga >= 0 && gb >= 0 && ga !== gb;
  };

  const takeDrop = (m: Msg) => {
    const rule = dropRules.find(
      (r) => r.left > 0 && (r.from ?? m.from) === m.from && (r.to ?? m.to) === m.to && (r.type ?? m.type) === m.type,
    );
    if (rule) rule.left--;
    return Boolean(rule);
  };

  const applyFault = (f: Fault) => {
    const named =
      f.kind === "crash" || f.kind === "recover"
        ? [f.node]
        : f.kind === "partition"
          ? f.groups.flat()
          : f.kind === "drop"
            ? [f.from, f.to].filter((id): id is NodeId => id !== undefined)
            : [];
    const unknown = named.find((id) => !known(id));
    if (unknown !== undefined) {
      run.error = `fault targets unknown node "${unknown}"`;
      return;
    }
    switch (f.kind) {
      case "crash":
        if (!up[f.node]) return;
        up[f.node] = false;
        timers.get(f.node)!.clear();
        record("crash", { node: f.node });
        return;
      case "recover": {
        if (up[f.node]) return;
        const old = nodes[f.node];
        const fresh = opts.nodes[f.node]();
        for (const key of (old.constructor as typeof SimNode).durable) {
          (fresh as unknown as Record<string, unknown>)[key] = structuredClone((old as unknown as Record<string, unknown>)[key]);
        }
        nodes[f.node] = fresh;
        up[f.node] = true;
        runHandler("recover", f.node, "onStart", [], {});
        return;
      }
      case "partition":
        partitions = f.groups.map((g) => [...g]);
        record("partition");
        return;
      case "heal":
        partitions = [];
        record("heal");
        return;
      case "drop":
        dropRules.push({ from: f.from, to: f.to, type: f.type, left: f.count });
        return;
      case "delay":
        delay = { extra: f.extra, until: f.until };
        return;
    }
  };

  // Anything that throws outside a handler (a node factory, state() that cannot be cloned, the
  // invariant) ends the run with an error; the run is still reported.
  try {
    for (const id of ids) {
      nodes[id] = opts.nodes[id]();
      up[id] = true;
      // A misspelt durable field would silently be lost on every restart.
      for (const key of (nodes[id].constructor as typeof SimNode).durable) {
        if (!(key in nodes[id])) throw new Error(`durable field "${key}" does not exist on ${nodes[id].constructor.name}`);
      }
    }
    for (const f of faults) queue.push({ t: f.at, seq: seq++, kind: "fault", fault: f });
    for (const op of opts.clients ?? []) {
      if (!(op.to in nodes)) {
        run.error = `client op targets unknown node "${op.to}"`;
        break;
      }
      sendMsg({ from: CLIENT, to: op.to, type: op.type, body: op.body }, op.at, 0);
    }

    for (const id of ids) {
      if (run.error) break;
      runHandler("start", id, "onStart", [], {});
    }

    while (!run.error) {
      if (steps.length >= MAX_EVENTS) {
        run.truncated = true;
        break;
      }
      const e = pop();
      if (!e || e.t > opts.until) break;
      now = e.t;
      if (e.kind === "fault") {
        applyFault(e.fault);
      } else if (e.kind === "timer") {
        const live = timers.get(e.node)!;
        if (!up[e.node] || live.get(e.name) !== e.gen) continue;
        live.delete(e.name);
        runHandler("timer", e.node, `on${e.name}`, [], { timer: e.name });
      } else {
        const m = e.msg;
        const msg = structuredClone(m);
        if (m.to === CLIENT) {
          inbox.push(msg);
          record("deliver", { node: CLIENT, msg });
          continue;
        }
        const reason: DropReason | null = !up[m.to]
          ? "crashed"
          : cut(m.from, m.to)
            ? "partition"
            : takeDrop(m)
              ? "fault"
              : null;
        if (reason) record("drop", { node: m.to, msg, dropReason: reason });
        else runHandler("deliver", m.to, `on${m.type}`, [structuredClone(m.body), m.from], { msg });
      }
    }
  } catch (err) {
    run.error = err instanceof Error ? err.message : String(err);
  }

  hooks.onRun?.(run);
  return { run, nodes, up, inbox };
}
