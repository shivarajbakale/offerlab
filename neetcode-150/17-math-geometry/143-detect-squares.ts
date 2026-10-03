/**
 * 2013. Detect Squares
 * Difficulty: Medium
 * Category: Math & Geometry
 * LeetCode: https://leetcode.com/problems/detect-squares/
 *
 * Design a structure over a stream of points on the X-Y plane:
 *   - add(point): add a point [x, y]. Duplicate points are allowed and are
 *     treated as distinct points.
 *   - count(point): given a query point, count the ways to pick three points
 *     from the structure so that together with the query point they form an
 *     axis-aligned square with positive area.
 *
 * Example 1:
 *   Input:  ["DetectSquares", "add", "add", "add", "count", "count", "add",
 *            "count"]
 *           [[], [[3,10]], [[11,2]], [[3,2]], [[11,10]], [[14,8]], [[11,2]],
 *            [[11,10]]]
 *   Output: [null, null, null, null, 1, 0, null, 2]
 *
 * Constraints:
 *   point.length == 2
 *   0 <= x, y <= 1000
 *   At most 3000 calls in total to add and count
 *
 * Approach: Point counts + diagonal enumeration
 *   Store how many times each point was added (hash map) plus a list of
 *   distinct points. For a query (qx, qy), every stored point (x, y) with
 *   |qx - x| == |qy - y| != 0 can be the opposite diagonal corner. The other
 *   two corners are (x, qy) and (qx, y); add
 *   cnt(x, y) * cnt(x, qy) * cnt(qx, y) for each such diagonal point.
 *
 * Time: add O(1), count O(p) for p distinct points   Space: O(p)
 *
 * Pattern: hashing,design
 * Key insight: Fixing the query point and choosing the diagonal corner pins down the whole
 *   square, so the other two corners can be looked up directly. Multiplying their stored
 *   counts handles duplicate points without enumerating triples.
 * Real world: A geometry or vision tool detecting axis-aligned rectangles from a stream of
 *   detected corner points, using a hash of point counts for constant-time corner lookups.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why A data structure that stores points and counts axis-aligned squares for a query point.
export class DetectSquares {
  // @why How many times each point was added (duplicates count), keyed by its coordinates.
  private counts = new Map<string, number>();
  // @why The distinct points, so `count` loops over each location only once.
  private points: [number, number][] = [];

  // @why Turns a point into a string so it can be a Map key.
  private key(x: number, y: number): string {
    // @why Example: (3, 4) becomes "3,4".
    return `${x},${y}`;
  }

  // @why Returns how many copies of the point exist, or 0 if never added.
  private get(x: number, y: number): number {
    // @why Look up the count by the point's key.
    return this.counts.get(this.key(x, y)) ?? 0;
  }

  // @why Stores a point.
  add(point: number[]): void {
    // @why Split the point into `x` and `y`.
    const [x, y] = point;
    // @why The Map key for this point.
    const k = this.key(x, y);
    // @why Remember a new location only the first time, so `points` has no repeats.
    if (!this.counts.has(k)) this.points.push([x, y]);
    // @why Bump the number of copies of this point.
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }

  // @why Returns how many squares can be made using the query point as one corner.
  count(point: number[]): number {
    // @why The query point's coordinates.
    const [qx, qy] = point;
    // @why Running total of squares.
    let res = 0;
    // @why Try each stored point as the corner diagonal to the query point.
    for (const [x, y] of this.points) {
      // Must be a diagonal corner of a non-degenerate square
      // @why A square's diagonal corner has equal x and y distance, and a distance of 0 would be no square.
      if (Math.abs(qx - x) !== Math.abs(qy - y) || x === qx) continue;
      // @why The other two corners are fixed. Multiply copies of all three, since each choice gives a different square.
      res += this.get(x, y) * this.get(x, qy) * this.get(qx, y);
    }
    // @why The total number of squares.
    return res;
  }
}

test("2013. Detect Squares", () => {
  const ds = new DetectSquares();
  ds.add([3, 10]);
  ds.add([11, 2]);
  ds.add([3, 2]);
  assert.equal(ds.count([11, 10]), 1);
  assert.equal(ds.count([14, 8]), 0);
  ds.add([11, 2]);
  assert.equal(ds.count([11, 10]), 2);

  // Squares on both sides of the query point, and an empty structure
  const ds2 = new DetectSquares();
  assert.equal(ds2.count([0, 0]), 0);
  for (const p of [[1, 0], [0, 1], [1, 1], [-1, 0], [-1, 1]]) ds2.add(p);
  assert.equal(ds2.count([0, 0]), 2);
});
