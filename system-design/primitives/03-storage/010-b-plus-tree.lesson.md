# B+ tree

## What it is

- **What it is:** A tree index kept on disk in fixed-size pages, where each page holds many keys, often hundreds. Upper pages only point the way down; the bottom pages, called leaves, hold every key and value in sorted order, each linked to the next.
- **The problem it solves:** Data far bigger than memory lives on disk, where every read is slow, and a search that learns one key per disk read, as a binary search tree does, takes 20 or more reads per lookup. A B+ tree finds any key in about 3 or 4 page reads, stays balanced whatever order keys arrive in, and reads ranges by following leaf links.
- **Reach for it when:** Reads matter most: lookups by key and range queries such as "orders between two dates" must be fast and predictable, rows are updated in place, and writes are not so heavy that rewriting pages becomes the bottleneck.
- **Not the right tool when:** Writes dominate and arrive faster than scattered page rewrites can keep up; an [LSM tree](#/sd-03-storage/009-lsm-tree) batches them into large sequential writes. For key-only lookups held entirely in memory, a hash table is simpler.
- **Where you'll meet it:** PostgreSQL's default index type, MySQL InnoDB's tables and indexes, and SQLite's tables; Bayer and McCreight's 1972 B-tree paper; and any interview question about why an index makes a query fast or how to choose a primary key.

## Words we'll use

- **Disk** — storage that keeps its contents through a crash. It holds far more than memory, but every read from it is slow by comparison.
- **Page** — a fixed-size block of a file, such as 8 KB. The disk always reads and writes whole pages, so reading one key costs as much as reading the whole page it is in.
- **Page read** — fetching one page from disk. It is the cost we count. Searching inside a page that is already in memory is cheap by comparison.
- **Index** — a structure that finds the place where a key is stored without looking at every key.
- **Binary search tree** — a tree where each node holds one key, smaller keys go to the left child and larger ones to the right.
- **Height** — how many levels a search passes through from the top of the tree to the bottom.
- **Fan-out** — how many children a page has. Each level divides the remaining keys by the fan-out.
- **Inner page** — a page that holds only **separator** keys and pointers to child pages. Separators say which child to go to: keys below the first separator go to the first child, and so on.
- **Leaf** — a page on the bottom row. Leaves hold the keys and their values. In the view, values are the small text under each key.
- **Split** — turning one overfull page into two half-full ones, and adding a separator for the new page to the parent.
- **Leaf link** — a pointer from each leaf to the next leaf in key order: the teal arrows in the view.
- **Range scan** — fetching every key between a low and a high key, in order.

## The world we're in

- The data is far bigger than memory, so it lives on disk, and the disk reads one page at a time.
- A page read takes much longer than searching the keys of a page already in memory, so the number of page reads is the cost that matters.
- Keys arrive in any order, and inserts never stop.
- Queries ask for one key ("user 13") or for a range ("orders from 5 to 12").

## The goal

Find any key, or every key in a range, with as few page reads as possible, however many keys have been inserted and in whatever order.

## The naive attempt

"Use a binary search tree, and store each node in its own page." Each page read rules out only half of what is left, so even a perfectly balanced tree over a million keys is about 20 levels deep: 20 page reads per lookup. And it does not stay balanced. Here the keys 1 to 12 arrived in order, as auto-increment ids do, so each new key became the right child of the last, and the tree is a chain. Looking up 12 starts at the top.
[▶ Broken: the search for 12 starts at the root, key 1](play:broken: binary tree@at=bst-read#1)
It reads every page on the way down: 12 page reads for 12 keys.
[▶ Broken: the 12th page read finally reaches 12](play:broken: binary tree@at=bst-read#12)

## Building it up

**1. Wide pages.** Put many keys in each page. A page with F children divides the search by F at each level instead of 2. Here pages hold up to 3 keys, so the 16 keys fit in a tree 3 levels high. The search for 13 reads the root, p8, which says 13 belongs right of 11.
[▶ The search for 13 reads the root page](play:search@at=read-inner#1)
It reads one more inner page and then the leaf p2, where 13 is. That is 3 page reads, one per level.
[▶ Three page reads: p8, p7, then leaf p2](play:search@at=found)
Real pages hold hundreds of keys. With a fan-out of 500, three levels cover 500 × 500 × 500, about 125 million keys.

**2. Split a full leaf and push a key up.** Pages have a fixed size, so a leaf can overflow. Here the only page is a leaf holding 10, 20 and 30, and 40 arrives. The leaf now has four keys, one more than fits.
[▶ The leaf holds 10, 20, 30 and 40: one too many](play:split@at=leaf-insert#4)
It splits: the right half, 30 and 40, moves to a new page, p2, which the tree does not link to yet.
[▶ The new page p2 holds 30 and 40](play:split@at=split-leaf)
A copy of p2's first key, 30, goes up as a separator. There is no parent yet, so a new root is made with that one key, pointing to both halves. The halves are linked: p1 → p2.
[▶ 30 goes up into a new root](play:split@at=new-root)

**3. Grow at the top, so every leaf stays at the same depth.** A separator pushed up can overflow the parent too. Here the keys 1 to 9 fill the root with separators 3, 5 and 7. Inserting 10 splits a leaf, and its separator, 9, makes the root hold four keys.
[▶ The root p3 now holds 3, 5, 7 and 9: one too many](play:root split@at=push-up)
The root splits like a leaf, except that its middle key, 7, moves up instead of being copied: inner keys only guide searches, so no copy is needed below.
[▶ The right half, holding 9, becomes p7](play:root split@at=split-inner)
A new root holding 7 goes on top. The tree is one level taller, and the new level is above every leaf at once, so all leaves stay at the same depth. That is why a search never takes more page reads than the height.
[▶ A new root with 7 goes on top](play:root split@at=new-root)

**4. Leaves hold the data, and links join them.** All keys and values are in the leaves, in order, and each leaf points to the next. A range scan for 5 to 12 goes down once, to the leaf holding 5.
[▶ One descent finds the leaf where 5 is](play:range scan@at=range-end)
From there it follows the links: p6, p4, p9, then p2.
[▶ Following the links to p2](play:range scan@at=next-leaf#3)
At 13 it stops. That is 6 page reads: 3 to get down, and 1 for each of the 3 extra leaves.
[▶ The scan stops at 13 after 6 page reads](play:range scan@at=range-end#11)
Without links, finding the next leaf means going back to the root each time.
[▶ Broken: back to the root to find the leaf after p6](play:broken: no leaf links@at=re-descend#2)
The fourth trip down starts with 9 page reads already spent, and the scan ends at 12: twice the 6 it needs with links.
[▶ Broken: the fourth descent from the root](play:broken: no leaf links@at=re-descend#4)

## Why it works now

- The tree only grows by adding a root on top, so every leaf is always at the same depth, and a search reads exactly one page per level. [▶ See it](play:search@at=found)
- Separators are copies of keys that split the range of their children, so following them always leads to the one leaf that can hold the key.
- Splits leave pages at least about half full, so the height stays near log base F of N, with F the fan-out.
- Leaves are linked in key order, so a range scan pays for the descent once.
- The tests check each of these: `search` counts one read per level, `root split` checks every leaf's depth, and `range scan` counts the reads.

## What it costs

- **Writes rewrite whole pages.** Changing one key means writing its whole page back, and a split writes several pages. To survive a crash in the middle of a split, those changes go through a write-ahead log (lesson 008) first.
- **Wasted space.** After a split, both halves are only half full. Pages typically run well short of full.
- **Writes are slower than an LSM tree's** (lesson 009), which never changes a page in place. In return, reads here are faster and more predictable: each key has exactly one place.

## Staff notes

- **Where you meet it.** When you create an index in a relational database (one that stores data as tables of rows and is queried with SQL), you are usually building a B+ tree: it is PostgreSQL's default index type, MySQL's InnoDB stores every table and index this way, and SQLite keeps its tables and indexes in B-trees too. A query such as `WHERE id = 13` walks root to leaf, and `WHERE id BETWEEN 5 AND 12` finds the first leaf and then follows the leaf links, exactly as here.
- **Write amplification compared with an LSM tree.** A B+ tree writes a whole page, plus a log record, for each changed key. An LSM tree writes keys in big sorted batches, but rewrites them during compaction. Write-heavy workloads tend to favour LSM trees, read-heavy ones B+ trees.
- **Fill factor.** Leaving free space in each page (say, filling to 90%) lets later inserts land without splitting at once. PostgreSQL lets you set a fill factor per index.
- **Clustered index.** In some databases, such as MySQL's InnoDB, the table's rows themselves live in the leaves of the primary-key tree. Other indexes then point to the primary key rather than to a row's location.
- **Choose keys with the tree in mind.** Ever-increasing keys always insert into the rightmost leaf: pages fill densely, but under many concurrent inserts that one page gets crowded. Random keys, such as random UUIDs, spread inserts over every leaf, causing more splits and more pages that must be read into memory.

## Check yourself

- **Q:** The tree is three levels deep. How many page reads does looking up one key take?
  A: Three: one per level, root to leaf. Every leaf is at the same depth. [▶ See it](play:search@at=found)
- **Q:** A leaf holds 10, 20 and 30, and at most 3 keys fit. What happens when 40 is inserted?
  A: The leaf splits into [10, 20] and [30, 40], and a copy of 30 goes up into the parent. Here there was no parent, so 30 becomes a new root. [▶ See it](play:split@at=new-root)
- **Q:** When does a B+ tree get taller?
  A: Only when the root splits. A new root goes on top, which adds a level above every leaf at once. [▶ See it](play:root split@at=new-root)
- **Q:** A range scan for 5 to 12 touches four leaves in a three-level tree. How many page reads does it take?
  A: Six: three to reach the first leaf, then one per extra leaf by following the links. [▶ See it](play:range scan@at=range-end#11)
- **Q:** Without leaf links, how many page reads does the same scan take?
  A: Twelve: a trip from the root, three page reads, for each of the four leaves. [▶ See it](play:broken: no leaf links@at=re-descend#4)

## Deep dive

- Rudolf Bayer and Edward McCreight, "Organization and Maintenance of Large Ordered Indices" (1972) introduced the B-tree. Douglas Comer, "The Ubiquitous B-Tree" (1979) surveys it and its B+ tree variant.
- Philip Lehman and S. Bing Yao, "Efficient Locking for Concurrent Operations on B-Trees" (1981) describes the B-link tree. PostgreSQL's B-tree index is based on it.
- "Database Internals" (Alex Petrov), part I, covers B-tree pages, splits and their variants in detail.
