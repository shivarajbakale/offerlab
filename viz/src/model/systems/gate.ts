// GateView data: something standing between callers and a server and deciding, request by
// request, whether to let it through: a rate limiter, a queue, a circuit breaker, a retry policy.
//
// `@viz gate:<history>,key=value,...` reads `history`, an array of `{ t, ok, row?, label? }`, one
// per decision, and these options (values use `_` for spaces):
// - title=Token_bucket       what the gate is called;
// - from=Client, to=Server    the boxes on either side;
// - level=<var>, max=<var|n>  a meter inside the gate (a number, an array's length, or the last
//                             `v` of an array of points), and its maximum;
// - unit=token                what one meter slot is ("token" draws "5 tokens");
// - state=<var>               a word shown as the gate's state (closed, open, half-open, ...), or
//                             an array of bands whose last `state` is shown (window 1–2);
// - only=<var>                draw this gate only where that variable exists (when several
//                             classes in one file share field names such as `history`);
// - absent=<var>              when that variable is true there is no gate at all: the middle is
//                             drawn as an empty, dashed "no <title>" box;
// - failAt=server             failed requests reached the server and failed there (default: the
//                             gate refused them);
// - gateRows=a|b              rows that are always the gate's own answer, even with failAt=server;
// - queueRow=in               the row of requests the gate accepted but is holding in a queue;
// - load=<points>, cap=<var>  the server's load in the latest tick against what it can handle;
// - down=<var>               the server is down (restarting) before this tick: shown on its box;
// - clients=<lanes>           one caller per row name, each with its latest outcome, a short note
//                             (the last comma-separated part of its latest label) and whether it
//                             sent in the current tick.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Builder } from "./types.ts";

type Ev = { t: number; ok: boolean; row?: string; label?: string };

export type GateEvent = {
  t: number;
  label: string;
  /** Where the request ended up. */
  outcome: "passed" | "failed" | "refused" | "queued";
  row?: string;
};

export type GatePanel = {
  kind: "gate";
  key: string;
  name: string;
  title: string;
  from: string;
  to: string;
  state?: string;
  /** There is no gate: requests go straight to the server. */
  absent?: boolean;
  meter?: { level: number; max?: number; unit: string };
  server?: { load: number; cap?: number; downUntil?: number };
  /** The decision just made, if this step made one, else the latest. */
  latest?: GateEvent & { fresh: boolean };
  counts: { passed: number; failed: number; refused: number; queued: number };
  clients?: { name: string; last?: GateEvent; note?: string; active?: boolean }[];
  now: number;
};

const spaced = (s: string | undefined) => s?.replace(/_/g, " ");

function ids(step: Step, v: Value | undefined): HeapId[] {
  if (v?.t !== "r") return [];
  const o = step.heap[v.id];
  if (!o) return [];
  if (o.kind === "array") return [v.id, ...o.items.flatMap((x) => ids(step, x))];
  return [v.id];
}

export const buildGate: Builder<GatePanel> = (ctx) => {
  const [historyArg, ...rest] = ctx.args;
  const opt: Record<string, string> = {};
  for (const a of rest) {
    const [k, v = ""] = a.split("=");
    opt[k] = v;
  }
  if (opt.only && ctx.find(opt.only) === undefined) return null;
  const hv = ctx.find(historyArg);
  const raw = ctx.js(hv);
  if (!Array.isArray(raw)) return null;
  const events = raw.filter((e): e is Ev => typeof e === "object" && e !== null && typeof (e as Ev).t === "number");
  const prevRaw = ctx.jsPrev(ctx.findPrev(historyArg));
  const prevLen = Array.isArray(prevRaw) ? prevRaw.length : 0;

  const gateRows = new Set((opt.gateRows ?? "").split("|").filter(Boolean).map(spaced));
  const outcomeOf = (e: Ev): GateEvent["outcome"] => {
    if (opt.queueRow && e.row === opt.queueRow) return e.ok ? "queued" : "refused";
    if (e.ok) return "passed";
    if (opt.failAt === "server" && !gateRows.has(e.row)) return "failed";
    return "refused";
  };
  const toEvent = (e: Ev): GateEvent => ({ t: e.t, label: e.label ?? (e.ok ? "let through" : "refused"), outcome: outcomeOf(e), ...(e.row ? { row: e.row } : {}) });

  /** A number from a variable: itself, an array's length, or the last point's `v`. */
  const numberOf = (name: string | undefined): number | undefined => {
    if (!name) return undefined;
    if (/^\d+(\.\d+)?$/.test(name)) return Number(name);
    const x = ctx.js(ctx.find(name));
    if (typeof x === "number") return x;
    if (Array.isArray(x)) {
      const last = x.at(-1) as { v?: unknown } | undefined;
      return last && typeof last === "object" && typeof last.v === "number" ? last.v : x.length;
    }
    return undefined;
  };
  const round = (x: number) => Math.round(x * 100) / 100;

  const level = numberOf(opt.level);
  // Several gates can share a file (one per class); each draws only where its meter exists.
  if (opt.level && level === undefined) return null;
  const max = numberOf(opt.max);
  const load = numberOf(opt.load);
  const cap = numberOf(opt.cap);
  const downUntil = numberOf(opt.down);
  const stateRaw = opt.state ? ctx.js(ctx.find(opt.state)) : undefined;
  const lastBand = Array.isArray(stateRaw) ? (stateRaw.at(-1) as { state?: unknown } | undefined) : undefined;
  const state = typeof stateRaw === "string" ? stateRaw : typeof lastBand?.state === "string" ? lastBand.state : undefined;
  const absent = opt.absent ? ctx.js(ctx.find(opt.absent)) === true : false;
  const last = events.at(-1);
  const counts = { passed: 0, failed: 0, refused: 0, queued: 0 };
  for (const e of events) counts[outcomeOf(e)]++;

  const tLocal = ctx.js(ctx.find("t"));
  const now = typeof tLocal === "number" ? tLocal : (last?.t ?? 0);
  let clients: GatePanel["clients"];
  if (opt.clients) {
    const lanes = ctx.js(ctx.find(opt.clients));
    if (Array.isArray(lanes)) {
      clients = lanes.map(String).map((name) => {
        const mine = events.filter((e) => e.row === name).at(-1);
        if (!mine) return { name };
        const ev = toEvent(mine);
        const note = ev.label.includes(", ") ? ev.label.split(", ").at(-1) : undefined;
        return { name, last: ev, ...(note ? { note } : {}), active: mine.t === now };
      });
    }
  }
  return {
    panel: {
      kind: "gate",
      key: `gate:${historyArg}`,
      name: spaced(opt.title) ?? "gate",
      title: spaced(opt.title) ?? "Gate",
      from: spaced(opt.from) ?? "Client",
      to: spaced(opt.to) ?? "Server",
      ...(state !== undefined ? { state } : {}),
      ...(absent ? { absent } : {}),
      ...(level !== undefined ? { meter: { level: round(level), ...(max !== undefined ? { max } : {}), unit: spaced(opt.unit) ?? "" } } : {}),
      ...(load !== undefined ? { server: { load, ...(cap !== undefined ? { cap } : {}), ...(downUntil !== undefined && now < downUntil ? { downUntil } : {}) } } : {}),
      ...(last ? { latest: { ...toEvent(last), fresh: events.length > prevLen } } : {}),
      counts,
      ...(clients ? { clients } : {}),
      now,
    },
    uses: [...ids(ctx.step, hv)],
  };
};
