// A B+ tree, level by level: each page is a box of keys, leaves sit on the bottom row with
// their values under the keys, and arrows between leaves show the leaf links. Pages the
// current operation has read are hot and labelled with their place in the read order; pages
// whose contents changed flash. Each row is named (root, inner, leaves), and a legend says that
// one box is one disk read, with the read count so far when the hint gives one.

import { motion } from "framer-motion";
import type { PageBox, PagesPanel } from "../../model/systems/pages.ts";
import { colorOf } from "../colors.ts";
import "./PagesView.css";

const KEY_W = 24;
const PAD = 5;
const H = 28;
const VAL_H = 16;
const GAP_X = 14;
const GAP_Y = 54;
const TOP = 6;
const DETACHED_GAP = 40;
/** Room on the left for the row names. */
const GUTTER = 62;
const spring = { type: "spring", stiffness: 220, damping: 28 } as const;

type Placed = { box: PageBox; x: number; y: number; w: number };

const widthOf = (b: PageBox) => Math.max(1, b.keys.length) * KEY_W + 2 * PAD;

/** Lays out one tree with its top-left at (x0, y0): leaves left to right, each inner page centred over its children. */
function placeTree(levels: PageBox[][], x0: number, y0: number, placed: Map<number, Placed>) {
  const leafRow = levels.length - 1;
  const rowY = (r: number) => y0 + r * (H + GAP_Y);
  let x = x0;
  for (const b of levels[leafRow] ?? []) {
    const w = widthOf(b);
    placed.set(b.id, { box: b, x, y: rowY(leafRow), w });
    x += w + GAP_X;
  }
  let right = Math.max(x0, x - GAP_X);
  for (let r = leafRow - 1; r >= 0; r--) {
    let cursor = x0;
    for (const b of levels[r]) {
      const w = widthOf(b);
      const kids = (b.children ?? []).map((id) => placed.get(id)).filter((p): p is Placed => Boolean(p));
      let px = kids.length ? (kids[0].x + kids.at(-1)!.x + kids.at(-1)!.w) / 2 - w / 2 : cursor;
      px = Math.max(px, cursor);
      placed.set(b.id, { box: b, x: px, y: rowY(r), w });
      cursor = px + w + GAP_X;
      right = Math.max(right, px + w);
    }
  }
  const hasValues = (levels[leafRow] ?? []).some((b) => b.values?.length);
  return { right, bottom: rowY(Math.max(0, leafRow)) + H + (hasValues ? VAL_H + 6 : 0) };
}

/** Detached pages grouped into subtrees (a page split off with its children), each as levels. */
function detachedTrees(detached: PageBox[]): PageBox[][][] {
  const byId = new Map(detached.map((b) => [b.id, b]));
  const isChild = new Set(detached.flatMap((b) => b.children ?? []));
  return detached
    .filter((b) => !isChild.has(b.id))
    .map((root) => {
      const levels: PageBox[][] = [];
      let row = [root];
      while (row.length) {
        levels.push(row);
        row = row.flatMap((b) => (b.children ?? []).map((id) => byId.get(id)).filter((c): c is PageBox => Boolean(c)));
      }
      return levels;
    });
}

/** The tree on top, then any detached subtrees side by side in a strip below. */
function layout(levels: PageBox[][], detached: PageBox[]) {
  const placed = new Map<number, Placed>();
  const main = placeTree(levels, GUTTER, TOP, placed);
  let width = main.right;
  let height = main.bottom + 4;
  let stripY: number | undefined;
  if (detached.length) {
    stripY = main.bottom + DETACHED_GAP;
    let x = GUTTER;
    let bottom = stripY;
    for (const tree of detachedTrees(detached)) {
      const t = placeTree(tree, x, stripY, placed);
      x = t.right + GAP_X * 2;
      bottom = Math.max(bottom, t.bottom);
    }
    width = Math.max(width, x - GAP_X * 2);
    height = bottom + 4;
  }
  return { placed, width, height, stripY };
}

function Page({ p }: { p: Placed }) {
  const { box, w } = p;
  return (
    <motion.g initial={false} animate={{ x: p.x, y: p.y }} transition={spring}>
      <rect width={w} height={H} rx={6} className={`pg-box ${box.leaf ? "leaf" : ""} ${box.hot ? "hot" : ""} ${box.changed ? "changed-node" : ""}`} />
      {box.keys.map((k, i) => (
        <g key={i}>
          {i > 0 && <line x1={PAD + i * KEY_W} x2={PAD + i * KEY_W} y1={5} y2={H - 5} className="pg-sep" />}
          <text x={PAD + i * KEY_W + KEY_W / 2} y={H / 2} className="pg-key">
            {k}
          </text>
        </g>
      ))}
      {box.values?.map((v, i) => (
        <text key={`v${i}`} x={PAD + i * KEY_W + KEY_W / 2} y={H + VAL_H / 2 + 4} className="pg-val">
          {v.length > 4 ? `${v.slice(0, 3)}…` : v}
        </text>
      ))}
      <text x={w / 2} y={-6} className="pg-id">
        p{box.id}
        {box.reads && <tspan className="pg-read"> read {box.reads.join(",")}</tspan>}
        {box.names.map((n) => (
          <tspan key={n} className="pg-name" fill={colorOf(n)}>
            {" "}
            {n}
          </tspan>
        ))}
      </text>
    </motion.g>
  );
}

/** The name of tree row r of n. */
function rowName(r: number, n: number): string {
  if (n === 1) return "root = leaf";
  if (r === 0) return "root";
  return r === n - 1 ? "leaves" : "inner";
}

export function PagesView({ panel }: { panel: PagesPanel }) {
  return (
    <div className="pg-wrap">
      <div className="pg-legend">
        <span>Each box is one page on disk: opening it costs one disk read. Leaves hold the values; arrows link each leaf to the next.</span>
        {panel.reads !== undefined && (
          <span className="pg-count">
            disk reads: <b>{panel.reads}</b>
          </span>
        )}
      </div>
      <PagesSvg panel={panel} />
    </div>
  );
}

function PagesSvg({ panel }: { panel: PagesPanel }) {
  const { placed, width, height, stripY } = layout(panel.levels, panel.detached ?? []);
  const all = [...placed.values()];
  const n = panel.levels.length;
  return (
    <div className="svg-wrap pg">
      <svg width={width + 8} height={height + 14} viewBox={`-4 -14 ${width + 8} ${height + 14}`}>
        <defs>
          <marker id="pg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="pg-arrowhead" />
          </marker>
        </defs>
        {all.flatMap((p) =>
          (p.box.children ?? []).map((cid, i) => {
            const c = placed.get(cid);
            if (!c) return null;
            const n = p.box.children!.length;
            // Each child hangs from the gap between keys that bounds its range.
            const fromX = p.x + PAD + (n > 1 ? (i * (p.w - 2 * PAD)) / (n - 1) : p.w / 2 - PAD);
            const hot = p.box.hot && c.box.hot;
            return (
              <motion.line
                key={`${p.box.id}-${cid}`}
                initial={false}
                animate={{ x1: fromX, y1: p.y + H, x2: c.x + c.w / 2, y2: c.y }}
                transition={spring}
                className={`edge ${hot ? "pg-hot-edge" : ""}`}
              />
            );
          }),
        )}
        {all
          .filter((p) => p.box.next !== undefined && placed.has(p.box.next))
          .map((p) => {
            const n = placed.get(p.box.next!)!;
            return (
              <motion.line
                key={`next-${p.box.id}`}
                initial={false}
                animate={{ x1: p.x + p.w + 2, y1: p.y + H / 2, x2: n.x - 3, y2: n.y + H / 2 }}
                transition={spring}
                className="pg-link"
                markerEnd="url(#pg-arrow)"
              />
            );
          })}
        {panel.levels.map((_, r) => (
          <text key={`row${r}`} x={0} y={TOP + r * (H + GAP_Y) + H / 2} className="pg-row">
            {rowName(r, n)}
          </text>
        ))}
        {stripY !== undefined && (
          <text x={GUTTER} y={stripY - 22} className="pg-strip">
            not linked into the tree yet
          </text>
        )}
        {all.map((p) => (
          <Page key={p.box.id} p={p} />
        ))}
      </svg>
    </div>
  );
}
