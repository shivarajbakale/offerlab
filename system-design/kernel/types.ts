// Shared format of a simulation run: produced by the kernel, drawn by the visualizer.

export type NodeId = string;

export type Msg = { from: NodeId; to: NodeId; type: string; body: unknown };

/** A message on the wire. Client requests are sent by "client" and arrive with no latency. */
export type InFlight = Msg & { id: number; sentAt: number; deliverAt: number };

export type Fault =
  | { at: number; kind: "crash" | "recover"; node: NodeId }
  | { at: number; kind: "partition"; groups: NodeId[][] }
  | { at: number; kind: "heal" }
  | { at: number; kind: "drop"; from?: NodeId; to?: NodeId; type?: string; count: number }
  | { at: number; kind: "delay"; extra: number; until: number };

export type ClientOp = { at: number; to: NodeId; type: string; body?: unknown };

export type StepKind = "start" | "deliver" | "drop" | "timer" | "crash" | "recover" | "partition" | "heal";
export type DropReason = "crashed" | "partition" | "fault";
export type NodeView = { up: boolean; state: Record<string, unknown> };

export type SimStep = {
  t: number;
  kind: StepKind;
  /** Where the event happened ("client" for replies delivered to the client). */
  node?: NodeId;
  msg?: InFlight;
  timer?: string;
  /** Method that ran, e.g. "onRequestVote". */
  handler?: string;
  /** Class of the node whose handler ran, so the code panel can show an overriding subclass. */
  className?: string;
  dropReason?: DropReason;
  nodes: Record<NodeId, NodeView>;
  /** Messages still on the wire after this event, soonest first. */
  inFlight: InFlight[];
  partitions: NodeId[][];
  note?: string;
  violation?: string;
  error?: string;
};

export type SimRun = { label: string; passed: boolean | null; steps: SimStep[]; truncated: boolean; error?: string };
export type SimTrace = { runs: SimRun[]; error?: string };
