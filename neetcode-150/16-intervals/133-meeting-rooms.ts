/**
 * 252. Meeting Rooms (Premium; LintCode 920)
 * Difficulty: Easy
 * Category: Intervals
 * LeetCode: https://leetcode.com/problems/meeting-rooms/
 *
 * Given an array of meeting time intervals, each with a `start` and `end`
 * time, determine whether one person could attend all of the meetings
 * (i.e. no two meetings overlap). A meeting ending at time t does not
 * conflict with one starting at time t.
 *
 * Example 1:
 *   Input: intervals = [(0,30),(5,10),(15,20)]
 *   Output: false
 *
 * Example 2:
 *   Input: intervals = [(5,8),(9,15)]
 *   Output: true
 *
 * Constraints:
 *   0 <= intervals.length <= 500
 *   0 <= start < end <= 10^6
 *
 * Approach: Sort by start, compare neighbors
 *   After sorting by start time, any overlap must occur between two
 *   consecutive meetings. Check that each meeting starts no earlier than
 *   the previous one ends.
 *
 * Time: O(n log n)   Space: O(1) extra (besides sorting)
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

export function canAttendMeetings(intervals: Interval[]): boolean {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return false;
  }
  return true;
}

const iv = (pairs: number[][]): Interval[] => pairs.map(([s, e]) => new Interval(s, e));

test("252. Meeting Rooms", () => {
  assert.equal(canAttendMeetings(iv([[0, 30], [5, 10], [15, 20]])), false);
  assert.equal(canAttendMeetings(iv([[5, 8], [9, 15]])), true);
  assert.equal(canAttendMeetings([]), true);
  assert.equal(canAttendMeetings(iv([[5, 8], [8, 9]])), true);
});
