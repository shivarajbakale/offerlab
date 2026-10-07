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
  // TODO: implement
  throw new Error("Not implemented");
}

const iv = (pairs: number[][]): Interval[] => pairs.map(([s, e]) => new Interval(s, e));

test("253. Meeting Rooms II", () => {
  assert.equal(minMeetingRooms(iv([[0, 40], [5, 10], [15, 20]])), 2);
  assert.equal(minMeetingRooms(iv([[4, 9]])), 1);
  assert.equal(minMeetingRooms([]), 0);
  assert.equal(minMeetingRooms(iv([[1, 5], [2, 6], [3, 7], [5, 8]])), 3);
});
