import { useMemo } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphPanel } from "../../model/scene.ts";
import { colorOf } from "../colors.ts";
import { NodeTags } from "./NodeTags.tsx";

type SimNode = SimulationNodeDatum & { id: string };

function useLayout(panel: GraphPanel) {
  const ids = panel.nodes.map((n) => n.id).join(",");
  const edges = panel.edges.map((e) => `${e.from}>${e.to}`).join(",");
  return useMemo(() => {
    const n = panel.nodes.length;
    const nodes: SimNode[] = panel.nodes.map((node, i) => ({
      id: node.id,
      x: Math.cos((2 * Math.PI * i) / Math.max(1, n)) * 120,
      y: Math.sin((2 * Math.PI * i) / Math.max(1, n)) * 120,
    }));
    const links = panel.edges
      .filter((e) => nodes.some((x) => x.id === e.from) && nodes.some((x) => x.id === e.to))
      .map((e) => ({ source: e.from, target: e.to }));
    const sim = forceSimulation(nodes)
      .force("link", forceLink<SimNode, { source: string; target: string }>(links).id((d) => d.id).distance(70))
      .force("charge", forceManyBody().strength(-260))
      .force("collide", forceCollide(26))
      .force("center", forceCenter(0, 0))
      // Gentle gravity keeps disconnected components (e.g. originals vs clones) close together.
      .force("x", forceX(0).strength(0.12))
      .force("y", forceY(0).strength(0.12))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    const xs = nodes.map((d) => d.x!);
    const ys = nodes.map((d) => d.y!);
    const minX = Math.min(...xs) - 34;
    const minY = Math.min(...ys) - 40;
    const pos = new Map(nodes.map((d) => [d.id, { x: d.x! - minX, y: d.y! - minY }]));
    return { pos, width: Math.max(...xs) - minX + 34, height: Math.max(...ys) - minY + 30 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, edges]);
}

export function GraphView({ panel }: { panel: GraphPanel }) {
  const { pos, width, height } = useLayout(panel);
  const markerId = `arrow-${panel.key.replace(/\W/g, "")}`;
  return (
    <div className="svg-wrap">
      <svg width={width} height={height}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-2)" />
          </marker>
        </defs>
        {panel.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const r = 18;
          return (
            <line
              key={i}
              className="edge"
              x1={a.x + (dx / len) * r}
              y1={a.y + (dy / len) * r}
              x2={b.x - (dx / len) * (r + 2)}
              y2={b.y - (dy / len) * (r + 2)}
              markerEnd={panel.directed ? `url(#${markerId})` : undefined}
            />
          );
        })}
        {panel.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const inner = n.names.filter((x) => x.inner);
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}>
              <circle
                r={17}
                className={`node-circle ${n.visited ? "visited" : ""} ${n.queued ? "queued" : ""} ${inner.length ? "current" : ""}`}
                style={inner.length ? { stroke: colorOf(inner[0].name) } : undefined}
              />
              <text className="node-text">{n.label}</text>
              <NodeTags names={n.names} y={-26} />
            </g>
          );
        })}
      </svg>
      <div className="empty" style={{ marginTop: 4 }}>
        filled = visited · dashed = in queue/stack
      </div>
    </div>
  );
}
