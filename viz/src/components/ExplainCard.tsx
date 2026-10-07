import type { Explanation } from "../model/explain.ts";
import { WhyText } from "./WhyText.tsx";

const DID_LABEL: Record<Explanation["did"]["kind"], string> = {
  say: "line",
  call: "call",
  return: "return",
  check: "check",
  change: "changed",
  code: "ran",
};

/**
 * Sits on top of the drawing and says why the step happens: which decision the code faced, the
 * values it read, the reasoning for the way it went, and what is known now. The plain record of
 * what the line changed stays underneath, small.
 */
export function ExplainCard({ ex }: { ex: Explanation }) {
  const d = ex.decision;
  return (
    <section className={`explain ${ex.key ? "key" : ""}`} aria-live="polite">
      {(ex.phase || ex.goal) && (
        <div className="explain-context">
          {ex.phase && <span className="explain-phase">{ex.phase}</span>}
          {ex.goal && (
            <span className="explain-goal">
              <b>Asking:</b> <WhyText text={ex.goal} />
            </span>
          )}
        </div>
      )}
      {d && (
        <div className={`explain-decision ${d.outcome ? "yes" : "no"}`}>
          <code className="cond">{d.cond}</code>
          {d.operands.length > 0 && (
            <span className="operands">
              {d.operands.map((o) => (
                <span key={o.expr} className="operand">
                  <code>{o.expr}</code> = <b>{o.value}</b>
                </span>
              ))}
            </span>
          )}
          <span className="outcome">{d.outcome ? "true" : "false"}</span>
        </div>
      )}
      {ex.why && (
        <p className={`explain-why ${ex.key ? "" : "plain"}`}>
          <WhyText text={ex.why} />
        </p>
      )}
      {ex.returns && (
        <p className="explain-row returns">
          <span className="tag">returns</span>
          <WhyText text={ex.returns} />
        </p>
      )}
      {ex.then && (
        <p className="explain-row then">
          <span className="tag">so now</span>
          <WhyText text={ex.then} />
        </p>
      )}
      {!d && (
        <p className="explain-did">
          <span className="tag">{DID_LABEL[ex.did.kind]}</span>
          <code>{ex.did.text}</code>
        </p>
      )}
    </section>
  );
}
