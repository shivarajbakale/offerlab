import { hierarchy, tree } from "d3-hierarchy";

export type Placed<T> = { key: string; data: T; x: number; y: number; parentKey?: string; edgeLabel?: string };

export type LayoutInput<T> = { key: string; data: T | null; edgeLabel?: string; children: LayoutInput<T>[] };

/** Tidy tree layout. Ghost children (data === null) hold left/right slots but are not returned. */
export function layoutTree<T>(root: LayoutInput<T>, dx: number, dy: number) {
  const h = hierarchy(root, (d) => (d.children.length ? d.children : undefined));
  tree<LayoutInput<T>>()
    .nodeSize([dx, dy])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.25))(h);
  const all = h.descendants();
  const minX = Math.min(...all.map((n) => n.x!));
  const maxX = Math.max(...all.map((n) => n.x!));
  const maxY = Math.max(...all.map((n) => n.y!));
  const pad = dx / 2 + 8;
  const nodes: Placed<T>[] = [];
  for (const n of all) {
    if (n.data.data === null) continue;
    nodes.push({
      key: n.data.key,
      data: n.data.data,
      x: n.x! - minX + pad,
      y: n.y! + 34,
      parentKey: n.parent?.data.key,
      edgeLabel: n.data.edgeLabel,
    });
  }
  return { nodes, width: maxX - minX + pad * 2, height: maxY + 70 };
}

/**
 * Width of one array cell, in pixels: smaller for long arrays, wider for long text (about 8 px per
 * character of 13 px monospace, plus padding), so "user:12" is readable. Past 136 px, text is
 * clipped with an ellipsis and shown whole on hover.
 */
export function arrayCellSize(len: number, longest: number): number {
  const base = len > 28 ? 30 : len > 16 ? 36 : 44;
  return Math.max(base, Math.min(136, longest * 8 + 12));
}
