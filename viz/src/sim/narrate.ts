// The narration bar text and message-log line for each simulation step.

import type { InFlight, SimStep, StepKind } from "../../../system-design/kernel/types.ts";
import type { Narration } from "../model/narrate.ts";

/** JSON that shows Map as an object and Set as an array, instead of `{}`. */
export function json(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x)) ?? "";
}

/** Short display form of a value: strings as is, everything else as JSON, cut at `max` chars. */
export function fmt(v: unknown, max = 48): string {
  const s = v === undefined ? "" : typeof v === "string" ? v : json(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const msgText = (m: InFlight) => `${m.type}${m.body === undefined ? "" : ` ${fmt(m.body)}`}`;
const groups = (s: SimStep, sep: string) => s.partitions.map((g) => `{${g.join(", ")}}`).join(sep);

const DROP_REASON: Record<string, string> = {
  crashed: "the receiver is down",
  partition: "the network is partitioned",
  fault: "an injected drop",
};

/** Fields of `node`'s state that differ between two steps, as "key: old → new". */
export function stateChanges(before: SimStep | undefined, after: SimStep, node: string): string[] {
  const b = before?.nodes[node]?.state;
  const a = after.nodes[node]?.state;
  if (!a) return [];
  return Object.keys(a)
    .filter((key) => !b || json(b[key]) !== json(a[key]))
    .map((key) => (b ? `${key}: ${fmt(b[key], 24)} → ${fmt(a[key], 24)}` : `${key} = ${fmt(a[key], 24)}`));
}

const LOG: Record<StepKind, (s: SimStep) => string> = {
  start: (s) => `${s.node} starts`,
  deliver: (s) => `${s.msg!.from} → ${s.msg!.to}  ${msgText(s.msg!)}`,
  drop: (s) => `✗ ${s.msg!.from} → ${s.msg!.to}  ${s.msg!.type} (${s.dropReason})`,
  timer: (s) => `${s.node} ⏱ ${s.timer}`,
  crash: (s) => `${s.node} crashes`,
  recover: (s) => `${s.node} recovers`,
  partition: (s) => `partition ${groups(s, " | ")}`,
  heal: () => "network heals",
};

/** One-line summary of a step, for the message log. */
export const logLine = (s: SimStep) => LOG[s.kind](s);

const SAY: Record<StepKind, (s: SimStep) => string> = {
  start: (s) => `${s.node} starts`,
  deliver: (s) =>
    s.node === "client"
      ? `client receives ${msgText(s.msg!)} from ${s.msg!.from}`
      : `${s.node} handles ${msgText(s.msg!)} from ${s.msg!.from}`,
  drop: (s) => `${s.msg!.type} from ${s.msg!.from} to ${s.msg!.to} is lost: ${DROP_REASON[s.dropReason!]}`,
  timer: (s) => `${s.node}'s ${s.timer} timer fires`,
  crash: (s) => `${s.node} crashes: its timers stop and messages to it are lost`,
  recover: (s) => `${s.node} restarts with only its durable state`,
  partition: (s) => `the network splits into ${groups(s, " and ")}`,
  heal: () => "the partition heals",
};

/** Narration for step k: the handler's own words if it said any, else the event and its state changes. */
export function narrateSim(steps: SimStep[], k: number): Narration {
  const s = steps[k];
  const changes = s.note || !s.node ? [] : stateChanges(steps[k - 1], s, s.node);
  const head = s.note ?? SAY[s.kind](s);
  const tail = changes.length ? `  ·  ${changes.join(", ")}` : "";
  const problem = s.violation ?? s.error;
  return { kind: s.note ? "say" : "change", text: `${problem ? `⚠ ${problem}. ` : ""}${head}${tail}` };
}

/**
 * The caption over the cluster picture at step k: a broken guarantee first, then the handler's
 * own words (`ctx.say`, which may start with "good:" or "bad:"), else the event in plain words.
 */
export function simCaption(steps: SimStep[], k: number): { tone: "info" | "good" | "bad"; text: string } | null {
  const s = steps[k];
  if (!s) return null;
  const problem = s.violation ?? s.error;
  if (problem) return { tone: "bad", text: `${problem}.${s.note ? ` ${s.note.replace(/^(good|bad):\s*/, "")}` : ""}` };
  if (s.note) {
    const tone = s.note.match(/^(good|bad):\s*/)?.[1] as "good" | "bad" | undefined;
    return { tone: tone ?? "info", text: s.note.replace(/^(good|bad):\s*/, "").replace(/ · (good|bad):\s*/g, " · ") };
  }
  const head = SAY[s.kind](s);
  return { tone: s.kind === "crash" || s.kind === "drop" || s.kind === "partition" ? "bad" : "info", text: head.charAt(0).toUpperCase() + head.slice(1) + "." };
}
