// Pure helpers behind the architecture screen: layout, moving requests, stages, knobs and charts.

import { replicaNames, type DesignView, type Frame, type Journey, type Kind, type Knob, type TrafficFault, type TrafficRun } from "../../../system-design/traffic/index.ts";

export const FRAME_MS = 100;

/** Column = how many hops from the users; rows in the order components appear. */
export function layout(d: DesignView): Record<string, { col: number; row: number }> {
  const byId = new Map(d.components.map((c) => [c.id, c]));
  const start = d.components.find((c) => c.type === "clients");
  const depth: Record<string, number> = {};
  if (start) {
    depth[start.id] = 0;
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const t of byId.get(id)?.targets ?? []) {
        if (t in depth) continue;
        depth[t] = depth[id] + 1;
        queue.push(t);
      }
    }
  }
  const rows: number[] = [];
  const pos: Record<string, { col: number; row: number }> = {};
  for (const c of d.components) {
    const col = depth[c.id] ?? 0;
    rows[col] = (rows[col] ?? -1) + 1;
    pos[c.id] = { col, row: rows[col] };
  }
  return pos;
}

export type Dot = { id: number; station: string; moving: boolean; outcome: Journey["outcome"] };

/** Where each tracked request is at time `t` (ms): inside a station, or on the link into it. */
export function dotsAt(journeys: Journey[], t: number): Dot[] {
  const out: Dot[] = [];
  for (const j of journeys) {
    if (t < j.sent || (j.end >= 0 && t > j.end)) continue;
    const open = j.hops.filter((h) => h.arrive <= t && (h.end < 0 || t <= h.end));
    if (open.length) {
      out.push({ id: j.id, station: open[open.length - 1].station, moving: false, outcome: j.outcome });
      continue;
    }
    const next = j.hops.find((h) => h.arrive > t) ?? j.hops[0];
    if (next) out.push({ id: j.id, station: next.station, moving: true, outcome: j.outcome });
  }
  return out;
}

const ms = (x: number) => `${Math.round(x * 10) / 10} ms`;

/** A tracked request's journey, one line per stop, in plain words. */
export function journeyLines(j: Journey): string[] {
  const lines = [`Request #${j.id}, a ${j.kind}, sent at ${(j.sent / 1000).toFixed(2)} s.`];
  for (const h of j.hops) {
    if (h.start < 0) {
      if (h.end < 0) lines.push(`${h.at}: still waiting for a worker when the run ended.`);
      else lines.push(`${h.at}: ${h.outcome === "rejected" ? "queue full, rejected at once (503)" : "could not connect (server down)"}.`);
      continue;
    }
    const parts = [`waited ${ms(h.start - h.arrive)} for a worker`];
    if (h.cpuStart >= 0) parts.push(`${ms(h.cpuStart - h.start)} for a CPU core`);
    if (h.cpuEnd >= 0) parts.push(`${ms(h.cpuEnd - h.cpuStart)} of work`);
    if (h.end >= 0 && h.cpuEnd >= 0 && h.end - h.cpuEnd > 0.05) parts.push(`${ms(h.end - h.cpuEnd)} waiting on the next components`);
    lines.push(`${h.at}: ${parts.join(", ")}${h.outcome === "ok" ? "" : ` — ${h.outcome}`}.`);
  }
  const total = j.end >= 0 ? ` after ${ms(j.end - j.sent)}` : "";
  const how = { ok: "Answered", rejected: "Rejected", failed: "Failed", timeout: "The user gave up", pending: "Still in flight" }[j.outcome];
  lines.push(`${how}${total}.`);
  return lines;
}

/** The stage number at the start of a design name ("3. Load balancer" is stage 3). */
export const stageOf = (name: string) => Number(name.match(/^(\d+)\./)?.[1] ?? NaN);

export function stages(runs: TrafficRun[]): number[] {
  return [...new Set(runs.map((r) => stageOf(r.design.name)).filter((n) => !Number.isNaN(n)))].sort((a, b) => a - b);
}

/** The first design of the stage before this run's: what the canvas compares against. */
export function previousDesign(runs: TrafficRun[], run: TrafficRun): DesignView | undefined {
  const s = stageOf(run.design.name);
  return runs.find((r) => stageOf(r.design.name) === s - 1)?.design;
}

/** Components a stage added ("new") or resized ("changed") compared with the stage before. */
export function designDiff(prev: DesignView | undefined, cur: DesignView): Record<string, "new" | "changed"> {
  if (!prev) return {};
  const out: Record<string, "new" | "changed"> = {};
  for (const c of cur.components) {
    const p = prev.components.find((x) => x.id === c.id);
    if (!p) out[c.id] = "new";
    else if (p.replicas !== c.replicas || p.cores !== c.cores || p.machine !== c.machine || p.sessions !== c.sessions) out[c.id] = "changed";
  }
  return out;
}

/** Slider position 0..1000 for a knob value; log ranges spread evenly by factor. */
export function toSlider(k: Knob, v: number): number {
  const f = k.log ? Math.log(v / k.min) / Math.log(k.max / k.min) : (v - k.min) / (k.max - k.min);
  return Math.round(Math.min(1, Math.max(0, f)) * 1000);
}

/** Knob value for a slider position, rounded to 2 significant digits on log ranges. */
export function fromSlider(k: Knob, pos: number): number {
  const f = pos / 1000;
  if (!k.log) {
    const v = k.min + f * (k.max - k.min);
    // Small ranges (a share from 0 to 0.5) keep two decimals; counts are whole.
    return k.max - k.min <= 1 ? Math.round(v * 100) / 100 : Math.round(v);
  }
  const v = k.min * (k.max / k.min) ** f;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1);
  return Math.min(k.max, Math.max(k.min, Math.round(v / p) * p));
}

export const formatNumber = (v: number) =>
  v > 0 && v < 1 ? `${Math.round(v * 100)}%` : v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${+(v / 1000).toFixed(1)}k` : String(Math.round(v));

/** Per-frame chart series, rates per second smoothed over the last second. */
export function series(run: TrafficRun) {
  const f = run.frames;
  const smooth = (xs: number[]) => xs.map((_, i) => xs.slice(Math.max(0, i - 9), i + 1).reduce((a, b) => a + b, 0) / Math.min(10, i + 1));
  const rate = (get: (i: number) => number) => smooth(f.map((_, i) => get(i) * 10));
  const sent = rate((i) => f[i].clients.sent);
  const ok = rate((i) => f[i].clients.ok);
  const bad = rate((i) => f[i].clients.rejected + f[i].clients.failed + f[i].clients.timedOut);
  const errors = bad.map((b, i) => (b + ok[i] > 0 ? (100 * b) / (b + ok[i]) : 0));
  const ids = run.design.components.filter((c) => c.type === "station" && c.role !== "cdn" && c.role !== "external").map((c) => c.id);
  const util = Object.fromEntries(ids.map((id) => [id, smooth(f.map((x) => 100 * (x.stations[id]?.util ?? 0)))]));
  const q = run.design.components.find((c) => c.type === "queue");
  const backlog = q ? f.map((x) => x.stations[q.id]?.backlog ?? 0) : null;
  const reads = smooth(f.map((x) => x.clients.reads));
  const staleN = smooth(f.map((x) => x.clients.stale));
  const anyStale = f.some((x) => x.clients.stale > 0);
  const stale = anyStale ? reads.map((r, i) => (r > 0 ? (100 * staleN[i]) / r : 0)) : null;
  // Frames where nothing succeeded have no latency (-1): left as gaps, not drawn as zero.
  const lat = (v: number) => (v < 0 ? NaN : v);
  return { sent, ok, errors, p50: f.map((x) => lat(x.clients.p50)), p99: f.map((x) => lat(x.clients.p99)), util, backlog, stale };
}

/** Every server a fault can target: one name per machine, as the engine names them. */
export function faultTargets(d: DesignView): string[] {
  return d.components.filter((c) => c.type === "station" && c.role !== "cdn").flatMap(replicaNames);
}

/** Regions a region fault can target: those some server is placed in (users alone don't count). */
export function faultRegions(d: DesignView): string[] {
  return [...new Set(d.components.flatMap((c) => c.regions ?? []))];
}

/** A fault in a few words, for the timeline and the chaos bar. */
export function faultLabel(f: TrafficFault): string {
  if ("region" in f) return `${f.kind === "killRegion" ? "kill" : "restart"} region ${f.region}`;
  return `${f.kind} ${f.target}`;
}

const KIND_ORDER: Kind[] = ["read", "write", "static"];

/**
 * Per request kind over the second up to frame `i`: requests a second, p99 of the successful ones
 * (NaN when none) and the share that failed or timed out. Empty when the design sends one kind only.
 */
export function kindRows(run: TrafficRun, i: number): { kind: Kind; rate: number; p99: number; errorRate: number }[] {
  const kinds = KIND_ORDER.filter((k) => run.frames[0]?.clients.byKind?.[k]);
  if (kinds.length < 2) return [];
  const win = run.frames.slice(Math.max(0, i - 9), i + 1);
  const secs = Math.max(0.1, win.length / 10);
  return kinds.map((kind) => {
    const k = KIND_ORDER.indexOf(kind);
    let sent = 0;
    let ok = 0;
    let errors = 0;
    const lat: number[] = [];
    for (const f of win) {
      const g = f.clients.byKind[kind];
      if (g) {
        sent += g.sent;
        ok += g.ok;
        errors += g.errors;
      }
      f.clients.tags.forEach((t, n) => {
        if ((t & 3) === k) lat.push(f.clients.latencies[n]);
      });
    }
    lat.sort((a, b) => a - b);
    const p99 = lat.length ? lat[Math.min(lat.length - 1, Math.ceil(0.99 * lat.length) - 1)] : NaN;
    return { kind, rate: sent / secs, p99, errorRate: ok + errors > 0 ? errors / (ok + errors) : 0 };
  });
}

/** The circuit breaker on the link from one station to another at this frame: "" when there is none or it is closed. */
export function breakerLabel(frame: Frame, from: string, to: string): string {
  const states = frame.stations[from]?.links?.[to]?.breaker ?? [];
  const open = states.filter((s) => s === "open").length;
  const half = states.filter((s) => s === "half-open").length;
  if (!open && !half) return "";
  const of = (n: number) => (states.length > 1 ? ` ${n}/${states.length}` : "");
  return [open ? `breaker open${of(open)}` : "", half ? `half-open${of(half)}` : ""].filter(Boolean).join(" · ");
}

/**
 * A queue box's backlog line: the visible jobs, or, when it holds more than it shows (jobs still on
 * their way, delayed and not due, or hidden after a failed attempt), both: "1200 held · 150 ready".
 */
export function backlogLabel(s: { backlog?: number; backlogTotal?: number }): string {
  const ready = s.backlog ?? 0;
  const held = s.backlogTotal ?? ready;
  return held !== ready ? `${formatNumber(held)} held · ${formatNumber(ready)} ready` : `backlog ${formatNumber(ready)}`;
}

/** The regions a component's machines are in, for its label ("us", "us · eu"); "" when not placed. */
export const regionLabel = (regions: string[] | undefined) => [...new Set(regions ?? [])].join(" · ");
