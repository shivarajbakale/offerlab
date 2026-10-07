/**
 * 347. Top K Frequent Elements
 * Difficulty: Medium
 * Category: Arrays & Hashing
 * LeetCode: https://leetcode.com/problems/top-k-frequent-elements/
 *
 * Given an integer array `nums` and an integer `k`, return the `k` most
 * frequent elements. The answer is guaranteed to be unique and may be
 * returned in any order.
 *
 * Example 1:
 *   Input: nums = [1, 1, 1, 2, 2, 3], k = 2
 *   Output: [1, 2]
 *
 * Example 2:
 *   Input: nums = [1], k = 1
 *   Output: [1]
 *
 * Constraints:
 *   1 <= nums.length <= 10^5
 *   -10^4 <= nums[i] <= 10^4
 *   k is in the range [1, number of unique elements].
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function topKFrequent(nums: number[], k: number): number[] {
  // TODO: implement
  throw new Error("Not implemented");
}

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

test("347. Top K Frequent Elements", () => {
  assert.deepEqual(sorted(topKFrequent([1, 1, 1, 2, 2, 3], 2)), [1, 2]);
  assert.deepEqual(topKFrequent([1], 1), [1]);
  assert.deepEqual(sorted(topKFrequent([4, 4, -1, -1, -1, 7], 2)), [-1, 4]);
});
