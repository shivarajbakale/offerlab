/**
 * 253. Meeting Rooms II (Premium; LintCode 919)
 * Difficulty: Medium
 * Category: Intervals
 * LeetCode: https://leetcode.com/problems/meeting-rooms-ii/
 *
 * Given an array of meeting time intervals, each with a `start` and `end`
 * time, return the minimum number of conference rooms required to hold all
 * meetings. A meeting ending at time t frees its room for one starting at t.
 *
 * Example 1:
 *   Input: intervals = [(0,40),(5,10),(15,20)]
 *   Output: 2
 *
 * Example 2:
 *   Input: intervals = [(4,9)]
 *   Output: 1
 *
 * Constraints:
 *   0 <= intervals.length <= 500
 *   0 <= start < end <= 10^6
 *
 * Approach: Two sorted pointer sweep
 *   Sort start times and end times separately. Walk the starts; if the
 *   next start comes before the earliest unfinished end, a new room is
 *   needed, otherwise a meeting has ended and we reuse its room. Track the
 *   peak number of simultaneous meetings.
 *
 * Time: O(n log n)   Space: O(n)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export class Interval {
  start: number;
  end: number;
  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }
}

export function minMeetingRooms(intervals: Interval[]): number {
  const starts = intervals.map((i) => i.start).sort((a, b) => a - b);
  const ends = intervals.map((i) => i.end).sort((a, b) => a - b);

  let rooms = 0;
  let best = 0;
  let e = 0;
  for (let s = 0; s < starts.length; s++) {
    if (starts[s] < ends[e]) {
      rooms++;
    } else {
      e++; // a meeting ended; its room is reused
    }
    best = Math.max(best, rooms);
  }
  return best;
}

const iv = (pairs: number[][]): Interval[] => pairs.map(([s, e]) => new Interval(s, e));

test("253. Meeting Rooms II", () => {
  assert.equal(minMeetingRooms(iv([[0, 40], [5, 10], [15, 20]])), 2);
  assert.equal(minMeetingRooms(iv([[4, 9]])), 1);
  assert.equal(minMeetingRooms([]), 0);
  assert.equal(minMeetingRooms(iv([[1, 5], [2, 6], [3, 7], [5, 8]])), 3);
});
