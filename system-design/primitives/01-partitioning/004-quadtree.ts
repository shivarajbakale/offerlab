/**
 * 004. Quadtree
 * Level: Senior
 * Group: Partitioning
 *
 * Problem: Answer "which points are inside this box?" over many points in 2D without checking
 *   every point, when the points are crowded in some places and sparse in others.
 *
 * Approach: Split a cell into four only when it gets too full
 *   Start with one cell covering the whole area. Each cell holds up to `capacity` points. When
 *   one more arrives, the cell splits into four equal quarters and hands its points down to
 *   them. So cells stay big where points are sparse and get small where they crowd. A range
 *   search starts at the top and only goes into cells that overlap the search box, skipping
 *   whole regions at once.
 *
 * Cost: insert O(depth); a range search visits the cells that overlap the box: for a small box
 *   about O(depth + k) for k results, while for a large box the cells along its edges add roughly
 *   O(√n) when points are spread evenly. Depth depends on the data, so there is no good
 *   worst-case bound. Memory O(n).
 *
 * Pattern: spatial index, adaptive partitioning
 * Key insight: The tree only splits where the data is, so its cells match the density of the
 *   points, and a search can throw away a whole quarter of the map with one comparison.
 * Tradeoffs: Adapts to uneven data, unlike a fixed grid or a geohash at one precision. But it
 *   lives in memory as pointers between nodes, so it does not map onto a sorted key-value store
 *   as directly as a geohash, and many identical points can make it split forever unless the
 *   depth is capped.
 * Staff notes: Used for in-memory indexes (game worlds, map tiles, collision checks, matching
 *   riders to nearby drivers on one server). Moving points mean removing and re-inserting, or
 *   rebuilding the whole tree every few seconds, which is often simpler and fast enough. For
 *   data on disk across machines, a geohash or S2 cell id in a sorted store usually wins.
 *   R-trees (used by many databases for spatial indexes) group nearby shapes into boxes
 *   instead of splitting space into equal quarters.
 * Interview signals: "find nearby drivers", "points in a region", "map viewport", "collision
 *   detection", "uneven density", "Yelp / Uber design".
 * Real world: The quadtree was described by Finkel and Bentley (1974). Variants are used in
 *   computer graphics, games and mapping software; map tile schemes divide the world into
 *   quarters at each zoom level in the same way.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Point = { x: number; y: number; label: string };
export type QuadNode = Rect & { depth: number; points: Point[]; children: QuadNode[] | null };

function makeNode(x0: number, y0: number, x1: number, y1: number, depth: number): QuadNode {
  return { x0, y0, x1, y1, depth, points: [], children: null };
}

export class QuadTree {
  // @viz spatial:root,root,lastQuery,dot=driver,pin=rider,scale=100,map=city hide:capacity,maxDepth,lastQuery,checked,mx,my,d,x0,y0,x1,y1,depth,p,q,moving,box,node,kids,bounds
  root: QuadNode;
  // @why How many points a cell holds before it splits. Small means more, smaller cells; large means more points checked per cell.
  capacity: number;
  // @why Many points at exactly the same spot can never be separated by splitting, so splitting stops at this depth.
  maxDepth = 8;
  // For drawing only: the last search's box, the cells it visited and the points it returned.
  lastQuery: { box: Rect; visited: QuadNode[]; found: Point[] } | null = null;
  // How many stored points the last search compared against its box.
  checked = 0;

  constructor(bounds: Rect, capacity = 4) {
    this.root = makeNode(bounds.x0, bounds.y0, bounds.x1, bounds.y1, 0);
    this.capacity = capacity;
  }

  insert(p: Point) {
    this.insertInto(this.root, p);
  }

  insertInto(node: QuadNode, p: Point) {
    // @why Only leaves hold points. Once a cell has split, a point goes down into the quarter that contains it.
    if (node.children) {
      this.insertInto(this.childFor(node, p), p);
      return;
    }
    // @caption {(typeof moving === "object" ? "Driver " + p.label + " is handed down into the quarter it is in" : "Driver " + p.label + " signs in at (" + p.x + ", " + p.y + ") and is stored in the cell around it") + ", a square " + ((m) => m >= 1000 ? m / 1000 + " km" : Math.round(m) + " m")((node.x1 - node.x0) * 100) + " across. That cell now holds " + node.points.length + " of at most " + capacity + (node.points.length > capacity && node.depth < maxDepth ? ": one too many, so it must split." : node.points.length > capacity ? ". It is too full, but it is already at the depth limit (" + maxDepth + "), so it stays as it is." : ".")}
    node.points.push(p); // @mark stored
    if (node.points.length > this.capacity && node.depth < this.maxDepth) {
      this.split(node);
    }
  }

  split(node: QuadNode) {
    const mx = (node.x0 + node.x1) / 2;
    const my = (node.y0 + node.y1) / 2;
    const d = node.depth + 1;
    node.children = [
      makeNode(node.x0, my, mx, node.y1, d),
      makeNode(mx, my, node.x1, node.y1, d),
      makeNode(node.x0, node.y0, mx, my, d),
      makeNode(mx, node.y0, node.x1, my, d),
    ];
    // @caption The cell splits into four equal quarters, each {((m) => m >= 1000 ? m / 1000 + " km" : Math.round(m) + " m")((mx - node.x0) * 100)} across. Its {node.points.length} drivers are handed down, each to the quarter it is in. The cell itself now holds no drivers, only its four quarters.
    const moving = node.points; // @mark split
    node.points = [];
    // @why Each point goes down to its quarter. If they all land in the same quarter, that quarter splits again.
    for (const q of moving) this.insertInto(node, q);
  }

  /** The quarter of a split cell that contains the point (points on the middle line go right or up). */
  childFor(node: QuadNode, p: Point): QuadNode {
    const mx = (node.x0 + node.x1) / 2;
    const my = (node.y0 + node.y1) / 2;
    const kids = node.children!;
    if (p.y >= my) return p.x >= mx ? kids[1] : kids[0];
    return p.x >= mx ? kids[3] : kids[2];
  }

  /** Every stored point inside the box. */
  query(box: Rect): Point[] {
    // @caption A rider at the pin asks for drivers nearby: every driver inside the dashed box, {((m) => m >= 1000 ? m / 1000 + " km" : Math.round(m) + " m")((box.x1 - box.x0) * 100)} by {((m) => m >= 1000 ? m / 1000 + " km" : Math.round(m) + " m")((box.y1 - box.y0) * 100)}. {(JSON.stringify(root).match(/"label"/g) || []).length} drivers are stored. The search starts at the top cell, the whole city.
    this.lastQuery = { box, visited: [], found: [] };
    this.checked = 0;
    this.search(this.root, box);
    // @caption {((total) => checked === total ? "bad: Done: " + lastQuery.found.length + " drivers found, but only after checking all " + total + ". With no capacity limit the city is one big cell that never splits, so every search reads every driver, near or far. With millions of drivers, each search would be far too slow." : "good: Done: " + lastQuery.found.length + " drivers found (" + lastQuery.found.map((f) => f.label).join(", ") + "). The search looked inside " + lastQuery.visited.length + " of the " + (JSON.stringify(root).match(/"depth"/g) || []).length + " cells and checked only " + checked + " of the " + total + " drivers.")((JSON.stringify(root).match(/"label"/g) || []).length)}
    return this.lastQuery.found; // @mark result
  }

  search(node: QuadNode, box: Rect) {
    // @why The pruning step: a cell that does not touch the box cannot hold an answer, so neither can anything inside it.
    // @caption {node.x1 < box.x0 || node.x0 > box.x1 || node.y1 < box.y0 || node.y0 > box.y1 ? "Skip this cell (" + ((m) => m >= 1000 ? m / 1000 + " km" : Math.round(m) + " m")((node.x1 - node.x0) * 100) + " across): it doesn't touch the dashed box, so none of the " + (JSON.stringify(node).match(/"label"/g) || []).length + " drivers in it can be near the rider. One comparison throws them all away, without looking at any of them" + (node.children ? " or at the smaller cells inside." : ".") : "This cell (" + ((m) => m >= 1000 ? m / 1000 + " km" : Math.round(m) + " m")((node.x1 - node.x0) * 100) + " across) touches the dashed box, so the search looks inside."}
    if (node.x1 < box.x0 || node.x0 > box.x1 || node.y1 < box.y0 || node.y0 > box.y1) {
      return; // @mark skip
    }
    // @caption Look inside this cell ({((m) => m >= 1000 ? m / 1000 + " km" : Math.round(m) + " m")((node.x1 - node.x0) * 100)} across). {node.children ? "It has split, so the search goes down into its four quarters and skips the ones that miss the box." : node.points.length === 0 ? "It is empty." : "It holds " + node.points.length + (node.points.length === 1 ? " driver" : " drivers") + ", so each one is checked against the box."}
    this.lastQuery!.visited.push(node); // @mark visit
    for (const p of node.points) {
      this.checked++;
      if (p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1) {
        // @caption good: Driver {lastQuery.found[lastQuery.found.length - 1].label} is inside the box: found. Found so far: {lastQuery.found.map((f) => f.label).join(", ")}.
        this.lastQuery!.found.push(p); // @mark found
      }
    }
    if (node.children) for (const c of node.children) this.search(c, box);
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: no capacity limit, so the first cell never splits and every search checks every point.
export class NoSplitQuadTree extends QuadTree {
  capacity = Infinity;
}

const WORLD: Rect = { x0: 0, y0: 0, x1: 100, y1: 100 };
const BOX: Rect = { x0: 8, y0: 55, x1: 40, y1: 88 };

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatter(n: number, seed: number, area: Rect = WORLD, prefix = "p"): Point[] {
  const rand = mulberry32(seed);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round((area.x0 + rand() * (area.x1 - area.x0)) * 10) / 10;
    const y = Math.round((area.y0 + rand() * (area.y1 - area.y0)) * 10) / 10;
    out.push({ x, y, label: `${prefix}${i + 1}` });
  }
  return out;
}

function build(points: Point[], broken = false): QuadTree {
  const tree = broken ? new NoSplitQuadTree(WORLD) : new QuadTree(WORLD);
  for (const p of points) tree.insert(p);
  return tree;
}

function allNodes(n: QuadNode, out: QuadNode[] = []): QuadNode[] {
  out.push(n);
  for (const c of n.children ?? []) allNodes(c, out);
  return out;
}

function leafOf(n: QuadNode, p: Point): QuadNode {
  if (!n.children) return n;
  const mx = (n.x0 + n.x1) / 2;
  const my = (n.y0 + n.y1) / 2;
  const i = (p.y >= my ? 0 : 2) + (p.x >= mx ? 1 : 0);
  return leafOf(n.children[i], p);
}

function inBox(points: Point[], box: Rect): string[] {
  return points.filter((p) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1).map((p) => p.label);
}

test("split: a fifth point splits the cell into four", () => {
  const tree = build([
    { x: 20, y: 70, label: "a" },
    { x: 70, y: 80, label: "b" },
    { x: 30, y: 20, label: "c" },
    { x: 80, y: 30, label: "d" },
  ]);
  assert.equal(tree.root.children, null);
  tree.insert({ x: 60, y: 60, label: "e" });
  assert.equal(tree.root.children!.length, 4);
  assert.equal(tree.root.points.length, 0);
  assert.deepEqual(
    tree.root.children!.map((c) => c.points.map((p) => p.label)),
    [["a"], ["b", "e"], ["c"], ["d"]],
  );
});

test("query: a range search skips cells outside the box", () => {
  const points = scatter(40, 7);
  const tree = build(points);
  const found = tree.query(BOX).map((p) => p.label);
  assert.deepEqual([...found].sort(), inBox(points, BOX).sort());
  assert.ok(tree.lastQuery!.visited.length < allNodes(tree.root).length);
  assert.ok(tree.checked < points.length / 2);
});

test("dense area: cells get small only where points cluster", () => {
  const tree = build(scatter(4, 3, WORLD, "s"));
  const cluster = scatter(14, 11, { x0: 62, y0: 62, x1: 72, y1: 72 }, "c");
  for (const p of cluster) tree.insert(p);
  const clusterDepth = Math.min(...cluster.map((p) => leafOf(tree.root, p).depth));
  const emptyCorner = leafOf(tree.root, { x: 10, y: 10, label: "probe" });
  assert.ok(clusterDepth >= 3, `cluster leaves at depth ${clusterDepth}`);
  assert.equal(emptyCorner.depth, 1);
});

test("broken: no capacity limit — the query checks every point", () => {
  const points = scatter(40, 7);
  const tree = build(points, true);
  const found = tree.query(BOX);
  assert.equal(tree.checked, points.length);
  assert.equal(found.length, inBox(points, BOX).length);
});
