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
 *
 * Pattern: intervals
 * Key insight: Once meetings are sorted by start time, if any two overlap then some
 *   adjacent pair overlaps, so checking neighbours is enough.
 * Real world: A calendar app warning that a person is double-booked when a new invite
 *   arrives.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why One meeting with a start time and an end time.
export class Interval {
  // @why When the meeting begins.
  start: number;
  // @why When the meeting ends.
  end: number;
  // @why Builds a meeting from its start and end.
  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }
}

// @rule no two meetings in sorted[0..i] overlap
// @why Returns true if one person can attend every meeting, meaning none overlap.
export function canAttendMeetings(intervals: Interval[]): boolean {
  // @why Sort by start so any clash must be between neighbours.
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  // @why Compare each meeting with the one just before it.
  for (let i = 1; i < sorted.length; i++) {
    // @why Does this one start before the previous one ends? Then they overlap.
    const clash = sorted[i].start < sorted[i - 1].end; // @ask clash
    // @why An overlap means one person cannot attend both.
    if (clash) return false; // @broken
  }
  // @why No neighbours overlapped, so no meetings clash.
  return true;
}

const iv = (pairs: number[][]): Interval[] => pairs.map(([s, e]) => new Interval(s, e));

test("252. Meeting Rooms", () => {
  assert.equal(canAttendMeetings(iv([[0, 30], [5, 10], [15, 20]])), false);
  assert.equal(canAttendMeetings(iv([[5, 8], [9, 15]])), true);
  assert.equal(canAttendMeetings([]), true);
  assert.equal(canAttendMeetings(iv([[5, 8], [8, 9]])), true);
});
