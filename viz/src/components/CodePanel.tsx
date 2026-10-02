import { useEffect, useRef } from "react";
import type { Problem } from "../problems.ts";
import { useTokens } from "./highlight.ts";

export function CodePanel({
  problem,
  activeLine,
  callerLines,
}: {
  problem: Problem;
  activeLine: number | null;
  callerLines: number[];
}) {
  const { lines, codeStart, codeEnd } = problem;
  const tokens = useTokens(problem.id, problem.source);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector(".code-line.active");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeLine, problem.id]);

  const rows = [];
  for (let n = codeStart; n <= codeEnd; n++) {
    // Hint comments are shown in the narration bar, not in the code.
    if (/^\s*\/\/\s*@viz\b/.test(lines[n - 1])) continue;
    const plain = lines[n - 1].replace(/\s*\/\/\s*@say\b.*$/, "");
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
    rows.push(
      <div
        key={n}
        className={`code-line ${n === activeLine ? "active" : callerLines.includes(n) ? "caller" : ""}`}
      >
        <span className="ln">{n}</span>
        <span>
          {lineTokens
            ? lineTokens.map((t, i) => (
                <span key={i} style={t.htmlStyle as React.CSSProperties}>
                  {t.content}
                </span>
              ))
            : plain}
        </span>
      </div>,
    );
  }
  return (
    <div className="code" ref={ref}>
      {rows}
    </div>
  );
}
