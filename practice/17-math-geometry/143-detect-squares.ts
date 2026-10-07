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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class DetectSquares {
  add(point: number[]): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  count(point: number[]): number {
    // TODO: implement
    throw new Error("Not implemented");
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
