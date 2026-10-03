# HyperLogLog

## What it is

- **What it is:** A small, fixed-size summary, a few kilobytes, that estimates how many different items a stream holds, such as unique visitors, within a few percent. It hashes each item and remembers, in many small slots, the longest run of leading zero bits it has seen.
- **The problem it solves:** Counting unique items exactly means remembering every item seen, so a billion visitor IDs costs gigabytes, and every extra page, day or country multiplies that. HyperLogLog gives a close estimate in fixed memory, ignores repeats, and two summaries combine into the count of both streams together.
- **Reach for it when:** The question is "how many different?": unique users per day, distinct search terms or distinct IP addresses, where a few percent of error is fine. It shines when you keep many slices and combine them on demand, such as weekly unique users from seven daily summaries.
- **Not the right tool when:** You need the exact number, need to know whether one particular item was seen (use a [Bloom filter](#/sd-02-probabilistic/005-bloom-filter)), or need how often each item appears (use a [count-min sketch](#/sd-02-probabilistic/006-count-min-sketch)). For small sets, an exact set is simpler.
- **Where you'll meet it:** Redis's PFADD, PFCOUNT and PFMERGE, at about 12 KB per key; BigQuery's HLL_COUNT functions and Trino's approx_distinct; the 2007 paper by Flajolet, Fusy, Gandouet and Meunier; and interview questions such as "Count unique visitors" or "Design an analytics dashboard".

## Words we'll use

- **Distinct items** (cardinality) — how many different items a stream holds. A stream of a million page views from 40,000 visitors has 40,000 distinct visitors.
- **Hash function** — a function that turns an item into a fixed number of bits (here 32) that look random. The same item always gives the same bits, and different items give unrelated bits, so each bit is like a fair coin flip.
- **Duplicate** — an item seen before. It must not be counted again.
- **Rank** — the position of the first 1 in a run of bits. 1xxx has rank 1, 01xx has rank 2, 001x has rank 3. Rank r means r − 1 zeros came first.
- **Register** — one small number in memory. Each register keeps the largest rank it has seen.
- **b and m** — the first b bits of a hash pick a register, so there are m = 2^b registers. Here b = 4 (16 registers) or b = 6 (64 registers).
- **Harmonic mean** — an average taken through reciprocals: the reciprocal of the average of the reciprocals. For 2, 4 and 1,000 the ordinary mean is about 335, but the harmonic mean is about 4. One huge value barely moves it.
- **Standard error** — how far off an estimate typically is, as a share of the true value.
- **Merge** — combining two sketches into one that counts the union of their streams.
- **ln** (natural logarithm) — the reverse of e^x: ln y is the power e must be raised to to give y. ln 1 = 0, ln 2 ≈ 0.69 and ln 100 ≈ 4.6. Here e is a constant from mathematics, about 2.718.
- **√m** — the square root of m: the number that, multiplied by itself, gives m. √64 = 8.

## The world we're in

- The stream is huge, and the same item turns up many times.
- Remembering every distinct item costs memory in proportion to their number: a billion 8-byte IDs is 8 GB.
- We often want counts for many slices (per page, per hour, per country) and for unions of slices (this week = seven days), so whatever we keep should be small and combinable.
- A count within a few percent is good enough.

## The goal

Estimate how many distinct items a stream holds, within a few percent, in a few kilobytes that do not grow with the stream, ignoring duplicates, and so that two estimates can be combined into the estimate of their union.

## The naive attempt

Flip coins in your head: the longer the longest run of heads you have seen, the more flips there must have been. A run of 10 tails before the first head comes up about once in 2^10 = 1,024 tries. So hash every item, and remember only the largest rank seen. If the largest rank is R, guess about 2^R distinct items. Duplicates hash the same way and give the same rank, so they change nothing. One small number holds the whole count.

But one observation is very noisy. A single lucky item can double the guess, and the guess only moves in powers of 2. Here 10,000 users go into one register. The longest run seen gives rank 15, and the estimate is about 42,000: more than 4 times too high.
[▶ Broken: one register — 10,000 users are estimated at about 42,000](play:broken: one register@at=one)

## Building it up

**1. Split the stream into buckets.** Use the first b bits of the hash to pick one of m registers, and measure the rank in the remaining bits. Each register now sees its own random 1/m share of the items and keeps its own longest run. Here b = 4, so 16 registers. fox hashes to 0100 001…: the first four bits, 0100, pick register 4, and in the rest two 0s come before the first 1, so its rank is 3.
[▶ fox goes to register 4 with rank 3](play:register@at=keep)
owl also lands in register 4, with rank 1. The register keeps the largest rank, 3, so nothing changes.
[▶ owl's rank 1 does not replace 3](play:register@at=skip)
cat lands in register 15 with rank 8: a single item that looks like hundreds. With many registers, one lucky register is just one voice among m.
[▶ cat alone pushes register 15 to 8](play:register@at=keep#2)

**2. Combine with a harmonic mean.** Each register suggests about 2^rank items for its share. Averaging those with an ordinary mean lets the biggest register dominate. The harmonic mean averages 2^−rank instead, where a huge register contributes almost nothing. With a bias correction α (about 0.709 for 64 registers), the estimate is α · m² / (sum of 2^−register). 10,000 users in 64 registers are estimated at 9,783, 2% off.
[▶ 10,000 users estimated at 9,783](play:estimate@at=harmonic)
With an ordinary mean, 1,000 users are estimated at about 12,000. Register 57 holds 12, and its 2^12 alone is a quarter of the sum.
[▶ Broken: the ordinary mean says about 12,000 for 1,000 users](play:broken: arithmetic@at=mean)
Then one unlucky item, lucky-58866, lands in register 24 with rank 19.
[▶ lucky-58866 pushes register 24 to 19](play:broken: arithmetic@at=keep)
The ordinary-mean estimate jumps to about 384,000, because 2^19 is now 97% of the sum.
[▶ Broken: one register wrecks the ordinary mean](play:broken: arithmetic@at=mean#2)
The harmonic mean, given the same unlucky item, says 1,089 for 1,001 users.
[▶ The harmonic mean shrugs it off](play:broken: arithmetic@at=harmonic)

**3. Count empty registers when there are few items.** With only a few items, most registers are still 0, and the formula above overshoots. Then the number of empty registers is a better guide: if a share z/m of the registers is empty, the estimate is m · ln(m/z). Here 3 items went into 16 registers. fox and owl share register 4, so only 2 registers are set, and the estimate is about 2.1.
[▶ 14 of 16 registers are empty: estimate 2.1](play:register@at=linear)

**4. Duplicates change nothing.** A duplicate gives the same register and the same rank, and a register keeps a maximum. Here 1,000 users are added, then some of them again.
[▶ user-7 again: its register already holds more](play:duplicates@at=skip)
Re-adding all 1,000 leaves every register, and the estimate, exactly as before.
[▶ Still 1,064 after adding every user a second time](play:duplicates@at=harmonic#2)

**5. Merge by taking the larger register.** A register is the largest rank among its items, so the largest of two registers is the largest rank over both streams together. Sketch A saw users 0 to 5,999 and sketch B users 4,000 to 9,999. Taking the larger value of each register changes 11 of A's 64 registers.
[▶ Merge: 11 registers are taken from B](play:merge@at=merge)
The result is exactly the sketch of all 10,000 users, and the 2,000 users seen by both are counted once.
[▶ The merged sketch estimates 9,783](play:merge@at=harmonic)

## Why it works now

- **Registers depend only on which items appeared.** Hashing is repeatable and each register keeps a maximum, so order and duplicates do not matter. The duplicates scenario checks that the registers are identical after re-adding everything. [▶ See it](play:duplicates@at=harmonic#2)
- **Many registers, one robust average.** Each register's guess is noisy, but the harmonic mean of m of them has a standard error of about 1.04 / √m: 13% for 64 registers. The estimate scenario asserts the error is under three times that. [▶ See it](play:estimate@at=harmonic)
- **Merging is exact.** The merge scenario asserts that merged registers equal those of one sketch fed both streams.

## What it costs

- **Memory:** m registers of 5 or 6 bits each. With 16,384 registers that is about 12 KB, for a standard error of about 0.8%, whether the stream has a thousand distinct items or billions (billions need a 64-bit hash; see Staff notes).
- **Accuracy:** to halve the error, use four times the registers.
- **Time:** one hash per add. An estimate or a merge reads all m registers.
- **It only counts.** It cannot say whether a particular item was seen (use a Bloom filter, 005), and cannot remove items.

## Staff notes

- **Mergeability is the point.** Keep one sketch per day, per shard or per dimension value, and union any combination on demand. Weekly unique users is the merge of seven daily sketches; exact sets would need all the IDs.
- **Intersections are weak.** |A ∩ B| = |A| + |B| − |A ∪ B| works, but its error is relative to the union, so a small overlap of two big sets is lost in the noise.
- **Hash width.** A 32-bit hash has only 2^32, about 4.3 billion, possible values. Long before that many distinct items, some of them share a hash value, and two items with the same hash look like one item, so the estimate comes out low. The HyperLogLog paper adds a correction once the estimate passes 2^32 / 30, about 143 million. Production versions use 64-bit hashes instead, which pushes the problem far beyond any real stream.
- **Small counts.** HyperLogLog++ (from Google) keeps a sparse list while few registers are set and corrects the bias between the linear counting range and the harmonic range.
- **Pick m from the error you need,** and remember that every slice you keep costs m registers.

## Check yourself

- **Q:** A register holds 3. An item lands in it with rank 1. What happens?
  A: Nothing. A register keeps the largest rank it has seen, and 1 is smaller than 3. [▶ See it](play:register@at=skip)
- **Q:** You add the same 1,000 users a second time. How does the estimate change?
  A: It does not. Each duplicate gives the same register and rank as before, and a maximum does not change when the same value arrives again. [▶ See it](play:duplicates@at=harmonic#2)
- **Q:** One item lands with rank 19. Which estimate does it wreck: the ordinary mean of 2^register, or the harmonic mean?
  A: The ordinary mean, which jumps from about 12,000 to about 384,000. The harmonic mean adds 2^−19, almost nothing, and stays near 1,000. [▶ See it](play:broken: arithmetic@at=mean#2)
- **Q:** Sketch A saw users 0 to 5,999 and sketch B users 4,000 to 9,999. After merging, is the overlap counted twice?
  A: No. Merging takes the larger value of each register, which is exactly what one sketch of all 10,000 users would hold. [▶ See it](play:merge@at=harmonic)
- **Q:** Why not keep just one register and save memory?
  A: One longest run is a very noisy guess, and it moves only in powers of 2. Here it says about 42,000 for 10,000 users. [▶ See it](play:broken: one register@at=one)

## Deep dive

- Philippe Flajolet and G. Nigel Martin, "Probabilistic Counting Algorithms for Data Base Applications" (1985), introduced counting by the position of the first 1-bit.
- Flajolet, Fusy, Gandouet and Meunier, "HyperLogLog: the analysis of a near-optimal cardinality estimation algorithm" (2007), adds the harmonic mean, the α constants and the 1.04/√m error.
- Heule, Nunkesser and Hall, "HyperLogLog in Practice" (2013), describes HyperLogLog++.
- Redis offers PFADD, PFCOUNT and PFMERGE, with about 12 KB per key and a standard error of 0.81%. BigQuery's HLL_COUNT functions and Trino's approx_distinct are built on HyperLogLog.
