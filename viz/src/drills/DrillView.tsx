// Practice drills: estimation, failure diagnosis and flashcards. No code panel; the file's
// tests prove the data right, and the screen tests the reader.

import type { Problem } from "../parseProblem.ts";
import { EstimationDrill } from "./EstimationDrill.tsx";
import { FailureDrill } from "./FailureDrill.tsx";
import { Flashcards } from "./Flashcards.tsx";
import { useDrill } from "./useDrill.ts";
import { DRILL_INTROS, FAILURE_INTRO_PHONE } from "../overviews.ts";
import { usePhone } from "../player/usePhone.ts";
import "./drills.css";

const KIND = { estimation: "Estimation drill", failure: "Failure drill", flashcards: "Flashcards" } as const;

export function DrillView({ problem, onSelect }: { problem: Problem; onSelect: (id: string) => void }) {
  const state = useDrill(problem.id, problem.source);
  const result = state.status === "ready" ? state.result : null;
  const drill = result && "drill" in result ? result.drill : null;
  const failure = drill?.kind === "failure" && result && "play" in result ? result.play : undefined;
  const phone = usePhone();

  return (
    <main className={`main ${failure ? "" : "drill-main"}`}>
      <header className="header">
        <div className="title-row">
          <h1 className="title">
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>{problem.number}</span> {problem.title}
          </h1>
          {problem.drill && <span className="badge drill">{KIND[problem.drill]}</span>}
          {problem.level && <span className={`badge ${problem.level}`}>{problem.level}</span>}
        </div>
        {problem.drill && (
          <p className="drill-intro">
            {phone && problem.drill === "failure" ? FAILURE_INTRO_PHONE : DRILL_INTROS[problem.drill]}
          </p>
        )}
      </header>
      {state.status === "loading" && <div className="status">{problem.drill === "failure" ? "Simulating…" : "Loading…"}</div>}
      {result && "error" in result && <div className="status error">{result.error}</div>}
      {drill?.kind === "estimation" && <EstimationDrill key={problem.id} drill={drill} />}
      {drill?.kind === "flashcards" && <Flashcards key={problem.id} deck={drill} deckId={problem.id} onSelect={onSelect} />}
      {drill?.kind === "failure" && failure && <FailureDrill key={problem.id} drill={drill} play={failure} answerTitle={problem.answerTitle} />}
    </main>
  );
}
