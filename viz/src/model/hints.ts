// Optional comment hints inside a solution file.
//
//   // @viz array:s window:l..r pointers:i,j values:lo,hi hide:tmp grid:dp graph:adj heap:minHeap
//   // @viz grid:scores labels:servers,keys   (column names, then row names, for the grid)
//   while (seen.has(s[r])) { // @say '{s[r]}' is already in the window, shrink from the left
//
//   // @viz arc:r->prev best:best unique   (window story: arc back to an index, best window, no repeats)
//   // @rule every character inside the window is different
//   if (prev >= l) l = prev + 1; // @ask l // @say ...   (pause; the learner clicks where l goes)
//   while (r - l + 1 - maxFreq > k) { // @broken          (the rule is broken while this holds)
//   dp[i] = dp[i - 1] + dp[i - 2]; // @ask dp[i]           (any expression: the learner picks its new value)
//   res.push([...path]); // @moment found {path}           (a labelled tick on the scrubber each time it runs)
//
//   // @viz range:lo..hi@mid   (binary search over values: draw lo..hi shrinking on a number line, mid as the probe)
//
//   Decision notes, written on their own comment lines above the code line they explain (like @why):
//   // @goal how tall is the subtree under {node.val}?      (above a function: the question each call answers)
//   // @phase Scan once, pairing each number with an earlier one   (a heading for the code from here on)
//   // @say {nums[i]} needs a partner of {target - nums[i]}         (what this step means, with live values)
//   // @yes The partner was seen at index {j}, so ...             (an if/while/for line: why, when it is true)
//   // @no  No earlier number fits, so ...                        (the same, when it is false)
//   // @then The map now covers indices 0..{i}                    (what is known after the line runs)
//   // @returns the subtree under {node.val} is {h} tall          (above a return: what the value means)
//
// @viz and @rule lines apply to the whole file; @say, @ask, @moment and @broken apply to the line they are on.
// Put @ask and @moment before @say on a line, since @say runs to the end of it.

import { SYSTEMS_KINDS, type SystemsKind } from "./systems/types.ts";

export type Hints = {
  array?: string;
  window?: [string, string];
  pointers: string[];
  hide: string[];
  /** Integers to show as plain values, never as array pointers. */
  values: string[];
  grid?: string;
  /** `labels:<cols>,<rows>`: arrays whose items name the grid's columns and rows. */
  gridLabels?: [string, string | undefined];
  graph?: string;
  heap?: string;
  /** The code turns letters into slots with `charCodeAt`, so 26-slot count arrays are labelled a to z. */
  letterIndex?: boolean;
  say: Record<number, string>;
  /** `// @mark name` at the end of a line names it for lesson play links (`@at=name`). */
  marks: Record<string, number>;
  /** Systems views, such as `@viz ring:tokens,keys`, in the order written. */
  systems: { kind: SystemsKind; args: string[] }[];
  /** `arc:r->prev`: draw an arc on the main array from index `r` back to index `prev`. */
  arcs: [string, string][];
  /** `best:best`: remember the window each time this variable changes, and draw it under the array. */
  best?: string;
  /** `unique`: the window must hold no repeated values; repeats turn the rule red. */
  unique?: boolean;
  /** `// @rule ...`: the one thing that must stay true, shown above the drawing. */
  rule?: string;
  /** `// @ask l` on a line: pause there and let the learner click where `l` goes before showing it. */
  ask: Record<number, string>;
  /** `// @broken` on an if/while line: the rule is broken whenever its condition is true. */
  broken: number[];
  /** `// @moment text` on a line: a key moment on the scrubber each time the line runs; `{expr}` is filled in. */
  moment: Record<number, string>;
  /** `range:lo..hi@mid`: the bounds of a binary search, and its probe, drawn on a number line. */
  range?: { lo: string; hi: string; mid?: string };
  /** Decision notes keyed by the 1-based code line they sit above; see the header. */
  notes: Notes;
  /** `@goal` templates keyed by the name of the function they sit above. */
  goal: Record<string, string>;
  /**
   * `// @caption [good:|bad:] text` above a line: what the picture shows once that line has run,
   * in plain words, with `{expr}` filled in. It stays up until the next caption (see caption.ts).
   */
  caption: Record<number, string>;
  /** Mistakes in the hints, such as a duplicate @mark; the lesson and hints tests require none. */
  errors: string[];
};

export type Notes = { yes: Record<number, string>; no: Record<number, string>; then: Record<number, string>; returns: Record<number, string>; phase: Record<number, string> };

const NOTE = /^\s*\/\/\s*@(goal|phase|say|yes|no|then|returns|caption)\s+(.*)$/;
/** A comment line holding one decision note (or a `@why`), which the code panel hides. */
export const isNoteLine = (line: string) => NOTE.test(line) || /^\s*\/\/\s*@why\s/.test(line);

/** Name of the function declared on a line: `function f(`, `const f = (`, `f = (` or a method `f(...) {`. */
export function declaredFunction(line: string): string | undefined {
  const m =
    line.match(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/) ??
    line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/) ??
    line.match(/^\s*(?:(?:public|private|protected|static|async)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{/);
  return m && !/^(if|for|while|switch|catch|return)$/.test(m[1]) ? m[1] : undefined;
}

/** Block notes (`// @yes ...` above a line) attach to the next line that is not itself a note or `@why`. */
function parseNotes(lines: string[], hints: Hints) {
  let pending: [string, string][] = [];
  lines.forEach((line, i) => {
    const m = line.match(NOTE);
    if (m) {
      const last = pending.at(-1);
      // Consecutive lines of the same kind join into one note.
      if (last && last[0] === m[1] && NOTE.test(lines[i - 1] ?? "") && lines[i - 1].match(NOTE)![1] === m[1]) last[1] += " " + m[2].trim();
      else pending.push([m[1], m[2].trim()]);
      return;
    }
    if (isNoteLine(line) || !pending.length) return;
    const n = i + 1;
    for (const [kind, text] of pending) {
      if (kind === "goal") {
        const fn = declaredFunction(line);
        if (fn) hints.goal[fn] = text;
        else hints.errors.push(`line ${n}: @goal must sit above a function`);
      } else if (kind === "say") hints.say[n] = text;
      else if (kind === "caption") hints.caption[n] = text;
      else hints.notes[kind as keyof Notes][n] = text;
    }
    pending = [];
  });
}

export function parseHints(source: string): Hints {
  const hints: Hints = {
    pointers: [], hide: [], values: [], say: {}, marks: {}, systems: [], errors: [], arcs: [], ask: {}, broken: [], moment: {},
    notes: { yes: {}, no: {}, then: {}, returns: {}, phase: {} },
    goal: {},
    caption: {},
  };
  parseNotes(source.split("\n"), hints);
  source.split("\n").forEach((line, i) => {
    const n = i + 1;
    if (NOTE.test(line)) return;
    const say = line.match(/\/\/\s*@say\s+(.+)$/);
    // A @say runs to the end of the line, so a @mark after it would be read as part of the text.
    if (say && /\/\/\s*@mark\b/.test(say[1])) hints.errors.push(`line ${n}: @say and @mark on one line; put the @mark on its own line`);
    else if (say) hints.say[n] = say[1].trim();
    const rule = line.match(/\/\/\s*@rule\s+(.+)$/);
    if (rule) hints.rule = rule[1].trim();
    const ask = line.match(/\/\/\s*@ask\s+(\S+)/);
    if (ask) hints.ask[n] = ask[1];
    const moment = line.match(/\/\/\s*@moment\s+(.+?)\s*(?=\/\/|$)/);
    if (moment) hints.moment[n] = moment[1];
    if (/\/\/\s*@broken\b/.test(line)) hints.broken.push(n);
    const mark = line.match(/\/\/\s*@mark\s+([\w-]+)\s*$/);
    if (mark && !say) {
      if (mark[1] in hints.marks) hints.errors.push(`line ${n}: duplicate @mark ${mark[1]} (first on line ${hints.marks[mark[1]]})`);
      else hints.marks[mark[1]] = n;
    }
    const viz = line.match(/\/\/\s*@viz\s+(.+)$/);
    if (!viz) return;
    for (const pair of viz[1].trim().split(/\s+/)) {
      const [key, value = ""] = pair.split(":");
      const list = value.split(",").filter(Boolean);
      switch (key) {
        case "array":
        case "grid":
        case "graph":
        case "heap":
          hints[key] = value;
          break;
        case "window": {
          const [l, r] = value.split("..");
          if (l && r) hints.window = [l, r];
          break;
        }
        case "pointers":
          hints.pointers.push(...list);
          break;
        case "hide":
          hints.hide.push(...list);
          break;
        case "values":
          hints.values.push(...list);
          break;
        case "arc": {
          const [from, to] = value.split("->");
          if (from && to) hints.arcs.push([from, to]);
          else hints.errors.push(`line ${n}: arc needs from->to, like arc:r->prev`);
          break;
        }
        case "best":
          hints.best = value;
          break;
        case "unique":
          hints.unique = true;
          break;
        case "range": {
          const m = value.match(/^([\w.]+)\.\.([\w.]+)(?:@([\w.]+))?$/);
          if (m) hints.range = { lo: m[1], hi: m[2], ...(m[3] ? { mid: m[3] } : {}) };
          else hints.errors.push(`line ${n}: range needs lo..hi or lo..hi@mid`);
          break;
        }
        case "labels":
          if (list[0]) hints.gridLabels = [list[0], list[1]];
          break;
        default:
          if ((SYSTEMS_KINDS as string[]).includes(key)) hints.systems.push({ kind: key as SystemsKind, args: list });
          else hints.errors.push(`line ${n}: unknown @viz view "${key}"`);
      }
    }
  });
  hints.letterIndex = /charCodeAt\(/.test(source);
  return hints;
}
