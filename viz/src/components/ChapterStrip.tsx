// The scenarios of a building block as a story: numbered chapters in the order the lesson tells
// them, each marked as the problem being shown or the design working.

import { ScrollArea, Stepper, Tooltip } from "@mantine/core";
import type { Chapter } from "../sim/lesson.ts";
import "./panels.css";

export function ChapterStrip({ chapters, current, onPick }: { chapters: Chapter[]; current: number; onPick: (run: number) => void }) {
  if (chapters.length < 2) return null;
  const active = Math.max(0, chapters.findIndex((c) => c.run === current));
  return (
    <ScrollArea type="auto" scrollbars="x" className="chapters" aria-label="Scenarios, in the order the lesson tells them" component="nav">
      <Stepper
        active={active}
        onStepClick={(i) => onPick(chapters[i].run)}
        allowNextStepsSelect
        size="xs"
        wrap={false}
        className="chapter-steps"
      >
        {chapters.map((c, i) => (
          <Stepper.Step
            key={c.run}
            color={c.role === "problem" ? "red" : "teal"}
            icon={i + 1}
            completedIcon={i + 1}
            aria-current={c.run === current ? "step" : undefined}
            label={
              <Tooltip label={c.role === "problem" ? "Runs a deliberately flawed version, to show the problem" : "The design doing its job"}>
                <span className={`chapter-role ${c.role}`}>{c.role === "problem" ? "The problem" : "How it works"}</span>
              </Tooltip>
            }
            description={<span className="chapter-title">{c.title}</span>}
          />
        ))}
      </Stepper>
    </ScrollArea>
  );
}
