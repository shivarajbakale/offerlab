import type { NodeName } from "../../model/scene.ts";
import { colorOf } from "../colors.ts";

/** Variable names pointing at a node, drawn above it in SVG. */
export function NodeTags({ names, y }: { names: NodeName[]; y: number }) {
  if (!names.length) return null;
  const shown = names.slice(0, 3);
  return (
    <text className="node-tag" y={y}>
      {shown.map((n, i) => (
        <tspan key={n.name} fill={n.inner ? colorOf(n.name) : "var(--muted)"}>
          {i ? " " : ""}
          {n.name}
        </tspan>
      ))}
      {names.length > 3 ? <tspan fill="var(--muted)"> …</tspan> : null}
    </text>
  );
}
