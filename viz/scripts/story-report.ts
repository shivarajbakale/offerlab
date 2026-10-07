// Prints what the story engine makes of one solution's hints, run by run, so annotations can be checked:
//   node scripts/story-report.ts neetcode-150/13-1d-dynamic-programming/101-house-robber.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { traceSource } from "../src/tracer/trace.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildStory } from "../src/model/story.ts";
import { lineDeps } from "../src/model/deps.ts";
import { buildCallTree } from "../src/model/callTree.ts";

const path = process.argv[2];
if (!path) throw new Error("usage: node scripts/story-report.ts <solution file>");
const src = readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const lines = src.split("\n");
const hints = parseHints(src);
console.log(`rule: ${hints.rule ?? "(none)"}`);
if (hints.errors.length) console.log(`HINT ERRORS: ${hints.errors.join("; ")}`);
const trace = traceSource(src);
if (trace.error) console.log(`TRACE ERROR: ${trace.error}`);
trace.runs.forEach((run, r) => {
  const steps = run.steps;
  const story = buildStory(steps, hints, lines);
  console.log(`\n--- run ${r}: ${run.label} (${steps.length} steps)`);
  const deps = new Set<string>();
  for (const s of steps) {
    const d = lineDeps(lines[s.line - 1], s);
    if (d) deps.add(`line ${s.line}: ${Object.entries(d).map(([n, x]) => `${n} w=${x.write ?? "-"} r=${x.reads.map((q) => `[${q}]`).join("")}`).join(" ")}`);
    if (deps.size >= 4) break;
  }
  for (const d of deps) console.log(`  reads/writes ${d}`);
  const tree = buildCallTree(steps);
  if (tree.recursive && tree.nodes.some((n) => n.node !== undefined)) console.log("  tree recursion lens: on");
  if (tree.collects) console.log(`  backtracking: ${tree.nodes.filter((n) => n.found).length} calls found answers, ${tree.nodes.filter((n) => !n.found).length} dead ends`);
  if (!story) return console.log("  no story (no story hints, or run shorter than 2 or longer than 2000 steps)");
  if (story.win) console.log(`  window on ${story.win.array}: ${story.win.mode}${story.win.restarts ? " (restarts)" : ""}`);
  if (story.range) console.log(`  range ${story.range.lo}..${story.range.hi}: ${story.range.min}..${story.range.max}`);
  const broken = story.broken.filter(Boolean).length;
  if (broken) console.log(`  rule broken on ${broken} steps`);
  for (const [k, a] of story.asks) {
    const line = steps[k].line;
    const what = a.kind === "cell" ? `click cell ${a.answer} (from ${a.from})` : `pick ${a.answer} from [${a.choices.join(", ")}]`;
    console.log(`  ask @${k} line ${line} ${a.name}: ${what}`);
  }
  for (const m of story.marks) console.log(`  ${m.kind} @${m.index}: ${m.label}`);
  if (story.trail.size) console.log(`  grid trail: ${[...story.trail].map(([k, t]) => `${k} ${t.size} cells`).join(", ")}`);
});
