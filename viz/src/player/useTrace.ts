// Runs the tracer for a problem in a Web Worker, with a timeout and a per-session cache.

import { useEffect, useState } from "react";
import type { TraceOptions } from "../tracer/recorder.ts";
import type { Trace } from "../tracer/types.ts";

const TIMEOUT_MS = 6000;
const cache = new Map<string, Trace>();

export type TraceState =
  | { status: "loading" }
  | { status: "ready"; trace: Trace }
  | { status: "error"; message: string };

function runInWorker(source: string, options?: TraceOptions): Promise<Trace> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../tracer/worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Tracing took longer than ${TIMEOUT_MS / 1000}s (infinite loop?)`));
    }, TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<Trace>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || "Worker crashed"));
    };
    worker.postMessage({ source, options });
  });
}

/** The cache is keyed by id alone: a problem is always traced in the same mode. */
export function useTrace(id: string, source: string, options?: TraceOptions): TraceState {
  const [result, setResult] = useState<{ id: string; value: TraceState } | null>(null);
  const cached = cache.get(id);

  useEffect(() => {
    if (cache.has(id)) return;
    let cancelled = false;
    runInWorker(source, options).then(
      (trace) => {
        cache.set(id, trace);
        if (!cancelled) setResult({ id, value: { status: "ready", trace } });
      },
      (err: Error) => {
        if (!cancelled) setResult({ id, value: { status: "error", message: err.message } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, source, options]);

  if (cached) return { status: "ready", trace: cached };
  return result?.id === id ? result.value : { status: "loading" };
}
