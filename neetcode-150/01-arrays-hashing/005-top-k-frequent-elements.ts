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
 *
 * Pattern: hashing,heap-top-k
 * Key insight: A frequency can never exceed n, so counts can index an array of buckets
 *   directly; reading buckets from high to low yields the top k without any sorting or
 *   heap.
 * Real world: A trending-topics panel counting hashtags in the last hour and showing the
 *   k most frequent ones.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule buckets[f] holds exactly the values that appear f times in nums
// @why Return the `k` values that appear most often.
// @goal which {k} values appear most often in {JSON.stringify(nums)}?
export function topKFrequent(nums: number[], k: number): number[] {
  // @why Map from each value to how many times it appears.
  const counts = new Map<number, number>();
  // @why Count every number; a missing one starts from 0.
  // @phase Step 1: count how often each value appears
  // @say {n} has now appeared {(counts.get(n) ?? 0) + 1} {counts.get(n) ? "times" : "time: first sighting, so its count starts from 0"}. One pass over the array counts everything.
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1); // @ask counts.get(n)

  // @why `buckets[f]` holds values that appear `f` times; a count can't exceed `nums.length`.
  // @phase Step 2: group values by their count instead of sorting
  // @say Sorting {counts.size} values by count costs n log n. But a count is a whole number between 1 and {nums.length}, so make one bucket per possible count and drop each value in: no sorting needed.
  const buckets: number[][] = Array.from({ length: nums.length + 1 }, () => []);
  // @why Put each value in the bucket for its count; this replaces sorting.
  // @say {n} appears {c} {c === 1 ? "time" : "times"}, so it goes in bucket {c}.
  // @then Non-empty buckets (count: values): {JSON.stringify(Object.fromEntries(buckets.map((b, f) => [f, b]).filter((e) => e[1].length)))}
  for (const [n, c] of counts) buckets[c].push(n);

  // @why The answer being collected, most frequent first.
  // @phase Step 3: walk buckets from most frequent down, taking values until k
  const result: number[] = [];
  // @why Go from the highest frequency down so we meet the most common values first.
  // @yes {buckets[f].length ? "Bucket " + f + " holds " + JSON.stringify(buckets[f]) + ", the values seen " + f + " times. Every higher bucket is already used up, so these beat everything below." : "Nothing appears exactly " + f + " times; move down."} Have {result.length} of {k}.
  // @no {result.length >= k ? "Got " + k + " values, and every one beats all lower buckets." : "Ran out of buckets."} Stop.
  for (let f = buckets.length - 1; f > 0 && result.length < k; f--) {
    // @why Take every value that has this frequency.
    for (const n of buckets[f]) {
      // @why This value is among the most frequent, so keep it.
      // @say {n} appears {f} times. Every value still to come is in this bucket or a lower one, so none appears more often than {n}: take it.
      result.push(n); // @ask result.length // @moment keep {n} (seen {f} times)
      // @why We have `k` values, so stop.
      // @yes That makes {k}. Anything left is no more frequent, so stop here.
      // @no {result.length} of {k} so far; take the next one.
      if (result.length === k) break;
    }
  }
  // @why Return the `k` most frequent values.
  // @returns the {k} most frequent values, found in O(n) without sorting.
  return result;
}

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

test("347. Top K Frequent Elements", () => {
  assert.deepEqual(sorted(topKFrequent([1, 1, 1, 2, 2, 3], 2)), [1, 2]);
  assert.deepEqual(topKFrequent([1], 1), [1]);
  assert.deepEqual(sorted(topKFrequent([4, 4, -1, -1, -1, 7], 2)), [-1, 4]);
});
