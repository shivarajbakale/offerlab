// TimelineView data: requests over time, with an optional level line and state bands.
//
// `@viz timeline:<events>[,<line>][,<bands>]`
// - events: an array of `{ t, ok, row?, label? }`, one per request (accepted or rejected);
// - line: an array of `{ t, v }`, such as tokens in a bucket or requests in a window;
// - bands: an array of `{ from, to, state }`, such as a circuit breaker's state; `to` may be
//   null for the band still going on;
// - lanes: an array of strings naming the rows up front (servers, clients), so a row with no
//   events yet is still drawn;
// - limit: a number, such as a capacity, drawn as a dashed line across the level line;
// - ok=<word>, bad=<word>: what a green dot and a red cross mean, such as ok=fast,bad=slow
//   (default accepted and rejected).
// The extra arrays are told apart by their shape, so any of them can be left out.
// The time span covers the events and the line; bands are clipped to it, so a band that began
// long before the first request does not squash the requests into a corner.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Builder } from "./types.ts";

export type TimelineEvent = { t: number; row: string; ok: boolean; label?: string; fresh?: boolean };

export type TimelinePanel = {
  kind: "timeline";
  key: string;
  name: string;
  span: [number, number];
  now?: number;
  rows: string[];
  /** `fresh` marks an event added since the previous step. */
  events: TimelineEvent[];
  line?: { label: string; max: number; points: { t: number; v: number }[]; limit?: { label: string; v: number } };
  bands?: { from: number; to: number; state: string }[];
  /** The bands' row label: the variable's name, or "state" for one simply named `bands`. */
  bandsLabel?: string;
  /** What `ok` and not-`ok` events are called in the summary and tooltips. */
  words: { ok: string; bad: string };
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

/** Every heap id reachable from `v`, so the generic walk skips the whole structure. */
function idsUnder(step: Step, v: Value | undefined, out: HeapId[], depth = 0) {
  if (v?.t !== "r" || depth > 4 || out.includes(v.id)) return;
  out.push(v.id);
  const o = step.heap[v.id];
  if (o?.kind === "array") for (const x of o.items) idsUnder(step, x, out, depth + 1);
  else if (o?.kind === "object") for (const x of Object.values(o.fields)) idsUnder(step, x, out, depth + 1);
}

/** Rows like c0, c1, c10 sort by their number; anything else keeps first-appearance order. */
function orderRows(rows: string[]): string[] {
  if (rows.length > 1 && rows.every((r) => /^\D*\d+$/.test(r))) {
    return [...rows].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  return rows;
}

export const buildTimeline: Builder<TimelinePanel> = (ctx) => {
  const [eventsName, ...args] = ctx.args;
  const option = (key: string) => args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1);
  const words = { ok: option("ok") || "accepted", bad: option("bad") || "rejected" };
  const rest = args.filter((a) => !a.includes("="));
  if (!eventsName) return null;
  const ev = ctx.find(eventsName);
  const raw = ctx.js(ev);
  if (ev?.t !== "r" || !Array.isArray(raw)) return null;
  const uses: HeapId[] = [];
  idsUnder(ctx.step, ev, uses);

  const prevRaw = ctx.jsPrev(ctx.findPrev(eventsName));
  const before = ctx.prev && Array.isArray(prevRaw) ? prevRaw.length : raw.length;
  const events: TimelineEvent[] = [];
  raw.forEach((e, i) => {
    if (!isObj(e)) return;
    const t = num(e.t);
    if (t === undefined) return;
    events.push({
      t,
      row: e.row === undefined || e.row === null ? "" : String(e.row),
      ok: Boolean(e.ok),
      ...(e.label !== undefined && e.label !== null ? { label: String(e.label) } : {}),
      ...(i >= before ? { fresh: true } : {}),
    });
  });

  let line: TimelinePanel["line"];
  let rawBands: Obj[] | undefined;
  let bandsLabel: string | undefined;
  let lanes: string[] = [];
  let limit: { label: string; v: number } | undefined;
  for (const name of rest) {
    const v = ctx.find(name);
    const items = ctx.js(v);
    if (num(items) !== undefined) limit = { label: name.split(".").pop()!, v: items as number };
    if (!Array.isArray(items)) continue;
    idsUnder(ctx.step, v, uses);
    if (items.length === 0) continue;
    const objs = items.filter(isObj);
    if (items.every((x) => typeof x === "string")) {
      lanes = items as string[];
    } else if (objs.some((x) => "from" in x)) {
      rawBands = objs;
      const last = name.split(".").pop()!;
      bandsLabel = last === "bands" ? "state" : last;
    } else {
      const points = objs.flatMap((p) => {
        const t = num(p.t);
        const y = num(p.v);
        return t === undefined || y === undefined ? [] : [{ t, v: y }];
      });
      line = { label: name.split(".").pop()!, max: Math.max(1, ...points.map((p) => p.v)), points };
    }
  }

  if (line && limit) line = { ...line, max: Math.max(line.max, limit.v), limit };

  const now = events.length ? Math.max(...events.map((e) => e.t)) : undefined;
  let times = [...events.map((e) => e.t), ...(line?.points.map((p) => p.t) ?? [])];
  if (!times.length) {
    times = (rawBands ?? []).flatMap((b) => [num(b.from), num(b.to)].filter((x): x is number => x !== undefined));
  }
  // A band that started after the last event (a breaker that just opened) still extends the span.
  const bandStarts = (rawBands ?? []).map((b) => num(b.from)).filter((x): x is number => x !== undefined);
  let lo = times.length ? Math.min(...times) : 0;
  let hi = times.length ? Math.max(...times, ...bandStarts) : 1;
  if (hi <= lo) hi = lo + 1;
  if (lo > hi) lo = hi - 1;

  const bands = rawBands?.flatMap((b) => {
    const from = Math.max(lo, num(b.from) ?? lo);
    const to = Math.min(hi, num(b.to) ?? hi);
    return to > from || (to === from && num(b.to) === undefined) ? [{ from, to, state: String(b.state ?? "") }] : [];
  });

  const rows = [...lanes, ...orderRows([...new Set(events.map((e) => e.row))].filter((r) => !lanes.includes(r)))];
  const panel: TimelinePanel = {
    kind: "timeline",
    key: `timeline:${ev.id}`,
    name: eventsName,
    span: [lo, hi],
    ...(now !== undefined ? { now } : {}),
    rows: rows.length ? rows : [""],
    events,
    ...(line ? { line } : {}),
    ...(bands ? { bands, bandsLabel } : {}),
    words,
  };
  return { panel, uses };
};
