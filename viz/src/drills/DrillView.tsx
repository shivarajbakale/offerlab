// Practice drills: estimation, failure diagnosis and flashcards. No code panel; the file's
// tests prove the data right, and the screen tests the reader.

import { Alert, Badge, Group, Loader, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { Problem } from "../parseProblem.ts";
import { EstimationDrill } from "./EstimationDrill.tsx";
import { FailureDrill } from "./FailureDrill.tsx";
import { Flashcards } from "./Flashcards.tsx";
import { useDrill } from "./useDrill.ts";
import { DRILL_INTROS, FAILURE_INTRO_PHONE } from "../overviews.ts";
import { usePhone } from "../player/usePhone.ts";
import "./drills.css";

const LEVEL_COLOR: Record<string, string> = { Senior: "indigo", Staff: "red" };
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
        <Group className="title-row" gap="sm" wrap="wrap">
          <Title order={1} className="title">
            <Text span c="dimmed" fw={500} inherit>
              {problem.number}
            </Text>{" "}
            {problem.title}
          </Title>
          {problem.drill && (
            <Badge color="indigo" variant="outline">
              {KIND[problem.drill]}
            </Badge>
          )}
          {problem.level && <Badge color={LEVEL_COLOR[problem.level] ?? "gray"}>{problem.level}</Badge>}
        </Group>
        {problem.drill && (
          <Text className="drill-intro" size="sm" c="dimmed">
            {phone && problem.drill === "failure" ? FAILURE_INTRO_PHONE : DRILL_INTROS[problem.drill]}
          </Text>
        )}
      </header>
      {state.status === "loading" && (
        <Group className="status" gap="sm">
          <Loader size="sm" /> {problem.drill === "failure" ? "Simulating…" : "Loading…"}
        </Group>
      )}
      {result && "error" in result && (
        <Alert className="status" color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
          <pre className="drill-pre">{result.error}</pre>
        </Alert>
      )}
      {drill?.kind === "estimation" && <EstimationDrill key={problem.id} drill={drill} />}
      {drill?.kind === "flashcards" && <Flashcards key={problem.id} deck={drill} deckId={problem.id} onSelect={onSelect} />}
      {drill?.kind === "failure" && failure && <FailureDrill key={problem.id} drill={drill} play={failure} answerTitle={problem.answerTitle} />}
    </main>
  );
}
