// Every solution with a `@goal` is annotated with decision notes, so its cards must explain each
// decision, fill every template, and carry a written reason on most steps of the first examples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProblem } from "../src/parseProblem.ts";
import { declaredFunction } from "../src/model/hints.ts";
import { explain } from "../src/model/explain.ts";
import { conditionOf, narrate } from "../src/model/narrate.ts";
import { traceSource } from "../src/tracer/trace.ts";

const ROOT = join(import.meta.dirname, "../../neetcode-150");
const DIRS = readdirSync(ROOT).filter((d) => /^\d\d-/.test(d));

/** The line after the body of the function declared on line `i` (0-based) closes. */
function bodyEnd(lines: string[], i: number): number {
  if (!/\{\s*(\/\/.*)?$/.test(lines[i])) return i + 1;
  const indent = lines[i].match(/^\s*/)![0];
  for (let j = i + 1; j < lines.length; j++) if (lines[j].startsWith(`${indent}}`)) return j + 1;
  return lines.length;
}

/** True when the function declared on line `i` calls itself inside its body. */
function recursive(lines: string[], i: number, name: string): boolean {
  const call = new RegExp(`\\b${name}\\(`);
  return lines.slice(i + 1, bodyEnd(lines, i)).some((l) => call.test(l.replace(/\/\/.*$/, "")));
}

for (const dir of DIRS) {
  for (const file of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".ts"))) {
    const path = `neetcode-150/${dir}/${file}`;
    const src = readFileSync(join(ROOT, dir, file), "utf8");
    if (!/\/\/\s*@goal\s/.test(src)) continue;
    const p = parseProblem(path, src);

    test(`${path}: every function has a goal and every branch has a reason`, () => {
      assert.deepEqual(p.hints.errors, []);
      const missing: string[] = [];
      // Branches count inside the solution's functions, not in test helpers like buildTree.
      let solutionUntil = 0;
      p.lines.forEach((line, i) => {
        const n = i + 1;
        const fn = declaredFunction(line);
        const solution = fn && (/^export\s/.test(line) || p.hints.goal[fn] || (i < solutionUntil && recursive(p.lines, i, fn)));
        if (fn && solution && !p.hints.goal[fn] && (/^export\s/.test(line) || recursive(p.lines, i, fn))) missing.push(`line ${n}: @goal for ${fn}`);
        if (solution) solutionUntil = Math.max(solutionUntil, bodyEnd(p.lines, i));
        const code = line.trim().replace(/\s*\/\/.*$/, "");
        if (i < solutionUntil && conditionOf(code) && !p.hints.notes.yes[n] && !p.hints.notes.no[n]) missing.push(`line ${n}: @yes/@no`);
      });
      assert.deepEqual(missing, []);
    });

    test(`${path}: every card fills its templates, and most steps carry a reason`, () => {
      const plain = { ...p.hints, say: {} };
      // A note's `{expr}` showing up verbatim means it failed to evaluate.
      const exprs = new Set(src.match(/\{[^{}]+\}/g) ?? []);
      const unfilled = (text: string) => [...exprs].find((x) => text.includes(x));
      const runs = traceSource(src).runs;
      runs.forEach((run, r) => {
        let keys = 0;
        run.steps.forEach((s, k) => {
          const e = explain(run.steps, k, p.lines, p.hints, p.why, narrate(run.steps, k, p.lines, plain));
          if (e.key) keys++;
          if (s.event === "return" && p.hints.notes.returns[s.line]) assert.ok(e.returns, `run ${r} step ${k} (line ${s.line}): the @returns note could not be filled`);
          for (const text of [e.phase, e.goal, e.why, e.then, e.returns]) {
            if (text === undefined) continue;
            assert.equal(unfilled(text), undefined, `run ${r} step ${k} (line ${s.line}) left a template unfilled: ${text}`);
            assert.doesNotMatch(text, /''/, `run ${r} step ${k} (line ${s.line}) shows an empty string: ${text}`);
          }
        });
        // Runs this short are a single call and its return; the ratio means little there.
        if (r < 2 && run.steps.length > 5) assert.ok(keys / run.steps.length >= 0.6, `run ${r}: only ${keys}/${run.steps.length} steps carry a reason`);
      });
    });
  }
}
