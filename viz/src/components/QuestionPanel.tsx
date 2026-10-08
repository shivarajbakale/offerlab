// The question first: statement, examples and constraints, then hints one at a time, then the
// solution. Also where the learner marks a problem attempted or solved.

import { Badge, Button, Card, Checkbox, Code, CopyButton, Group, List, Paper, Text, ThemeIcon, Timeline, Title } from "@mantine/core";
import { IconBulb, IconCheck, IconCopy, IconEyeOff, IconLock } from "@tabler/icons-react";
import { Fragment, type ReactNode } from "react";
import { patternById } from "../patterns/index.ts";
import type { Problem } from "../problems.ts";
import { entryOf, HINTS, hideAgain, isRevealed, mark, openHint, setShowAll, type Status } from "../progress.ts";
import { updateProgress, useProgress } from "../useProgress.ts";
import "./panels.css";

/** `code` spans in header prose. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? <Code key={i}>{part.slice(1, -1)}</Code> : <Fragment key={i}>{part}</Fragment>,
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

/** A section's small uppercase heading. */
function Heading({ children }: { children: ReactNode }) {
  return (
    <Title order={4} className="q-heading">
      {children}
    </Title>
  );
}

export function QuestionPanel({ problem, onShowSolution }: { problem: Problem; onShowSolution: () => void }) {
  const progress = useProgress();
  const entry = entryOf(progress, problem.id);
  const revealed = isRevealed(progress, problem.id);
  const hints = hintsFor(problem);
  const shown = revealed ? HINTS : entry.hints;
  const setStatus = (s: Status) => updateProgress((p, now) => mark(p, problem.id, entry.status === s ? undefined : s, now));
  const command = `node --test ${practicePath(problem)}`;

  return (
    <div className="question">
      <section className="q-statement">
        {problem.statement.map((para, i) => (
          <Text key={i} className="q-para">
            <Prose text={para} />
          </Text>
        ))}
      </section>

      {problem.examples.map((ex) => (
        <section key={ex.title} className="q-example">
          <Heading>{ex.title}</Heading>
          <ExampleBody body={ex.body} />
        </section>
      ))}

      {problem.constraints.length > 0 && (
        <section className="q-constraints">
          <Heading>Constraints</Heading>
          <List size="sm" spacing={4}>
            {problem.constraints.map((c) => (
              <List.Item key={c}>
                <Code>{c}</Code>
              </List.Item>
            ))}
          </List>
        </section>
      )}

      <Card component="section" className="q-card" padding="md">
        <Heading>Try it first</Heading>
        <Text size="sm" c="dimmed" mb="xs">
          Solve it in <Code>{practicePath(problem)}</Code>, then run its tests:
        </Text>
        <Group gap="xs" wrap="nowrap" className="q-command">
          <Code className="q-command-text">{command}</Code>
          <CopyButton value={command} timeout={1500}>
            {({ copied, copy }) => (
              <Button
                size="xs"
                variant={copied ? "light" : "default"}
                color={copied ? "green" : undefined}
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                onClick={copy}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </CopyButton>
        </Group>
        <Group gap="xs" mt="md" role="group" aria-label="Your progress">
          <Button
            size="xs"
            variant={entry.status === "attempted" ? "light" : "default"}
            color={entry.status === "attempted" ? "orange" : undefined}
            aria-pressed={entry.status === "attempted"}
            onClick={() => setStatus("attempted")}
          >
            Attempted
          </Button>
          <Button
            size="xs"
            variant={entry.status === "solved" ? "filled" : "default"}
            color={entry.status === "solved" ? "green" : undefined}
            leftSection={entry.status === "solved" ? <IconCheck size={14} /> : undefined}
            aria-pressed={entry.status === "solved"}
            onClick={() => setStatus("solved")}
          >
            I solved it
          </Button>
          {entry.status === "solved" && entry.solvedWith && (
            <Text size="xs" c="dimmed">
              {entry.solvedWith.revealed
                ? "after seeing the solution"
                : entry.solvedWith.hints
                  ? `with ${entry.solvedWith.hints} hint${entry.solvedWith.hints > 1 ? "s" : ""}`
                  : "with no hints"}
            </Text>
          )}
        </Group>
      </Card>

      <Card component="section" className="q-card" padding="md">
        <Heading>Stuck?</Heading>
        {shown > 0 && (
          <Timeline active={shown - 1} bulletSize={22} lineWidth={2} mt="xs" mb="sm">
            {hints.slice(0, shown).map((h, i) => (
              <Timeline.Item
                key={h.label}
                bullet={<Text size="xs" fw={700}>{i + 1}</Text>}
                title={
                  <Badge size="sm" variant="light">
                    Hint {i + 1} · {h.label}
                  </Badge>
                }
              >
                <Text size="sm" mt={4}>
                  {h.body}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
        {!revealed && (
          <Group gap="sm">
            {shown < HINTS && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconBulb size={14} />}
                onClick={() => updateProgress((p, now) => openHint(p, problem.id, now))}
              >
                Show hint {shown + 1} of {HINTS}
              </Button>
            )}
            <Button size="xs" variant={shown < HINTS ? "subtle" : "filled"} color={shown < HINTS ? "gray" : undefined} onClick={onShowSolution}>
              Show solution
            </Button>
          </Group>
        )}
        {revealed && !progress.showAll && (
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconEyeOff size={14} />}
            onClick={() => updateProgress((p, now) => hideAgain(p, problem.id, now))}
          >
            Hide hints and solution to try again
          </Button>
        )}
      </Card>

      <Checkbox
        size="xs"
        checked={progress.showAll}
        onChange={(e) => updateProgress((p) => setShowAll(p, e.currentTarget.checked))}
        label="Always show solutions (skip the try-first step on every problem)"
        c="dimmed"
      />
    </div>
  );
}

/** Stands in for the code, intuition and animation until the solution is revealed. */
export function SolutionHidden({ onShow, onProblem }: { onShow: () => void; onProblem?: () => void }) {
  return (
    <div className="solution-hidden">
      <Paper className="solution-hidden-card" p="xl" radius="lg">
        <ThemeIcon size={44} radius="xl" variant="light" mx="auto" mb="sm">
          <IconLock size={22} />
        </ThemeIcon>
        <Title order={3} size="h4" mb={6}>
          Solution hidden
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Read the problem and try it yourself first. The code, notes and step-by-step animation open when you reveal the solution.
        </Text>
        <Group justify="center" gap="xs">
          {onProblem && (
            <Button variant="default" onClick={onProblem}>
              Back to the problem
            </Button>
          )}
          <Button onClick={onShow}>Show solution</Button>
        </Group>
      </Paper>
    </div>
  );
}
