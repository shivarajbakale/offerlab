// Shared trace format produced by the tracer (worker / Node) and consumed by the UI.

export type HeapId = number;

export type Value =
  | { t: "p"; v: number | string | boolean | null | undefined }
  | { t: "r"; id: HeapId }
  | { t: "f"; name: string };

export type HeapObj =
  | { kind: "array"; items: Value[]; len: number }
  | { kind: "map"; entries: [Value, Value][]; size: number }
  | { kind: "set"; items: Value[]; size: number }
  | { kind: "object"; className: string; fields: Record<string, Value> };

export type Frame = {
  fn: string;
  /** Parameter names (plus `this` for methods), in order. */
  params: string[];
  /** Variable name -> value, in declaration order. */
  vars: [string, Value][];
  returned?: Value;
};

export type StepEvent = "line" | "loop" | "call" | "return";

export type Step = {
  line: number;
  event: StepEvent;
  /** Outermost first, innermost last. */
  stack: Frame[];
  heap: Record<HeapId, HeapObj>;
};

export type Run = {
  label: string;
  passed: boolean | null;
  steps: Step[];
  truncated: boolean;
  error?: string;
};

export type Trace = {
  runs: Run[];
  error?: string;
  /** Runs dropped because the total step budget ran out. */
  skippedRuns: number;
};
