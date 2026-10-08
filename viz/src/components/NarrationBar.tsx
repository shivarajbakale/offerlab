import { Badge } from "@mantine/core";
import type { Narration } from "../model/narrate.ts";
import { WhyText } from "./WhyText.tsx";

/** Badge colour per kind: what the step said in words, a branch's outcome, a call, or plain code. */
function kindColor(n: Narration): string {
  if (n.kind === "say") return "indigo";
  if (n.kind === "check") return n.outcome ? "green" : "red";
  if (n.kind === "call" || n.kind === "return") return "teal";
  return "gray";
}

const KIND_TEXT: Record<Narration["kind"], string> = {
  say: "now",
  call: "call",
  return: "return",
  check: "check",
  change: "update",
  code: "run",
};

/**
 * What the current step did, plus (when the problem has line notes) why that line exists.
 * The why row is always rendered for such problems so the bar does not jump in height.
 */
export function NarrationBar({ narration, why, hasNotes }: { narration: Narration | null; why?: string; hasNotes: boolean }) {
  const cls = narration
    ? narration.kind === "check"
      ? `check ${narration.outcome ? "yes" : "no"}`
      : narration.kind
    : "";
  return (
    <div className="narration">
      {narration && (
        <div className="narration-row">
          <Badge className={`narration-kind ${cls}`} color={kindColor(narration)} variant="light" size="md">
            {KIND_TEXT[narration.kind]}
          </Badge>
          <span className={`narration-text ${narration.kind === "say" ? "say" : ""}`}>{narration.text}</span>
          {narration.check && (
            <Badge
              className={`narration-check ${narration.check.outcome ? "yes" : "no"}`}
              color={narration.check.outcome ? "green" : "red"}
              variant="light"
              ff="monospace"
              tt="none"
            >
              {narration.check.cond} → {String(narration.check.outcome)}
            </Badge>
          )}
        </div>
      )}
      {narration && hasNotes && (
        <div className="narration-row">
          <Badge className="narration-kind why" color="orange" variant="outline" size="md">
            why
          </Badge>
          <span className="narration-why">{why ? <WhyText text={why} /> : <span className="none">—</span>}</span>
        </div>
      )}
    </div>
  );
}
