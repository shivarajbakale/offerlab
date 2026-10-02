import { motion } from "framer-motion";
import type { ArrayPanel } from "../../model/scene.ts";
import { colorOf } from "../colors.ts";
import { HeapTree } from "./HeapTree.tsx";

const spring = { type: "spring", stiffness: 320, damping: 30 } as const;

export function ArrayView({ panel }: { panel: ArrayPanel }) {
  const cell = panel.len > 28 ? 30 : panel.len > 16 ? 36 : 44;
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

  return (
    <div className="arr" style={{ ["--cell" as string]: `${cell}px` }}>
      {panel.heap && shown > 1 && <HeapTree cells={panel.cells} />}
      <div style={{ display: "flex" }}>
        <div style={{ position: "relative" }}>
          <div className="arr-cells">
            {panel.cells.map((c, i) => (
              <div
                key={`${i}:${c.text}`}
                className={[
                  "arr-cell",
                  c.changed ? "changed" : "",
                  c.muted ? "muted" : "",
                  i >= wl && i <= wr ? "in-window" : "",
                ].join(" ")}
                title={c.text}
              >
                {c.text}
              </div>
            ))}
            {shown === 0 && <div className="empty">[ ] empty</div>}
            {panel.window && (
              <motion.div
                className="window"
                initial={false}
                animate={{ x: wl * cell - 1, width: (wr - wl + 1) * cell + 1 }}
                transition={spring}
              />
            )}
          </div>
          <div className="arr-idx">
            {panel.cells.map((_, i) => (
              <span key={i}>{i}</span>
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
        </div>
        {panel.len > shown && <div className="arr-more">+{panel.len - shown} more</div>}
      </div>
    </div>
  );
}
