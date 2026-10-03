import { runTrafficSource, type Override } from "./run.ts";

self.onmessage = (e: MessageEvent<{ source: string; override?: Override }>) => {
  self.postMessage(runTrafficSource(e.data.source, e.data.override));
};
