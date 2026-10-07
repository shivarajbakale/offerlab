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

// @rule the heap holds each source's newest unshown tweet; its top is the newest of all
// @why A tiny Twitter: post, follow, unfollow and a feed of the 10 newest tweets.
export class Twitter {
  // @why A counter that gives every tweet a newer time than the last.
  private time = 0;
  // @why Each user's tweets, oldest first.
  private tweets = new Map<number, Tweet[]>();
  // @why Who each user follows.
  private following = new Map<number, Set<number>>();

  // @why Save a tweet for a user.
  // @goal user {userId} posts tweet {tweetId}: where does it go so feeds can find it fast?
  postTweet(userId: number, tweetId: number): void {
    // @why Make a tweet list the first time a user posts.
    // @phase Post: append to the author's own list
    // @yes User {userId} has never posted, so give them an empty list first.
    // @no User {userId} already has a list of {this.tweets.get(userId).length}, so just add to it.
    if (!this.tweets.has(userId)) this.tweets.set(userId, []);
    // @why Add the tweet with the next time stamp.
    // @say Stamp tweet {tweetId} with time {this.time}, newer than every tweet before it. Appending keeps each user's list sorted oldest to newest for free, so a feed never has to sort it.
    this.tweets.get(userId)!.push({ time: this.time++, id: tweetId });
  }

  // @why The 10 newest tweet ids from the user and everyone they follow.
  // @goal what are the 10 newest tweets user {userId} should see?
  getNewsFeed(userId: number): number[] {
    // @why A max-heap on time, so the newest tweet is always on top.
    // @phase Feed: one candidate per source
    // @say Gathering every tweet from every followed user and sorting costs time for tweets nobody will see. Each user's list is already sorted, so this is a merge: keep only each source's newest unshown tweet in a max-heap, and the top is always the next tweet of the feed.
    const heap = new Heap<Entry>((a, b) => b.time - a.time); // max-heap
    // @why Copy the followed users into a new set so we don't change the original.
    // @say User {userId} follows {JSON.stringify([...(this.following.get(userId) ?? [])])}. Copy that set, so adding the user below does not change who they follow.
    const sources = new Set(this.following.get(userId) ?? []);
    // @why Users see their own tweets too.
    // @say Add user {userId} to the sources: your own tweets belong in your feed too.
    sources.add(userId);

    // @why Start with each person's newest tweet only.
    // @say Source: user {u}.
    for (const u of sources) {
      // @why That person's tweets.
      // @say User {u}'s tweets, oldest first: {JSON.stringify(this.tweets.get(u) ?? [])}.
      const list = this.tweets.get(u);
      // @why Skip people who have not posted.
      // @yes User {u} has {list.length === 1 ? "one tweet, so it is their candidate" : list.length + " tweets. Only the newest can be the next one shown from them, so it alone is the candidate"}.
      // @no User {u} has never posted, so they add no candidate.
      if (list && list.length > 0) {
        // @why Their newest tweet is the last one.
        // @say The newest is the last in the list, at index {list.length - 1}.
        const idx = list.length - 1;
        // @why Add it with the author and position, so we can step back later.
        // @say Add tweet {list[idx].id} (time {list[idx].time}) with its author and position, so once it is shown the heap knows where user {u}'s next older tweet is.
        heap.push({ ...list[idx], user: u, idx });
      }
    }

    // @why The feed we are building.
    // @phase Feed: take the newest, then refill from its author
    // @say {heap.data.length} {heap.data.length === 1 ? "candidate" : "candidates"} in the heap, one per source that has posted.
    const feed: number[] = [];
    // @why Take the newest tweet until we have 10 or run out.
    // @yes The feed has {feed.length} of 10 and {heap.data.length} {heap.data.length === 1 ? "candidate is" : "candidates are"} waiting, so take the next one.
    // @no {feed.length === 10 ? "The feed is full at 10" : "Every source has run out of tweets"}, so stop.
    // @say {heap.data.length > 0 && feed.length < 10 ? "The feed has " + feed.length + " of 10 and " + heap.data.length + " waiting, so take the next one." : feed.length === 10 ? "The feed is full at 10, so stop." : "Every source has run out of tweets, so stop at " + feed.length + "."}
    while (heap.size() > 0 && feed.length < 10) {
      // @why The newest tweet among all candidates.
      // @say The top, tweet {heap.data[0].id} from user {heap.data[0].user}, {heap.data.length > 1 ? "is newer than every other source's newest unshown tweet, and each source's older ones are older still, so nothing can beat it." : "is the only candidate left."}
      const top = heap.pop()!; // @ask top.id
      // @why Add it to the feed.
      // @say Tweet {top.id} goes next in the feed.
      feed.push(top.id); // @moment feed gets tweet {top.id}
      // @why If that author has an older tweet, it is the next candidate from them.
      // @yes User {top.user} has older tweets. The one just before, at index {top.idx - 1}, is now their newest unshown, so it replaces the one taken.
      // @no That was user {top.user}'s oldest tweet, so they have no more candidates.
      if (top.idx > 0) {
        // @why Position of their next older tweet.
        const idx = top.idx - 1;
        // @why Add that older tweet to the heap.
        // @say Add tweet {this.tweets.get(top.user)[idx].id} (time {this.tweets.get(top.user)[idx].time}). Each source still has at most one candidate, so the heap stays small.
        heap.push({ ...this.tweets.get(top.user)![idx], user: top.user, idx }); // @ask heap.data.length
      }
    }
    // @why Return the newest-first list.
    // @returns {JSON.stringify(feed)}, newest first. Only the tweets shown (plus one per source) went through the heap, not every tweet.
    return feed;
  }

  // @why Start following someone.
  // @goal user {followerId} follows user {followeeId}: what has to change?
  follow(followerId: number, followeeId: number): void {
    // @why Following yourself does nothing, since your own tweets show anyway.
    // @phase Follow: one entry in a set
    // @yes A user following themselves changes nothing: their own tweets are always in their feed.
    // @no {followerId} and {followeeId} are different users, so record it.
    // @returns nothing; there is nothing to record.
    if (followerId === followeeId) return;
    // @why Make a follow set the first time this user follows someone.
    // @yes User {followerId} follows nobody yet, so give them an empty set.
    // @no User {followerId} already follows {JSON.stringify([...this.following.get(followerId)])}.
    if (!this.following.has(followerId)) this.following.set(followerId, new Set());
    // @why Record the follow; a set ignores repeats.
    // @say Add {followeeId}. A set makes a repeat follow harmless and unfollow O(1); past tweets need no copying, since feeds read authors' lists directly.
    this.following.get(followerId)!.add(followeeId);
  }

  // @why Stop following someone.
  // @goal user {followerId} unfollows user {followeeId}: what has to change?
  unfollow(followerId: number, followeeId: number): void {
    // @why Remove them if the user follows anyone; otherwise do nothing.
    // @phase Unfollow: remove one entry
    // @say Remove {followeeId} from user {followerId}'s follow set. Their tweets stay where they are; the next feed simply stops reading them.
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
