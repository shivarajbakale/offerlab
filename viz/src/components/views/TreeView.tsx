import { motion } from "framer-motion";
import type { TreeNodeData, TreePanel } from "../../model/scene.ts";
import { colorOf } from "../colors.ts";
import { layoutTree, type LayoutInput } from "./layout.ts";
import { NodeTags } from "./NodeTags.tsx";

const spring = { type: "spring", stiffness: 220, damping: 28 } as const;

function toLayout(n: TreeNodeData): LayoutInput<TreeNodeData> {
  const kids: LayoutInput<TreeNodeData>[] = [];
  if (n.left || n.right) {
    kids.push(n.left ? toLayout(n.left) : { key: `ghost-l-${n.id}`, data: null, children: [] });
    kids.push(n.right ? toLayout(n.right) : { key: `ghost-r-${n.id}`, data: null, children: [] });
  }
  return { key: String(n.id), data: n, children: kids };
}

/** From the recursion: nodes whose call is still open (the path down), and what each finished call returned. */
export type TreeLens = { path: Set<number>; done: Map<number, string | undefined> };

export function TreeView({ panel, lens }: { panel: TreePanel; lens?: TreeLens }) {
  const { nodes, width, height } = layoutTree(toLayout(panel.root), 46, 66);
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return (
    <div className="svg-wrap">
      <svg width={width} height={height}>
        {nodes.map((n) => {
          const p = n.parentKey ? byKey.get(n.parentKey) : undefined;
          if (!p) return null;
          return (
            <motion.line
              key={`${p.key}-${n.key}`}
              className={`edge ${lens?.path.has(n.data.id) && lens.path.has(p.data.id) ? "on-path" : ""}`}
              initial={false}
              animate={{ x1: p.x, y1: p.y, x2: n.x, y2: n.y }}
              transition={spring}
            />
          );
        })}
        {nodes.map((n) => {
          const inner = n.data.names.filter((x) => x.inner);
          const onPath = lens?.path.has(n.data.id);
          const done = lens?.done.has(n.data.id) && !onPath;
          const ret = done ? lens!.done.get(n.data.id) : undefined;
          return (
            <motion.g key={n.key} initial={false} animate={{ x: n.x, y: n.y }} transition={spring}>
              <circle
                r={17}
                className={`node-circle ${n.data.changed ? "changed-node" : ""} ${inner.length ? "current" : ""} ${onPath ? "on-path" : ""} ${done ? "done" : ""}`}
                style={inner.length ? { stroke: colorOf(inner[0].name) } : undefined}
              />
              <text className="node-text" style={{ fontSize: n.data.label.length > 3 ? 10 : 13 }}>
                {n.data.label}
              </text>
              <NodeTags names={n.data.names} y={-26} />
              {ret !== undefined && (
                <text className="node-ret" y={31}>
                  ↑ {ret.length > 8 ? ret.slice(0, 7) + "…" : ret}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
