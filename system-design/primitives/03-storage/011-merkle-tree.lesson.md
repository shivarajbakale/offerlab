# Merkle tree

## What it is

- **What it is:** A tree of fingerprints, or hashes: short numbers computed from data that change whenever the data changes. Each bottom node fingerprints one group of keys, and each node above fingerprints its two children, so the single top node covers everything.
- **The problem it solves:** Two copies of a large dataset on different servers slowly drift apart, and finding which keys differ by sending all the data, or one fingerprint per key, costs too much network. Comparing two Merkle trees from the top skips every half that matches, so a few differences are found in a handful of comparisons.
- **Reach for it when:** Replicas must be checked and repaired in the background, the data is large and differences are few. Also when one trusted top fingerprint must vouch for many pieces of data, such as files or transactions.
- **Not the right tool when:** Most of the data differs, so the tree compares nearly every node and sending everything is simpler. If replicas apply the same ordered log of writes, comparing log positions is enough, as in [leader-follower replication](#/sd-05-replication/017-leader-follower-replication).
- **Where you'll meet it:** Amazon's Dynamo paper and Cassandra's repair, which compare trees per key range to sync replicas; Git, which names files, directories and commits by content hashes; Bitcoin, where each block header holds the Merkle root of its transactions; and interview questions such as "Design a key-value store".

## In plain words

Two servers are supposed to hold the same copy of the data, but one missed a few writes while it was down. To find out which keys differ, they could send each other every key, but with millions of keys that is far too much traffic. A Merkle tree lets them compare a single short fingerprint first. If the fingerprints match, all the data matches. If not, they compare the two halves and keep going down only where the fingerprints differ.

Think of two people checking that their copies of a thick book are identical. Instead of reading each page aloud, they compare a checksum of the whole book. It differs, so they compare checksums of the first half and the second half: the first half matches, so they never look at it again. A few rounds later they have found the one page that differs.

In the picture on the right are two replicas, A on top and B below, each drawn as its tree of fingerprints. The bottom row holds one fingerprint per bucket of keys, with the bucket number and its key count underneath; each node above is a fingerprint of the two below it. A fingerprint drawn in red differs from the one in the same place on the other replica. The pair being compared right now is highlighted and tagged `x` (on A) and `y` (on B), and the count above the trees shows how many pairs have been compared. During a write, only one replica is shown, with the node being recomputed tagged `node`.

## Words we'll use

- **Replica** — one copy of the data on its own server. Here there are two, a and b, that should hold the same keys and values.
- **Drift** — replicas slowly disagreeing, because one missed a write while it was down or a message was lost.
- **Anti-entropy** — a background job that finds where replicas disagree and repairs them.
- **Fingerprint (hash)** — a short number computed from some data. The same data always gives the same fingerprint; different data almost always gives a different one. Here fingerprints are 4 hex digits, such as `c1d4`, so they fit in the circles.
- **Bucket** — a group of keys. Each key goes to a bucket chosen by hashing the key, so both replicas put every key in the same bucket.
- **Leaf** — a node on the bottom row. Its value is the fingerprint of one bucket's contents.
- **Parent** — a node whose value is the fingerprint of its two children's values put together.
- **Root** — the single node at the top. Its fingerprint covers every bucket below it.
- **Compare** — check whether two nodes, one from each replica's tree, have the same fingerprint. The picture tags them `x` (on replica A) and `y` (on replica B).

## The world we're in

- Two replicas each hold a copy of the same keys. Most of the time they agree.
- Sometimes one misses a write, so a few keys differ. Nobody knows which.
- The data is large and the network is the expensive part: sending all of it, or one fingerprint per key, costs too much to do often.
- Each replica can read its own data quickly.

## The goal

Find exactly which buckets differ between two replicas, sending an amount of data that grows with how much differs, not with how much data there is.

## The naive attempt

"Send everything, and compare." That costs the whole dataset each time. A smarter first try: fingerprint each bucket, and send the list of bucket fingerprints. Only a bucket whose fingerprint differs needs its keys sent. But the list itself still has one entry per bucket, and every entry has to be compared. Here only user7 differs, and it takes all 8 comparisons to find it.
[▶ Broken: the 8th comparison finally finds the different bucket](play:broken: flat list@at=flat-compare#8)
The test also measures 1,024 buckets: 1,024 comparisons. With a million buckets, that is a million fingerprints sent to find one difference.

## Building it up

**1. Fingerprint each bucket.** Each leaf is the fingerprint of one bucket's keys and values. Here user7 is written into bucket 7, and its leaf changes from `1cd9` (an empty bucket) to `c1d4`.
[▶ Bucket 7's leaf gets a new fingerprint](play:build@at=rehash-leaf)

**2. Fingerprint the fingerprints.** Each parent is the fingerprint of its two children together, so a change in any bucket changes its parent, and its parent's parent, all the way up. Here the leaf's parent is recomputed.
[▶ The leaf's parent changes too](play:build@at=rehash-parent#1)
The root changes last. A write recomputes only these 4 fingerprints, one per level, not the whole tree.
[▶ The root changes: a write rehashes 4 nodes](play:build@at=rehash-parent#3)

**3. Compare roots first.** If the roots match, everything below them matches, and there is nothing to send. Here a and b hold the same 6 keys: one comparison, and the job is done.
[▶ Equal roots: one comparison, nothing to send](play:same@at=same)

**4. Descend only where fingerprints differ.** Now b gets user7=v2, which a does not have. b's root changes from `1973` to `0920`; a's stays `1973`.
[▶ b's root changes from 1973 to 0920](play:diff@at=rehash-parent#3)
The roots differ, so a and b compare the roots' left children. Those match (`b486`), so the whole left half, 4 buckets, is skipped with one comparison.
[▶ The left halves match and are skipped](play:diff@at=descend#1)
On the right, the pair that differs is followed down, level by level, to bucket 7. That took 7 comparisons: the root, then two children at each of 3 levels. Only bucket 7's keys need to be sent. With 1,024 buckets the same search takes 21 comparisons, where the flat list takes 1,024.
[▶ Bucket 7 found after 7 comparisons](play:diff@at=found)

**5. Each parent must cover both children.** If a parent's fingerprint covers only its left child, a change on the right never reaches the root. Here b's bucket 5 changes, but b's root stays `891f`, the same as a's.
[▶ Broken: b's data changed, but its root did not](play:broken: parent hashes@at=rehash-parent#3)
The roots match, so the comparison stops at once and the difference is never repaired.
[▶ Broken: equal roots, so nothing is repaired](play:broken: parent hashes@at=same)

## Why it works now

- A parent's fingerprint depends on both children, so equal parents almost surely mean equal subtrees. The only exception is an accidental match of fingerprints, which long real hashes make vanishingly unlikely.
- So skipping a subtree whose fingerprints match never misses a difference, and every differing bucket is reached by following differing pairs down. [▶ See it](play:diff@at=found)
- The cost is two comparisons per level for each differing bucket, plus the root: 7 for one bucket in 8, 21 for one in 1,024, about 41 for one in a million.
- The `same` and `diff` scenarios count the comparisons; the broken scenarios show the flat list paying for every bucket and a half-hashed tree missing a change.

## What it costs

- **Keeping the tree up to date.** Every write rehashes its leaf and every node above it. The alternative, rebuilding the tree just before comparing, means reading all the data.
- **Memory.** The tree has about twice as many nodes as buckets.
- **Coarse repair.** A differing bucket is sent whole, even if one key in it changed. More buckets mean finer repair but a bigger tree.
- **Many differences.** When most buckets differ, the tree compares almost every node, more than the flat list would. Merkle trees pay off when differences are few.

## Staff notes

- **Bucket count.** Choose it so a typical differing bucket is small enough to resend cheaply, and the tree still fits in memory. Real systems use thousands to tens of thousands of leaves per tree.
- **One tree per key range.** In Dynamo-style stores each node owns several ranges of the key space, and replicas only share some of them. So a node keeps one tree per range and compares a range only with the replicas that also hold it. When ranges move to other nodes, those trees are rebuilt.
- **Repair is I/O-heavy.** Cassandra builds its trees during repair by reading the data, which competes with normal traffic. That is why repair is run on a schedule, a range at a time, and why incremental repair exists to skip data already repaired.
- **The same idea, elsewhere.** Git names every file and directory by a hash of its contents, and every commit by a hash that covers its whole tree, so one commit ID stands for a whole snapshot. When two repositories sync, they do not walk two trees comparing hashes from the top down: they exchange commit IDs to find the newest commits both already have, and then send the objects reachable from the new commits but not from those.

## Check yourself

- **Q:** Two replicas have equal roots. How many comparisons does the diff need?
  A: One. Equal roots mean every bucket below is equal. [▶ See it](play:same@at=same)
- **Q:** One key differs among 8 buckets. How many node pairs are compared?
  A: 7: the root, then two children at each of the 3 levels below it. [▶ See it](play:diff@at=found)
- **Q:** With a flat list of bucket fingerprints instead of a tree, how many comparisons does the same diff need?
  A: All 8, one per bucket, whatever differs. With 1,024 buckets, 1,024. [▶ See it](play:broken: flat list@at=flat-compare#8)
- **Q:** A write changes one bucket in a tree of 8. How many fingerprints must be recomputed?
  A: 4: the leaf, and one node on each of the 3 levels above it, up to the root. [▶ See it](play:build@at=rehash-parent#3)
- **Q:** What goes wrong if a parent fingerprints only its left child?
  A: A change in a right half never reaches the root, so equal roots hide a real difference and it is never repaired. [▶ See it](play:broken: parent hashes@at=same)

## When to use which

- **Merkle tree** — when two copies of large data must be checked and repaired in the background, and usually only a little differs. Example: replicas in a Dynamo-style store, such as Cassandra's repair, finding the few keys a replica missed while it was down.
- **Send everything, or a fingerprint per key** — when the data is small, or when most of it differs anyway. The tree would end up comparing nearly every node, so it saves nothing.
- **A flat list of bucket fingerprints** — when there are only a handful of buckets. It always compares every bucket, so its cost grows with the data, not with how much differs.
- **Replay a shared log instead** — when replicas apply the same ordered log of writes, comparing log positions tells you exactly what is missing. Example: [leader-follower replication](#/sd-05-replication/017-leader-follower-replication) or [Raft log replication](#/sd-05-replication/021-raft-log-replication).
- **Fix on read, not in the background** — when you want repairs to happen sooner for the keys people actually use: a [quorum read](#/sd-05-replication/018-quorum-read-write) that notices stale replicas can repair them on the spot. The Merkle tree catches the keys nobody reads.
- **Detect tampering** — when one trusted fingerprint must vouch for many pieces of data. Example: Git commits and Bitcoin blocks; change any file or transaction, and the root changes.
- **In an interview:** for "how do replicas get back in sync?", say anti-entropy with Merkle trees per key range: compare roots, descend only into differing halves, resend only the differing buckets.

## Deep dive

- Ralph Merkle described hash trees in the late 1970s, for signing many messages with one public key.
- "Dynamo: Amazon's Highly Available Key-value Store" (DeCandia et al., 2007), section 4.7, describes using Merkle trees per key range to synchronise replicas.
- The Apache Cassandra documentation on repair explains how it builds and compares Merkle trees, and its full and incremental repair modes.
