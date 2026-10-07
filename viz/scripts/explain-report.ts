// Prints the explain card for every step of a solution's first run, so decision notes can be read in order:
//   node scripts/explain-report.ts neetcode-150/01-arrays-hashing/003-two-sum.ts [run] [--key]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { traceSource } from "../src/tracer/trace.ts";
import { parseProblem } from "../src/parseProblem.ts";
import { narrate } from "../src/model/narrate.ts";
import { explain } from "../src/model/explain.ts";

const [path, runArg = "0"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const keyOnly = process.argv.includes("--key");
if (!path) throw new Error("usage: node scripts/explain-report.ts <solution file> [run] [--key]");
const src = readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const p = parseProblem(path, src);
if (p.hints.errors.length) console.log(`HINT ERRORS: ${p.hints.errors.join("; ")}`);
const run = traceSource(src).runs[Number(runArg)];
const plain = { ...p.hints, say: {} };
let keys = 0;
run.steps.forEach((s, k) => {
  const e = explain(run.steps, k, p.lines, p.hints, p.why, narrate(run.steps, k, p.lines, plain));
  if (e.key) keys++;
  if (keyOnly && !e.key) return;
  const out = [`#${k} line ${s.line} ${s.event}${e.key ? " ★" : ""}  ${p.lines[s.line - 1].trim().slice(0, 70)}`];
  if (e.phase) out.push(`   phase: ${e.phase}`);
  if (e.goal) out.push(`   asking: ${e.goal}`);
  if (e.decision) out.push(`   decision: ${e.decision.cond}  [${e.decision.operands.map((o) => `${o.expr}=${o.value}`).join(", ")}] -> ${e.decision.outcome}`);
  if (e.why) out.push(`   why: ${e.why}`);
  if (e.returns) out.push(`   returns: ${e.returns}`);
  if (e.then) out.push(`   so now: ${e.then}`);
  if (!e.decision) out.push(`   did: ${e.did.text}`);
  console.log(out.join("\n"));
});
console.log(`\n${keys}/${run.steps.length} steps carry a written reason`);
