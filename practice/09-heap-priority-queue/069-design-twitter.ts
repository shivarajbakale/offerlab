/**
 * 355. Design Twitter
 * Difficulty: Medium
 * Category: Heap / Priority Queue
 * LeetCode: https://leetcode.com/problems/design-twitter/
 *
 * Design a simplified Twitter where users can post tweets, follow and
 * unfollow other users, and see the 10 most recent tweets in their feed.
 *   - postTweet(userId, tweetId): user posts a new tweet (ids are unique).
 *   - getNewsFeed(userId): return up to 10 most recent tweet ids posted by
 *     the user or anyone they follow, ordered most recent first.
 *   - follow(followerId, followeeId): follower starts following followee.
 *   - unfollow(followerId, followeeId): follower stops following followee.
 *
 * Example 1:
 *   Input:  ["Twitter", "postTweet", "getNewsFeed", "follow", "postTweet",
 *            "getNewsFeed", "unfollow", "getNewsFeed"]
 *           [[], [1, 5], [1], [1, 2], [2, 6], [1], [1, 2], [1]]
 *   Output: [null, null, [5], null, null, [6, 5], null, [5]]
 *
 * Constraints:
 *   1 <= userId, followerId, followeeId <= 500
 *   0 <= tweetId <= 10^4
 *   All tweet ids are unique
 *   At most 3 * 10^4 calls in total
 *   A user cannot follow themselves
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Note: JavaScript has no built-in heap. Write your own (a sorted array is fine to start).

export class Twitter {
  postTweet(userId: number, tweetId: number): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  getNewsFeed(userId: number): number[] {
    // TODO: implement
    throw new Error("Not implemented");
  }

  follow(followerId: number, followeeId: number): void {
    // TODO: implement
    throw new Error("Not implemented");
  }

  unfollow(followerId: number, followeeId: number): void {
    // TODO: implement
    throw new Error("Not implemented");
  }
}

test("355. Design Twitter", () => {
  const t = new Twitter();
  t.postTweet(1, 5);
  assert.deepEqual(t.getNewsFeed(1), [5]);
  t.follow(1, 2);
  t.postTweet(2, 6);
  assert.deepEqual(t.getNewsFeed(1), [6, 5]);
  t.unfollow(1, 2);
  assert.deepEqual(t.getNewsFeed(1), [5]);

  // Feed is capped at 10 and ordered newest first
  const u = new Twitter();
  for (let i = 0; i < 12; i++) u.postTweet(i % 2 === 0 ? 1 : 2, i);
  u.follow(1, 2);
  assert.deepEqual(u.getNewsFeed(1), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.deepEqual(u.getNewsFeed(3), []);
});
