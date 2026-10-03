import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CallNode, CallTree } from "../../model/callTree.ts";
import { layoutTree, type LayoutInput } from "./layout.ts";

const MAX_LABEL = 22;
const clip = (s: string) => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + "…" : s);

/** Recursion tree grown up to the current step. */
export function CallTreeView({ tree, index }: { tree: CallTree; index: number }) {
  const visible = tree.nodes.filter((n) => n.start <= index);
  const active = tree.activeAt[index];
  const onPath = new Set<number>();
  for (let id = active; id !== null && id !== undefined; id = tree.nodes[id].parent) onPath.add(id);

  const compact = visible.length > 90;
  const build = (n: CallNode): LayoutInput<CallNode> => ({
    key: String(n.id),
    data: n,
    children: n.children.filter((c) => tree.nodes[c].start <= index).map((c) => build(tree.nodes[c])),
  });
  const roots = visible.filter((n) => n.parent === null).map(build);
  const longest = Math.max(4, ...visible.map((n) => clip(n.label).length));
  const dx = compact ? 16 : Math.min(170, longest * 6.8 + 18);
  const { nodes, width, height } = layoutTree<CallNode>({ key: "root", data: null, children: roots }, dx, compact ? 34 : 54);
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  // Shrink wide trees to fit (down to 55%), then keep the active call scrolled into view.
  const wrap = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(800);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.max(0.55, Math.min(1, avail / width));
  const activeNode = active !== null && active !== undefined ? byKey.get(String(active)) : undefined;
  useEffect(() => {
    const el = wrap.current;
    if (!el || !activeNode) return;
    const x = activeNode.x * scale;
    if (x < el.scrollLeft + 60 || x > el.scrollLeft + el.clientWidth - 60) {
      el.scrollTo({ left: x - el.clientWidth / 2, behavior: "smooth" });
    }
  }, [activeNode, scale]);

  return (
    <div className="svg-wrap" ref={wrap} style={{ overflowX: "auto", width: "100%" }}>
      <svg
        width={width * scale}
        height={(height - 34) * scale}
        viewBox={`0 34 ${width} ${height - 34}`}
      >
        {nodes.map((n) => {
          const p = n.parentKey ? byKey.get(n.parentKey) : undefined;
          if (!p) return null;
          return (
            <line
              key={`e${n.key}`}
              className="edge"
              x1={p.x}
              y1={p.y + (compact ? 0 : 11)}
              x2={n.x}
              y2={n.y - (compact ? 0 : 11)}
              style={onPath.has(n.data.id) ? { stroke: "var(--accent-line)", strokeWidth: 2 } : undefined}
            />
          );
        })}
        {nodes.map((n) => {
          const c = n.data;
          const done = c.end < index;
          const cls = `call-node ${c.id === active ? "active" : onPath.has(c.id) ? "on-path" : ""} ${done ? "done" : ""}`;
          if (compact) {
            return (
              <g key={n.key} className={cls} transform={`translate(${n.x},${n.y})`}>
                <rect x={-5} y={-5} width={10} height={10} rx={3} />
                <title>{`${c.label}${c.ret !== undefined ? ` → ${c.ret}` : ""}`}</title>
              </g>
            );
          }
          const text = clip(c.label);
          const w = text.length * 6.6 + 14;
          const showRet = c.ret !== undefined && c.retStep !== undefined && c.retStep <= index;
          return (
            <g key={n.key} className={cls} transform={`translate(${n.x},${n.y})`}>
              <rect x={-w / 2} y={-11} width={w} height={22} rx={6} />
              <text>{text}</text>
              {showRet && (
                <text className="ret" y={20}>
                  → {c.ret}
                </text>
              )}
              <title>{c.label}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
