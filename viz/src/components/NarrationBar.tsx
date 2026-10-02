import type { Narration } from "../model/narrate.ts";

const KIND_TEXT: Record<Narration["kind"], string> = {
  say: "why",
  call: "call",
  return: "return",
  check: "check",
  change: "update",
  code: "run",
};

export function NarrationBar({ narration }: { narration: Narration | null }) {
  if (!narration) return <div className="narration" />;
  const cls =
    narration.kind === "check" ? `check ${narration.outcome ? "yes" : "no"}` : narration.kind;
  return (
    <div className="narration">
      <span className={`narration-kind ${cls}`}>{KIND_TEXT[narration.kind]}</span>
      <span className={`narration-text ${narration.kind === "say" ? "say" : ""}`}>{narration.text}</span>
      {narration.check && (
        <span className={`narration-check ${narration.check.outcome ? "yes" : "no"}`}>
          {narration.check.cond} → {String(narration.check.outcome)}
        </span>
      )}
    </div>
  );
}
