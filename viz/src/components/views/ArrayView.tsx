import { motion } from "framer-motion";
import type { ArrayPanel } from "../../model/scene.ts";
import { colorOf } from "../colors.ts";
import { HeapTree } from "./HeapTree.tsx";
import { arrayCellSize } from "./layout.ts";

const spring = { type: "spring", stiffness: 320, damping: 30 } as const;
const ARC_SPACE = 46;

/** What the window story adds to the main array: ruled-out cells, the best window, arcs room and questions. */
export type ArrayLens = {
  mode: "slide" | "converge";
  best: { l: number; r: number; text: string } | null;
  bestName?: string;
  /** Cells that left the window on this step. */
  justLeft?: [number, number];
  /** Keep room above the cells so arcs coming and going do not shift the drawing. */
  arcRoom: boolean;
  ask?: { name: string; wrong?: number; onPick: (i: number) => void };
};

/** Cells the current line reads and the cell it writes. */
export type CellDeps = { write?: number[]; reads: number[][] };

export function ArrayView({ panel, lens, deps }: { panel: ArrayPanel; lens?: ArrayLens; deps?: CellDeps }) {
  const reads = new Set(deps?.reads.filter((r) => r.length === 1).map((r) => r[0]));
  const write = deps?.write?.length === 1 ? deps.write[0] : undefined;
  const cell = arrayCellSize(panel.len, Math.max(1, ...panel.cells.map((c) => c.text.length)));
  // Stack pointers that share an index so labels do not overlap.
  const rows = new Map<number, number>();
  const placed = panel.pointers.map((p) => {
    const row = rows.get(p.index) ?? 0;
    rows.set(p.index, row + 1);
    return { ...p, row };
  });
  const pointerRows = Math.max(0, ...rows.values());
  const [wl, wr] = panel.window ?? [0, -1];
  const shown = panel.cells.length;
  const dups = new Set(panel.dups ?? []);
  const arcs = panel.arcs ?? [];
  const arcTop = lens?.arcRoom || arcs.length ? ARC_SPACE : 0;
  const ask = lens?.ask;

  const outside = (i: number) => {
    if (!lens || !panel.window) return "";
    if (lens.justLeft && i >= lens.justLeft[0] && i <= lens.justLeft[1]) return "just-left";
    if (i < wl || (lens.mode === "converge" && i > wr)) return "ruled-out";
    if (i > wr) return "ahead";
    return "";
  };

  return (
    <div className="arr" style={{ ["--cell" as string]: `${cell}px`, paddingTop: arcTop }}>
      {panel.heap && shown > 1 && <HeapTree cells={panel.cells} />}
      <div style={{ display: "flex" }}>
        <div style={{ position: "relative" }}>
          <div className="arr-cells">
            {panel.cells.map((c, i) => {
              const pickable = ask !== undefined;
              return (
                <div
                  key={`${i}:${c.text}`}
                  className={[
                    "arr-cell",
                    c.changed ? "changed" : "",
                    c.muted || (panel.letters && c.text === "0") ? "muted" : "",
                    i >= wl && i <= wr ? "in-window" : "",
                    outside(i),
                    dups.has(i) ? "dup" : "",
                    pickable ? "pickable" : "",
                    ask?.wrong === i ? "wrong" : "",
                    reads.has(i) ? "dep-read" : "",
                    write === i ? "dep-write" : "",
                  ].join(" ")}
                  title={pickable ? `Move ${ask.name} to ${i}` : c.text}
                  onClick={pickable ? () => ask.onPick(i) : undefined}
                  role={pickable ? "button" : undefined}
                >
                  {c.text}
                </div>
              );
            })}
            {shown === 0 && <div className="empty">[ ] empty</div>}
            {panel.window && (
              <motion.div
                className={`window ${dups.size ? "broken" : ""}`}
                initial={false}
                animate={{ x: wl * cell - 1, width: (wr - wl + 1) * cell + 1 }}
                transition={spring}
              />
            )}
            {arcs.length > 0 && (
              <svg className="arcs" width={panel.len * cell} height={arcTop} style={{ top: -arcTop }} aria-hidden>
                <defs>
                  <marker id="arc-in" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--bad)" />
                  </marker>
                  <marker id="arc-out" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
                  </marker>
                </defs>
                {arcs.map((a) => {
                  const x1 = a.from * cell + cell / 2;
                  const x2 = a.to * cell + cell / 2;
                  const y = arcTop - 2;
                  const h = Math.min(arcTop - 14, 12 + Math.abs(a.from - a.to) * 5);
                  const color = a.inside ? "var(--bad)" : "var(--muted)";
                  return (
                    <g key={`${a.name}:${a.from}:${a.to}`}>
                      <path
                        d={`M${x1},${y} C${x1},${y - h * 1.3} ${x2},${y - h * 1.3} ${x2},${y}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray={a.inside ? undefined : "4 4"}
                        markerEnd={`url(#${a.inside ? "arc-in" : "arc-out"})`}
                      />
                      <text x={(x1 + x2) / 2} y={y - h - 4} textAnchor="middle" fill={color} fontSize={10} fontWeight={600}>
                        {a.inside ? `${a.name} ${a.to}: inside` : `${a.name} ${a.to}: outside`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
          <div className={`arr-idx ${panel.letters ? "letters" : ""}`}>
            {panel.cells.map((_, i) => (
              <span key={i}>{panel.letters ? String.fromCharCode(97 + i) : i}</span>
            ))}
          </div>
          {pointerRows > 0 && (
            <div className="pointers" style={{ height: pointerRows * 26 + 6 }}>
              {placed.map((p) => (
                <motion.div
                  key={p.name}
                  className="pointer"
                  style={{ color: colorOf(p.name), top: p.row * 26 }}
                  initial={false}
                  animate={{ x: p.index * cell, opacity: p.index < 0 || p.index >= panel.len ? 0.45 : 1 }}
                  transition={spring}
                >
                  <span className="tri" />
                  <span>{p.name}</span>
                </motion.div>
              ))}
            </div>
          )}
          {lens && lens.bestName !== undefined && (
            <div className="best-row">
              {lens.best && (
                <motion.div
                  className="best-bar"
                  initial={false}
                  animate={{ x: lens.best.l * cell + 3, width: Math.max(cell - 6, (lens.best.r - lens.best.l + 1) * cell - 6) }}
                  transition={spring}
                >
                  <span>
                    {lens.bestName} {lens.best.text}
                  </span>
                </motion.div>
              )}
            </div>
          )}
        </div>
        {panel.len > shown && <div className="arr-more">+{panel.len - shown} more</div>}
      </div>
    </div>
  );
}
