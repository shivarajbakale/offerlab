// Smoke check: trace every NeetCode file and report failures.
// Usage: node scripts/check.ts [filter]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { traceSource } from "../src/tracer/trace.ts";

const root = join(import.meta.dirname, "../../neetcode-150");
const filter = process.argv[2] ?? "";
let ok = 0;
let bad = 0;
for (const dir of readdirSync(root).filter((d) => !d.includes("."))) {
  for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".ts"))) {
    if (!`${dir}/${file}`.includes(filter)) continue;
    const started = performance.now();
    const trace = traceSource(readFileSync(join(root, dir, file), "utf8"));
    const ms = Math.round(performance.now() - started);
    const runs = trace.runs;
    const steps = runs.reduce((n, r) => n + r.steps.length, 0);
    const failed = runs.filter((r) => r.passed === false).length;
    const errors = runs.filter((r) => r.error).map((r) => r.error);
    const problems: string[] = [];
    if (trace.error) problems.push(`error: ${trace.error}`);
    if (runs.length === 0) problems.push("no runs");
    if (runs[0] && runs[0].steps.length === 0) problems.push("first run has no steps");
    if (failed) problems.push(`${failed} failing asserts`);
    if (errors.length) problems.push(`run errors: ${errors.join("; ")}`);
    if (ms > 3000) problems.push(`slow: ${ms}ms`);
    const status = problems.length ? "FAIL" : "ok  ";
    if (problems.length) bad++;
    else ok++;
    const trunc = runs.filter((r) => r.truncated).length;
    console.log(
      `${status} ${dir}/${file}  runs=${runs.length} steps=${steps} truncated=${trunc} ${ms}ms ${problems.join(" | ")}`,
    );
  }
}
console.log(`\n${ok} ok, ${bad} failing`);
process.exit(bad ? 1 : 0);
