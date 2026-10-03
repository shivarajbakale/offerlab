// Every event of the run as one line; the current one is highlighted and clicking jumps there.

import { useEffect, useRef } from "react";
import type { SimStep } from "../../../../system-design/kernel/types.ts";
import { logLine } from "../../sim/narrate.ts";

/** Rows rendered either side of the current step, so long runs stay cheap. */
const WINDOW = 150;

export function MessageLog({ steps, index, onJump }: { steps: SimStep[]; index: number; onJump: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(".log-row.active")?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const from = Math.max(0, index - WINDOW);
  const rows = steps.slice(from, Math.min(steps.length, index + WINDOW));
  return (
    <div className="msglog" ref={ref}>
      {rows.map((s, j) => {
        const i = from + j;
        return (
          <button
            key={i}
            className={`log-row ${s.kind} ${i === index ? "active" : ""} ${i > index ? "future" : ""}`}
            onClick={() => onJump(i)}
          >
            <span className="log-t">t={s.t}</span>
            <span>{logLine(s)}</span>
            {s.violation && <span className="log-warn">⚠ {s.violation}</span>}
          </button>
        );
      })}
    </div>
  );
}
