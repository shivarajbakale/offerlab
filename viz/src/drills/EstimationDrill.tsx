// An estimation drill: the question and its assumptions, the reader's number graded by factor,
// then the worked answer one step at a time, then what to remember.

import { useState } from "react";
import type { Estimation } from "../../../system-design/drills/index.ts";
import { formatQuantity, grade, readEstimate, type Grade } from "./grade.ts";
import { Rich } from "./Rich.tsx";

export function EstimationDrill({ drill }: { drill: Estimation }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Grade | null>(null);
  const [shown, setShown] = useState(0);
  const unit = drill.answer.unit;
  const read = readEstimate(text, unit);
  const value = "value" in read ? read.value : null;
  const valid = value !== null && value > 0;
  const check = () => {
    if (valid) setResult(grade(value, drill.answer.value, drill.tolerance, unit));
  };
  const done = shown >= drill.steps.length;

  return (
    <div className="drill-body">
      <section className="drill-card">
        <p className="drill-prompt">
          <Rich text={drill.prompt} />
        </p>
        <table className="drill-table">
          <thead>
            <tr>
              <th>Assume</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {drill.assumptions.map((a) => (
              <tr key={a.name}>
                <td>
                  {a.note ? <Rich text={a.note} /> : a.name} <span className="drill-name">{a.name}</span>
                </td>
                <td className="num">
                  {formatQuantity(a.value, a.unit === "bytes" ? "bytes" : "")}
                  {a.unit && a.unit !== "bytes" ? ` ${a.unit}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="drill-card">
        <label className="drill-answer">
          <span>Your estimate{unit ? ` (${unit})` : ""}:</span>
          <input
            value={text}
            placeholder={unit === "bytes" ? "e.g. 200TB or 2e14" : "e.g. 12k or 1.2e4"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            aria-invalid={text.trim() !== "" && !valid}
          />
          <button className="drill-btn primary" disabled={!valid} onClick={check}>
            Check
          </button>
          <span className="drill-reading">
            {text.trim() === "" ? `Suffixes: k, M, B (billion), T${unit === "bytes" ? "; KB, MB, GB, TB, PB" : ""}` : valid ? `reads as ${formatQuantity(value, unit)}${unit && unit !== "bytes" ? ` ${unit}` : ""}` : "error" in read ? read.error : "must be above zero"}
          </span>
        </label>
        {result && <div className={`drill-verdict ${result.ok ? "ok" : "bad"}`}>{result.message}</div>}
      </section>

      <section className="drill-card">
        <h3 className="drill-h">Working</h3>
        {shown === 0 && !result && <p className="drill-muted">Make your own estimate first, then compare the working.</p>}
        <ol className="drill-steps">
          {drill.steps.slice(0, shown).map((s) => (
            <li key={s.label}>
              <span className="drill-step-label">{s.label}</span>
              <span className="drill-step-value">
                {formatQuantity(s.value, s.unit === "bytes" ? "bytes" : "")}
                {s.unit !== "bytes" ? ` ${s.unit}` : ""}
              </span>
              <span className="drill-step-how">
                <Rich text={s.how} />
              </span>
            </li>
          ))}
        </ol>
        {!done && (
          <button className="drill-btn" onClick={() => setShown(shown + 1)}>
            {shown === 0 ? "Show the first step" : `Next step (${shown + 1} of ${drill.steps.length})`}
          </button>
        )}
        {done && (
          <>
            <div className="drill-final">
              Answer: <b>{formatQuantity(drill.answer.value, unit)}</b>
              {unit !== "bytes" ? ` ${unit}` : ""} · anything within x{drill.tolerance} counts
            </div>
            <h3 className="drill-h">Takeaways</h3>
            <ul className="drill-takeaways">
              {drill.takeaways.map((t, i) => (
                <li key={i}>
                  <Rich text={t} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
