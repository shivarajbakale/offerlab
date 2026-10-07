// Two replicas of the same data, one above the other, each as its tree of fingerprints over key
// buckets (or a flat row of bucket fingerprints). A fingerprint that differs from the other
// replica's in the same place is red; the pair the current step looks at is highlighted; a
// fingerprint that just changed flashes; under each leaf is its bucket and how many keys it holds.

import type { MerkleNodeBox, MerklePanel, MerkleReplica } from "../../model/systems/merkle.ts";
import "./MerkleView.css";

const W = 46;
const H = 24;
const GAP_X = 8;
const GAP_Y = 30;
const UNDER = 30;

type Placed = { box: MerkleNodeBox; x: number; y: number };

function depthOf(b: MerkleNodeBox): number {
  return b.children ? 1 + Math.max(depthOf(b.children[0]), depthOf(b.children[1])) : 1;
}

/** Leaves left to right, each parent centred over its two children. */
function place(root: MerkleNodeBox): { nodes: Placed[]; edges: [Placed, Placed][]; width: number; height: number } {
  const nodes: Placed[] = [];
  const edges: [Placed, Placed][] = [];
  let leaf = 0;
  const go = (b: MerkleNodeBox, d: number): Placed => {
    const y = d * (H + GAP_Y);
    if (!b.children) {
      const p = { box: b, x: leaf++ * (W + GAP_X), y };
      nodes.push(p);
      return p;
    }
    const l = go(b.children[0], d + 1);
    const r = go(b.children[1], d + 1);
    const p = { box: b, x: (l.x + r.x) / 2, y };
    nodes.push(p);
    edges.push([p, l], [p, r]);
    return p;
  };
  go(root, 0);
  const depth = depthOf(root);
  return { nodes, edges, width: leaf * (W + GAP_X) - GAP_X, height: (depth - 1) * (H + GAP_Y) + H + UNDER };
}

function cls(b: MerkleNodeBox) {
  return `mk-node ${b.differs ? "differs" : ""} ${b.hot ? "hot" : ""} ${b.changed ? "changed-node" : ""} ${b.found ? "found" : ""}`;
}

function Node({ p }: { p: Placed }) {
  const { box } = p;
  return (
    <g transform={`translate(${p.x},${p.y})`}>
      <title>{box.entries ? `bucket ${box.bucket}: ${box.entries.join(", ") || "no keys"}` : `fingerprint of the two below`}</title>
      <rect width={W} height={H} rx={5} className={cls(box)} />
      <text x={W / 2} y={H / 2} className="mk-hash">
        {box.value}
      </text>
      {box.names.length > 0 && (
        <text x={W / 2} y={-4} className="mk-name">
          {box.names.join(" ")}
        </text>
      )}
      {box.bucket !== undefined && (
        <>
          <text x={W / 2} y={H + 11} className="mk-bucket">
            bucket {box.bucket}
          </text>
          <text x={W / 2} y={H + 23} className={`mk-keys ${box.found ? "found" : ""}`}>
            {box.found ? "resend" : `${box.entries?.length ?? 0} key${box.entries?.length === 1 ? "" : "s"}`}
          </text>
        </>
      )}
    </g>
  );
}

function Tree({ root }: { root: MerkleNodeBox }) {
  const { nodes, edges, width, height } = place(root);
  return (
    <div className="svg-wrap">
      <svg width={width + 4} height={height + 12} viewBox={`-2 -12 ${width + 4} ${height + 12}`}>
        {edges.map(([a, b]) => (
          <line key={`${a.box.id}-${b.box.id}`} x1={a.x + W / 2} y1={a.y + H} x2={b.x + W / 2} y2={b.y} className={`edge ${a.box.hot && b.box.hot ? "mk-hot-edge" : ""}`} />
        ))}
        {nodes.map((p) => (
          <Node key={p.box.id} p={p} />
        ))}
      </svg>
    </div>
  );
}

function Flat({ boxes }: { boxes: MerkleNodeBox[] }) {
  const width = boxes.length * (W + GAP_X) - GAP_X;
  return (
    <div className="svg-wrap">
      <svg width={width + 4} height={H + UNDER + 12} viewBox={`-2 -12 ${width + 4} ${H + UNDER + 12}`}>
        {boxes.map((b, i) => (
          <Node key={i} p={{ box: b, x: i * (W + GAP_X), y: 0 }} />
        ))}
      </svg>
    </div>
  );
}

function Replica({ r }: { r: MerkleReplica }) {
  return (
    <section className="mk-replica">
      <header className="mk-head">
        <span className="mk-title">{r.title}</span>
        <span className="mk-sub">{r.root ? "root: one fingerprint for all its data" : "one fingerprint per bucket, no tree"}</span>
      </header>
      {r.root && <Tree root={r.root} />}
      {r.flat && <Flat boxes={r.flat} />}
    </section>
  );
}

export function MerkleView({ panel }: { panel: MerklePanel }) {
  const a = panel.replicas[0];
  const two = panel.replicas.length > 1;
  return (
    <div className="mk">
      <div className="mk-legend">
        {two && (
          <span>
            <i className="mk-swatch differs" /> differs from the other replica
          </span>
        )}
        <span>
          <i className="mk-swatch hot" /> looked at now
        </span>
        {two && a.compared !== undefined && a.compared > 0 && (
          <span className="mk-count">
            pairs compared: <b>{a.compared}</b>
          </span>
        )}
      </div>
      {panel.replicas.map((r) => (
        <Replica key={r.name} r={r} />
      ))}
    </div>
  );
}
