import { useLayoutEffect, useRef, useState } from "react";
import type { GridPanel } from "../../model/scene.ts";
import type { CellDeps } from "./ArrayView.tsx";

// Highlight "land"-like cells in character grids ("1", "#", "X", "Q", "O") and true booleans.
const TINT = new Set(["1", "#", "X", "Q", "O"]);
const tinted = (c: { text: string; str?: boolean }) => (c.str ? TINT.has(c.text) : c.text === "true");

type Arrow = { x1: number; y1: number; x2: number; y2: number };

/**
 * `trail` holds the cells visited or filled so far ("r,c"); `deps` the cells the current line
 * reads and writes, drawn as arrows from each cell read into the cell written.
 */
export function GridView({ panel, trail, deps }: { panel: GridPanel; trail?: Set<string>; deps?: CellDeps }) {
  const cols = Math.max(0, ...panel.rows.map((r) => r.length));
  const longest = Math.max(1, ...panel.rows.flatMap((r) => r.map((c) => c.text.length)), ...(panel.colLabels ?? []).map((l) => l.length));
  const cell = Math.min(56, Math.max(cols > 14 ? 26 : 32, longest * 8 + 12));
  const reads = new Set(deps?.reads.filter((r) => r.length === 2).map((r) => r.join(",")));
  const write = deps?.write?.length === 2 ? deps.write.join(",") : undefined;

  const box = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const arrowKey = write ? `${write}<${[...reads].join("|")}` : "";
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !write || reads.size === 0) {
      setArrows((a) => (a.length ? [] : a));
      return;
    }
    const base = el.getBoundingClientRect();
    const center = (rc: string) => {
      const c = el.querySelector<HTMLElement>(`[data-rc="${rc}"]`)?.getBoundingClientRect();
      return c ? { x: c.left - base.left + c.width / 2, y: c.top - base.top + c.height / 2 } : null;
    };
    const to = center(write);
    const next: Arrow[] = [];
    for (const rc of reads) {
      const from = center(rc);
      if (!from || !to) continue;
      // Stop short of the centers so the arrow sits between the two cells' text.
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      const pad = Math.min(cell * 0.32, d / 3);
      next.push({ x1: from.x + (dx / d) * pad, y1: from.y + (dy / d) * pad, x2: to.x - (dx / d) * pad, y2: to.y - (dy / d) * pad });
    }
    setArrows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrowKey, cell, cols, panel.rows.length]);

  return (
    <div ref={box} style={{ position: "relative", display: "grid", gridTemplateColumns: `minmax(22px, auto) auto`, ["--cell" as string]: `${cell}px` }}>
      <span />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(${cell}px, auto))` }}>
        {Array.from({ length: cols }, (_, c) => (
          <span key={c} className="grid-head" style={{ height: 16 }}>
            {panel.colLabels?.[c] ?? c}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridAutoRows: cell }}>
        {panel.rows.map((_, r) => (
          <span key={r} className="grid-head" style={panel.rowLabels ? { paddingRight: 6, justifyItems: "end" } : undefined}>
            {panel.rowLabels?.[r] ?? r}
          </span>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(${cell}px, auto))` }}>
        {panel.rows.flatMap((row, r) =>
          Array.from({ length: cols }, (_, c) => {
            const v = row[c];
            const rc = `${r},${c}`;
            const isCursor = panel.cursor?.r === r && panel.cursor?.c === c;
            return (
              <div
                key={`${r}-${c}:${v?.text ?? ""}`}
                data-rc={rc}
                className={[
                  "grid-cell",
                  v?.changed ? "changed" : "",
                  v && tinted(v) ? "tint" : "",
                  v?.muted ? "muted" : "",
                  isCursor ? "cursor" : "",
                  trail?.has(rc) && !v?.changed && !isCursor ? "trail" : "",
                  reads.has(rc) ? "dep-read" : "",
                  write === rc ? "dep-write" : "",
                ].join(" ")}
              >
                {v?.text ?? ""}
              </div>
            );
          }),
        )}
      </div>
      {arrows.length > 0 && (
        <svg className="dep-arrows" aria-hidden>
          <defs>
            <marker id="dep-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
          </defs>
          {arrows.map((a, i) => (
            <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} markerEnd="url(#dep-head)" />
          ))}
        </svg>
      )}
    </div>
  );
}
