/**
 * 312. Burst Balloons
 * Difficulty: Hard
 * Category: 2-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/burst-balloons/
 *
 * There are n balloons, each painted with a number `nums[i]`. Bursting
 * balloon i earns nums[i - 1] * nums[i] * nums[i + 1] coins, where the
 * neighbours are whichever balloons are currently adjacent to it; an
 * out-of-range neighbour counts as 1. After a burst, its neighbours become
 * adjacent. Return the maximum coins you can collect by bursting them all.
 *
 * Example 1:
 *   Input: nums = [3, 1, 5, 8]
 *   Output: 167
 *   (3*1*5 + 3*5*8 + 1*3*8 + 1*8*1 = 15 + 120 + 24 + 8)
 *
 * Example 2:
 *   Input: nums = [1, 5]
 *   Output: 10
 *
 * Constraints:
 *   1 <= nums.length <= 300
 *   0 <= nums[i] <= 100
 *
 * Approach: Interval DP, choosing the LAST balloon to burst
 *   Pad nums with 1 on both ends. Instead of the first balloon to burst in
 *   an interval, pick the last one: when it pops, its neighbours are the
 *   interval's fixed outer boundaries, which makes subproblems independent.
 *   State: dp[l][r] = max coins from bursting every balloon in (l, r)
 *   exclusive, with l and r still standing.
 *   Recurrence: dp[l][r] = max over l < k < r of
 *     dp[l][k] + a[l] * a[k] * a[r] + dp[k][r]
 *   Fill by increasing interval length. Answer: dp[0][n + 1].
 *
 * Time: O(n^3)   Space: O(n^2)
 *
 * Pattern: dp-interval
 * Key insight: Choosing the first balloon to burst leaves neighbours that keep changing.
 *   Choosing the LAST balloon k in (l, r) fixes its neighbours to l and r, which splits
 *   the interval into two independent halves (l, k) and (k, r).
 * Real world: Query optimizers pick the best join order the same way: choose the last join
 *   to perform, and the left and right sub-plans become independent subproblems.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[l][r] is the most coins from bursting every balloon strictly between l and r
// @why Returns the most coins from bursting all balloons, where each burst pays left x self x right.
// @goal what is the most coins from bursting every balloon in {JSON.stringify(nums)}?
export function maxCoins(nums: number[]): number {
  // @why Pad both ends with 1 so edge balloons have neighbours; the pads are never burst.
  // @phase Setup: pad the ends and make a table of gaps
  // @say Trying every burst order is {nums.length}! orders. Choosing the FIRST balloon to burst doesn't split the problem, because its neighbours then change. Choosing the LAST one does: until it goes, it walls off its left and right sides, so they become two independent smaller problems.
  const a = [1, ...nums, 1];
  // @why Length including the padding.
  const size = a.length;
  // @why `dp[l][r]` means the best coins from bursting every balloon strictly between `l` and `r`.
  const dp = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  // @why Solve small gaps first, since big gaps are built from smaller ones.
  // @phase Grow the gaps: each one picks its last balloon
  // @yes Gaps of width {len}, holding {len - 1} {len - 1 === 1 ? "balloon" : "balloons"}. Every narrower gap is already solved, and those are the only pieces a choice here splits into.
  // @no Every gap is solved, including the whole row between the two pads.
  for (let len = 2; len < size; len++) {
    // @why Pick the left boundary of the gap.
    // @yes Gap from index {l} to {l + len}: {len === 2 ? "balloon " + a[l + 1] : "balloons " + JSON.stringify(a.slice(l + 1, l + len))} between the walls {a[l]} and {a[l + len]}.
    // @no All gaps of width {len} are done.
    for (let l = 0; l + len < size; l++) {
      // @why Right boundary of the gap.
      const r = l + len;
      // @why Let `k` be the LAST balloon burst in the gap; its neighbours are then `l` and `r`.
      // @yes Try {a[k]} (index {k}) as the last balloon burst in this gap.
      // @no Every choice of last balloon is tried: the best for this gap is {dp[l][r]}.
      for (let k = l + 1; k < r; k++) {
        // @why Last burst pays `a[l] * a[k] * a[r]`, plus the two independent sides `dp[l][k]` and `dp[k][r]`.
        // @say Burst {a[k]} last: by then only the walls {a[l]} and {a[r]} are beside it, paying {a[l]} x {a[k]} x {a[r]} = {a[l] * a[k] * a[r]}. Add the left side's best {dp[l][k]} and the right side's best {dp[k][r]}: {dp[l][k] + a[l] * a[k] * a[r] + dp[k][r]}. Best so far {dp[l][r]}. {dp[l][k] + a[l] * a[k] * a[r] + dp[k][r] > dp[l][r] ? "New best." : "Not better."}
        dp[l][r] = Math.max(dp[l][r], dp[l][k] + a[l] * a[k] * a[r] + dp[k][r]); // @ask dp[l][r]
      }
    }
  }
  // @why The whole padded range, excluding the two pads.
  // @phase Answer
  // @returns {dp[0][size - 1]}: the best over every choice of last balloon for the whole row, built from O(n^2) gaps x O(n) choices each.
  return dp[0][size - 1];
}

test("312. Burst Balloons", () => {
  assert.equal(maxCoins([3, 1, 5, 8]), 167);
  assert.equal(maxCoins([1, 5]), 10);
  assert.equal(maxCoins([7]), 7);
  assert.equal(maxCoins([0, 0]), 0);
});
