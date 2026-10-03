import { SYSTEMS_LIMITS, type TraceOptions } from "./recorder.ts";
import { traceSource } from "./trace.ts";

self.onmessage = (e: MessageEvent<{ source: string; options?: TraceOptions }>) => {
  const options = e.data.options ?? {};
  self.postMessage(traceSource(e.data.source, options.scenarios ? SYSTEMS_LIMITS : undefined, options));
};
