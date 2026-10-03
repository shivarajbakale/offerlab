// Source in, SimTrace out: runs a kernel primitive's scenarios. Pure, so the worker, the tests
// and the smoke check share it. Each simulate() call inside a test() becomes one run.

import Babel from "@babel/standalone";
import * as kernel from "../../../system-design/kernel/sim.ts";
import type { Fault, SimRun, SimTrace } from "../../../system-design/kernel/types.ts";
import { makeModules } from "../tracer/shims.ts";

/** Extra faults injected into one run (by its index in the file) when replaying with chaos. */
export type Chaos = { run: number; faults: Fault[] };

/** Strips types and turns ESM imports into require() calls. No instrumentation. */
export function compile(source: string): string {
  const out = Babel.transform(source, {
    filename: "primitive.ts",
    presets: [["typescript", { allowDeclareFields: true }]],
    plugins: ["transform-modules-commonjs"],
  });
  return out.code ?? "";
}

export function runSimSource(source: string, chaos?: Chaos): SimTrace {
  let code: string;
  try {
    code = compile(source);
  } catch (err) {
    return { runs: [], error: `Compile error: ${(err as Error).message}` };
  }

  const runs: SimRun[] = [];
  let testName = "";
  let testRuns: SimRun[] = [];
  let failed = false;
  const asyncTests: string[] = [];

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
      const result = fn({});
      if (result instanceof Promise) asyncTests.push(testName);
    } catch {
      failed = true;
    }
    for (const r of testRuns) r.passed = !failed && !r.error;
  };
  const modules: Record<string, unknown> = {
    "node:test": { __esModule: true, test, it: test, describe: (_name: unknown, fn?: unknown) => typeof fn === "function" && fn(), default: test },
    "node:assert": { ...shims["node:assert"], __esModule: true },
    "node:assert/strict": { ...shims["node:assert/strict"], __esModule: true },
  };
  const require = (name: string) => {
    if (/kernel\/sim\.ts$/.test(name)) return kernel;
    const mod = modules[name];
    if (!mod) throw new Error(`Module "${name}" is not available in the visualizer`);
    return mod;
  };

  kernel.hooks.count = 0;
  kernel.hooks.onRun = (run) => {
    run.label = testRuns.length ? `${testName} (#${testRuns.length + 1})` : testName;
    testRuns.push(run);
    runs.push(run);
  };
  kernel.hooks.extraFaults = (index) => (chaos && chaos.run === index ? chaos.faults : []);
  try {
    new Function("require", "exports", "module", code)(require, {}, { exports: {} });
  } catch (err) {
    return { runs, error: (err as Error).message };
  } finally {
    kernel.hooks.onRun = null;
    kernel.hooks.extraFaults = null;
  }
  if (asyncTests.length) return { runs, error: `Scenario "${asyncTests[0]}" is async; scenarios must be synchronous` };
  return { runs };
}
