import { runSimSource, type Chaos } from "./run.ts";

self.onmessage = (e: MessageEvent<{ source: string; chaos?: Chaos }>) => {
  self.postMessage(runSimSource(e.data.source, e.data.chaos));
};
