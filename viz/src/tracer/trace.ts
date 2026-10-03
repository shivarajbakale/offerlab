// Source in, Trace out. Pure function used by the Web Worker and the Node smoke check.

import { instrument } from "./instrument.ts";
import { DEFAULT_LIMITS, Recorder, type Limits, type TraceOptions } from "./recorder.ts";
import { makeModules } from "./shims.ts";
import type { Trace } from "./types.ts";

export function traceSource(source: string, limits: Limits = DEFAULT_LIMITS, options: TraceOptions = {}): Trace {
  let code: string;
  try {
    code = instrument(source);
  } catch (err) {
    return { runs: [], skippedRuns: 0, error: `Compile error: ${(err as Error).message}` };
  }

  const rec = new Recorder(limits, options);
  const modules = makeModules(rec);
  const require = (name: string) => {
    const mod = modules[name];
    if (!mod) throw new Error(`Module "${name}" is not available in the visualizer`);
    return mod;
  };

  try {
    new Function("__rt", "__require", code)(rec.api, require);
  } catch (err) {
    rec.fail(err);
  }
  return rec.finish();
}
