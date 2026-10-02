import { traceSource } from "./trace.ts";

self.onmessage = (e: MessageEvent<{ source: string }>) => {
  self.postMessage(traceSource(e.data.source));
};
