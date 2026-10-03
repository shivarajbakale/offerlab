import { motion } from "framer-motion";
import type { TrieNodeData, TriePanel } from "../../model/scene.ts";
import { colorOf } from "../colors.ts";
import { layoutTree, type LayoutInput } from "./layout.ts";
import { NodeTags } from "./NodeTags.tsx";

function toLayout(n: TrieNodeData): LayoutInput<TrieNodeData> {
  return { key: String(n.id), data: n, edgeLabel: n.char, children: n.children.map(toLayout) };
}

export function TrieView({ panel }: { panel: TriePanel }) {
  const { nodes, width, height } = layoutTree(toLayout(panel.root), 34, 54);
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return (
    <div className="svg-wrap">
      <svg width={width} height={height}>
        {nodes.map((n) => {
          const p = n.parentKey ? byKey.get(n.parentKey) : undefined;
          if (!p) return null;
          return <line key={`e${n.key}`} className="edge" x1={p.x} y1={p.y} x2={n.x} y2={n.y} />;
        })}
        {nodes.map((n) => {
          const inner = n.data.names.filter((x) => x.inner);
          return (
            <motion.g key={n.key} initial={{ opacity: 0 }} animate={{ opacity: 1, x: n.x, y: n.y }}>
              <circle
                r={13}
                className={`node-circle ${n.data.end ? "end" : ""} ${n.data.changed ? "changed-node" : ""} ${inner.length ? "current" : ""}`}
                style={inner.length ? { stroke: colorOf(inner[0].name) } : undefined}
              />
              <text className="node-text">{n.data.char || "·"}</text>
              <NodeTags names={n.data.names} y={-21} />
            </motion.g>
          );
        })}
      </svg>
      <div className="empty" style={{ marginTop: 4 }}>
        green ring = end of a word
      </div>
    </div>
  );
}
