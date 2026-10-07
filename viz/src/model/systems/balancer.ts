// BalancerView data: requests arriving at one or more load balancers, which send each one to a
// server; each server has a queue it works through at its own speed.
//
// `@viz balancer:<inflight>,<speed>,<history>` reads:
// - inflight: requests at each server right now (waiting or being worked on);
// - speed: requests each server finishes per tick;
// - history: one `{ t, row, ok, label }` per routed request, row being the server's name.
// It also reads, when present: `strategy`, `next` (round robin's turn), `lanes` (server names),
// `seen` (each balancer's stale copy of the counts) and `from` (which balancer is routing), and
// the locals `i`, `a`, `b` and `t` of the function running now. A `caption` says, in plain words,
// what just happened and why.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Builder, Caption } from "./types.ts";

/** A request that will wait this many ticks or more counts as slow (matches the lesson). */
const SLOW_WAIT = 2;

export type BalancerServer = {
  name: string;
  speed: number;
  /** Requests waiting or being worked on. */
  queue: number;
  /** The queue is long enough that a new request would wait SLOW_WAIT ticks or more. */
  backedUp: boolean;
  /** Requests it received in the current tick. */
  gotThisTick: number;
  /** Requests it received in total, and how many of those were slow. */
  got: number;
  slow: number;
  /** One of the two servers sampled by "two random choices" right now. */
  sampled: boolean;
  /** Where the request being routed is going. */
  target: boolean;
};

export type BalancerPanel = {
  kind: "balancer";
  key: string;
  name: string;
  strategy: string;
  /** One line on how this strategy picks a server. */
  rule: string;
  /** Several balancers, each with its own copy of the counts (stale), or one balancer. */
  balancers: { label: string; view?: number[]; active: boolean }[];
  servers: BalancerServer[];
  /** Round robin's next server, when the strategy is round robin. */
  next?: number;
  tick: number;
  sent: number;
  slow: number;
  caption: Caption;
};

type Req = { t: number; row: string; ok: boolean; label: string };

const STRATEGY: Record<string, { name: string; rule: string }> = {
  "round-robin": { name: "Round robin", rule: "Takes turns: s0, s1, s2, s0, … It never looks at how busy a server is." },
  "least-connections": { name: "Least connections", rule: "Sends each request to the server with the fewest unfinished requests." },
  p2c: { name: "Two random choices", rule: "Picks two servers at random and sends the request to the less busy one." },
};

const nums = (x: unknown): number[] | undefined => (Array.isArray(x) && x.every((n) => typeof n === "number") ? (x as number[]) : undefined);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const counts = (names: string[], c: number[]) => names.map((n, i) => `${n} ${c[i]}`).join(" · ");

/** The value's heap id and, for arrays, the ids of everything inside (nested arrays too). */
function refIds(step: Step, v: Value | undefined): HeapId[] {
  if (v?.t !== "r") return [];
  const o = step.heap[v.id];
  if (o?.kind !== "array") return [v.id];
  return [v.id, ...o.items.flatMap((x) => refIds(step, x))];
}

export const buildBalancer: Builder<BalancerPanel> = (ctx) => {
  const [inflightArg = "inflight", speedArg = "speed", historyArg = "history"] = ctx.args;
  const speedNow = nums(ctx.js(ctx.find(speedArg)));
  // While the constructor runs, the servers exist (speed) before their counts do: draw them empty.
  const inflightNow = nums(ctx.js(ctx.find(inflightArg))) ?? speedNow?.map(() => 0);
  if (!inflightNow || !speedNow || inflightNow.length !== speedNow.length) return null;
  const inflight: number[] = inflightNow;
  const speed: number[] = speedNow;
  const hv = ctx.find(historyArg);
  const history = ((ctx.js(hv) as Req[] | undefined) ?? []).filter((r) => r && typeof r.row === "string");

  const lanes = ctx.js(ctx.find("lanes"));
  const names = Array.isArray(lanes) && lanes.length === inflight.length ? lanes.map(String) : inflight.map((_, i) => `s${i}`);
  const strategyId = String(ctx.js(ctx.find("strategy")) ?? "");
  const seen = ctx.js(ctx.find("seen"));
  const views = Array.isArray(seen) && seen.length > 0 ? seen.map((v) => nums(v) ?? []) : undefined;
  const from = Number(ctx.js(ctx.find("from")) ?? 0);
  const twoChoices = ctx.js(ctx.find("twoChoices")) === true;
  const stale = Boolean(views);
  const sid = stale ? (twoChoices ? "p2c" : "least-connections") : strategyId;
  const strat = STRATEGY[sid] ?? { name: sid || "Balancer", rule: "" };

  const inner = ctx.step.stack.at(-1);
  const fn = inner?.fn ?? "";
  const local = (name: string) => {
    const v = inner?.vars.find(([n]) => n === name)?.[1];
    const x = ctx.js(v);
    return typeof x === "number" ? x : undefined;
  };
  const tNow = typeof ctx.js(ctx.find("t")) === "number" ? (ctx.js(ctx.find("t")) as number) : (history.at(-1)?.t ?? 0);

  // Where the step is: choosing a server, placing the request on it, or at the end of a tick.
  const routeFrame = [...ctx.step.stack].reverse().find((f) => /\.route$/.test(f.fn));
  const routeLocal = (name: string) => {
    const x = ctx.js(routeFrame?.vars.find(([n]) => n === name)?.[1]);
    return typeof x === "number" ? x : undefined;
  };
  const ran = ctx.ran ?? 0;
  const after = (mark: string) => ran >= (ctx.markLine?.(mark) ?? Infinity);
  const inRoute = Boolean(routeFrame) && fn === routeFrame?.fn;
  const chosen = routeLocal("i");

  /** The request being placed or last placed: its server, its wait, and whether it is counted yet. */
  type Placed = { row: number; t: number; wait?: number; ok: boolean; pushed: boolean; counted: boolean };
  let placed: Placed | undefined;
  if (routeFrame && chosen !== undefined && inRoute) {
    const pushed = after("assign");
    const wait = routeLocal("wait");
    placed = { row: chosen, t: tNow, ...(wait !== undefined ? { wait } : {}), ok: (wait ?? 0) < SLOW_WAIT, pushed, counted: after("count") };
  } else if (!routeFrame && !/tick$/.test(fn) && history.length) {
    const last = history.at(-1)!;
    placed = { row: names.indexOf(last.row), t: last.t, wait: Number(last.label.match(/\d+/)?.[0] ?? 0), ok: last.ok, pushed: true, counted: true };
  }

  const sampled = new Set<number>();
  const a = local("a");
  const b = local("b");
  if (/pick$/.test(fn) && sid === "p2c" && a !== undefined && b !== undefined) {
    sampled.add(a);
    sampled.add(b);
  }
  let target: number | undefined;
  if (placed) target = placed.row;
  else if (/pick$/.test(fn)) target = local("chosen") ?? local("i");

  const servers: BalancerServer[] = names.map((name, i) => {
    const mine = history.filter((r) => r.row === name);
    return {
      name,
      speed: speed[i],
      queue: inflight[i],
      backedUp: Math.floor(inflight[i] / speed[i]) >= SLOW_WAIT,
      gotThisTick: mine.filter((r) => r.t === tNow).length,
      got: mine.length,
      slow: mine.filter((r) => !r.ok).length,
      sampled: sampled.has(i),
      target: target === i,
    };
  });

  const caption = captionFor();

  function placedCaption(p: Placed): Caption {
    const row = names[p.row];
    const before = inflight.map((n, j) => (j === p.row && p.counted ? n - 1 : n));
    const ahead = before[p.row];
    const nth = history.filter((r) => r.t === p.t).length + (p.pushed ? 0 : 1);
    let why: string;
    if (stale) {
      const view = views?.[from] ?? [];
      why = `Balancer ${from + 1} only knows the counts from the last refresh (${counts(names, view)}). ${
        twoChoices ? `Of two random servers, those old counts favour ${row}` : `Those old counts say ${row} is the least busy`
      }, but it really has ${plural(ahead, "request")} already.`;
    } else if (sid === "round-robin") why = `Round robin: it is ${row}'s turn. The balancer does not look at how busy ${row} is.`;
    else if (sid === "least-connections") why = `Least connections: ${row} has the fewest unfinished requests (${counts(names, before)}).`;
    else why = `Two random choices sent it to ${row}, the less busy of the two it picked.`;
    const fate =
      p.wait === undefined
        ? ""
        : p.wait === 0
          ? ` ${row} can start on it this tick, so it does not wait.`
          : ` ${plural(ahead, "request")} ${ahead === 1 ? "is" : "are"} ahead of it and ${row} finishes ${speed[p.row]} per tick, so it waits ${plural(p.wait, "tick")}${p.ok ? "." : ". That is slow."}`;
    // Several balancers on the same old counts all choosing one server: the herd.
    const tickRows = [...history.filter((r) => r.t === p.t).map((r) => r.row), ...(p.pushed ? [] : [row])];
    const herd = stale && nth > 1 && tickRows.every((r) => r === row);
    const herdNote = herd ? ` All ${nth} requests so far this tick went to ${row}: the balancers herd onto one server while the others get nothing.` : "";
    return { tone: p.ok && !herd ? "good" : "bad", text: `Tick ${p.t}, request ${nth}. ${why}${fate}${herdNote}` };
  }

  function captionFor(): Caption {
    if (ctx.mark === "refresh" && views) {
      return { tone: "info", text: `Counts refreshed. Every balancer now sees the same numbers: ${counts(names, views[0])}. Until the next refresh, they will all keep using these.` };
    }
    if (placed) return placedCaption(placed);
    if (/pick$/.test(fn) && sid === "round-robin" && local("i") !== undefined) {
      const i = local("i") ?? 0;
      return { tone: "info", text: `Round robin: it is ${names[i]}'s turn, whatever ${names[i]} already has waiting (${inflight[i]}). Next turn goes to ${names[(i + 1) % names.length]}.` };
    }
    if (/pick$/.test(fn) && a !== undefined && b !== undefined) {
      const pick = local("chosen") ?? a;
      const pickText = inflight[a] === inflight[b] ? `Both have the same, so either will do: ${names[pick]}.` : `It takes the less busy one, ${names[pick]}.`;
      const missed = names.findIndex((_, j) => j !== a && j !== b && inflight[j] < inflight[pick]);
      const missNote =
        missed >= 0
          ? ` ${names[missed]} has only ${inflight[missed]} but was not picked at random, so it is skipped this time: two choices is good, not perfect.`
          : " It never had to compare every server.";
      return {
        tone: missed >= 0 ? "bad" : "info",
        text: `Two random choices: it picked ${names[a]} (${inflight[a]} unfinished) and ${names[b]} (${inflight[b]} unfinished) at random. ${pickText}${missNote}`,
      };
    }
    // End of a tick: the servers work through their queues.
    if (/tick$/.test(fn)) {
      const idle = servers.filter((s) => s.queue === 0).map((s) => s.name);
      const behind = servers.filter((s) => s.backedUp);
      const finished = names.map((n, i) => `${n} up to ${speed[i]}`).join(", ");
      const tail =
        behind.length && idle.length
          ? ` ${behind.map((s) => s.name).join(" and ")} still ${behind.length === 1 ? "has" : "have"} ${behind.map((s) => s.queue).join(" and ")} waiting while ${idle.join(" and ")} ${idle.length === 1 ? "sits" : "sit"} idle. That is wasted capacity.`
          : behind.length
            ? ` ${behind.map((s) => `${s.name} still has ${s.queue} waiting`).join(", ")}.`
            : " Every queue is short.";
      return { tone: behind.length ? "bad" : "good", text: `End of tick ${tNow}: each server finishes what it can (${finished}).${tail}` };
    }
    if (/leastLoaded$/.test(fn)) {
      const view = stale ? (views?.[from] ?? inflight) : inflight;
      return { tone: "info", text: `Least connections compares the unfinished counts it knows: ${counts(names, view)}. The smallest wins.` };
    }
    if (routeFrame) {
      return { tone: "info", text: `A new request arrives at the load balancer (tick ${tNow}). ${strat.rule}` };
    }
    const desc = names.map((n, i) => `${n} finishes ${speed[i]}`).join(", ");
    return {
      tone: "info",
      text: `${names.length} servers run copies of the same app. Each tick, requests arrive at the load balancer, which picks a server for each one. Speeds per tick: ${desc}.`,
    };
  }

  return {
    panel: {
      kind: "balancer",
      key: `balancer:${inflightArg}`,
      name: "load balancer",
      strategy: strat.name,
      rule: strat.rule,
      balancers: views ? views.map((v, k) => ({ label: `Balancer ${k + 1}`, view: v, active: k === from })) : [{ label: "Load balancer", active: true }],
      servers,
      ...(sid === "round-robin" ? { next: Number(ctx.js(ctx.find("next")) ?? 0) } : {}),
      tick: tNow,
      sent: history.length,
      slow: history.filter((r) => !r.ok).length,
      caption,
    },
    uses: [...refIds(ctx.step, ctx.find(inflightArg)), ...refIds(ctx.step, ctx.find(speedArg)), ...refIds(ctx.step, hv), ...refIds(ctx.step, ctx.find("seen"))],
  };
};
