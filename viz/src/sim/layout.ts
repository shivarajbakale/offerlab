// Where to draw each node of a simulated cluster, and what to write under it.

export type Point = { x: number; y: number };

/** Nodes evenly on a circle, the first one at the top; the client, if any, in the top-left corner. */
export function clusterLayout(ids: string[], w: number, h: number, withClient: boolean): Record<string, Point> {
  const cx = w / 2;
  const cy = h / 2 - 4;
  // Room below each node for its role and a two-line summary.
  const r = Math.min(w, h) / 2 - 62;
  const out: Record<string, Point> = {};
  ids.forEach((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
    out[id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  if (withClient) out.client = { x: 50, y: 34 };
  return out;
}

export const lerp = (a: Point, b: Point, p: number): Point => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });

/** Plain words for the roles nodes report in `state().role`; anything else is shown as written. */
const ROLE_WORDS: Record<string, string> = {
  leader: "leader (main server)",
  follower: "follower (copy)",
  candidate: "candidate (wants votes)",
};

/** Longest line drawn under a node, so neighbours' labels don't run into each other. */
export const LABEL_MAX = 26;

/**
 * What to write under a node: its role in plain words, then its `state().summary` (a short
 * description in words, lines split on " · " or newlines), cut to two lines of LABEL_MAX chars.
 */
export function nodeLabel(state: Record<string, unknown>, up: boolean): { role: string; lines: string[] } {
  const raw = typeof state.role === "string" ? state.role : "";
  const role = up ? (ROLE_WORDS[raw] ?? raw) : raw ? `down (was ${raw})` : "down (crashed)";
  const summary = typeof state.summary === "string" ? state.summary : "";
  const lines = summary
    .split(/\n| · /)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((l) => (l.length > LABEL_MAX ? `${l.slice(0, LABEL_MAX - 1)}…` : l));
  return { role, lines };
}
