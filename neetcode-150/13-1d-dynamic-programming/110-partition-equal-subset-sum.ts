/**
 * 416. Partition Equal Subset Sum
 * Difficulty: Medium
 * Category: 1-D Dynamic Programming
 * LeetCode: https://leetcode.com/problems/partition-equal-subset-sum/
 *
 * Given an array of positive integers `nums`, return true if it can be split
 * into two subsets whose sums are equal.
 *
 * Example 1:
 *   Input: nums = [1, 5, 11, 5]
 *   Output: true   ([1, 5, 5] and [11])
 *
 * Example 2:
 *   Input: nums = [1, 2, 3, 5]
 *   Output: false
 *
 * Constraints:
 *   1 <= nums.length <= 200
 *   1 <= nums[i] <= 100
 *
 * Approach: 0/1 knapsack over reachable sums
 *   If the total is odd, it's impossible. Otherwise we need a subset that
 *   sums to target = total / 2.
 *   State: dp[t] = true if some subset of the numbers seen so far sums to t.
 *   Recurrence: for each n, for t from target down to n:
 *     dp[t] = dp[t] || dp[t - n]
 *   (Iterating t downward ensures each number is used at most once.)
 *
 * Time: O(n * target)   Space: O(target)
 *
 * Pattern: knapsack
 * Key insight: Two equal halves exist exactly when some subset sums to total / 2, so it
 *   becomes a reachable-sum question. Updating sums from high to low means each number is
 *   used at most once in a pass.
 * Real world: Splitting jobs or files across two machines or disks so both get the same
 *   total load.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule dp[t] is true when some subset of the numbers seen so far sums to exactly t
// @why Returns whether the numbers can be split into two groups with equal sums.
// @goal can {JSON.stringify(nums)} be split into two groups with the same sum?
export function canPartition(nums: number[]): boolean {
  // @why Sum of all numbers; needed to know what each half must be.
  // @phase Turn it into one question: can some subset hit half the total?
  // @say Trying every way to split into two groups is 2^n. But if one group sums to exactly half the total, the rest automatically sums to the other half. So the real question is smaller: which sums can some subset reach?
  const total = nums.reduce((a, b) => a + b, 0);
  // @why An odd total can't be cut into two equal whole halves.
  // @yes The total, {total}, is odd. Two equal whole-number sums always add to an even number, so no split works.
  // @returns false: an odd total can't be halved.
  // @no The total, {total}, is even, so each group would need {total / 2}.
  if (total % 2 !== 0) return false;
  // @why One group must add up to half the total; the other then does too.
  const target = total / 2;

  // @why `dp[t]` means some subset of the numbers seen so far adds up to exactly `t`.
  // @say Track every sum from 0 to {target}: one true/false each. Sums above {target} can never help, so they are not stored.
  const dp = new Array<boolean>(target + 1).fill(false);
  // @why Taking nothing gives sum 0, the base case.
  dp[0] = true;
  // @why Consider each number once: take it or leave it.
  // @phase Add numbers one at a time: every reachable sum either takes it or not
  // @say Number {n}. Reachable so far: {JSON.stringify(dp.map((ok, s) => ok ? s : -1).filter((s) => s >= 0))}. Each of those sums plus {n} becomes reachable too.
  for (const n of nums) {
    // @why Go downward so this number isn't used twice in the same round.
    // @yes Can sum {t} be made with {n}? That needs {t - n} without {n}. Going downward means dp[{t - n}] hasn't been touched by {n} yet in this round, so {n} is used at most once.
    // @no {t < n ? "Sums below " + n + " can't include " + n + ", so they keep their old answers." : ""}
    for (let t = target; t >= n; t--) {
      // @why If `t - n` was reachable, adding `n` makes `t` reachable.
      // @yes Sum {t - n} was reachable without {n}, so adding {n} reaches {t}.
      // @no Sum {t - n} isn't reachable, so {n} on top of it can't make {t} {dp[t] ? "(but " + t + " was already reachable another way)" : "yet"}.
      if (dp[t - n]) dp[t] = true; // @ask dp[t]
    }
    // @why Stop early once the half-sum is reachable.
    // @yes Some subset now sums to {target}, exactly half. The numbers left out sum to the other {target}, so the split exists.
    // @returns true, without looking at the remaining numbers.
    // @no {target} isn't reachable with the numbers so far. Keep adding numbers.
    if (dp[target]) return true;
  }
  // @why Whether the half-sum can be reached by some subset.
  // @phase Answer
  // @returns {dp[target]}: after every number, no subset reaches {target}, so no equal split exists. O(n × {target}) time.
  return dp[target];
}

test("416. Partition Equal Subset Sum", () => {
  assert.equal(canPartition([1, 5, 11, 5]), true);
  assert.equal(canPartition([1, 2, 3, 5]), false);
  assert.equal(canPartition([1]), false);
  assert.equal(canPartition([2, 2]), true);
});
