import { useEffect, useRef, useState } from "react";
import type { Problem } from "../parseProblem.ts";
import { isNoteLine } from "../model/hints.ts";
import { useTokens } from "./highlight.ts";
import { WhyText } from "./WhyText.tsx";
import { scrollWithin } from "./scrollWithin.ts";
import { usePhone } from "../player/usePhone.ts";

export function CodePanel({
  problem,
  activeLine,
  callerLines,
  explain,
}: {
  problem: Problem;
  activeLine: number | null;
  callerLines: number[];
  /** Show every line's note under it instead of on hover. */
  explain: boolean;
}) {
  const { lines, codeStart, codeEnd, why } = problem;
  const tokens = useTokens(problem.id, problem.source);
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  // Phones show no playback, so no line is highlighted as running.
  const phone = usePhone();

  useEffect(() => {
    scrollWithin(ref.current?.querySelector(".code-line.active"), "smooth");
  }, [activeLine, problem.id]);

  useEffect(() => {
    if (pinned === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [pinned]);

  const togglePin = (n: number) => {
    // Selecting code to copy it should not pin a note.
    if (getSelection()?.toString()) return;
    setPinned((p) => (p === n ? null : n));
  };

  const rows = [];
  // Hidden hint lines would leave gaps in the source numbering, so number visible lines 1, 2, 3...
  let shown = 0;
  for (let n = codeStart; n <= codeEnd; n++) {
    // Hint comments are shown elsewhere (narration bar, notes), not as code.
    if (/^\s*\/\/\s*@(viz|rule)\b/.test(lines[n - 1]) || isNoteLine(lines[n - 1])) continue;
    const plain = lines[n - 1].replace(/\s*\/\/\s*@(say|mark|ask|broken|rule|moment)\b.*$/, "");
    let lineTokens = tokens?.[n - 1];
    if (lineTokens && plain.length < lines[n - 1].length) {
      let used = 0;
      lineTokens = lineTokens
        .map((t) => {
          const keep = t.content.slice(0, Math.max(0, plain.length - used));
          used += t.content.length;
          return { ...t, content: keep };
        })
        .filter((t) => t.content);
    }
    shown++;
    const note = why[n];
    const state = phone ? "" : n === activeLine ? "active" : callerLines.includes(n) ? "caller" : "";
    rows.push(
      <div
        key={n}
        className={`code-line ${state} ${note ? "has-why" : ""} ${note && pinned === n && !explain ? "pinned" : ""}`}
        onClick={note && !explain ? () => togglePin(n) : undefined}
      >
        <span className="ln">{shown}</span>
        <span className="why-gutter">
          {note && (
            <button
              className="why-mark"
              aria-label={`Why line ${shown}: ${note}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!explain) togglePin(n);
              }}
            />
          )}
        </span>
        <span>
          {lineTokens
            ? lineTokens.map((t, i) => (
                <span key={i} style={t.htmlStyle as React.CSSProperties}>
                  {t.content}
                </span>
              ))
            : plain}
        </span>
        {note && !explain && (
          <span className="why-pop" role="tooltip">
            <b>Why</b>
            <WhyText text={note} />
          </span>
        )}
      </div>,
    );
    if (note && explain) {
      const indent = plain.match(/^\s*/)![0].length;
      rows.push(
        <div key={`why-${n}`} className={`why-line ${state}`}>
          <span />
          <span />
          {/* Indent in the code font's ch units so the note lines up with its code. */}
          <span style={{ paddingLeft: `${indent}ch` }}>
            <span className="why-note">
              <WhyText text={note} />
            </span>
          </span>
        </div>,
      );
    }
  }
  return (
    <div className={`code ${explain ? "explain" : ""}`} ref={ref}>
      {rows}
    </div>
  );
}
