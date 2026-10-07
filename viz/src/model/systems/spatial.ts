// SpatialView data: rectangles (geohash cells, quadtree nodes), points and a query box.
//
// `@viz spatial:<rects>,<points>,<query>` reads two data shapes:
// - geohash: rects are an array of `{ x0, y0, x1, y1, label }` (x = longitude, y = latitude) and
//   points an array of `{ lat, lon, name }` or `{ x, y, label }`;
// - quadtree: rects and points both come from a recursive node `{ x0, y0, x1, y1, points,
//   children }`, flattened here; every node is marked as used so it is not drawn again.
// The query is a rect, or `{ box, visited, found }`: visited rects and found points are hot.
// An argument may list alternatives, `trail|cells`: the first one that is in scope and not null
// is drawn. A `lat`/`lon` pair of locals in the innermost frame is drawn as a marker, and a local `node`
// that is one of the drawn rects is outlined as the one being looked at.
//
// Options (`key=value` after the three names; `_` stands for a space) make the plane read as a map:
// - dot=driver      what one point is, for the key and the counts ("3 drivers");
// - pin=you         what the marker is. A string local `name` in any frame (a place being
//                   added) wins over it. With a pin and no lat/lon, the query box's centre is
//                   drawn as the pin: the person asking.
// - scale=geo|<m>   coordinates are degrees (geo) or this many metres per unit, for a scale bar;
// - map=city        streets in the background while the view is no wider than a city.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Builder } from "./types.ts";

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type SpatialPanel = {
  kind: "spatial";
  key: string;
  name: string;
  /** The square region of the plane the view shows. */
  bounds: Rect;
  rects: (Rect & { label?: string; hot?: boolean; focus?: boolean; id?: HeapId; leaf?: boolean })[];
  points: { x: number; y: number; label?: string; hot?: boolean; id?: HeapId }[];
  query?: Rect;
  /** The query is a search's area (`{ box, ... }`), not just a rect such as the cell kept so far. */
  search?: boolean;
  /** The location being encoded or searched from, or the person asking. */
  marker?: { x: number; y: number; label?: string };
  /** Real-world names and distances, from the hint's options. */
  world?: {
    /** What one point is ("driver"); "point" when not given. */
    dot: string;
    /** Metres per unit along x and y, for the scale bar. */
    metres?: { x: number; y: number };
    /** Coordinates are degrees: the equator and the Greenwich meridian can be drawn. */
    geo?: boolean;
    /** Draw streets: the view is a city map. */
    city?: boolean;
  };
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x) && !(x instanceof Map) && !(x instanceof Set);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const idOf = (o: Obj) => (typeof o.__id === "number" ? o.__id : undefined);

function asRect(o: unknown): Rect | undefined {
  if (!isObj(o)) return undefined;
  const [x0, y0, x1, y1] = [num(o.x0), num(o.y0), num(o.x1), num(o.y1)];
  return x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined ? undefined : { x0, y0, x1, y1 };
}

function asPoint(o: unknown): SpatialPanel["points"][number] | undefined {
  if (!isObj(o)) return undefined;
  const x = num(o.x) ?? num(o.lon);
  const y = num(o.y) ?? num(o.lat);
  if (x === undefined || y === undefined) return undefined;
  const name = typeof o.label === "string" ? o.label : typeof o.name === "string" ? o.name : undefined;
  // A geohash next to the name shows which points share a prefix.
  const label = name && typeof o.hash === "string" ? `${name} ${o.hash}` : name;
  return { x, y, ...(label ? { label } : {}), ...(idOf(o) !== undefined ? { id: idOf(o) } : {}) };
}

const isTree = (o: unknown): o is Obj => isObj(o) && asRect(o) !== undefined && ("children" in o || "points" in o);

/** Every node of a quadtree, parents before children. */
function flatten(node: Obj, out: Obj[] = [], depth = 0): Obj[] {
  out.push(node);
  if (depth < 24 && Array.isArray(node.children)) for (const c of node.children) if (isTree(c)) flatten(c, out, depth + 1);
  return out;
}

/** Heap ids of a value and, recursively, of everything it reaches (bounded). */
function reach(step: Step, v: Value | undefined, out: Set<HeapId>, depth = 0) {
  if (v?.t !== "r" || out.has(v.id) || depth > 14) return;
  const o = step.heap[v.id];
  if (!o) return;
  out.add(v.id);
  const kids = o.kind === "object" ? Object.values(o.fields) : o.kind === "map" ? o.entries.flat() : o.items;
  for (const k of kids) reach(step, k, out, depth + 1);
}

/** Like ctx.js, but deep enough for a quadtree (each tree level is two levels of nesting). */
function deepJs(step: Step, v: Value | undefined, depth = 0): unknown {
  if (!v || depth > 48) return undefined;
  if (v.t === "p") return v.v;
  if (v.t === "f") return undefined;
  const o = step.heap[v.id];
  if (!o) return undefined;
  if (o.kind === "array") return o.items.map((x) => deepJs(step, x, depth + 1));
  if (o.kind !== "object") return undefined;
  const out: Record<string, unknown> = { __id: v.id };
  for (const [k, x] of Object.entries(o.fields)) out[k] = deepJs(step, x, depth + 1);
  return out;
}

const contains = (a: Rect, b: Rect) => a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;

/** A square frame around `r`, padded by `pad` of its larger side. */
function square(r: Rect, pad: number): Rect {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const half = (Math.max(r.x1 - r.x0, r.y1 - r.y0, 1e-9) * (1 + 2 * pad)) / 2;
  return { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half };
}

const spaced = (s: string | undefined) => s?.replace(/_/g, " ");
/** Metres in one degree of latitude (and of longitude at the equator). */
const DEGREE_M = 111_320;

export const buildSpatial: Builder<SpatialPanel> = (ctx) => {
  const opts = Object.fromEntries(ctx.args.filter((a) => a.includes("=")).map((a) => a.split("=", 2) as [string, string]));
  const [rectArg, pointArg, queryArg] = ctx.args.filter((a) => !a.includes("="));
  const pick = (arg: string | undefined): [string, Value | undefined] => {
    for (const name of arg?.split("|") ?? []) {
      const v = ctx.find(name);
      if (v !== undefined && !(v.t === "p" && v.v == null)) return [name, v];
    }
    return [arg?.split("|")[0] ?? "", undefined];
  };
  const [rectName, rv] = pick(rectArg);
  const [pointName, pv] = pick(pointArg);
  const [, qv] = pick(queryArg);
  const rawRects = deepJs(ctx.step, rv);
  const rawPoints = pv?.t === "r" && rv?.t === "r" && pv.id === rv.id ? rawRects : deepJs(ctx.step, pv);
  const rawQuery = deepJs(ctx.step, qv);
  const tree = isTree(rawRects) ? rawRects : undefined;
  if (!tree && !Array.isArray(rawRects) && !Array.isArray(rawPoints)) return null;

  const uses = new Set<HeapId>();
  // A quadtree is drawn whole, so everything it reaches is used. A list only uses itself and its items.
  for (const v of [rv, pv]) {
    if (v?.t !== "r") continue;
    if (tree) reach(ctx.step, v, uses);
    else {
      const o = ctx.step.heap[v.id];
      uses.add(v.id);
      if (o?.kind === "array") for (const x of o.items) if (x.t === "r") uses.add(x.id);
    }
  }
  // Alternatives not chosen (an empty `cells` while a `trail` is drawn) belong to this view too.
  for (const arg of [rectArg, pointArg, queryArg]) {
    for (const name of arg?.split("|") ?? []) {
      const v = ctx.find(name);
      if (v?.t !== "r" || [rv, pv, qv].some((x) => x?.t === "r" && x.id === v.id)) continue;
      const o = ctx.step.heap[v.id];
      uses.add(v.id);
      if (o?.kind === "array") for (const x of o.items) if (x.t === "r") uses.add(x.id);
    }
  }
  if (qv?.t === "r") {
    const o = ctx.step.heap[qv.id];
    uses.add(qv.id);
    if (o?.kind === "object") for (const f of ["box", "visited", "found"]) if (o.fields[f]?.t === "r") uses.add((o.fields[f] as { id: HeapId }).id);
  }

  const nodes = tree ? flatten(tree) : Array.isArray(rawRects) ? rawRects.filter(isObj) : [];
  const pointObjs = isTree(rawPoints)
    ? flatten(rawPoints).flatMap((n) => (Array.isArray(n.points) ? n.points : []))
    : Array.isArray(rawPoints)
      ? rawPoints
      : [];

  const q = isObj(rawQuery) ? rawQuery : undefined;
  const box = asRect(q?.box) ?? asRect(q);
  const ids = (list: unknown) => new Set((Array.isArray(list) ? list : []).filter(isObj).map(idOf).filter((x) => x !== undefined));
  const visited = ids(q?.visited);
  const found = ids(q?.found);

  const inner = ctx.step.stack.at(-1);
  const local = (name: string) => inner?.vars.find(([n]) => n === name)?.[1];
  const focusVal = ctx.js(local("node"));
  const focusId = isObj(focusVal) ? idOf(focusVal) : undefined;
  const lat = num(ctx.js(local("lat")));
  const lon = num(ctx.js(local("lon")));
  // A place being added names the marker; otherwise it is the pin option ("you").
  let named: string | undefined;
  for (let f = ctx.step.stack.length - 1; f >= 0 && named === undefined; f--) {
    const v = ctx.step.stack[f].vars.find(([n]) => n === "name")?.[1];
    if (v?.t === "p" && typeof v.v === "string") named = v.v;
  }

  const rects = nodes.flatMap((n) => {
    const r = asRect(n);
    if (!r) return [];
    const id = idOf(n);
    return [
      {
        ...r,
        ...(typeof n.label === "string" ? { label: n.label } : {}),
        hot: id !== undefined && visited.has(id),
        ...(id !== undefined && id === focusId ? { focus: true } : {}),
        ...(id !== undefined ? { id } : {}),
        ...(tree ? { leaf: !Array.isArray(n.children) || n.children.length === 0 } : {}),
      },
    ];
  });
  const points = pointObjs.flatMap((o) => {
    const p = asPoint(o);
    return p ? [{ ...p, hot: p.id !== undefined && found.has(p.id) }] : [];
  });
  const pin = spaced(opts.pin);
  const markLabel = named ?? pin;
  const marker =
    lat !== undefined && lon !== undefined
      ? { x: lon, y: lat, ...(markLabel ? { label: markLabel } : {}) }
      : pin && box
        ? { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, label: pin }
        : undefined;

  let bounds: Rect;
  const rootRect = tree ? asRect(tree) : undefined;
  const chain = !tree && rects.length >= 2 && rects.every((r, i) => i === 0 || contains(rects[i - 1], r));
  if (rootRect) bounds = rootRect;
  else if (chain) {
    // Frame the last cell's parent, plus any point close enough to it to matter (one across an edge).
    const parent = rects[rects.length - 2];
    const mx = (parent.x1 - parent.x0) / 2;
    const my = (parent.y1 - parent.y0) / 2;
    const near = points.filter((p) => p.x >= parent.x0 - mx && p.x <= parent.x1 + mx && p.y >= parent.y0 - my && p.y <= parent.y1 + my);
    const u = near.reduce(
      (a, p) => ({ x0: Math.min(a.x0, p.x), y0: Math.min(a.y0, p.y), x1: Math.max(a.x1, p.x), y1: Math.max(a.y1, p.y) }),
      { x0: parent.x0, y0: parent.y0, x1: parent.x1, y1: parent.y1 },
    );
    bounds = square(u, near.length ? 0.1 : 0.06);
  }
  else {
    const all: Rect[] = [...rects, ...points.map((p) => ({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })), ...(box ? [box] : [])];
    if (marker) all.push({ x0: marker.x, y0: marker.y, x1: marker.x, y1: marker.y });
    if (!all.length) return null;
    const u = all.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), y0: Math.min(a.y0, r.y0), x1: Math.max(a.x1, r.x1), y1: Math.max(a.y1, r.y1) }));
    bounds = square(u, 0.08);
  }

  return {
    panel: {
      kind: "spatial",
      key: `spatial:${rectArg ?? pointArg}`,
      name: rv ? rectName : pv ? pointName : "space",
      bounds,
      rects,
      points,
      ...(box ? { query: box } : {}),
      ...(asRect(q?.box) ? { search: true } : {}),
      ...(marker ? { marker } : {}),
      ...(Object.keys(opts).length ? { world: worldOf(opts, bounds) } : {}),
    },
    uses: [...uses],
  };
};

function worldOf(opts: Record<string, string>, bounds: Rect): NonNullable<SpatialPanel["world"]> {
  const geo = opts.scale === "geo";
  const perUnit = Number(opts.scale);
  const midLat = (bounds.y0 + bounds.y1) / 2;
  const metres = geo
    ? { x: DEGREE_M * Math.cos((Math.max(-89, Math.min(89, midLat)) * Math.PI) / 180), y: DEGREE_M }
    : perUnit > 0
      ? { x: perUnit, y: perUnit }
      : undefined;
  // Streets only make sense while the view is about a city across (30 km or less).
  const across = metres ? (bounds.x1 - bounds.x0) * metres.x : Infinity;
  return {
    dot: spaced(opts.dot) ?? "point",
    ...(metres ? { metres } : {}),
    ...(geo ? { geo } : {}),
    ...(opts.map === "city" && across <= 30_000 ? { city: true } : {}),
  };
}
