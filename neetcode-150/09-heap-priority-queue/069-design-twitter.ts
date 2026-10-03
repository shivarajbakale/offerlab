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
 *
 * Pattern: design,k-way-merge
 * Key insight: Each user's tweets are already in time order, so the feed is a merge of
 *   sorted lists. A max-heap seeded with each followee's newest tweet yields the 10
 *   newest overall while only touching about 10 tweets.
 * Real world: Social media news feeds and log viewers that merge several time-ordered
 *   streams (per user or per server) into one timeline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why A binary heap: the best item by `cmp` is always at the front, in O(log n) per change.
class Heap<T> {
  // @why The heap stored flat in an array; the children of index i are 2i+1 and 2i+2.
  private data: T[] = [];
  // @why Says which of two items belongs nearer the top (negative means `a` first).
  private cmp: (a: T, b: T) => number;

  // @why Pass in the ordering, so one class works as a min-heap or max-heap.
  constructor(cmp: (a: T, b: T) => number) {
    // @why Keep the ordering for later comparisons.
    this.cmp = cmp;
  }

  // @why How many items are in the heap.
  size(): number {
    return this.data.length;
  }

  // @why Add an item and keep the heap rule true.
  push(val: T): void {
    // @why A short name for the array.
    const d = this.data;
    // @why Put the new item at the end, the only free slot.
    d.push(val);
    // @why `i` is where the new item sits as it moves up.
    let i = d.length - 1;
    // @why Climb until the item reaches the root.
    while (i > 0) {
      // @why Index of the parent.
      const p = (i - 1) >> 1;
      // @why The parent is already as good or better, so the item is in place.
      if (this.cmp(d[i], d[p]) >= 0) break;
      // @why The item beats its parent, so swap them.
      [d[i], d[p]] = [d[p], d[i]];
      // @why Continue from the parent's old spot.
      i = p;
    }
  }

  // @why Remove and return the top item.
  pop(): T | undefined {
    // @why A short name for the array.
    const d = this.data;
    // @why Nothing to remove from an empty heap.
    if (d.length === 0) return undefined;
    // @why Save the top item, since we will overwrite its spot.
    const top = d[0];
    // @why Take the last item off the end so the array stays gap-free.
    const last = d.pop()!;
    // @why If the heap is now empty there is nothing to rebalance.
    if (d.length > 0) {
      // @why Put the last item at the root; it is probably in the wrong place.
      d[0] = last;
      // @why `i` is where that item sits as it sinks down.
      let i = 0;
      // @why Sink it down until it fits.
      for (;;) {
        // @why Index of the left child.
        const l = 2 * i + 1;
        // @why Index of the right child.
        const r = l + 1;
        // @why Track which of the three (item, left, right) should be on top.
        let best = i;
        // @why If the left child exists and beats the current best, pick it.
        if (l < d.length && this.cmp(d[l], d[best]) < 0) best = l;
        // @why Same check for the right child.
        if (r < d.length && this.cmp(d[r], d[best]) < 0) best = r;
        // @why The item beats both children, so it is in place.
        if (best === i) break;
        // @why Swap with the better child to push the item down.
        [d[i], d[best]] = [d[best], d[i]];
        // @why Continue from the child's spot.
        i = best;
      }
    }
    // @why Give back the item that was on top.
    return top;
  }
}

// @why A tweet with a global time stamp, so we can order tweets across users.
type Tweet = { time: number; id: number };
// Heap entry: a tweet plus where it came from, so we can fetch the next one.
// @why A heap entry: a tweet plus its author and position, to fetch their next older tweet.
type Entry = { time: number; id: number; user: number; idx: number };

// @why A tiny Twitter: post, follow, unfollow and a feed of the 10 newest tweets.
export class Twitter {
  // @why A counter that gives every tweet a newer time than the last.
  private time = 0;
  // @why Each user's tweets, oldest first.
  private tweets = new Map<number, Tweet[]>();
  // @why Who each user follows.
  private following = new Map<number, Set<number>>();

  // @why Save a tweet for a user.
  postTweet(userId: number, tweetId: number): void {
    // @why Make a tweet list the first time a user posts.
    if (!this.tweets.has(userId)) this.tweets.set(userId, []);
    // @why Add the tweet with the next time stamp.
    this.tweets.get(userId)!.push({ time: this.time++, id: tweetId });
  }

  // @why The 10 newest tweet ids from the user and everyone they follow.
  getNewsFeed(userId: number): number[] {
    // @why A max-heap on time, so the newest tweet is always on top.
    const heap = new Heap<Entry>((a, b) => b.time - a.time); // max-heap
    // @why Copy the followed users into a new set so we don't change the original.
    const sources = new Set(this.following.get(userId) ?? []);
    // @why Users see their own tweets too.
    sources.add(userId);

    // @why Start with each person's newest tweet only.
    for (const u of sources) {
      // @why That person's tweets.
      const list = this.tweets.get(u);
      // @why Skip people who have not posted.
      if (list && list.length > 0) {
        // @why Their newest tweet is the last one.
        const idx = list.length - 1;
        // @why Add it with the author and position, so we can step back later.
        heap.push({ ...list[idx], user: u, idx });
      }
    }

    // @why The feed we are building.
    const feed: number[] = [];
    // @why Take the newest tweet until we have 10 or run out.
    while (heap.size() > 0 && feed.length < 10) {
      // @why The newest tweet among all candidates.
      const top = heap.pop()!;
      // @why Add it to the feed.
      feed.push(top.id);
      // @why If that author has an older tweet, it is the next candidate from them.
      if (top.idx > 0) {
        // @why Position of their next older tweet.
        const idx = top.idx - 1;
        // @why Add that older tweet to the heap.
        heap.push({ ...this.tweets.get(top.user)![idx], user: top.user, idx });
      }
    }
    // @why Return the newest-first list.
    return feed;
  }

  // @why Start following someone.
  follow(followerId: number, followeeId: number): void {
    // @why Following yourself does nothing, since your own tweets show anyway.
    if (followerId === followeeId) return;
    // @why Make a follow set the first time this user follows someone.
    if (!this.following.has(followerId)) this.following.set(followerId, new Set());
    // @why Record the follow; a set ignores repeats.
    this.following.get(followerId)!.add(followeeId);
  }

  // @why Stop following someone.
  unfollow(followerId: number, followeeId: number): void {
    // @why Remove them if the user follows anyone; otherwise do nothing.
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
