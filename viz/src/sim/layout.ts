// Where to draw each node of a simulated cluster.

export type Point = { x: number; y: number };

/** Nodes evenly on a circle, the first one at the top; the client, if any, in the top-left corner. */
export function clusterLayout(ids: string[], w: number, h: number, withClient: boolean): Record<string, Point> {
  const cx = w / 2;
  const cy = h / 2 + 6;
  const r = Math.min(w, h) / 2 - 44;
  const out: Record<string, Point> = {};
  ids.forEach((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
    out[id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  if (withClient) out.client = { x: 50, y: 34 };
  return out;
}

export const lerp = (a: Point, b: Point, p: number): Point => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
