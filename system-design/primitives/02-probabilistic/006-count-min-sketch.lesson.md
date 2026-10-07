# Count-min sketch

## What it is

- **What it is:** A small, fixed grid of counters that estimates how many times each item has appeared in a stream. Each row has its own hash function that picks one counter for the item; adding the item raises one counter per row, and its estimate is the smallest of those counters.
- **The problem it solves:** Counting every distinct item exactly needs one counter per item, so memory grows without limit on streams such as search queries or the IP addresses of incoming requests. A count-min sketch uses fixed memory and gives estimates that are never too low and rarely much too high.
- **Reach for it when:** You need rough counts or the top items of a huge stream in fixed memory: trending searches, the busiest client IPs for abuse detection, or the most requested keys for a cache to keep. Sketches from different servers or time windows add together.
- **Not the right tool when:** Exact counts matter, as in billing, or the distinct items are few enough for a hash map. To count how many distinct items there are, use [HyperLogLog](#/sd-02-probabilistic/007-hyperloglog); to ask only "was this ever seen?", use a [Bloom filter](#/sd-02-probabilistic/005-bloom-filter).
- **Where you'll meet it:** Cormode and Muthukrishnan's 2005 paper; the Caffeine Java cache, whose TinyLFU policy uses a count-min style sketch to decide what to keep; RedisBloom's CMS commands; and interview questions such as "Design a top-K service" or "Design trending hashtags".

## In plain words

Say a search engine wants to show what is trending. Every search typed in the world goes past one server, and it wants to know which terms are the most common. Keeping an exact count for every term ever typed needs one counter per term, and there are billions of different terms, most typed once. A count-min sketch keeps a small fixed table of counters instead, shared between terms, and still finds the popular ones.

Think of a few tally sheets, each with a handful of boxes. Every time a word comes in, each sheet puts a tick in one box, picked from the word in its own way. Many words share each box, so a box's tally is that word's ticks plus everyone else's in that box: it can be too high, never too low. Asking for a word, you read its box on every sheet and trust the smallest, because the smallest has the fewest strangers mixed in.

In the picture on the right, the grid is the sketch: one row per hash, one column per counter. The item being counted or asked about has one outlined counter in each row, listed above the grid. Below it are the question, the answer, the reason (the counters it read and the smallest one), and what an overcount costs. The current top items are shown next to it, and the box at the top says what just happened.

## Words we'll use

- **Stream** — a long sequence of items that arrive one at a time, such as search queries or the IP addresses of incoming requests. We see each item once and cannot store them all.
- **Count** (or frequency) — how many times an item has appeared in the stream so far.
- **Distinct items** — the different items. A stream of a billion queries might hold a hundred million distinct ones.
- **Heavy hitters** — the few items with the highest counts, such as the top 3.
- **Counter** — one number in memory that we add to.
- **Hash function** — a function that turns an item into a large number. The same item always gives the same number, and different items give numbers that look unrelated. Taking it modulo w (the remainder after dividing by w) picks one of w columns.
- **Collision** — two different items hashing to the same counter.
- **w** (width) — how many counters each row has.
- **d** (depth) — how many rows there are, each with its own hash function.
- **Estimate** — the sketch's answer for an item's count. It may be wrong, but only by being too high.
- **e** — a constant from mathematics, about 2.718. e^x means e raised to the power x.
- **ln** (natural logarithm) — the reverse of e^x: ln y is the power e must be raised to to give y. ln 1 = 0, ln 2 ≈ 0.69 and ln 100 ≈ 4.6. It grows very slowly: multiplying y by 10 adds only about 2.3.

## The world we're in

- The stream is too big to store, and has too many distinct items to keep one counter for each.
- Memory is fixed in advance. It must not grow with the number of distinct items.
- Approximate counts are fine, as long as we know which way they can be wrong and by roughly how much. Being too high is acceptable; we care most about the heavy items.

## The goal

Estimate any item's count, and find the heavy hitters, using a fixed number of counters, with estimates that are never too low and rarely much too high.

## The naive attempt

One counter per distinct item is exact, but memory grows with every new item. So share counters: keep one row of w counters, hash each item to one of them, and add to it. The estimate is that counter.

A shared counter holds the sum of every item that hashes there. So a rare item that lands on a popular item's counter inherits the popular item's count. Here one row of 16 counters sees apple 50 times, banana 30 times and cherry 20 times. eel turns up once, but its only counter is apple's, so its estimate is 51 and it pushes cherry out of the top 3.
[▶ Broken: one row — eel, seen once, is estimated at 51 and enters the top 3](play:broken: one row@at=top#4)

## Building it up

**1. Collisions only add.** Counters only go up, and an item always adds to its own counters. So a counter holds the item's true count plus whatever collided with it: never less than the truth. Here the sketch has 2 rows of 8 counters. cat (20 times), dog (5) and cow (3) are added, then zebra once. In row 0, zebra's counter is cow's, so it goes from 3 to 4.
[▶ zebra adds 1 to row 0's counter 2, which cow already brought to 3](play:collision@at=bump#7)

**2. Use several rows, and take the smallest.** Each row has its own hash, so items that collide in one row usually land apart in another. Every one of an item's d counters is too high or exact, so the smallest is the best estimate. zebra's counters hold 4 (row 0, shared with cow) and 26 (row 1, shared with cat and dog). The estimate is 4. That is still 3 too many, because zebra collides in both rows, but far better than 26.
[▶ zebra's counters hold 4 and 26, so the estimate is 4](play:collision@at=estimate#5)
With 4 rows of 16 and a skewed stream of 2,000 items, w150 (truly seen 3 times) has counters 68, 25, 57 and 157. One row would have said 68 or 157; the minimum says 25.
[▶ Four rows disagree about w150; the smallest, 25, is kept](play:min of rows@at=estimate)
On average over that stream, estimates are about 128 too high with 1 row, 79 with 2 rows and 50 with 4 rows.

**3. Never too low.** In a stream of 1,000 items, apple is added 3 times. Its counters hold 6, 59, 31 and 59: all at least 3, and the estimate is 6. The scenario checks every item in the stream, and none is estimated below its true count.
[▶ apple: counters 6, 59, 31, 59; estimate 6, true count 3](play:estimate@at=estimate#3)

**4. Keep the top items as you go.** The sketch does not remember which items it has seen, so it cannot list the heaviest ones later. Instead, after each add, the item's estimate is compared with a small list of the current top 3, and it takes a place if it beats the smallest. In a skewed stream of 3,000 items, the top 3 come out as w0, w1 and w2, the same as the true top 3, even though every estimate is too high (w2 is truly 153, estimated 234).
[▶ w2 keeps its place in the top 3](play:heavy hitters@at=top)
The same four items as the naive attempt, but with 4 rows: eel's other three counters are 1, so its estimate is 1 and the top 3 stay apple, banana and cherry.
[▶ With four rows, eel is estimated at 1 and stays out](play:broken: one row@at=top#8)

## Why it works now

- **Never too low.** Every add raises all of the item's counters by its amount, and nothing lowers a counter. So each counter is at least the item's count, and so is their minimum. [▶ apple is never underestimated](play:estimate@at=estimate#3)
- **Rarely much too high.** For the estimate to be far off, the item must collide with heavy items in every row at once. Rows hash independently, so that gets rarer with each row added.
- **The bound in words.** Let N be the total of all counts in the stream. Pick ε (epsilon), how far off you accept, as a share of N, and δ (delta), the chance you accept of being further off than that. With w = e / ε counters per row (e ≈ 2.718) and d = ln(1/δ) rows, an estimate is too high by more than ε·N with probability at most δ. For example, ε = 0.1% and δ = 1% needs about 2,700 counters per row and 5 rows.

## What it costs

- **Memory:** d × w counters, fixed, whatever the number of distinct items. The example above is about 13,600 counters.
- **Time:** d hashes and d counter updates per add or estimate.
- **Error grows with the whole stream,** not with the item. Heavy items are estimated well in relative terms. Light items can be off by many times their own count, as w150 shows.
- **It cannot list items.** Finding heavy hitters needs the extra top list, kept up to date on every add.

## Staff notes

- **Deletes only of real adds.** Plain count-min has no general delete. Subtracting is safe only to undo an add that really happened (a counter must never hold less than the true counts behind it); subtract anything else and estimates can come out too low.
- **Conservative update.** On add, raise only the counters that are at the item's current minimum (up to the new estimate). It cuts overestimates a lot, at the cost of ruling out subtraction.
- **Time windows.** For "top items in the last hour", keep one sketch per few minutes, answer from the sum of the recent ones, and drop the oldest. Sketches with the same width, depth and hash functions merge by adding counters, which also lets shards count separately and combine.
- **Sizing.** Width buys accuracy (ε), depth buys confidence (δ). Counters are often 32 bits; caches that only need "popular or not" use smaller counters and halve them all now and then, so old popularity fades.

## Check yourself

- **Q:** Can a count-min sketch ever estimate an item below its true count?
  A: No. Every one of the item's counters includes all of its adds, plus possibly other items'. The smallest of them is still at least the true count. [▶ See it](play:estimate@at=estimate#3)
- **Q:** zebra was added once. Its counters hold 4 and 26. What is its estimate, and why not 26?
  A: 4. Both counters are at least zebra's count, so the smaller one is the closer bound. It is still 3 too high because zebra shares row 0's counter with cow. [▶ See it](play:collision@at=estimate#5)
- **Q:** With a single row, eel (seen once) shares its counter with apple (seen 50 times). Where does eel land in the top 3?
  A: First, at 51. With one row there is no other counter to show that the 51 is mostly apple's. [▶ See it](play:broken: one row@at=top#4)
- **Q:** The same items go into 4 rows instead of 1. Does eel still make the top 3?
  A: No. Its counters in rows 1, 2 and 3 hold only its own 1, so the minimum is 1. [▶ See it](play:broken: one row@at=top#8)

## When to use which

- **Count-min sketch** — when you need rough counts or the top items of a huge stream in fixed memory, and counting a little too high is fine. Example: the top 100 search terms of the last hour, or the busiest client IPs for abuse detection.
- **An exact count in a hash map** — when the distinct items are few enough to keep a counter each (thousands or a few million), or when every count must be right, as in billing.
- **Sampling** — when you only need the share of the very biggest items: count every 100th event exactly and multiply. It is simple, but rare items are missed entirely, and small counts are very noisy.
- **Per-key counters with a window** — when you must act on each key's exact recent rate, such as limiting each user to 100 requests a minute. See [window rate limiters](#/sd-04-traffic/013-window-rate-limiters).
- **[HyperLogLog](#/sd-02-probabilistic/007-hyperloglog)** — when the question is how many different items there are, not how often each appears.
- **[Bloom filter](#/sd-02-probabilistic/005-bloom-filter)** — when the question is only whether an item was ever seen.
- **In an interview:** for "top K" or "trending", say "a count-min sketch per time window plus a small heap of the current top K", and mention that sketches from different servers add together.

## Deep dive

- Graham Cormode and S. Muthukrishnan, "An Improved Data Stream Summary: The Count-Min Sketch and its Applications" (2005), gives the structure and the ε, δ bounds.
- Related sketches: Count sketch (Charikar, Chen and Farach-Colton) adds and subtracts with random signs, which gives unbiased estimates; Misra-Gries and Space-Saving find heavy hitters with a fixed number of named counters.
- The Caffeine Java cache's TinyLFU policy keeps a count-min style frequency sketch to decide whether a new entry is worth caching. RedisBloom, a Redis module, offers count-min commands such as CMS.INCRBY and CMS.QUERY.
