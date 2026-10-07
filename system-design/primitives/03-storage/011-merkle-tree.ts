/**
 * 011. Merkle Tree
 * Level: Staff
 * Group: Storage
 *
 * Problem: Two replicas of the same data drift apart (a missed write, a replica that was down).
 *   Find exactly which keys differ without sending all the data, or even a fingerprint of
 *   every key, across the network.
 *
 * Approach: A tree of hashes over key buckets
 *   Each replica hashes its keys into a fixed number of buckets and fingerprints each bucket's
 *   contents: those are the leaves. Each parent is the fingerprint of its two children's
 *   fingerprints, up to a single root. Two replicas compare roots first: equal roots mean equal
 *   data. Where two nodes differ, they compare those nodes' children, and descend only into
 *   the halves that differ, until they reach the buckets that need repair. A write changes one
 *   bucket, so only its leaf and the nodes above it are rehashed.
 *
 * Cost: compare: 1 node when nothing differs, about 1 + 2·log2(B) for one differing bucket
 *   out of B, up to all 2B - 1 when everything differs; write: log2(B) + 1 hashes; memory:
 *   2B - 1 fingerprints.
 *
 * Pattern: anti-entropy
 * Key insight: A fingerprint of fingerprints summarises everything below it, so one equal pair
 *   rules out a whole subtree at once. The comparison cost tracks how much differs, not how
 *   much data there is.
 * Tradeoffs: More buckets pinpoint differences more precisely (less data resent per bucket)
 *   but cost more memory and a taller tree. The tree must be kept up to date on every write,
 *   or rebuilt before each comparison, which means reading all the data. A bucket that differs
 *   is resent whole, even when only one key in it changed.
 * Staff notes: Dynamo-style stores keep one tree per key range a node owns, so two replicas
 *   compare only the ranges they share, and a change in ownership means rebuilding trees.
 *   Cassandra builds its trees during repair by reading the data, which is heavy I/O; that is
 *   why repair is scheduled and incremental. The hash must be long enough that accidental
 *   equal fingerprints never happen in practice (here 16 bits, only so it fits on screen).
 * Interview signals: "replicas out of sync", "anti-entropy", "repair", "sync two large
 *   datasets", "detect tampering", "content-addressed storage".
 * Real world: Amazon's Dynamo paper (2007) uses Merkle trees per key range for anti-entropy;
 *   Apache Cassandra builds them for its repair process. Git names every file and directory by
 *   a hash of its contents, so a commit's hash covers its whole tree in the same way.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type MerkleNode = { value: string; left: MerkleNode | null; right: MerkleNode | null };

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// @why A fingerprint: a short number computed from the data. Any change to the data almost surely changes it. Cut to 4 hex digits here so it fits in a circle; real trees keep 128 bits or more.
function fingerprint(s: string): string {
  const h = hash32(s);
  return ((h ^ (h >>> 16)) & 0xffff).toString(16).padStart(4, "0");
}

export class MerkleTree {
  // @viz merkle:this,other hide:other,k,v,lo,hi,mid,i,s,h,fresh,combined,size,compared,rehashed,differing,buckets,rest,root,x,y,node,left,right,hashes,ignoresRight,b values:lo,hi,mid,b
  root: MerkleNode;
  // @why Keys are grouped into a fixed number of buckets, so both replicas build trees of the same shape and can compare them node by node.
  size: number;
  // @why Each bucket's keys and values, sorted; buckets with no keys are left out.
  buckets = new Map<number, string[]>();
  // @why How many node pairs the last diff looked at: the cost of finding the differences.
  compared = 0;
  differing: number[] = [];
  // @why How many hashes the last write recomputed: the cost of keeping the tree up to date.
  rehashed = 0;

  constructor(buckets = 8) {
    // @caption A replica builds its Merkle tree. Its keys are spread over {size} buckets; each bucket gets a fingerprint (a leaf), and each node above is a fingerprint of the two below it, up to one root that sums up all the data.
    this.size = buckets;
    this.root = this.build(0, buckets - 1);
  }

  bucketOf(k: string): number {
    return hash32(k) % this.size;
  }

  leafHash(i: number): string {
    return fingerprint((this.buckets.get(i) ?? []).join(","));
  }

  // @why A parent's fingerprint covers both children's fingerprints, so a change anywhere below changes every fingerprint up to the root.
  combine(left: MerkleNode, right: MerkleNode): string {
    return fingerprint(left.value + right.value);
  }

  build(lo: number, hi: number): MerkleNode {
    if (lo === hi) return { value: this.leafHash(lo), left: null, right: null };
    const mid = (lo + hi) >> 1;
    const left = this.build(lo, mid);
    const right = this.build(mid + 1, hi);
    return { value: this.combine(left, right), left, right };
  }

  /** Stores the write and returns the new root fingerprint. */
  put(k: string, v: string): string {
    const b = this.bucketOf(k);
    const rest = (this.buckets.get(b) ?? []).filter((e) => !e.startsWith(`${k}=`));
    // @caption {v === "v1" ? "Write " + k + "=" + v + "." : "One replica, B, gets a write, " + k + "=" + v + ", that the other replica, A, missed (say A was down for a moment)."} The key falls in bucket {b}, so only that bucket's contents change.
    this.buckets.set(b, [...rest, `${k}=${v}`].sort()); // @mark bucket
    this.rehashed = 0;
    this.update(this.root, 0, this.size - 1, b);
    return this.root.value;
  }

  // @why Only the changed bucket's leaf and the nodes above it need new fingerprints: one per level, not the whole tree.
  update(node: MerkleNode, lo: number, hi: number, b: number) {
    this.rehashed++;
    if (lo === hi) {
      const fresh = this.leafHash(b);
      // @caption Bucket {b}'s leaf gets a new fingerprint, {fresh}. Any change to a bucket's keys changes its fingerprint.
      node.value = fresh; // @mark rehash-leaf
      return;
    }
    const mid = (lo + hi) >> 1;
    if (b <= mid) this.update(node.left!, lo, mid, b);
    else this.update(node.right!, mid + 1, hi, b);
    const combined = this.combine(node.left!, node.right!);
    // @caption {self.ignoresRight && b > mid ? "bad: The change is in this node's right half, but this broken tree fingerprints only the left child. So the node keeps its old fingerprint, " + combined + ", and the change goes no higher." : lo === 0 && hi === size - 1 ? "The root's fingerprint changes too, to " + combined + ". This write recomputed " + rehashed + " fingerprints: the leaf and one per level above it, not the whole tree." : "The node above covers buckets " + lo + " to " + hi + ". Its fingerprint is made from its two children's, so it changes too: now " + combined + "."}
    node.value = combined; // @mark rehash-parent
  }

  diff(other: MerkleTree): number[] {
    this.compared = 0;
    this.differing = [];
    this.walk(this.root, other.root, 0, this.size - 1);
    return this.differing;
  }

  walk(x: MerkleNode, y: MerkleNode, lo: number, hi: number) {
    // @caption {x.value === y.value ? (lo === 0 && hi === size - 1 ? (self.ignoresRight ? "bad: The roots match (" + x.value + "), so the replicas look identical and nothing is repaired. But they hold different data: the change in the right half never reached the root." : "good: The roots match (" + x.value + " on both), so all the data matches. One comparison, and nothing needs to be sent.") : "good: " + (lo === hi ? "Bucket " + lo + " matches" : "Buckets " + lo + " to " + hi + " match") + " (" + x.value + " on both). Everything below is equal, so this whole part is skipped without looking inside.") : lo === hi ? "Bucket " + lo + " differs: " + x.value + " on A, " + y.value + " on B." : (lo === 0 && hi === size - 1 ? "Compare the roots first: " + x.value + " on A, " + y.value + " on B. They differ, so something differs somewhere. Look one level down." : "Buckets " + lo + " to " + hi + " differ (" + x.value + " vs " + y.value + "). Look one level down, at both halves.")} ({compared === 1 ? "1 pair" : compared + " pairs"} compared so far.)
    this.compared++;
    // @why Equal fingerprints mean everything below is equal, so this whole subtree is skipped. This is where the savings come from.
    if (x.value === y.value) return; // @mark same
    if (lo === hi) {
      // @caption good: Found it: bucket {lo} is the one that differs, after {compared} comparisons. Only that bucket's keys need to be sent across the network and repaired, not all the data.
      this.differing.push(lo); // @mark found
      return;
    }
    const mid = (lo + hi) >> 1;
    // @caption Look one level down, left half first: {lo === hi ? "bucket " + lo : "buckets " + lo + " to " + hi}, {x.value} on A and {y.value} on B. {x.value === y.value ? "They match, so this whole half is skipped." : "They differ too, so keep going down."}
    this.walk(x.left!, y.left!, lo, mid); // @mark descend
    this.walk(x.right!, y.right!, mid + 1, hi);
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: one hash per bucket in a flat list, with no tree above them.
export class FlatHashList {
  hashes: string[];
  buckets = new Map<number, string[]>();
  compared = 0;
  differing: number[] = [];

  constructor(buckets = 8) {
    this.hashes = Array.from({ length: buckets }, () => fingerprint(""));
  }

  bucketOf(k: string): number {
    return hash32(k) % this.hashes.length;
  }

  put(k: string, v: string) {
    const b = this.bucketOf(k);
    this.buckets.set(b, [...(this.buckets.get(b) ?? []).filter((e) => !e.startsWith(`${k}=`)), `${k}=${v}`].sort());
    // @caption {v === "v1" ? "Write " + k + "=" + v + "." : "One replica, B, gets a write, " + k + "=" + v + ", that the other replica, A, missed."} It falls in bucket {b}, so that bucket's fingerprint changes. There is no tree above the buckets: just this flat list.
    this.hashes[b] = fingerprint(this.buckets.get(b)!.join(","));
  }

  diff(other: FlatHashList): number[] {
    this.compared = 0;
    this.differing = [];
    for (let i = 0; i < this.hashes.length; i++) {
      // @caption {i === hashes.length - 1 ? "bad: Bucket " + i + ": " + hashes[i] + " vs " + other.hashes[i] + ". That was the last of all " + compared + " buckets: a flat list must compare every bucket, every time, to find " + (differing.length + (hashes[i] !== other.hashes[i] ? 1 : 0)) + " difference. With 1,024 buckets it would be 1,024 comparisons." : "Compare bucket " + i + ": " + hashes[i] + " on A, " + other.hashes[i] + " on B. " + (hashes[i] === other.hashes[i] ? "Same." : "Different!") + " (" + compared + " of " + hashes.length + " compared.)"}
      this.compared++; // @mark flat-compare
      if (this.hashes[i] !== other.hashes[i]) this.differing.push(i);
    }
    return this.differing;
  }
}

// Broken on purpose: a parent's hash covers only its left child.
export class LeftOnlyMerkle extends MerkleTree {
  // For the picture only: marks this tree as the broken one in captions.
  ignoresRight = true;

  combine(left: MerkleNode, right: MerkleNode): string {
    void right;
    return fingerprint(left.value); // @mark left-only
  }
}

function load(tree: { put(k: string, v: string): void }, n: number) {
  for (let i = 1; i <= n; i++) tree.put(`user${i}`, `v1`);
}

/** A replica holding user1..user{n}, built quietly. */
function replica<T extends { put(k: string, v: string): void }>(make: () => T, n: number): T {
  const tree = make();
  load(tree, n);
  return tree;
}

/** Every inner node's value must be the hash of its two children's values. */
function parentsMatch(tree: MerkleTree, node: MerkleNode | null): boolean {
  if (!node || !node.left || !node.right) return true;
  return node.value === tree.combine(node.left, node.right) && parentsMatch(tree, node.left) && parentsMatch(tree, node.right);
}

test("build: a parent is the hash of its two children", () => {
  const tree = new MerkleTree(8);
  load(tree, 6);
  tree.put("user7", "v1");
  assert.ok(parentsMatch(tree, tree.root));
  assert.equal(tree.rehashed, 4, "a write rehashes its leaf and the 3 nodes above it");
});

/** Comparisons to find one changed key between two replicas with `buckets` buckets, measured quietly. */
function diffCost(make: (buckets: number) => MerkleTree | FlatHashList, buckets: number): number {
  const a = replica(() => make(buckets), 50);
  const b = replica(() => make(buckets), 50);
  b.put("user7", "v2");
  if (a instanceof MerkleTree && b instanceof MerkleTree) a.diff(b);
  else if (a instanceof FlatHashList && b instanceof FlatHashList) a.diff(b);
  return a.compared;
}

test("same: equal roots mean nothing to send", () => {
  const a = replica(() => new MerkleTree(8), 6);
  const b = replica(() => new MerkleTree(8), 6);
  assert.deepEqual(a.diff(b), []);
  assert.equal(a.compared, 1, "only the roots were compared");
});

test("diff: one changed key is found by comparing about 2·log n nodes", () => {
  const a = replica(() => new MerkleTree(8), 6);
  const b = replica(() => new MerkleTree(8), 6);
  b.put("user7", "v2");
  assert.deepEqual(a.diff(b), [a.bucketOf("user7")]);
  assert.equal(a.compared, 1 + 2 * 3, "the root, then two children at each of 3 levels");
  assert.equal(diffCost((n) => new MerkleTree(n), 1024), 1 + 2 * 10, "with 1024 buckets: 21 comparisons");
});

test("broken: flat list of bucket hashes — every bucket is compared", () => {
  const a = replica(() => new FlatHashList(8), 6);
  const b = replica(() => new FlatHashList(8), 6);
  b.put("user7", "v2");
  assert.deepEqual(a.diff(b), [a.bucketOf("user7")]);
  assert.equal(a.compared, 8, "all 8 bucket hashes, to find 1 difference");
  assert.equal(diffCost((n) => new FlatHashList(n), 1024), 1024, "with 1024 buckets: 1024 comparisons");
});

test("broken: parent hashes only its left child — a change on the right goes unnoticed", () => {
  const a = replica(() => new LeftOnlyMerkle(8), 6);
  const b = replica(() => new LeftOnlyMerkle(8), 6);
  const key = rightHalfKey(a);
  b.put(key, "v2");
  assert.notDeepEqual(a.buckets, b.buckets, "the replicas hold different data");
  assert.deepEqual(a.diff(b), [], "but the roots match, so nothing is repaired");
});

/** A key that lands in the right half of the buckets. */
function rightHalfKey(tree: MerkleTree): string {
  for (let i = 1; i < 1000; i++) if (tree.bucketOf(`user${i}`) >= tree.size / 2) return `user${i}`;
  return "none";
}
