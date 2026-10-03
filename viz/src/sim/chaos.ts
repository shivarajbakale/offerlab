// Plain-words labels for faults injected by the chaos bar.

import type { Fault, SimStep } from "../../../system-design/kernel/types.ts";

export function describeFault(f: Fault): string {
  switch (f.kind) {
    case "crash":
      return `t=${f.at} crash ${f.node}`;
    case "recover":
      return `t=${f.at} restart ${f.node}`;
    case "partition":
      return `t=${f.at} cut off ${f.groups[0].join(", ")}`;
    case "heal":
      return `t=${f.at} heal network`;
    case "drop":
      return `t=${f.at} lose next message`;
    case "delay":
      return `t=${f.at} slow network until t=${f.until}`;
  }
}

/**
 * Whether a chaos replay broke the protocol's safety rule. This is judged by the invariant the
 * scenario checks after every event, not by the scenario's own tests: those check one exact story,
 * which any injected fault is free to change, and broken scenarios pass when the bug appears.
 */
export function chaosVerdict(steps: SimStep[]): { broken: boolean; text: string } {
  const first = steps.find((s) => s.violation);
  return first
    ? { broken: true, text: `⚠ Your faults broke a safety rule at t=${first.t}: ${first.violation}.` }
    : { broken: false, text: "No safety rule was broken." };
}
