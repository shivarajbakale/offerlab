// Source in, drill data out: evaluates a drill file and, for a failure drill, plays its run and
// the fix on the traffic simulator. The file's tests are not run here (`npm test` runs them).
// Pure, so the worker, the tests and the smoke check share it.

import * as drills from "../../../system-design/drills/index.ts";
import type { Drill } from "../../../system-design/drills/index.ts";
import * as traffic from "../../../system-design/traffic/index.ts";
import type { TrafficRun } from "../../../system-design/traffic/index.ts";
import { compile } from "../sim/run.ts";
import { makeModules } from "../tracer/shims.ts";

export type DrillResult = { drill: Drill; play?: { broken: TrafficRun; fixed: TrafficRun } } | { error: string };

export function loadDrillSource(source: string): { drill: Drill } | { error: string } {
  let code: string;
  try {
    code = compile(source);
  } catch (err) {
    return { error: `Compile error: ${(err as Error).message}` };
  }
  const shims = makeModules({ fail: () => {}, assertResult: () => {} });
  const skip = () => {};
  const modules: Record<string, unknown> = {
    "node:test": { __esModule: true, test: skip, it: skip, describe: skip, default: skip },
    "node:assert": { ...shims["node:assert"], __esModule: true },
    "node:assert/strict": { ...shims["node:assert/strict"], __esModule: true },
  };
  const require = (name: string) => {
    // Drill files import "../index.ts" (the drills module), "../links.ts" and "../../traffic/index.ts".
    // Exact paths, so an import of some other index.ts fails here rather than getting the wrong module.
    if (name === "../../traffic/index.ts") return traffic;
    if (name === "../index.ts") return drills;
    if (name === "../links.ts") return { __esModule: true, problemIds: () => new Set(), unknownLinks: () => [] };
    const mod = modules[name];
    if (!mod) throw new Error(`Module "${name}" is not available in the visualizer`);
    return mod;
  };
  const module = { exports: {} as Record<string, unknown> };
  try {
    new Function("require", "exports", "module", code)(require, module.exports, module);
  } catch (err) {
    return { error: (err as Error).message };
  }
  const found = module.exports.drill ?? module.exports.deck;
  const kind = (found as Drill | undefined)?.kind;
  if (kind !== "estimation" && kind !== "failure" && kind !== "flashcards") {
    return { error: "A drill file must export `drill` (from estimation() or failureDrill()) or `deck` (from flashcards())." };
  }
  return { drill: found as Drill };
}

export function runDrillSource(source: string): DrillResult {
  const loaded = loadDrillSource(source);
  if ("error" in loaded || loaded.drill.kind !== "failure") return loaded;
  try {
    return { drill: loaded.drill, play: drills.playDrill(loaded.drill) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
