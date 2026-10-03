// Source in, TrafficTrace out: runs an architecture file's scenarios on the traffic simulator.
// Pure, so the worker, the tests and the smoke check share it. Each run() inside a test() is one run.

import * as traffic from "../../../system-design/traffic/index.ts";
import type { TrafficFault, TrafficRun, TrafficTrace } from "../../../system-design/traffic/index.ts";
import { compile } from "../sim/run.ts";
import { makeModules } from "../tracer/shims.ts";

/** New knob values or faults for one run (by its index in the file). `only` skips every other run. */
export type Override = { run: number; knobs?: Record<string, number>; faults?: TrafficFault[]; only?: boolean };

export function runTrafficSource(source: string, override?: Override): TrafficTrace {
  let code: string;
  try {
    code = compile(source);
  } catch (err) {
    return { runs: [], error: `Compile error: ${(err as Error).message}` };
  }

  const runs: TrafficRun[] = [];
  let testName = "";
  let testRuns: TrafficRun[] = [];
  let failed = false;
  const shims = makeModules({
    fail: () => {
      failed = true;
    },
    assertResult: (pass) => {
      if (!pass) failed = true;
    },
  });
  const test = (name: unknown, a?: unknown, b?: unknown) => {
    const fn = typeof a === "function" ? a : b;
    if (typeof fn !== "function") return;
    testName = String(name);
    testRuns = [];
    failed = false;
    try {
      fn({});
    } catch {
      failed = true;
    }
    for (const r of testRuns) r.passed = override ? null : !failed && !r.error;
  };
  const modules: Record<string, unknown> = {
    "node:test": { __esModule: true, test, it: test, describe: (_n: unknown, fn?: unknown) => typeof fn === "function" && fn(), default: test },
    "node:assert": { ...shims["node:assert"], __esModule: true },
    "node:assert/strict": { ...shims["node:assert/strict"], __esModule: true },
  };
  const require = (name: string) => {
    if (/traffic\/index\.ts$/.test(name)) return traffic;
    const mod = modules[name];
    if (!mod) throw new Error(`Module "${name}" is not available in the visualizer`);
    return mod;
  };

  traffic.hooks.count = 0;
  traffic.hooks.onRun = (run) => {
    run.label = testRuns.length ? `${testName} (#${testRuns.length + 1})` : testName;
    testRuns.push(run);
    runs.push(run);
  };
  traffic.hooks.overrides = (i) => (override?.run === i ? { knobs: override.knobs, faults: override.faults } : {});
  traffic.hooks.skip = override?.only ? (i) => i !== override.run : null;
  try {
    new Function("require", "exports", "module", code)(require, {}, { exports: {} });
  } catch (err) {
    return { runs, error: (err as Error).message };
  } finally {
    traffic.hooks.onRun = null;
    traffic.hooks.overrides = null;
    traffic.hooks.skip = null;
  }
  return { runs };
}
