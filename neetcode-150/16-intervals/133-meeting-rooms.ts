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
// @goal can one person sit through {intervals.length === 1 ? "this one meeting" : "these " + intervals.length + " meetings"} without two overlapping?
export function canAttendMeetings(intervals: Interval[]): boolean {
  // @why Sort by start so any clash must be between neighbours.
  // @phase Setup: sort so a clash can only be between neighbours
  // @say Checking every pair of meetings is n² work. After sorting by start, if any two meetings clash, then some meeting clashes with the one right before it, so only neighbours need checking.
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  // @why Compare each meeting with the one just before it.
  // @phase Check each neighbouring pair
  // @yes Compare [{sorted[i].start},{sorted[i].end}] with the meeting before it, [{sorted[i - 1].start},{sorted[i - 1].end}].
  // @no Every neighbouring pair has been checked and none clashed.
  for (let i = 1; i < sorted.length; i++) {
    // @why Does this one start before the previous one ends? Then they overlap.
    // @say Does {sorted[i].start} come before the previous meeting's end, {sorted[i - 1].end}? Starting exactly when it ends is fine.
    const clash = sorted[i].start < sorted[i - 1].end; // @ask clash
    // @why An overlap means one person cannot attend both.
    // @yes The meeting at {sorted[i].start} begins while [{sorted[i - 1].start},{sorted[i - 1].end}] is still running. One person can't be in both, so the answer is settled.
    // @no The meeting at {sorted[i].start} starts once [{sorted[i - 1].start},{sorted[i - 1].end}] is over. Every earlier meeting ended even sooner, so it is clear of all of them.
    // @returns false: two meetings overlap, so no need to check the rest.
    if (clash) return false; // @broken
  }
  // @why No neighbours overlapped, so no meetings clash.
  // @phase Answer
  // @returns true: no neighbouring pair clashed, and after sorting that means no pair at all clashes.
  return true;
}

const iv = (pairs: number[][]): Interval[] => pairs.map(([s, e]) => new Interval(s, e));

test("252. Meeting Rooms", () => {
  assert.equal(canAttendMeetings(iv([[0, 30], [5, 10], [15, 20]])), false);
  assert.equal(canAttendMeetings(iv([[5, 8], [9, 15]])), true);
  assert.equal(canAttendMeetings([]), true);
  assert.equal(canAttendMeetings(iv([[5, 8], [8, 9]])), true);
});
