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
 *
 * Approach: Per-user tweet lists + k-way merge with a max-heap
 *   Each tweet gets a global increasing timestamp and is appended to its
 *   author's list. For a feed, seed a max-heap (by timestamp) with the newest
 *   tweet of the user and each followee. Pop the newest overall, then push
 *   the next-older tweet from the same author, until 10 tweets are collected.
 *
 * Time: post/follow/unfollow O(1); getNewsFeed O(f + 10 log f) for f
 *       followees   Space: O(users + tweets + follows)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

class Heap<T> {
  private data: T[] = [];
  private cmp: (a: T, b: T) => number;

  constructor(cmp: (a: T, b: T) => number) {
    this.cmp = cmp;
  }

  size(): number {
    return this.data.length;
  }

  push(val: T): void {
    const d = this.data;
    d.push(val);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(d[i], d[p]) >= 0) break;
      [d[i], d[p]] = [d[p], d[i]];
      i = p;
    }
  }

  pop(): T | undefined {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < d.length && this.cmp(d[l], d[best]) < 0) best = l;
        if (r < d.length && this.cmp(d[r], d[best]) < 0) best = r;
        if (best === i) break;
        [d[i], d[best]] = [d[best], d[i]];
        i = best;
      }
    }
    return top;
  }
}

type Tweet = { time: number; id: number };
// Heap entry: a tweet plus where it came from, so we can fetch the next one.
type Entry = { time: number; id: number; user: number; idx: number };

export class Twitter {
  private time = 0;
  private tweets = new Map<number, Tweet[]>();
  private following = new Map<number, Set<number>>();

  postTweet(userId: number, tweetId: number): void {
    if (!this.tweets.has(userId)) this.tweets.set(userId, []);
    this.tweets.get(userId)!.push({ time: this.time++, id: tweetId });
  }

  getNewsFeed(userId: number): number[] {
    const heap = new Heap<Entry>((a, b) => b.time - a.time); // max-heap
    const sources = new Set(this.following.get(userId) ?? []);
    sources.add(userId);

    for (const u of sources) {
      const list = this.tweets.get(u);
      if (list && list.length > 0) {
        const idx = list.length - 1;
        heap.push({ ...list[idx], user: u, idx });
      }
    }

    const feed: number[] = [];
    while (heap.size() > 0 && feed.length < 10) {
      const top = heap.pop()!;
      feed.push(top.id);
      if (top.idx > 0) {
        const idx = top.idx - 1;
        heap.push({ ...this.tweets.get(top.user)![idx], user: top.user, idx });
      }
    }
    return feed;
  }

  follow(followerId: number, followeeId: number): void {
    if (followerId === followeeId) return;
    if (!this.following.has(followerId)) this.following.set(followerId, new Set());
    this.following.get(followerId)!.add(followeeId);
  }

  unfollow(followerId: number, followeeId: number): void {
    this.following.get(followerId)?.delete(followeeId);
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
