// SpatialView data: geohash cells (a list of rects with lat/lon points) and quadtrees (a recursive
// node) both become rects, points and a query box; what the query visited and found is hot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHints } from "../src/model/hints.ts";
import { buildScene, type Panel } from "../src/model/scene.ts";
import type { SpatialPanel } from "../src/model/systems/spatial.ts";
import { traceSource } from "../src/tracer/trace.ts";

const spatialOf = (panels: Panel[]) => panels.find((p): p is SpatialPanel => p.kind === "spatial");
const lastScene = (src: string) => {
  const steps = traceSource(src, undefined, { scenarios: true }).runs[0].steps;
  return buildScene(steps.at(-1)!, steps.at(-2), parseHints(src));
};

const GEO = `
import { test } from "node:test";
type Cell = { x0: number; y0: number; x1: number; y1: number; label: string };
type Place = { name: string; lat: number; lon: number };
export class Geo {
  // @viz spatial:cells,points,query
  cells: Cell[] = [];
  points: Place[] = [{ name: "cafe", lat: 1, lon: 1 }, { name: "far", lat: 3, lon: 3 }];
  query: { box: Cell; visited: Cell[]; found: Place[] } | null = null;
  search() {
    this.cells = [{ x0: 0, y0: 0, x1: 2, y1: 2, label: "s0" }, { x0: 2, y0: 0, x1: 4, y1: 2, label: "s1" }];
    this.query = { box: { x0: 0.5, y0: 0.5, x1: 1.5, y1: 1.5, label: "q" }, visited: [this.cells[0]], found: [this.points[0]] };
    return this.query.found.length;
  }
}
test("geo: search", () => { new Geo().search(); });
`;

test("spatial: geohash cells, lat/lon points and a query box", () => {
  const p = spatialOf(lastScene(GEO).panels)!;
  assert.equal(p.name, "cells");
  assert.deepEqual(
    p.rects.map((r) => [r.label, r.x0, r.y0, r.x1, r.y1, r.hot]),
    [
      ["s0", 0, 0, 2, 2, true],
      ["s1", 2, 0, 4, 2, false],
    ],
  );
  assert.deepEqual(
    p.points.map((x) => [x.label, x.x, x.y, x.hot]),
    [
      ["cafe", 1, 1, true],
      ["far", 3, 3, false],
    ],
  );
  assert.deepEqual(p.query, { x0: 0.5, y0: 0.5, x1: 1.5, y1: 1.5 });
  // Everything fits in the frame, which is square.
  assert.ok(p.bounds.x0 <= 0 && p.bounds.y0 <= 0 && p.bounds.x1 >= 4 && p.bounds.y1 >= 3);
  assert.ok(Math.abs(p.bounds.x1 - p.bounds.x0 - (p.bounds.y1 - p.bounds.y0)) < 1e-9);
});

const NESTED = `
import { test } from "node:test";
export function narrow() {
  // @viz spatial:cells,points,query
  const cells = [{ x0: 0, y0: 0, x1: 32, y1: 32, label: "a" }];
  cells.push({ x0: 0, y0: 0, x1: 8, y1: 4, label: "ab" });
  cells.push({ x0: 0, y0: 0, x1: 1, y1: 1, label: "abc" });
  return cells.length;
}
test("nested: narrow", () => { narrow(); });
`;

test("spatial: nested cells (one inside the next) are framed by the last cell's parent", () => {
  const p = spatialOf(lastScene(NESTED).panels)!;
  assert.equal(p.rects.length, 3);
  assert.ok(p.bounds.x0 <= 0 && p.bounds.x1 >= 8 && p.bounds.x1 < 32);
});

const QUAD = `
import { test } from "node:test";
type Pt = { x: number; y: number; label: string };
type Node = { x0: number; y0: number; x1: number; y1: number; points: Pt[]; children: Node[] | null };
const leaf = (x0: number, y0: number, x1: number, y1: number, points: Pt[]): Node => ({ x0, y0, x1, y1, points, children: null });
export class Quad {
  // @viz spatial:root,root,lastQuery
  root: Node = { x0: 0, y0: 0, x1: 100, y1: 100, points: [], children: [
    leaf(0, 0, 50, 50, [{ x: 10, y: 10, label: "p1" }]),
    leaf(50, 0, 100, 50, [{ x: 60, y: 10, label: "p2" }]),
    leaf(0, 50, 50, 100, []),
    leaf(50, 50, 100, 100, []),
  ] };
  lastQuery: { box: { x0: number; y0: number; x1: number; y1: number }; visited: Node[]; found: Pt[] } | null = null;
  query() {
    const kids = this.root.children!;
    this.lastQuery = { box: { x0: 0, y0: 0, x1: 20, y1: 20 }, visited: [this.root, kids[0]], found: [kids[0].points[0]] };
    return 1;
  }
}
test("quad: query", () => { new Quad().query(); });
`;

test("spatial: a quadtree is flattened to rects; visited nodes and found points are hot", () => {
  const scene = lastScene(QUAD);
  const p = spatialOf(scene.panels)!;
  assert.equal(p.rects.length, 5);
  assert.deepEqual(p.rects.filter((r) => r.hot).map((r) => [r.x0, r.y0, r.x1, r.y1]), [
    [0, 0, 100, 100],
    [0, 0, 50, 50],
  ]);
  assert.deepEqual(p.points.map((x) => [x.label, x.hot]), [
    ["p1", true],
    ["p2", false],
  ]);
  assert.deepEqual(p.query, { x0: 0, y0: 0, x1: 20, y1: 20 });
  assert.deepEqual(p.bounds, { x0: 0, y0: 0, x1: 100, y1: 100 });
  // The tree is drawn once: no tree, trie or object panels for its nodes.
  assert.deepEqual(scene.panels.map((x) => x.kind), ["spatial"]);
});

const ALT = `
import { test } from "node:test";
export class Index {
  // @viz spatial:trail|cells,points,box|query
  cells = [{ x0: 0, y0: 0, x1: 10, y1: 10, label: "c" }];
  points = [];
  query = null;
  encode() {
    const trail = [{ x0: 0, y0: 0, x1: 4, y1: 4, label: "t" }];
    const box = { x0: 1, y0: 1, x1: 2, y1: 2 };
    return trail.length + box.x0; // @mark inside
  }
  run() {
    this.encode();
    return this.cells.length;
  }
}
test("alt: run", () => { new Index().run(); });
`;

test("spatial: an argument may name alternatives; the first in scope and not null is drawn", () => {
  const steps = traceSource(ALT, undefined, { scenarios: true }).runs[0].steps;
  const hints = parseHints(ALT);
  const inside = steps.find((s) => s.stack.at(-1)!.fn === "Index.encode" && s.stack.at(-1)!.vars.some(([n]) => n === "box"))!;
  const p1 = spatialOf(buildScene(inside, undefined, hints).panels)!;
  assert.equal(p1.name, "trail");
  assert.deepEqual(p1.rects.map((r) => r.label), ["t"]);
  assert.deepEqual(p1.query, { x0: 1, y0: 1, x1: 2, y1: 2 });
  const p2 = spatialOf(buildScene(steps.at(-1)!, undefined, hints).panels)!;
  assert.equal(p2.name, "cells");
  assert.deepEqual(p2.rects.map((r) => r.label), ["c"]);
  assert.equal(p2.query, undefined);
});
