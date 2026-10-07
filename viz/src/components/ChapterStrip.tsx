// The scenarios of a building block as a story: numbered chapters in the order the lesson tells
// them, each marked as the problem being shown or the design working.

import type { Chapter } from "../sim/lesson.ts";

export function ChapterStrip({ chapters, current, onPick }: { chapters: Chapter[]; current: number; onPick: (run: number) => void }) {
  if (chapters.length < 2) return null;
  return (
    <nav className="chapters" aria-label="Scenarios, in the order the lesson tells them">
      {chapters.map((c, i) => (
        <button
          key={c.run}
          className={`chapter ${c.role} ${c.run === current ? "on" : ""}`}
          aria-current={c.run === current ? "step" : undefined}
          onClick={() => onPick(c.run)}
          title={c.role === "problem" ? "Runs a deliberately flawed version, to show the problem" : "The design doing its job"}
        >
          <span className="chapter-role">
            {i + 1}. {c.role === "problem" ? "The problem" : "How it works"}
          </span>
          <span className="chapter-title">{c.title}</span>
        </button>
      ))}
    </nav>
  );
}
