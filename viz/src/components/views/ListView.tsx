import { motion } from "framer-motion";
import type { ListPanel } from "../../model/scene.ts";
import { colorOf } from "../colors.ts";

export function ListView({ panel }: { panel: ListPanel }) {
  return (
    <div className="list">
      {panel.nodes.map((n, i) => {
        const inner = n.names.filter((x) => x.inner);
        return (
          <motion.div key={n.id} layout="position" style={{ display: "flex", alignItems: "flex-end" }}>
            <div className="list-node">
              <div className="list-tags">
                {n.names.slice(0, 3).map((x) => (
                  <span key={x.name} style={{ color: x.inner ? colorOf(x.name) : "var(--muted)" }}>
                    {x.name}
                  </span>
                ))}
              </div>
              <div
                className={[
                  "list-box",
                  n.changed ? "changed" : "",
                  inner.length ? "current" : "",
                  panel.cycleTo === i ? "cycle-target" : "",
                ].join(" ")}
                style={inner.length ? { borderColor: colorOf(inner[0].name) } : undefined}
              >
                {n.label}
              </div>
              {n.extra ? <div className="list-extra">{n.extra}</div> : null}
            </div>
            <div className="list-arrow">→</div>
          </motion.div>
        );
      })}
      <div className="list-end" style={panel.cycleTo !== undefined ? { color: "var(--p3)" } : undefined}>
        {panel.cycleTo !== undefined
          ? `↩ back to ${panel.nodes[panel.cycleTo]?.label} (cycle)`
          : panel.joins
            ? `joins ${panel.joins}`
            : "null"}
      </div>
    </div>
  );
}
