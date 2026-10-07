// Which cells a line reads and which one it writes: `dp[i][j] = dp[i - 1][j] + dp[i][j - 1]`
// reads two cells and writes one. The drawing shows arrows from the cells read to the cell
// written, which is how a DP table's recurrence becomes visible.

import type { Step } from "../tracer/types.ts";
import { evaluate, scopeValues } from "./heap.ts";

/** Indexes into one named array or grid: one number per bracket (`[i]` or `[i, j]`). */
export type Deps = Record<string, { write?: number[]; reads: number[][] }>;

type Access = { name: string; exprs: string[]; at: number };

/** Every `name[a]` or `name[a][b]` in the code, with the text inside each bracket. */
function accesses(code: string): Access[] {
  const out: Access[] = [];
  const re = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\[/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const exprs: string[] = [];
    let i = m.index + m[0].length - 1;
    while (code[i] === "[") {
      let depth = 0;
      let j = i;
      for (; j < code.length; j++) {
        if (code[j] === "[") depth++;
        else if (code[j] === "]" && --depth === 0) break;
      }
      if (j >= code.length) break;
      exprs.push(code.slice(i + 1, j));
      i = j + 1;
      while (code[i] === " ") i++;
    }
    if (exprs.length) out.push({ name: m[1], exprs, at: m.index });
    re.lastIndex = m.index + m[0].length;
  }
  return out;
}

/** Index of the assignment `=` (also `+=`, `||=` ...) at the top level of the line, or -1. */
function assignAt(code: string): number {
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "=" && depth === 0) {
      const prev = code[i - 1];
      const next = code[i + 1];
      if (next === "=" || next === ">" || prev === "=" || prev === "!" || prev === "<" || prev === ">") continue;
      return i;
    }
  }
  return -1;
}

const SAFE = /^[\w$\s.+\-*/%()]+$/;

/** The cells that `line` reads and writes, judged against the state before it runs. */
export function lineDeps(line: string | undefined, step: Step | undefined): Deps | null {
  if (!line || !step) return null;
  const code = line.replace(/\/\/.*$/, "").trim();
  if (!code || /^(for|while|function|export|class|return\s*$)/.test(code) || code.startsWith("}")) return null;
  // `if (cond) x[i] = ...;` reads in the condition, then treats the statement after it as its own line.
  const guard = code.match(/^(?:}\s*)?(?:else\s+)?if\s*\(/);
  if (guard) {
    let depth = 0;
    let end = -1;
    for (let i = guard[0].length - 1; i < code.length; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    const rest = end > 0 ? code.slice(end + 1).replace(/^\s*\{?/, "").trim() : "";
    if (end > 0 && rest && !rest.startsWith("return")) {
      const cond = code.slice(guard[0].length, end);
      const a = lineDeps(`(${cond});`, step) ?? {};
      const b = lineDeps(rest, step) ?? {};
      for (const [name, d] of Object.entries(b)) {
        const into = (a[name] ??= { reads: [] });
        if (d.write) into.write = d.write;
        for (const r of d.reads) if (!into.reads.some((x) => x.join() === r.join())) into.reads.push(r);
      }
      return Object.keys(a).length ? a : null;
    }
  }
  const found = accesses(code);
  if (!found.length) return null;
  const eq = assignAt(code);
  let scope: Record<string, unknown> | undefined;
  const indexes = (a: Access): number[] | null => {
    if (!a.exprs.every((e) => SAFE.test(e) && !/\+\+|--/.test(e))) return null;
    scope ??= scopeValues(step);
    const out: number[] = [];
    for (const e of a.exprs) {
      const r = evaluate(e, scope);
      if (!r.ok || typeof r.value !== "number" || !Number.isInteger(r.value) || r.value < 0) return null;
      out.push(r.value);
    }
    return out;
  };
  const deps: Deps = {};
  const entry = (name: string) => (deps[name] ??= { reads: [] });
  for (const a of found) {
    const idx = indexes(a);
    if (!idx) continue;
    const lhs = eq >= 0 && a.at < eq;
    // Only the outermost access on the left is the written cell; `+=` also reads it.
    if (lhs && !entry(a.name).write && code.slice(0, a.at).replace(/^(const|let|var)\s+/, "").trim() === "") {
      entry(a.name).write = idx;
      if (/[-+*/%|&^?]$/.test(code.slice(0, eq))) entry(a.name).reads.push(idx);
    } else {
      entry(a.name).reads.push(idx);
    }
  }
  for (const [name, d] of Object.entries(deps)) {
    const seen = new Set<string>();
    d.reads = d.reads.filter((r) => {
      const key = r.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!d.write && d.reads.length === 0) delete deps[name];
  }
  return Object.keys(deps).length ? deps : null;
}
