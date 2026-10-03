// Runs a kernel primitive's scenarios in a Web Worker, with a timeout and a per-session cache.

import { useEffect, useState } from "react";
import type { SimTrace } from "../../../system-design/kernel/types.ts";
import { cacheSet } from "./cache.ts";
import type { Chaos } from "./run.ts";

const TIMEOUT_MS = 3000;
const cache = new Map<string, SimTrace>();

export type SimTraceState =
  | { status: "loading" }
  | { status: "ready"; trace: SimTrace }
  | { status: "error"; message: string };

function runInWorker(source: string, chaos?: Chaos): Promise<SimTrace> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Simulation took longer than ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<SimTrace>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || "Worker crashed"));
    };
    worker.postMessage({ source, chaos });
  });
}

export function useSimTrace(id: string, source: string, chaos?: Chaos): SimTraceState {
  // Keyed by source and injected faults too: editing a primitive in dev, or adding chaos, re-runs it.
  const key = `${id}\n${source}\n${chaos ? JSON.stringify(chaos) : ""}`;
  const [result, setResult] = useState<{ key: string; value: SimTraceState } | null>(null);
  const cached = cache.get(key);

  useEffect(() => {
    if (cache.has(key)) return;
    let cancelled = false;
    runInWorker(source, chaos).then(
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
    };
  }, [key, source, chaos]);

  if (cached) return { status: "ready", trace: cached };
  return result?.key === key ? result.value : { status: "loading" };
}
