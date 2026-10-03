// One simulation step: nodes on a circle with messages on the wire, and every node's state below.

import { motion } from "framer-motion";
import type { SimStep } from "../../../../system-design/kernel/types.ts";
import { clusterLayout, lerp } from "../../sim/layout.ts";
import { fmt, json } from "../../sim/narrate.ts";

const W = 560;
const H = 340;
const R = 30;
const ROLE_FILL: Record<string, string> = { leader: "var(--p0)", candidate: "var(--p1)" };

export function ClusterView({ step, prev, hasClient }: { step: SimStep; prev?: SimStep; hasClient: boolean }) {
  const ids = Object.keys(step.nodes);
  const pos = clusterLayout(ids, W, H, hasClient);
  const at = (id: string) => pos[id] ?? { x: 50, y: 34 };
  const groupOf = (id: string) => step.partitions.findIndex((g) => g.includes(id));
  const isCut = (a: string, b: string) => groupOf(a) >= 0 && groupOf(b) >= 0 && groupOf(a) !== groupOf(b);
  const keys = [...new Set(ids.flatMap((id) => Object.keys(step.nodes[id].state)))];
  const event = step.kind === "deliver" || step.kind === "drop" ? step.msg : undefined;
  const eventAt = event ? lerp(at(event.from), at(event.to), 0.82) : null;

  return (
    <div className="visual cluster">
      {step.violation && <div className="violation">⚠ {step.violation}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} className="cluster-svg" role="img" aria-label="Cluster state">
        {ids.flatMap((a, i) =>
          ids.slice(i + 1).map((b) => (
            <line
              key={`${a}-${b}`}
              x1={pos[a].x}
              y1={pos[a].y}
              x2={pos[b].x}
              y2={pos[b].y}
              className={`link ${isCut(a, b) ? "cut" : ""}`}
            />
          )),
        )}
        {step.inFlight.map((m) => {
          const span = Math.max(1, m.deliverAt - m.sentAt);
          const p = Math.min(1, Math.max(0, (step.t - m.sentAt) / span));
          const { x, y } = lerp(at(m.from), at(m.to), 0.15 + 0.7 * p);
          return (
            <motion.g key={m.id} initial={false} animate={{ x, y }} transition={{ duration: 0.4 }}>
              <circle r={5} className="msg-dot" />
              <text y={-9} className="msg-label">
                {m.type}
              </text>
            </motion.g>
          );
        })}
        {event && eventAt && step.kind === "drop" && (
          <text x={eventAt.x} y={eventAt.y + 5} className="msg-drop">
            ✗
          </text>
        )}
        {event && eventAt && step.kind === "deliver" && (
          <g transform={`translate(${eventAt.x},${eventAt.y})`}>
            <circle r={6} className="msg-dot delivered" />
            <text y={-10} className="msg-label">
              {event.type}
            </text>
          </g>
        )}
        {ids.map((id) => {
          const v = step.nodes[id];
          const role = typeof v.state.role === "string" ? v.state.role : "";
          const term = v.state.term;
          return (
            <g
              key={id}
              transform={`translate(${pos[id].x},${pos[id].y})`}
              className={`sim-node ${v.up ? `role-${role}` : "down"} ${step.node === id ? "active" : ""}`}
            >
              <circle r={R} style={{ fill: v.up ? (ROLE_FILL[role] ?? "var(--panel)") : "var(--panel-2)" }} />
              <text y={-6} className="node-id">
                {id}
              </text>
              <text y={6} className="node-role">
                {v.up ? role : "down"}
              </text>
              {typeof term === "number" && (
                <text y={17} className="node-role">
                  term {term}
                </text>
              )}
            </g>
          );
        })}
        {hasClient && (
          <g transform={`translate(${at("client").x},${at("client").y})`} className={`sim-node client ${step.node === "client" ? "active" : ""}`}>
            <rect x={-30} y={-14} width={60} height={28} rx={6} />
            <text y={4} className="node-role">
              client
            </text>
          </g>
        )}
      </svg>
      <table className="cluster-table">
        <thead>
          <tr>
            <th>node</th>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const v = step.nodes[id];
            const before = prev?.nodes[id]?.state;
            return (
              <tr key={id} className={v.up ? "" : "down"}>
                <th>{id}</th>
                {keys.map((k) => {
                  const changed = before !== undefined && json(before[k]) !== json(v.state[k]);
                  return (
                    <td key={k} className={changed ? "changed" : ""}>
                      {fmt(v.state[k], 32)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
