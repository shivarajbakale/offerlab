// The explain card: why the current step happens, not just what it changed.
//
// Built from the decision notes in a solution (@goal, @phase, @say, @yes/@no, @then, @returns; see
// hints.ts), filled in with the step's live values. Steps without notes fall back to the plain
// narration, so every problem gets a card and annotated ones get the reasoning.

import type { Frame, Step } from "../tracer/types.ts";
import type { Hints } from "./hints.ts";
import { evaluate, fmtPrim, scopeValues, toJs } from "./heap.ts";
import { conditionOf, type Narration } from "./narrate.ts";

export type Operand = { expr: string; value: string };

export type Explanation = {
  /** The heading of the part of the code this step is in. */
  phase?: string;
  /** What the innermost call is trying to answer. */
  goal?: string;
  /** An if/while/for line: its condition, the values it read, and how it came out. */
  decision?: { cond: string; operands: Operand[]; outcome: boolean };
  /** The reasoning: the matching @yes/@no, else the @say, else the line's static note. */
  why?: string;
  /** What is known once the line has run. */
  then?: string;
  /** A return: what the returned value means. */
  returns?: string;
  /** What the line mechanically did, as the narration bar used to say it. */
  did: Narration;
  /** True when the step has a written note beyond the static per-line `@why`. */
  key: boolean;
};

const LITERAL = /^(?:-?\d+(?:\.\d+)?|undefined|null|true|false|(["'`]).*\1|\[\]|\{\})$/;

/** Splits a condition at its top-level comparison and logical operators. */
function operandsOf(cond: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let quote = "";
  for (let i = 0; i < cond.length; i++) {
    const c = cond[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (depth) continue;
    const op = cond.slice(i).match(/^(?:===|!==|==|!=|<=|>=|&&|\|\||<|>)/);
    if (op) {
      parts.push(cond.slice(start, i));
      i += op[0].length - 1;
      start = i + 1;
    }
  }
  parts.push(cond.slice(start));
  return parts.map((p) => p.trim().replace(/^!+/, "").replace(/^\((.*)\)$/, "$1").trim()).filter(Boolean);
}

function show(v: unknown): string {
  if (v === undefined) return "undefined";
  // A tree or list node reads as its value; its whole subtree as JSON would bury the point.
  if (typeof v === "object" && v !== null && "val" in v && ("next" in v || "left" in v || "children" in v)) return `node ${fmtPrim((v as { val: unknown }).val, true)}`;
  if (typeof v === "object" && v !== null) {
    try {
      return JSON.stringify(v instanceof Set ? [...v] : v instanceof Map ? [...v] : v);
    } catch {
      return String(v);
    }
  }
  return fmtPrim(v, true);
}

/** The values a condition reads, such as `height[l]` = 1, skipping literals and repeats. */
export function readOperands(cond: string, scope: Record<string, unknown>): Operand[] {
  const out: Operand[] = [];
  const parts = operandsOf(cond);
  // A condition that is one call, like `set.has(n - 1)`, would only repeat itself; show what it was called with.
  const call = parts.length === 1 && parts[0].match(/^[\w$.[\]]+\((.+)\)$/);
  for (const expr of call ? call[1].split(",").map((a) => a.trim()) : parts) {
    if (LITERAL.test(expr) || out.some((o) => o.expr === expr)) continue;
    const r = evaluate(expr, scope);
    if (r.ok && typeof r.value !== "function") out.push({ expr, value: show(r.value) });
  }
  return out;
}

/** Variables of one frame, so a caller's goal is filled with its own arguments. */
function frameScope(step: Step, frame: Frame): Record<string, unknown> {
  const out: Record<string, unknown> = { ...scopeValues(step) };
  const memo = new Map();
  for (const [name, v] of frame.vars) if (name !== "this") out[name] = toJs(step, v, memo);
  return out;
}

/**
 * Fills a note, or gives undefined when any `{expr}` in it can't be evaluated here (such as a loop
 * variable before its first value), so the card falls back instead of showing raw braces.
 */
function tryFill(t: string, scope: Record<string, unknown>): string | undefined {
  const values = new Map<string, unknown>();
  for (const m of t.matchAll(/\{([^{}]+)\}/g)) {
    const r = evaluate(m[1], scope);
    if (!r.ok) return undefined;
    values.set(m[1], r.value);
  }
  // One pass, so a value that itself holds braces is never read as another template.
  return t.replace(/"\{([^{}]+)\}"|\{([^{}]+)\}/g, (_whole, quotedExpr: string | undefined, bareExpr: string | undefined) => {
    const v = values.get((quotedExpr ?? bareExpr)!);
    // A note that quotes a string itself, as in "{s}", shows it as is, so "" reads as "" and not "''".
    if (quotedExpr !== undefined && typeof v === "string") return JSON.stringify(v);
    // An unquoted expression that comes out empty, as in {more ? ", then " + x : ""}, adds nothing.
    if (bareExpr !== undefined && v === "") return "";
    const text = typeof v === "object" && v !== null ? show(v) : fmtPrim(v);
    return quotedExpr !== undefined ? `"${text}"` : text;
  });
}

/** A frame's `@goal`: methods are traced as `Class.method` but noted above `method`. */
function goalOf(hints: Hints, fn: string): string | undefined {
  // `goal` is a plain object, so read only its own keys: `constructor` would find Object's.
  const own = (name: string) => (Object.hasOwn(hints.goal, name) ? hints.goal[name] : undefined);
  if (fn.startsWith("new ")) return own("constructor") ?? own(fn.slice(4));
  return own(fn) ?? own(fn.slice(fn.lastIndexOf(".") + 1));
}

/** TypeScript's non-null `!` (as in `heap.peek()![1]`) is not JavaScript; drop it before evaluating. */
const stripNonNull = (expr: string) => expr.replace(/([\w\])])!(?!=)/g, "$1");

/** The line where the block opened on line `n` closes, or undefined when the line opens none. */
function blockEnd(lines: string[], n: number): number | undefined {
  const code = (lines[n - 1] ?? "").replace(/\/\/.*$/, "").trim().replace(/^}\s*/, "");
  if (!code.endsWith("{")) return undefined;
  let depth = 0;
  for (let i = n - 1; i < lines.length; i++) {
    const text = (lines[i] ?? "").replace(/\/\/.*$/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
    for (const ch of i === n - 1 ? text.trim().replace(/^}\s*/, "") : text) {
      if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return i + 1;
    }
  }
  return undefined;
}

/**
 * Whether the condition on step `k` held, read from where the trace went next. This is exact even
 * when the condition can't be re-evaluated, such as a class getter like `heap.size`.
 */
function flowOutcome(steps: Step[], k: number, lines: string[]): boolean | undefined {
  const s = steps[k];
  const next = nextInFrame(steps, k);
  if (!next) return undefined;
  const end = blockEnd(lines, s.line);
  if (end !== undefined) {
    if (next.line === s.line) return undefined;
    return next.line > s.line && next.line < end;
  }
  // A one-line body (`while (c) x++;` or `if (c) return x;`) runs on the same line.
  if (next.line === s.line && (next.event === "line" || next.event === "return")) return true;
  return undefined;
}

/** Each frame's goal, outermost first; undefined where its function has no `@goal`. */
export function frameGoals(step: Step, hints: Hints): (string | undefined)[] {
  return step.stack.map((f) => {
    const t = goalOf(hints, f.fn);
    return t ? tryFill(t, frameScope(step, f)) : undefined;
  });
}

const TOP_LEVEL = /^(?:export\s+)?(?:async\s+)?(?:function|class)\b|^(?:export\s+)?const\s+[\w$]+\s*=\s*(?:async\s*)?\(/;

/** The most recent `@phase` at or above `line`, within the same top-level function or class. */
function phaseAt(hints: Hints, lines: string[], line: number): string | undefined {
  let best = 0;
  for (const n of Object.keys(hints.notes.phase).map(Number)) if (n <= line && n > best) best = n;
  if (!best) return undefined;
  for (let d = best + 1; d <= line; d++) if (TOP_LEVEL.test(lines[d - 1] ?? "")) return undefined;
  return hints.notes.phase[best];
}

/**
 * The state once line `s` has run. The tracer records no step between the last line of a `for`
 * body and the loop's next check, so the counter there has already moved on; keep its old value.
 */
function afterLine(s: Step, after: Step, lines: string[]): Record<string, unknown> {
  // Variables declared in the block that just ended are gone from `after`; keep their last values.
  const scope = { ...scopeValues(s), ...scopeValues(after) };
  const head = (lines[after.line - 1] ?? "").trim();
  if (after.event !== "loop" || !/^for\s*\(/.test(head) || after.stack.length !== s.stack.length) return scope;
  const update = head.slice(head.indexOf("(") + 1).split(";")[2] ?? "";
  const before = scopeValues(s);
  for (const m of update.matchAll(/(?:\+\+|--)\s*([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*(?:\+\+|--|[-+*/]?=)/g)) {
    const name = m[1] ?? m[2];
    if (name in before) scope[name] = before[name];
  }
  return scope;
}

/** The step where the frame running step `k` was called, so its goal reads the arguments it got. */
function callStepOf(steps: Step[], k: number): Step | undefined {
  const depth = steps[k].stack.length;
  for (let j = k; j >= 0; j--) {
    if (steps[j].stack.length < depth) return undefined;
    if (steps[j].stack.length === depth && steps[j].event === "call") return steps[j];
  }
  return undefined;
}

/** The first step back in step `k`'s frame after its line finishes, past any calls the line made. */
function nextInFrame(steps: Step[], k: number): Step | undefined {
  const depth = steps[k].stack.length;
  for (let j = k + 1; j < steps.length; j++) {
    if (steps[j].stack.length < depth) return undefined;
    if (steps[j].stack.length === depth) return steps[j];
  }
  return undefined;
}

export function explain(steps: Step[], k: number, lines: string[], hints: Hints, why: Record<number, string>, did: Narration): Explanation {
  const s = steps[k];
  const after = steps[k + 1] ?? s;
  const frame = s.stack.at(-1);
  const scope = scopeValues(s);
  const fill = (t: string, sc = scope) => tryFill(t, sc);
  const out: Explanation = { did, key: false };

  // A call step sits on the function's signature; it belongs to the phase its body starts in.
  const phase = phaseAt(hints, lines, s.event === "call" ? (nextInFrame(steps, k)?.line ?? s.line) : s.line);
  if (phase) out.phase = fill(phase);
  // A top-level call's goal is shown as it starts; nested calls keep theirs in view throughout.
  // The goal is read where the call began: shared state like a backtracking path moves on later.
  const called = callStepOf(steps, k) ?? s;
  const goal = frame && goalOf(hints, frame.fn);
  if (goal && (s.event === "call" || s.stack.length > 1)) out.goal = fill(goal, frameScope(called, called.stack.at(-1) ?? frame!));

  if (s.event === "call") {
    // A call step: the goal is the whole story, so lead with it.
    out.key = Boolean(out.goal);
    return out;
  }
  if (s.event === "return") {
    // The frame closes: say what its value means for the caller.
    if (hints.notes.returns[s.line]) out.returns = fill(hints.notes.returns[s.line]);
    out.key = Boolean(out.returns);
    return out;
  }

  const n = s.line;
  const code = (lines[n - 1] ?? "").trim().replace(/\s*\/\/.*$/, "");
  // A one-line loop (`for (...) body;`) records its body on the head line, right after the check.
  const prev = steps[k - 1];
  const sameLine = (o: Step | undefined, event: Step["event"]) => o?.event === event && o.line === n && o.stack.length === s.stack.length;
  const inlineBody = s.event === "line" && sameLine(prev, "loop");
  const found = inlineBody ? null : conditionOf(code);
  // A `for (;;)` line's first step runs its initializer; its counter isn't set yet (and in a
  // recursive call, the caller's counter of the same name would show), so the next step decides.
  const cond = found?.kind === "for" && s.event === "line" ? null : found;
  // A `while` check recorded twice in a row (entering, then the first test) explains once.
  const repeat = cond?.kind === "while" && s.event === "loop" && sameLine(prev, "line") && !sameLine(steps[k - 2], "loop");
  if (cond) {
    // Re-running a condition that changes state, such as `stack.pop() !== open`, would change it again.
    const mutates = /\.(?:pop|push|shift|unshift|splice|set|delete|add|clear|sort|reverse)\(|\+\+|--|[^=!<>]=[^=>]/.test(cond.cond);
    const r = mutates ? { ok: false as const } : evaluate(stripNonNull(cond.cond), scope);
    const flow = flowOutcome(steps, k, lines);
    if (r.ok || flow !== undefined) {
      const outcome = flow ?? Boolean(r.value);
      out.decision = { cond: cond.cond, operands: mutates ? [] : readOperands(stripNonNull(cond.cond), scope), outcome };
      const note = outcome ? hints.notes.yes[n] : hints.notes.no[n];
      if (note) out.why = fill(note);
    }
  }
  // A `for…of` head step is where its variable gets the next item, so read that item afterwards.
  const ofHead = /^for\s*\(\s*(?:const|let|var)\s.+\sof\s.*\{$/.test(code) && after.stack.length === s.stack.length;
  if (!out.why && hints.say[n] && !(cond?.kind === "for" && !inlineBody)) out.why = ofHead ? fill(hints.say[n], scopeValues(after)) : fill(hints.say[n]);
  if (out.why) out.key = !repeat;
  else if (why[n]) out.why = why[n];

  // @then reads the state once the line is done, past any calls it made, unless it left the frame (a return).
  const done = nextInFrame(steps, k);
  // On `if (c) x = ...;` the line only did something when its condition held.
  const skipped = cond?.kind === "if" && out.decision?.outcome === false;
  // A function that ends without `return` has no return step: this is its last line.
  const exit = done ? undefined : steps.slice(k + 1).find((o) => o.stack.length < s.stack.length);
  const leaving = exit && frame ? { ...scopeValues(s), ...frameScope(exit, frame) } : undefined;
  if (hints.notes.then[n] && (done || leaving) && !skipped) {
    out.then = fill(hints.notes.then[n], done ? afterLine(s, done, lines) : leaving!);
    if (out.then) out.key = true;
  }
  // Its `@returns` sits above the closing brace.
  const end = leaving && blockEnd(lines, called.line);
  if (end && hints.notes.returns[end]) {
    out.returns = fill(hints.notes.returns[end], leaving!);
    if (out.returns) out.key = true;
  }
  return out;
}
