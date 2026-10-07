// The story of a run: what it did over its whole life, not just at one step. It powers the
// parts of the drawing that need history: the rule and when it breaks, the key moments on
// the scrubber, the "what happens next?" questions, and, for problems with a window on an
// array, where the best window was found, which cells were ruled out, and the search-space
// and window-over-time views. Binary searches over values get a shrinking number line, and
// grids remember which cells have been visited or filled so far.

import type { Step } from "../tracer/types.ts";
import type { Hints } from "./hints.ts";
import { evaluate, fmtPrim, scopeValues } from "./heap.ts";
import { conditionOf, fillTemplate } from "./narrate.ts";
import { buildScene, type ArrayPanel, type Scene } from "./scene.ts";

export type Window = [number, number];
export type StoryMark = { index: number; kind: "shrink" | "best" | "broken" | "moment"; label: string };

/** A window (l..r) living on one array, over the whole run. */
export type WindowStory = {
  /** Name of the array the window lives on, and its length and cell texts. */
  array: string;
  len: number;
  cells: string[];
  /** `slide`: both edges move right. `converge`: the edges start at the two ends and meet. */
  mode: "slide" | "converge";
  /** The window opened up again partway through, so the search-space views do not apply. */
  restarts: boolean;
  /** The window after each step (what the scene at that index draws), or null. */
  wins: (Window | null)[];
  /** The best window so far at each step, with the best value's text. */
  best: ({ l: number; r: number; text: string } | null)[];
};

/** `range:lo..hi@mid`: the bounds of a search at each step, on a number line from `min` to `max`. */
export type RangeStory = {
  lo: string;
  hi: string;
  mid?: string;
  min: number;
  max: number;
  at: (Window | null)[];
  probes: (number | null)[];
};

/** A question: click the cell a pointer moves to, or pick an expression's next value from a few choices. */
export type Ask =
  | { name: string; kind: "cell"; answer: number; from: number }
  | { name: string; kind: "choice"; answer: string; choices: string[] };

export type Story = {
  win: WindowStory | null;
  range: RangeStory | null;
  /** True at steps where the rule is broken (a repeat inside the window, or an `@broken` condition holds). */
  broken: boolean[];
  marks: StoryMark[];
  /** Steps that pause and ask what a line is about to do. */
  asks: Map<number, Ask>;
  /** For each grid (by panel key), the step at which each cell ("r,c") was first visited or changed. */
  trail: Map<string, Map<string, number>>;
};

const MAX_STEPS = 2000;
const MAX_ASKS = 10;
const MAX_ASKS_PER_LINE = 6;
const MAX_MOMENTS = 40;

/** Problems opt in with a story hint (`@rule`, `@ask`, `@moment`, `@broken`, `best:`, `arc:`, `unique`, `range:`). */
export function wantsStory(h: Hints): boolean {
  return Boolean(
    h.rule || h.best || h.unique || h.range || h.arcs.length || h.broken.length || Object.keys(h.ask).length || Object.keys(h.moment).length,
  );
}

/** Null when the problem has no story hints or the run is too short or too long to tell one. */
export function buildStory(steps: Step[], hints: Hints, lines: string[]): Story | null {
  if (!wantsStory(hints) || steps.length < 2 || steps.length > MAX_STEPS) return null;
  const scenes = steps.map((s, k) => buildScene(steps[k + 1] ?? s, s, hints));
  const scopes: Record<string, unknown>[] = [];
  const scopeAt = (k: number) => (scopes[k] ??= scopeValues(steps[k]));
  const win = windowStory(scenes, hints);

  // Rule: a repeat inside the window, or an `@broken` line whose condition holds.
  const broken = scenes.map((sc, k) => {
    if (sc.ruleBroken) return true;
    const line = steps[k].line;
    if (!hints.broken.includes(line)) return false;
    const cond = conditionOf((lines[line - 1] ?? "").trim());
    if (!cond) return false;
    const r = evaluate(cond.cond, scopeAt(k));
    return r.ok && Boolean(r.value);
  });

  const marks: StoryMark[] = [];
  let lastBestText: string | undefined;
  let prevWin: Window | null = null;
  let moments = 0;
  for (let k = 0; k < steps.length; k++) {
    if (broken[k] && !broken[k - 1]) marks.push({ index: k, kind: "broken", label: "Rule broken" });
    const w = win?.wins[k] ?? null;
    if (w && prevWin && win!.mode === "slide" && w[0] > prevWin[0]) {
      marks.push({ index: k, kind: "shrink", label: `Left edge moves to ${w[0]}` });
    }
    if (w) prevWin = w;
    if (hints.best) {
      const text = scenes[k].scalars.find((s) => s.name === hints.best)?.text;
      if (text !== undefined && text !== lastBestText && lastBestText !== undefined) {
        marks.push({ index: k, kind: "best", label: `New best: ${text}` });
      }
      if (text !== undefined) lastBestText = text;
    }
    const moment = hints.moment[steps[k].line];
    // A line that runs over several steps (a call, then its return) is one moment, not two.
    const again = k > 0 && steps[k - 1].line === steps[k].line && steps[k - 1].stack.length >= steps[k].stack.length && steps[k].event === "return";
    // On an if or while line, the moment is the condition coming true, not the check itself.
    const cond = moment ? conditionOf((lines[steps[k].line - 1] ?? "").trim()) : null;
    const holds = !cond || cond.kind === "for" || (() => {
      const r = evaluate(cond.cond, scopeAt(k));
      return !r.ok || Boolean(r.value);
    })();
    if (moment && holds && moments < MAX_MOMENTS && steps[k].event !== "call" && !again) {
      moments++;
      marks.push({ index: k, kind: "moment", label: fillTemplate(moment, scopeAt(k)) });
    }
  }

  return {
    win,
    range: hints.range ? rangeStory(steps, hints.range, scopeAt) : null,
    broken,
    marks,
    asks: askSteps(steps, hints, lines, win, scenes, scopeAt),
    trail: gridTrail(scenes),
  };
}

function windowStory(scenes: Scene[], hints: Hints): WindowStory | null {
  const primaryOf = (k: number) =>
    scenes[k].panels.find((p): p is ArrayPanel => p.kind === "array" && Boolean(p.window));
  const first = scenes.findIndex((_, k) => primaryOf(k));
  if (first < 0) return null;
  const head = primaryOf(first)!;
  const array = head.name;
  const len = head.len;
  if (len < 2) return null;

  const wins: (Window | null)[] = scenes.map((_, k) => {
    const p = primaryOf(k);
    return p && p.name === array && p.window ? p.window : null;
  });
  const firstWin = wins[first]!;
  const mode = firstWin[1] === len - 1 && firstWin[0] < firstWin[1] && len > 2 ? "converge" : "slide";
  // Converging windows that open up again (3Sum restarts l..r for each fixed number) have no single search space.
  const restarts =
    mode === "converge" && wins.some((w, k) => w && wins.slice(0, k).some((p) => p && (w[0] < p[0] || w[1] > p[1])));

  const best: WindowStory["best"] = [];
  let bestNow: WindowStory["best"][number] = null;
  let lastBestText: string | undefined;
  for (let k = 0; k < scenes.length; k++) {
    if (hints.best) {
      const text = scenes[k].scalars.find((s) => s.name === hints.best)?.text;
      // The line that changed the best measured the window as it was before it ran.
      const measured = wins[k - 1] ?? wins[k];
      if (text !== undefined && text !== lastBestText && lastBestText !== undefined && measured) {
        bestNow = { l: measured[0], r: measured[1], text };
      }
      if (text !== undefined) lastBestText = text;
    }
    best.push(bestNow);
  }
  return { array, len, cells: head.cells.map((c) => c.text), mode, restarts, wins, best };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function rangeStory(steps: Step[], range: NonNullable<Hints["range"]>, scopeAt: (k: number) => Record<string, unknown>): RangeStory | null {
  const at: RangeStory["at"] = [];
  const probes: RangeStory["probes"] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < steps.length; k++) {
    // Like the scene, each index shows the state after its line ran.
    const scope = scopeAt(Math.min(k + 1, steps.length - 1));
    const lo = num(evaluate(range.lo, scope).value);
    const hi = num(evaluate(range.hi, scope).value);
    const mid = range.mid ? num(evaluate(range.mid, scope).value) : undefined;
    at.push(lo !== undefined && hi !== undefined ? [lo, hi] : null);
    probes.push(mid ?? null);
    if (lo !== undefined && hi !== undefined && lo <= hi) {
      min = Math.min(min, lo);
      max = Math.max(max, hi);
    }
  }
  if (min > max) return null;
  return { ...range, min, max, at, probes };
}

/** The value an `@ask` expression has in a step, as a primitive, or undefined when it has none. */
function askValue(expr: string, scope: Record<string, unknown>): { v: unknown } | undefined {
  const r = evaluate(expr, scope);
  if (!r.ok) return undefined;
  const v = r.value;
  if (v === undefined || (typeof v === "object" && v !== null) || typeof v === "function") return undefined;
  return { v };
}

function choicesFor(answer: unknown, before: unknown): string[] {
  if (typeof answer === "boolean") return ["true", "false"];
  if (typeof answer === "number" && Number.isFinite(answer)) {
    const out = new Set<number>([answer]);
    if (typeof before === "number" && Number.isFinite(before)) out.add(before);
    const step = Number.isInteger(answer) ? 1 : Math.max(0.5, Math.abs(answer) / 4);
    for (const d of [step, -step, 2 * step]) if (out.size < 4) out.add(answer + d);
    return [...out].sort((a, b) => a - b).map((x) => fmtPrim(x));
  }
  const out = new Set<string>([fmtPrim(answer)]);
  if (before !== undefined && (typeof before !== "object" || before === null)) out.add(fmtPrim(before));
  if (out.size < 2) out.add(answer === null ? "0" : "null");
  return [...out].sort();
}

/** Names a line assigns to: `x = ...`, `x += ...`, `x++`, `--x`, `const x = ...`. */
function assignedNames(code: string): Set<string> {
  const out = new Set<string>();
  const plain = code.replace(/\/\/.*$/, "");
  for (const m of plain.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:[-+*/%|&^]|\|\||&&|\?\?|<<|>>>?|\*\*)?=(?![=>])/g)) out.add(m[1]);
  for (const m of plain.matchAll(/(?:\+\+|--)\s*([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*(?:\+\+|--)/g)) out.add(m[1] ?? m[2]);
  return out;
}

/**
 * The scope an `@ask` answer is read in: the state after the line ran, except that plain values the
 * line does not assign keep their value from before. The next step is often the loop header, where
 * `j` has already moved on, and `dp[i][j]` must still mean the cell this line wrote.
 */
function afterScope(before: Record<string, unknown>, after: Record<string, unknown>, code: string): Record<string, unknown> {
  const assigned = assignedNames(code);
  const out = { ...after };
  for (const [n, v] of Object.entries(before)) {
    if (assigned.has(n) || (typeof v === "object" && v !== null) || typeof v === "function") continue;
    if (n in after) out[n] = v;
  }
  return out;
}

function askSteps(
  steps: Step[],
  hints: Hints,
  lines: string[],
  win: WindowStory | null,
  scenes: Scene[],
  scopeAt: (k: number) => Record<string, unknown>,
): Story["asks"] {
  // Every step that could ask, then a varied few: answers that differ from the last one picked on that line come first.
  const candidates: { k: number; line: number; ask: Ask }[] = [];
  for (let k = 0; k + 1 < steps.length && candidates.length < 400; k++) {
    const line = steps[k].line;
    const name = hints.ask[line];
    if (!name || steps[k].event === "call" || steps[k].event === "return") continue;
    // The answer is read once the line is done in this same call: past any calls it makes.
    const a = steps[k].stack;
    let j = k + 1;
    while (j < steps.length && steps[j].stack.length > a.length) j++;
    const b = steps[j]?.stack;
    if (!b || a.length !== b.length || a.at(-1)?.fn !== b.at(-1)?.fn) continue;
    const before = askValue(name, scopeAt(k));
    const after = askValue(name, afterScope(scopeAt(k), scopeAt(j), lines[line - 1] ?? ""));
    if (!after) continue;
    // A pointer on the window's array is answered by clicking the cell it moves to.
    const onArray =
      win &&
      Number.isInteger(after.v) &&
      Number.isInteger(before?.v) &&
      scenes[k].panels.some((p) => p.kind === "array" && p.name === win.array && p.pointers.some((x) => x.name === name));
    let ask: Ask | undefined;
    if (onArray) {
      if (before!.v === after.v || (after.v as number) < 0 || (after.v as number) >= win.len) continue;
      ask = { name, kind: "cell", answer: after.v as number, from: before!.v as number };
    } else {
      const choices = choicesFor(after.v, before?.v);
      if (choices.length < 2) continue;
      ask = { name, kind: "choice", answer: fmtPrim(after.v), choices };
    }
    candidates.push({ k, line, ask });
  }
  const answerOf = (a: Ask) => String(a.answer);
  const picked = new Set<number>();
  const perLine = new Map<number, number>();
  const lastAnswer = new Map<number, string>();
  for (const varied of [true, false]) {
    for (const c of candidates) {
      // Repeats of the same answer only fill in when there are too few varied questions.
      if (picked.size >= (varied ? MAX_ASKS : 3)) break;
      if (picked.has(c.k) || (perLine.get(c.line) ?? 0) >= MAX_ASKS_PER_LINE) continue;
      if (varied && lastAnswer.get(c.line) === answerOf(c.ask)) continue;
      picked.add(c.k);
      perLine.set(c.line, (perLine.get(c.line) ?? 0) + 1);
      lastAnswer.set(c.line, answerOf(c.ask));
    }
  }
  // Text answers have few natural wrong choices, so borrow other answers the same line gives.
  const seen = new Map<number, string[]>();
  for (const c of candidates) {
    const list = seen.get(c.line) ?? [];
    if (!list.includes(String(c.ask.answer))) list.push(String(c.ask.answer));
    seen.set(c.line, list);
  }
  const asks: Story["asks"] = new Map();
  for (const c of candidates) {
    if (!picked.has(c.k)) continue;
    const a = c.ask;
    if (a.kind === "choice" && a.choices.length < 4 && !a.choices.includes("true")) {
      const more = (seen.get(c.line) ?? []).filter((x) => !a.choices.includes(x));
      a.choices = [...a.choices, ...more.slice(0, 4 - a.choices.length)].sort((x, y) => {
        const nx = Number(x);
        const ny = Number(y);
        return Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny;
      });
    }
    asks.set(c.k, a);
  }
  return asks;
}

function gridTrail(scenes: Scene[]): Story["trail"] {
  const trail: Story["trail"] = new Map();
  scenes.forEach((sc, k) => {
    for (const p of sc.panels) {
      if (p.kind !== "grid") continue;
      let t = trail.get(p.key);
      if (!t) trail.set(p.key, (t = new Map()));
      p.rows.forEach((row, r) =>
        row.forEach((c, col) => {
          if (c.changed && !t!.has(`${r},${col}`)) t!.set(`${r},${col}`, k);
        }),
      );
      if (p.cursor && !t.has(`${p.cursor.r},${p.cursor.c}`)) t.set(`${p.cursor.r},${p.cursor.c}`, k);
    }
  });
  for (const [key, t] of trail) if (t.size === 0) trail.delete(key);
  return trail;
}

export type PairState = "checked" | "skipped" | "open";

/**
 * Every (start, end) pair a brute force would check, and what the run has done with it by
 * step `k`: looked at it, ruled it out without looking, or not decided yet.
 */
export function searchSpace(story: WindowStory, k: number): { at: (i: number, j: number) => PairState; checked: number; skipped: number; total: number } {
  const seen = new Set<string>();
  for (let x = 0; x <= k; x++) {
    const w = story.wins[x];
    if (w) seen.add(`${w[0]},${w[1]}`);
  }
  let cur: Window | null = null;
  for (let x = k; x >= 0 && !cur; x--) cur = story.wins[x];
  const [l, r] = cur ?? [0, -1];
  const done = k >= story.wins.length - 1;
  const at = (i: number, j: number): PairState => {
    if (seen.has(`${i},${j}`)) return "checked";
    if (done) return "skipped";
    if (!cur) return "open";
    if (story.mode === "converge") return i < l || j > r ? "skipped" : "open";
    return i < l || j < r ? "skipped" : "open";
  };
  let checked = 0;
  let skipped = 0;
  const n = story.len;
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const s = at(i, j);
      if (s === "checked") checked++;
      else if (s === "skipped") skipped++;
    }
  }
  return { at, checked, skipped, total: (n * (n + 1)) / 2 };
}

/** The distinct windows up to step `k`, in order, for the window-over-time view. */
export function windowHistory(story: WindowStory, k: number): { w: Window; index: number; back: boolean }[] {
  const out: { w: Window; index: number; back: boolean }[] = [];
  for (let x = 0; x <= k; x++) {
    const w = story.wins[x];
    if (!w) continue;
    const last = out.at(-1);
    if (last && last.w[0] === w[0] && last.w[1] === w[1]) continue;
    const back = Boolean(last) && story.mode === "slide" && w[0] < last!.w[0];
    out.push({ w, index: x, back });
  }
  return out;
}

/** The distinct ranges up to step `k`, with the probe that produced each, for the number-line view. */
export function rangeHistory(story: RangeStory, k: number): { w: Window; probe: number | null; index: number }[] {
  const out: { w: Window; probe: number | null; index: number }[] = [];
  for (let x = 0; x <= k; x++) {
    const w = story.at[x];
    if (!w) continue;
    const last = out.at(-1);
    if (last && last.w[0] === w[0] && last.w[1] === w[1]) {
      const probe = story.probes[x];
      if (probe !== null && probe >= w[0] && probe <= w[1]) last.probe = probe;
      continue;
    }
    // Right after a bound moves, the probe variable still holds the old middle until it is recomputed.
    const probe = story.probes[x];
    out.push({ w, probe: probe !== null && probe !== last?.probe && probe >= w[0] && probe <= w[1] ? probe : null, index: x });
  }
  return out;
}

/** Cells that left the window between two steps: off the left edge, or off the right when converging. */
export function leftWindow(before: Window | null, now: Window | null): [number, number] | undefined {
  if (!before || !now) return undefined;
  if (now[0] > before[0]) return [before[0], Math.min(now[0], before[1] + 1) - 1];
  if (now[1] < before[1]) return [Math.max(now[1], before[0] - 1) + 1, before[1]];
  return undefined;
}
