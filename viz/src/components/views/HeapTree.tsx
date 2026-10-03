import type { Cell } from "../../model/scene.ts";

/** Binary-heap array drawn as a tree (children of i at 2i+1, 2i+2). */
export function HeapTree({ cells }: { cells: Cell[] }) {
  const n = Math.min(cells.length, 31);
  const levels = Math.ceil(Math.log2(n + 1));
  const width = Math.max(1, 2 ** (levels - 1)) * 40;
  const pos = (i: number) => {
    const level = Math.floor(Math.log2(i + 1));
    const first = 2 ** level - 1;
    const slots = 2 ** level;
    return { x: ((i - first + 0.5) / slots) * width, y: level * 52 + 18 };
  };
  return (
    <div className="svg-wrap" style={{ marginBottom: 12 }}>
      <svg width={width} height={levels * 52}>
        {Array.from({ length: n }, (_, i) =>
          i === 0 ? null : (
            <line key={`e${i}`} className="edge" x1={pos((i - 1) >> 1).x} y1={pos((i - 1) >> 1).y} x2={pos(i).x} y2={pos(i).y} />
          ),
        )}
        {Array.from({ length: n }, (_, i) => (
          <g key={i} transform={`translate(${pos(i).x},${pos(i).y})`}>
            <circle r={15} className={`node-circle ${cells[i].changed ? "changed-node" : ""} ${i === 0 ? "current" : ""}`} />
            <text className="node-text" style={{ fontSize: cells[i].text.length > 3 ? 10 : 13 }}>
              {cells[i].text}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
