// The question first: statement, examples and constraints, then hints one at a time, then the
// solution. Also where the learner marks a problem attempted or solved.

import { Fragment, useState, type ReactNode } from "react";
import { patternById } from "../patterns/index.ts";
import type { Problem } from "../problems.ts";
import { entryOf, HINTS, hideAgain, isRevealed, mark, openHint, setShowAll, type Status } from "../progress.ts";
import { updateProgress, useProgress } from "../useProgress.ts";

/** `code` spans in header prose. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

/** Example lines with their "Input:" / "Output:" labels set apart. */
function ExampleBody({ body }: { body: string }) {
  return (
    <pre className="q-example-body">
      {body.split("\n").map((line, i) => {
        const m = line.match(/^(Input|Output|Explanation):(\s*)(.*)$/);
        return (
          <div key={i}>
            {m ? (
              <>
                <span className="q-label">{m[1]}:</span>
                {m[2]}
                {m[3]}
              </>
            ) : (
              line || "\n"
            )}
          </div>
        );
      })}
    </pre>
  );
}

function hintsFor(problem: Problem): { label: string; body: ReactNode }[] {
  const names = problem.patterns.map((id) => patternById.get(id)?.name ?? id);
  return [
    {
      label: "Pattern",
      body: names.length ? (
        <>
          This is a <b>{names.join(" + ")}</b> problem. What does that pattern usually keep track of, and what would it let you skip?
        </>
      ) : (
        "Think about which work a brute force repeats, and what you could remember to avoid it."
      ),
    },
    { label: "Key insight", body: problem.insight || "No insight written for this problem yet." },
    {
      label: "Approach",
      body: (
        <>
          <b>{problem.approachName || "Approach"}.</b> {problem.approach} <span className="complexity">{problem.complexity}</span>
        </>
      ),
    },
  ];
}

const practicePath = (problem: Problem) => `practice/${problem.id}.ts`;

export function QuestionPanel({ problem, onShowSolution }: { problem: Problem; onShowSolution: () => void }) {
  const progress = useProgress();
  const entry = entryOf(progress, problem.id);
  const revealed = isRevealed(progress, problem.id);
  const hints = hintsFor(problem);
  const shown = revealed ? HINTS : entry.hints;
  const setStatus = (s: Status) => updateProgress((p, now) => mark(p, problem.id, entry.status === s ? undefined : s, now));
  const command = `node --test ${practicePath(problem)}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="question">
      <section className="q-statement">
        {problem.statement.map((para, i) => (
          <p key={i}>
            <Prose text={para} />
          </p>
        ))}
      </section>

      {problem.examples.map((ex) => (
        <section key={ex.title} className="q-example">
          <h4>{ex.title}</h4>
          <ExampleBody body={ex.body} />
        </section>
      ))}

      {problem.constraints.length > 0 && (
        <section className="q-constraints">
          <h4>Constraints</h4>
          <ul>
            {problem.constraints.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="q-try">
        <h4>Try it first</h4>
        <p>
          Solve it in <code>{practicePath(problem)}</code>, then run its tests:
        </p>
        <div className="q-command">
          <code>{command}</code>
          <button
            className="q-copy"
            onClick={() => {
              navigator.clipboard?.writeText(command).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => {},
              );
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="q-status" role="group" aria-label="Your progress">
          <button className={`q-status-btn attempted ${entry.status === "attempted" ? "on" : ""}`} aria-pressed={entry.status === "attempted"} onClick={() => setStatus("attempted")}>
            Attempted
          </button>
          <button className={`q-status-btn solved ${entry.status === "solved" ? "on" : ""}`} aria-pressed={entry.status === "solved"} onClick={() => setStatus("solved")}>
            I solved it
          </button>
          {entry.status === "solved" && entry.solvedWith && (
            <span className="q-status-note">
              {entry.solvedWith.revealed
                ? "after seeing the solution"
                : entry.solvedWith.hints
                  ? `with ${entry.solvedWith.hints} hint${entry.solvedWith.hints > 1 ? "s" : ""}`
                  : "with no hints"}
            </span>
          )}
        </div>
      </section>

      <section className="q-hints">
        <h4>Stuck?</h4>
        <ol>
          {hints.slice(0, shown).map((h, i) => (
            <li key={h.label} className="q-hint">
              <span className="q-hint-label">
                Hint {i + 1} · {h.label}
              </span>
              <p>{h.body}</p>
            </li>
          ))}
        </ol>
        {!revealed && (
          <div className="q-hint-actions">
            {shown < HINTS && (
              <button className="q-hint-btn" onClick={() => updateProgress((p, now) => openHint(p, problem.id, now))}>
                Show hint {shown + 1} of {HINTS}
              </button>
            )}
            <button
              className={shown < HINTS ? "q-reveal-link" : "q-hint-btn primary"}
              onClick={onShowSolution}
            >
              Show solution
            </button>
          </div>
        )}
        {revealed && !progress.showAll && (
          <button className="q-reveal-link" onClick={() => updateProgress((p, now) => hideAgain(p, problem.id, now))}>
            Hide hints and solution to try again
          </button>
        )}
      </section>

      <label className="q-showall">
        <input type="checkbox" checked={progress.showAll} onChange={(e) => updateProgress((p) => setShowAll(p, e.target.checked))} />
        Always show solutions (skip the try-first step on every problem)
      </label>
    </div>
  );
}

/** Stands in for the code, intuition and animation until the solution is revealed. */
export function SolutionHidden({ onShow, onProblem }: { onShow: () => void; onProblem?: () => void }) {
  return (
    <div className="solution-hidden">
      <div className="solution-hidden-card">
        <h3>Solution hidden</h3>
        <p>Read the problem and try it yourself first. The code, notes and step-by-step animation open when you reveal the solution.</p>
        <div className="solution-hidden-actions">
          {onProblem && (
            <button className="q-hint-btn" onClick={onProblem}>
              Back to the problem
            </button>
          )}
          <button className="q-hint-btn primary" onClick={onShow}>
            Show solution
          </button>
        </div>
      </div>
    </div>
  );
}
