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
 *
 * Pattern: intervals
 * Key insight: Which meeting ends does not matter, only how many have ended by each start
 *   time. Sorting starts and ends separately and sweeping them like events counts the peak
 *   number of meetings in progress at once.
 * Real world: Capacity planning for meeting rooms, servers or gates: the peak number of
 *   overlapping sessions is how many resources you must provision.
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

// @viz best:best
// @rule rooms is how many meetings are running when meeting starts[s] begins
// @why Returns the fewest rooms needed so no two overlapping meetings share one.
export function minMeetingRooms(intervals: Interval[]): number {
  // @why All start times in order; which meeting each belongs to does not matter.
  const starts = intervals.map((i) => i.start).sort((a, b) => a - b);
  // @why All end times in order, so `ends[e]` is the next room to free up.
  const ends = intervals.map((i) => i.end).sort((a, b) => a - b);

  // @why Rooms in use right now.
  let rooms = 0;
  // @why The most rooms ever in use at once, which is the answer.
  let best = 0;
  // @why Points at the earliest meeting end that has not been used yet.
  let e = 0;
  // @why Process meetings in the order they start.
  for (let s = 0; s < starts.length; s++) {
    // @why This meeting starts before the earliest end, so no room is free and we need a new one.
    if (starts[s] < ends[e]) {
      // @why Open one more room.
      rooms++; // @ask rooms // @moment meeting at {starts[s]} needs a new room
    // @why The earliest meeting is over, so its room can be reused.
    } else {
      e++; // a meeting ended; its room is reused // @ask e
    }
    // @why Remember the busiest moment.
    best = Math.max(best, rooms);
  }
  // @why The peak number of rooms needed.
  return best;
}

const iv = (pairs: number[][]): Interval[] => pairs.map(([s, e]) => new Interval(s, e));

test("253. Meeting Rooms II", () => {
  assert.equal(minMeetingRooms(iv([[0, 40], [5, 10], [15, 20]])), 2);
  assert.equal(minMeetingRooms(iv([[4, 9]])), 1);
  assert.equal(minMeetingRooms([]), 0);
  assert.equal(minMeetingRooms(iv([[1, 5], [2, 6], [3, 7], [5, 8]])), 3);
});
