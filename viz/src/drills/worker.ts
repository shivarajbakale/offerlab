import { runDrillSource } from "./run.ts";

self.onmessage = (e: MessageEvent<{ source: string }>) => {
  self.postMessage(runDrillSource(e.data.source));
};
