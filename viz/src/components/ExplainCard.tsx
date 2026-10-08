import { Badge, Code, Paper } from "@mantine/core";
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
    <Paper component="section" className={`explain ${ex.key ? "key" : ""}`} aria-live="polite">
      {(ex.phase || ex.goal) && (
        <div className="explain-context">
          {ex.phase && <Badge className="explain-phase" size="sm">{ex.phase}</Badge>}
          {ex.goal && (
            <span className="explain-goal">
              <b>Asking:</b> <WhyText text={ex.goal} />
            </span>
          )}
        </div>
      )}
      {d && (
        <div className={`explain-decision ${d.outcome ? "yes" : "no"}`}>
          <Code className="cond">{d.cond}</Code>
          {d.operands.length > 0 && (
            <span className="operands">
              {d.operands.map((o) => (
                <span key={o.expr} className="operand">
                  <code>{o.expr}</code> = <b>{o.value}</b>
                </span>
              ))}
            </span>
          )}
          <Badge className="outcome" color={d.outcome ? "green" : "red"} variant="light" ff="monospace">
            {d.outcome ? "true" : "false"}
          </Badge>
        </div>
      )}
      {ex.why && (
        <p className={`explain-why ${ex.key ? "" : "plain"}`}>
          <WhyText text={ex.why} />
        </p>
      )}
      {ex.returns && (
        <p className="explain-row returns">
          <Badge className="tag" color="teal" variant="outline" size="sm">returns</Badge>
          <WhyText text={ex.returns} />
        </p>
      )}
      {ex.then && (
        <p className="explain-row then">
          <Badge className="tag" color="green" variant="outline" size="sm">so now</Badge>
          <WhyText text={ex.then} />
        </p>
      )}
      {!d && (
        <p className="explain-did">
          <Badge className="tag" color="gray" variant="light" size="sm">{DID_LABEL[ex.did.kind]}</Badge>
          <code>{ex.did.text}</code>
        </p>
      )}
    </Paper>
  );
}
