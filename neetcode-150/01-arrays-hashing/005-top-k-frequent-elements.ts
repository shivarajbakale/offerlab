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
 *
 * Approach: Bucket sort by frequency
 *   Count each value, then place values into buckets indexed by frequency
 *   (a frequency is at most n). Walk buckets from highest frequency down,
 *   collecting values until we have k.
 *
 * Time: O(n)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export function topKFrequent(nums: number[], k: number): number[] {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);

  const buckets: number[][] = Array.from({ length: nums.length + 1 }, () => []);
  for (const [n, c] of counts) buckets[c].push(n);

  const result: number[] = [];
  for (let f = buckets.length - 1; f > 0 && result.length < k; f--) {
    for (const n of buckets[f]) {
      result.push(n);
      if (result.length === k) break;
    }
  }
  return result;
}

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

test("347. Top K Frequent Elements", () => {
  assert.deepEqual(sorted(topKFrequent([1, 1, 1, 2, 2, 3], 2)), [1, 2]);
  assert.deepEqual(topKFrequent([1], 1), [1]);
  assert.deepEqual(sorted(topKFrequent([4, 4, -1, -1, -1, 7], 2)), [-1, 4]);
});
