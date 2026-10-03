// Smoke check: run every NeetCode file through the tracer, every systems primitive (and the
// low-level design and API tracks) through the tracer or the simulation kernel, every
// architecture and microservices topic through the traffic simulator, and load every drill.
// Usage: node scripts/check.ts [filter]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { runDrillSource } from "../src/drills/run.ts";
import { isKernelSource } from "../src/parseProblem.ts";
import { runSimSource } from "../src/sim/run.ts";
import { runTrafficSource } from "../src/traffic/run.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

type Outcome = {
  runs: { passed: boolean | null; truncated: boolean; error?: string; steps: unknown[] }[];
  error?: string;
};

const sd = join(import.meta.dirname, "../../system-design");
const ts = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".ts")) : []);
const groups = (root: string) => readdirSync(root).filter((d) => !d.includes(".")).map((dir) => ({ dir, path: join(root, dir) }));
// Tracer and kernel files: NeetCode and the primitives by group folder, and the two flat tracer tracks.
const tracerGroups = [
  ...groups(join(import.meta.dirname, "../../neetcode-150")).map((g) => ({ ...g, systems: false })),
  ...groups(join(sd, "primitives")).map((g) => ({ ...g, systems: true })),
  ...["low-level-design", "api-design"].map((dir) => ({ dir, path: join(sd, dir), systems: true })),
];
const filter = process.argv[2] ?? "";
let ok = 0;
let bad = 0;
for (const { dir, path, systems } of tracerGroups) {
  for (const file of ts(path)) {
    if (!`${dir}/${file}`.includes(filter)) continue;
    const source = readFileSync(join(path, file), "utf8");
    const kernel = isKernelSource(source);
    const started = performance.now();
    const trace: Outcome = kernel
      ? runSimSource(source)
      : systems
        ? traceSource(source, SYSTEMS_LIMITS, { scenarios: true })
        : traceSource(source);
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
    const truncatedRuns = runs.filter((r) => r.truncated).length;
    if (systems && truncatedRuns) problems.push(`truncated runs: ${truncatedRuns}`);
    const status = problems.length ? "FAIL" : "ok  ";
    if (problems.length) bad++;
    else ok++;
    const trunc = runs.filter((r) => r.truncated).length;
    console.log(
      `${status} ${kernel ? "[sim] " : ""}${dir}/${file}  runs=${runs.length} steps=${steps} truncated=${trunc} ${ms}ms ${problems.join(" | ")}`,
    );
  }
}
// Architectures and microservices play on the traffic simulator; one file runs every scenario, so it gets more time.
for (const file of ["architectures", "microservices"].flatMap((t) => ts(join(sd, t)).map((f) => `${t}/${f}`))) {
  if (!file.includes(filter)) continue;
  const started = performance.now();
  const trace = runTrafficSource(readFileSync(join(sd, file), "utf8"));
  const ms = Math.round(performance.now() - started);
  const problems: string[] = [];
  if (trace.error) problems.push(`error: ${trace.error}`);
  if (trace.runs.length === 0) problems.push("no runs");
  const failed = trace.runs.filter((r) => r.passed === false).map((r) => r.label);
  if (failed.length) problems.push(`failing: ${failed.join("; ")}`);
  const errors = trace.runs.filter((r) => r.error || r.truncated).map((r) => r.label);
  if (errors.length) problems.push(`errors or truncated: ${errors.join("; ")}`);
  if (ms > 10_000) problems.push(`slow: ${ms}ms`);
  if (problems.length) bad++;
  else ok++;
  const frames = trace.runs.reduce((n, r) => n + r.frames.length, 0);
  console.log(`${problems.length ? "FAIL" : "ok  "} [traffic] ${file}  runs=${trace.runs.length} frames=${frames} ${ms}ms ${problems.join(" | ")}`);
}
// Drills load as the app loads them; a failure drill plays its run and the fix.
for (const file of ["estimation", "failure", "flashcards"].flatMap((k) => ts(join(sd, "drills", k)).map((f) => `drills/${k}/${f}`))) {
  if (!file.includes(filter)) continue;
  const started = performance.now();
  const result = runDrillSource(readFileSync(join(sd, file), "utf8"));
  const ms = Math.round(performance.now() - started);
  const problems: string[] = [];
  if ("error" in result) problems.push(`error: ${result.error}`);
  else if (result.play) {
    for (const r of [result.play.broken, result.play.fixed]) if (r.error || r.truncated) problems.push(`${r.label}: ${r.error ?? "truncated"}`);
  }
  if (ms > 10_000) problems.push(`slow: ${ms}ms`);
  if (problems.length) bad++;
  else ok++;
  console.log(`${problems.length ? "FAIL" : "ok  "} [drill] ${file}  ${"drill" in result ? result.drill.kind : ""} ${ms}ms ${problems.join(" | ")}`);
}
console.log(`\n${ok} ok, ${bad} failing`);
process.exit(bad ? 1 : 0);
