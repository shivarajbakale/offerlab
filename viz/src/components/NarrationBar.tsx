import type { Narration } from "../model/narrate.ts";
import { WhyText } from "./WhyText.tsx";

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
          <span className={`narration-kind ${cls}`}>{KIND_TEXT[narration.kind]}</span>
          <span className={`narration-text ${narration.kind === "say" ? "say" : ""}`}>{narration.text}</span>
          {narration.check && (
            <span className={`narration-check ${narration.check.outcome ? "yes" : "no"}`}>
              {narration.check.cond} → {String(narration.check.outcome)}
            </span>
          )}
        </div>
      )}
      {narration && hasNotes && (
        <div className="narration-row">
          <span className="narration-kind why">why</span>
          <span className="narration-why">{why ? <WhyText text={why} /> : <span className="none">—</span>}</span>
        </div>
      )}
    </div>
  );
}
