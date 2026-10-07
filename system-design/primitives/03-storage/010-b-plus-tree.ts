/**
 * 010. B+ Tree
 * Level: Senior
 * Group: Storage
 *
 * Problem: Find any key, and every key in a range, in data far larger than memory, with as few
 *   disk reads as possible, while inserts keep arriving in any order.
 *
 * Approach: Wide pages, splits that push a key up, linked leaves
 *   Data lives in fixed-size pages, the unit the disk reads. Inner pages hold sorted
 *   separator keys and pointers to child pages; leaves hold the keys with their values and a
 *   link to the next leaf. A search reads one page per level, from the root down. An insert
 *   goes into its leaf; a leaf that overflows splits in two and copies the right half's first
 *   key up into its parent, which may overflow and split in turn. When the root splits, a new
 *   root goes on top, so every leaf stays at the same depth. A range scan finds the first leaf
 *   and then follows the leaf links.
 *
 * Cost: search: one page read per level, and the height is about log base F of N for fan-out
 *   F; insert: the same, plus a split now and then on the way back up; range scan: the height
 *   plus one page per extra leaf.
 *
 * Pattern: storage engine
 * Key insight: The disk reads a whole page whether you use one key from it or hundreds, so
 *   put hundreds of keys in each page. With that fan-out, a tree over billions of keys is
 *   only three or four levels deep, and its top levels stay cached in memory.
 * Tradeoffs: Reads are fast and predictable, because each key has exactly one place. Writes
 *   change pages in place: a one-key change rewrites a whole page, a split touches several
 *   pages, and all of it has to go through a write-ahead log (008) to survive a crash. LSM
 *   trees (009) take writes faster. Pages are often only partly full, which wastes space.
 * Staff notes: A fill factor leaves room in each page so later inserts split less often. In a
 *   clustered index the table's rows live in the leaves of the primary-key tree, so the
 *   choice of primary key decides where every insert lands: increasing keys always go to the
 *   rightmost leaf (dense pages, but one hot page under concurrent inserts), while random keys
 *   such as random UUIDs scatter inserts over many pages and cause more splits and cache
 *   misses. Concurrent access needs page latches; B-link trees add right-sibling links so
 *   readers can cope with a split happening under them.
 * Interview signals: "index", "range query", "ORDER BY", "why is this query slow",
 *   "choosing a primary key", "B-tree or LSM".
 * Real world: Most relational database indexes are B-tree variants, usually B+ trees:
 *   PostgreSQL's default index type, and MySQL InnoDB, which keeps each table's rows in the
 *   leaves of its primary-key tree. SQLite stores tables and indexes in B-trees too.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Page = { id: number; keys: number[]; children?: Page[]; values?: string[]; next: Page | null };

export class BPlusTree {
  // @viz pages:root,path,reads=pageReads hide:v,parents,path,pageReads,height,nextId,maxKeys,order,i,mid,j,bound values:lo,hi,from
  // @why The only page a search can start from. Every other page is reached by following child pointers down from it.
  root: Page;
  // @why The pages the last operation read, top to bottom: the cost the view highlights.
  path: number[] = [];
  // @why Each page visit stands for one disk read, the cost that matters on disk.
  pageReads = 0;
  height = 1;
  nextId = 1;
  // @why A page holds at most this many keys. Real pages hold hundreds, which is what keeps the tree so short.
  maxKeys: number;

  constructor(order = 4) {
    this.maxKeys = order - 1;
    this.root = { id: this.nextId++, keys: [], values: [], next: null };
  }

  // @why Which child's key range holds k: keys below the first separator go to the first child, and so on.
  childIndex(page: Page, k: number): number {
    let i = 0;
    while (i < page.keys.length && k >= page.keys[i]) i++;
    return i;
  }

  // @why Walk from the root to the one leaf that can hold k, reading one page per level.
  descend(k: number, parents: Page[] = []): Page {
    this.path = [];
    let page = this.root;
    while (page.children) {
      // @caption Disk read {pageReads + 1}: page p{page.id}, {path.length === 1 ? "the root, where every search starts" : "an inner page"}. Its keys [{page.keys.join(", ")}] are signposts: they say which child page to read next to find {k}.
      this.path.push(page.id); // @mark read-inner
      this.pageReads++;
      parents.push(page);
      page = page.children[this.childIndex(page, k)];
    }
    // @caption Disk read {pageReads + 1}: leaf p{page.id}, {page.keys.length ? "holding [" + page.keys.join(", ") + "]" : "still empty"}. {path.length === 1 ? "The tree is a single page so far: the root is also the leaf." : "That is " + path.length + " page reads from the root down to a leaf: one per level."}
    this.path.push(page.id); // @mark read-leaf
    this.pageReads++;
    return page;
  }

  get(k: number): string | undefined {
    const leaf = this.descend(k);
    // @why Searching inside a page costs no disk read: the whole page is already in memory.
    const i = leaf.keys.indexOf(k);
    // @caption {i >= 0 ? "good: Found " + k + "=" + leaf.values[i] + " in leaf p" + leaf.id + ", after " + pageReads + " disk reads: exactly one per level, because every leaf is the same depth down. Searching inside a page is free: it is already in memory." : k + " is not in leaf p" + leaf.id + ", the only place it could be: not found, after " + pageReads + " disk reads."}
    return i >= 0 ? leaf.values![i] : undefined; // @mark found
  }

  insert(k: number, v: string) {
    const parents: Page[] = [];
    const leaf = this.descend(k, parents);
    let i = 0;
    while (i < leaf.keys.length && leaf.keys[i] < k) i++;
    if (leaf.keys[i] === k) {
      leaf.values![i] = v;
      return;
    }
    leaf.keys.splice(i, 0, k);
    // @caption {k} goes into leaf p{leaf.id} in key order: [{leaf.keys.join(", ")}]. {leaf.keys.length > maxKeys ? "That is " + leaf.keys.length + " keys, one more than a page holds (" + maxKeys + " here, hundreds in a real database), so the page must split." : "A page holds up to " + maxKeys + " keys, so it fits: done."}
    leaf.values!.splice(i, 0, v); // @mark leaf-insert
    if (leaf.keys.length <= this.maxKeys) return;
    let right = this.splitLeaf(leaf);
    // @why A copy of the right half's first key goes up as the separator: searches for it or anything larger go right.
    // @caption A copy of {sep}, the new page's first key, goes up to the parent as a signpost: searches for {sep} or bigger go to the new page.
    let sep = right.keys[0];
    let left = leaf;
    while (true) {
      const parent = parents.pop();
      // @why The root itself split, so a new root goes on top. This is the only way the tree gets taller, and it adds a level above every leaf at once.
      if (!parent) {
        this.root = { id: this.nextId++, keys: [sep], children: [left, right], next: null };
        // @caption good: There is no parent to take {sep}, so a new root p{root.id} goes on top, holding just [{root.keys.join(", ")}]. This is the only way the tree gets taller, and it adds a level above every leaf at once: every leaf is now {height} levels down.
        this.height++; // @mark new-root
        return;
      }
      const j = this.childIndex(parent, sep);
      parent.keys.splice(j, 0, sep);
      // @caption {sep} goes up into parent p{parent.id}, which now holds [{parent.keys.join(", ")}], with a pointer to the new page p{right.id}. {parent.keys.length > maxKeys ? "That is one key too many, so the parent must split too." : "It fits, so the insert is done."}
      parent.children!.splice(j + 1, 0, right); // @mark push-up
      if (parent.keys.length <= this.maxKeys) return;
      // @why An inner page that overflows splits too. Its middle key moves up (not copied): inner keys only guide searches.
      const mid = Math.floor(parent.keys.length / 2);
      sep = parent.keys[mid];
      right = { id: this.nextId++, keys: parent.keys.slice(mid + 1), children: parent.children!.slice(mid + 1), next: null };
      // @caption The full inner page splits: p{parent.id} keeps [{parent.keys.join(", ")}], a new page p{right.id} takes [{right.keys.join(", ")}], and the middle key {sep} moves up a level. It is moved, not copied: inner keys only guide searches, the values live in the leaves.
      parent.keys = parent.keys.slice(0, mid); // @mark split-inner
      parent.children = parent.children!.slice(0, mid + 1);
      left = parent;
    }
  }

  // @why A full leaf becomes two half-full leaves, so the next few inserts there need no split.
  splitLeaf(leaf: Page): Page {
    const mid = Math.ceil(leaf.keys.length / 2);
    const right: Page = { id: this.nextId++, keys: leaf.keys.slice(mid), values: leaf.values!.slice(mid), next: leaf.next };
    // @caption The full leaf splits in two: p{leaf.id} keeps [{leaf.keys.join(", ")}], and a new page p{right.id} takes [{right.keys.join(", ")}]. Both are now half full, so the next few inserts here need no split. The new page is not linked into the tree yet.
    leaf.keys = leaf.keys.slice(0, mid); // @mark split-leaf
    leaf.values = leaf.values!.slice(0, mid);
    // @why Leaves stay chained in key order, so a range scan can walk from one leaf to the next without going back up.
    // @caption The leaves stay chained in key order: p{leaf.id} → p{right.id}. A range scan can walk along this chain without going back up the tree.
    leaf.next = right;
    return right;
  }

  range(lo: number, hi: number): number[] {
    const out: number[] = [];
    let page: Page | null = this.descend(lo);
    while (page) {
      for (let i = 0; i < page.keys.length; i++) {
        // @caption {page.keys[i] > hi ? "good: " + page.keys[i] + " is past " + hi + ", so the scan stops with [" + out.join(", ") + "]. Disk reads: " + pageReads + ", that is " + height + " to reach the first leaf, then one per extra leaf." : page.keys[i] >= lo ? page.keys[i] + " is in the range " + lo + " to " + hi + ": keep it." : "The scan reads leaf p" + page.id + ", where " + lo + " would be. " + page.keys[i] + " is below " + lo + ": skip it."}
        if (page.keys[i] > hi) return out; // @mark range-end
        if (page.keys[i] >= lo) out.push(page.keys[i]);
      }
      page = page.next;
      if (page) {
        // @caption End of this leaf. Follow its link straight to the next leaf, p{page.id}: disk read {pageReads + 1}. No need to go back up to the root.
        this.path.push(page.id); // @mark next-leaf
        this.pageReads++;
      }
    }
    return out;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: leaves are never linked, so a range scan finds each next leaf from the root.
export class NoLeafLinksTree extends BPlusTree {
  splitLeaf(leaf: Page): Page {
    const right = super.splitLeaf(leaf);
    leaf.next = null;
    return right;
  }

  range(lo: number, hi: number): number[] {
    const out: number[] = [];
    this.path = [];
    let from = lo;
    while (true) {
      // Back to the root. On the way down, the smallest key above `from` in an inner page is where the next leaf starts.
      // @caption {path.length === 0 ? "The scan starts at the root, to find the leaf where " + from + " would be." : "bad: This leaf has no link to the next one, so the scan goes back to the root and descends again, to find the leaf holding keys from " + from + " on. Another " + height + " disk reads (" + pageReads + " so far)."}
      let page = this.root; // @mark re-descend
      let bound: number | null = null;
      while (page.children) {
        this.path.push(page.id);
        this.pageReads++;
        const i = this.childIndex(page, from);
        if (i < page.keys.length) bound = page.keys[i];
        page = page.children[i];
      }
      this.path.push(page.id);
      this.pageReads++;
      for (let i = 0; i < page.keys.length; i++) {
        // @caption {page.keys[i] > hi ? "bad: " + page.keys[i] + " is past " + hi + ", so the scan stops with [" + out.join(", ") + "]. But it took " + pageReads + " disk reads: a full trip from the root, " + height + " reads, for each of the " + pageReads / height + " leaves." : page.keys[i] >= from ? "Leaf p" + page.id + ": " + page.keys[i] + " is in the range: keep it." : "Leaf p" + page.id + ": " + page.keys[i] + " is below " + from + ": skip it."}
        if (page.keys[i] > hi) return out;
        if (page.keys[i] >= from) out.push(page.keys[i]);
      }
      if (bound === null) return out;
      from = bound;
    }
  }
}

type Node = { value: number; left: Node | null; right: Node | null };

// Broken on purpose: a binary search tree, one key per node and one node per page.
export class BinaryTreeIndex {
  root: Node | null = null;
  pageReads = 0;

  get(k: number): boolean {
    let node = this.root;
    while (node) {
      // @caption {k === node.value ? "bad: Found " + k + ", but only after " + pageReads + " disk reads, one per key. Each page holds a single key, and keys that arrived in order made the tree one long chain. A B+ tree over the same 12 keys is only 3 pages deep." : "Disk read " + pageReads + ": a page holding just one key, " + node.value + ". " + k + (k < node.value ? " is smaller, so go left" : " is bigger, so go right") + ", to another page."}
      this.pageReads++; // @mark bst-read
      if (k === node.value) return true;
      node = k < node.value ? node.left : node.right;
    }
    return false;
  }
}

function bstInsert(tree: BinaryTreeIndex, k: number) {
  const fresh: Node = { value: k, left: null, right: null };
  if (!tree.root) {
    tree.root = fresh;
    return;
  }
  let node = tree.root;
  while (true) {
    const side = k < node.value ? "left" : "right";
    if (!node[side]) {
      node[side] = fresh;
      return;
    }
    node = node[side]!;
  }
}

function build(tree: BPlusTree, keys: number[]) {
  for (const k of keys) tree.insert(k, `v${k}`);
  tree.pageReads = 0;
  tree.path = [];
}

/** Page reads for one call on a fresh B+ tree holding `keys`, measured quietly for comparison. */
function readsFor(keys: number[], op: (tree: BPlusTree) => void): number {
  const tree = new BPlusTree();
  build(tree, keys);
  op(tree);
  return tree.pageReads;
}

/** Depth of every leaf, left to right. */
function leafDepths(page: Page, depth = 1): number[] {
  return page.children ? page.children.flatMap((c) => leafDepths(c, depth + 1)) : [depth];
}

function leafKeys(page: Page): number[][] {
  return page.children ? page.children.flatMap(leafKeys) : [page.keys];
}

// The same keys in a fixed shuffled order, so the leaves fill unevenly as they would in practice.
const KEYS = [8, 3, 14, 11, 1, 6, 16, 12, 5, 9, 2, 15, 7, 13, 4, 10];

test("search: one page per level", () => {
  const tree = new BPlusTree();
  build(tree, KEYS);
  assert.equal(tree.get(13), "v13");
  assert.equal(tree.height, 3);
  assert.equal(tree.pageReads, tree.height, "one page read per level");
  assert.equal(tree.path.length, 3);
});

test("split: a full leaf splits and pushes a key up", () => {
  const tree = new BPlusTree();
  tree.insert(10, "v10");
  tree.insert(20, "v20");
  tree.insert(30, "v30");
  assert.equal(tree.height, 1, "one leaf holds three keys");
  tree.insert(40, "v40");
  assert.deepEqual(tree.root.keys, [30], "the right half's first key is copied up");
  assert.deepEqual(leafKeys(tree.root), [
    [10, 20],
    [30, 40],
  ]);
  assert.equal(tree.root.children![0].next, tree.root.children![1], "the halves are linked");
});

test("root split: the tree grows at the top, so all leaves stay at the same depth", () => {
  const tree = new BPlusTree();
  build(tree, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(tree.height, 2);
  assert.equal(tree.root.keys.length, 3, "the root is full");
  tree.insert(10, "v10");
  assert.equal(tree.height, 3);
  assert.equal(tree.root.keys.length, 1, "a new root with one key");
  assert.deepEqual(new Set(leafDepths(tree.root)), new Set([3]), "every leaf is at depth 3");
});

test("range scan: follow the leaf links", () => {
  const tree = new BPlusTree();
  build(tree, KEYS);
  assert.deepEqual(tree.range(5, 12), [5, 6, 7, 8, 9, 10, 11, 12]);
  const leaves = tree.path.length - (tree.height - 1);
  assert.equal(tree.pageReads, tree.height + leaves - 1, "one descent, then one read per extra leaf");
});

test("broken: binary tree — one key per page makes the tree too tall", () => {
  // Keys arriving in order, like an auto-increment id.
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const bst = new BinaryTreeIndex();
  for (const k of ids) bstInsert(bst, k);
  assert.equal(bst.get(12), true);
  const wide = readsFor(ids, (t) => t.get(12));
  assert.equal(bst.pageReads, 12, "one page read per key on the way down");
  assert.ok(bst.pageReads >= 3 * wide, `${bst.pageReads} page reads, against ${wide} in the B+ tree`);
});

test("broken: no leaf links — a range scan re-descends from the root for each leaf", () => {
  const tree = new NoLeafLinksTree();
  build(tree, KEYS);
  assert.deepEqual(tree.range(5, 12), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(readsFor(KEYS, (t) => t.range(5, 12)), 6, "with links: 3 to reach the first leaf, then 3 more leaves");
  assert.equal(tree.pageReads, 12, "without links: 3 for each of the 4 leaves");
});
