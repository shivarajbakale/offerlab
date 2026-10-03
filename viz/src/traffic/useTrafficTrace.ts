// Runs an architecture file in a Web Worker. All scenarios run once; a knob change re-runs only
// the scenario showing, and its result replaces that one run.

import { useEffect, useMemo, useState } from "react";
import type { TrafficTrace } from "../../../system-design/traffic/index.ts";
import { cacheSet } from "../sim/cache.ts";
import type { Override } from "./run.ts";

const TIMEOUT_MS = 20_000;
const cache = new Map<string, TrafficTrace>();

export type TrafficState =
  | { status: "loading" }
  | { status: "ready"; trace: TrafficTrace }
  | { status: "error"; message: string };

/** Runs in a fresh worker; `stop` ends it early when the result is no longer wanted. */
function runInWorker(source: string, override?: Override): { done: Promise<TrafficTrace>; stop: () => void } {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const done = new Promise<TrafficTrace>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Simulation took longer than ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<TrafficTrace>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || "Worker crashed"));
    };
    worker.postMessage({ source, override });
  });
  return { done, stop: () => worker.terminate() };
}

function useCached(key: string | null, source: string, override?: Override): TrafficState {
  const [result, setResult] = useState<{ key: string; value: TrafficState } | null>(null);
  const cached = key ? cache.get(key) : undefined;
  useEffect(() => {
    if (!key || cache.has(key)) return;
    let cancelled = false;
    const job = runInWorker(source, override);
    job.done.then(
      (trace) => {
        cacheSet(cache, key, trace);
        if (!cancelled) setResult({ key, value: { status: "ready", trace } });
      },
      (err: Error) => {
        if (!cancelled) setResult({ key, value: { status: "error", message: err.message } });
      },
    );
    return () => {
      cancelled = true;
      job.stop();
    };
  }, [key, source, override]);
  if (!key) return { status: "loading" };
  if (cached) return { status: "ready", trace: cached };
  return result?.key === key ? result.value : { status: "loading" };
}

export function useTrafficTrace(id: string, source: string, override?: Override): TrafficState {
  const base = useCached(`${id}\n${source}`, source);
  const only = useMemo(() => (override ? { ...override, only: true } : undefined), [override]);
  const single = useCached(only ? `${id}\n${source}\n${JSON.stringify(only)}` : null, source, only);
  const baseTrace = base.status === "ready" ? base.trace : null;
  const singleTrace = single.status === "ready" ? single.trace : null;
  const merged = useMemo(() => {
    if (!baseTrace || !override || !singleTrace) return null;
    const runs = baseTrace.runs.map((r, i) =>
      i === override.run && singleTrace.runs[0] ? { ...singleTrace.runs[0], label: r.label, passed: null } : r,
    );
    return { ...baseTrace, runs };
  }, [baseTrace, singleTrace, override]);
  if (base.status !== "ready" || !override) return base;
  if (single.status !== "ready") return single;
  return { status: "ready", trace: merged! };
}
