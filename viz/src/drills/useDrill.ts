// Loads a drill file in a Web Worker (compiling it needs Babel, and a failure drill runs the
// traffic simulator twice). Results are cached per source.

import { useEffect, useState } from "react";
import { cacheSet } from "../sim/cache.ts";
import type { DrillResult } from "./run.ts";

const TIMEOUT_MS = 20_000;
const cache = new Map<string, DrillResult>();

export type DrillState = { status: "loading" } | { status: "ready"; result: DrillResult };

export function useDrill(id: string, source: string): DrillState {
  const key = `${id}\n${source}`;
  const [result, setResult] = useState<{ key: string; value: DrillResult } | null>(null);
  useEffect(() => {
    if (cache.has(key)) return;
    let cancelled = false;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const finish = (value: DrillResult) => {
      clearTimeout(timer);
      worker.terminate();
      if ("drill" in value) cacheSet(cache, key, value);
      if (!cancelled) setResult({ key, value });
    };
    const timer = setTimeout(() => finish({ error: `The drill took longer than ${TIMEOUT_MS / 1000}s to load` }), TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<DrillResult>) => finish(e.data);
    worker.onerror = (e) => finish({ error: e.message || "Worker crashed" });
    worker.postMessage({ source });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      worker.terminate();
    };
  }, [key, source]);
  const cached = cache.get(key);
  if (cached) return { status: "ready", result: cached };
  return result?.key === key ? { status: "ready", result: result.value } : { status: "loading" };
}
