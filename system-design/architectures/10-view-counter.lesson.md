# View counter

## What it is

- **What it is:** The number under a video or post that says how many times it was viewed, kept up to date while views arrive, often thousands of them a second.
- **What makes it hard:** Every view is a write, and one database can only save so many a second. Splitting videos over several databases does not help the one viral video, because all of its updates change the same row, one at a time.
- **Building blocks it uses:** views put on a durable log and added up in batches ([Kafka partitions and consumer groups](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups)), with how far the log was read saved together with the sums so a batch is never counted twice ([idempotent consumers](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)).
- **Where you'll meet it:** "Design a view counter" or "Design a like counter" is a common interview question. In 2014 YouTube said "Gangnam Style" had neared the largest number a signed 32-bit integer can hold (2,147,483,647) and moved view counts to 64 bits. Likes, ad impressions and rate limits are the same counting problem.

## Words we'll use

- **View** — one person starting one video. Here every view is a **write**: it changes stored data (the video's count goes up by one).
- **Counter** — a number stored in the database for each video, its view count.
- **Requests a second** (often written **QPS**) — how much traffic arrives. Here, views a second.
- **Latency** — how long one request takes, from the user sending it to the answer arriving. **p50** is the middle latency (half were faster); **p99** is the one 99% were faster than.
- **CPU core** — one part of a processor that runs one piece of work at a time. A 4-core machine runs 4 at once.
- **Utilization** (busy) — the share of time a machine's cores are working. 100% means no spare capacity.
- **Worker** — a slot for one request in progress inside a server. It stays taken while the request waits for anything, including another machine.
- **Error** — a request that failed: turned away because every worker and waiting slot was full, or given up on after 1 second (a **timeout**).
- **Bottleneck** — the part that runs out of capacity first and so limits the whole system.
- **UPDATE** — the database command that changes a row: `UPDATE videos SET views = views + 1 WHERE id = 42`. The database must find the row, change it and **commit** it: write it safely to disk so it survives a crash. That costs about 5 ms of CPU here.
- **Primary** — the database machine that accepts writes for some data.
- **Row lock** — while a transaction changes a row, the database locks that row until the commit, so a second change to the same row waits its turn. Changes to one row go one at a time.
- **Key** — the id that picks which counter a view changes: the video id.
- **Zipf distribution** (**skew**) — a way popularity is spread: the most popular key gets the most, the second about half as much, the third a third as much, and so on. A higher **skew** makes the top keys take an even bigger share.
- **Hot key** — one key that gets so much traffic that the machine holding it is overloaded.
- **Shard** — one slice of the data, held by its own primary. **Sharding** splits the keys over several shards by a rule (here, a hash of the video id), so each shard takes the writes for its keys only.
- **Queue** — a list of messages waiting to be handled. A **consumer** is a worker that takes messages off the queue and handles them. The **backlog** is how many are waiting.
- **Batch** — a group of messages handled together. Here, about 50 views summed into one write.
- **Eventual consistency** — a stored value may be behind reality for a while, but catches up once the work in flight is done.
- **Acknowledge** (ack) — a consumer telling the queue "I am done with this message, delete it". A message not acknowledged is handed out again.

## The world we're in

- Every view must add 1 to that video's counter. Nobody waits for the count before the video plays, but the view must not be lost.
- 2,000 views arrive a second, at random moments, from 5,000 people at a time.
- There are 100,000 videos and their popularity is Zipf-shaped. On a normal day (skew 1) the top video gets about 8% of all views. On a viral day (skew 1.5) the top video alone gets about 38%.
- The web servers are cheap and plentiful: four of them, never the limit here.
- One database machine has 4 cores and spends 5 ms of CPU on each committed UPDATE. So it can do at most 4 / 5 ms = 800 writes a second.

## The goal

Count every view, keep the page fast while doing it, and survive the day one video takes a third of all traffic. Find out how exact and how fresh the count really needs to be.

## The naive attempt

"Each view runs one UPDATE on the database."

At 500 views a second this is fine: the database is about 63% busy and nothing fails.
[▶ One database at 500 views a second](play:one database: 500@t=8)

At 2,000 views a second the database would need 2,000 × 5 ms = 10 seconds of CPU every second, and it has 4. Its cores sit at 100%, writes queue up, and about 6 in 10 views fail: turned away or timed out. The web servers are 5% busy. They are not the problem, so adding more of them does nothing.
[▶ Broken: 2,000 views a second into one database](play:broken: one database@t=8)

## Building it up

**1. Split the counters over several primaries.** A view of video 42 only touches video 42's row. Two different videos never need the same machine. So give each of 4 database machines (shards) a quarter of the videos, chosen by a hash of the video id, and send each view to the shard that owns its video. Four primaries could do 4 × 800 = 3,200 writes a second if the views were spread evenly. On a normal day the four shards are 54% to 76% busy and every view is recorded. They are not exactly even, because each shard's share depends on which popular videos happen to hash to it. That unevenness sets the real limit: the busiest shard fills first. At 2,500 views a second it is 94% busy; by about 2,700 it is full, and at 3,000 about 1 view in 10 fails while the other three shards still have room. Four shards carry about 2,500 views a second, not 3,200.
[▶ Four shards on a normal day](play:shards: four@t=8)
[▶ Broken: 3,000 views a second, the busiest shard full](play:broken: four shards at 3,000 views a second — the busiest shard fills first (#2)@t=8)

**2. See what sharding cannot split.** Sharding spreads different keys. It cannot split one key: every view of the viral video goes to the one shard that owns it. On the viral day that video alone is 38% of 2,000 = about 770 views a second, which needs 770 × 5 ms ≈ 3.8 seconds of CPU a second: 96% of one shard by itself. Its shard is at 100%, while the other three are between 27% and 48%. A real database fails sooner than this. All 770 updates change the same row, and each waits for that row's lock, held until its commit. One row therefore takes at most 1 / (lock hold time) changes a second, however many cores the machine has (case study 11 measures this): if the lock is held for the whole 5 ms, that is 200 a second, far below 770. The simulator models only CPU, so it shows the hot shard failing later than a real one would. Worse, the web servers' workers all end up waiting on that one shard, so views of *other* videos fail too: about 17% of all views fail.
[▶ Broken: the viral video pins its shard](play:broken: a viral video — its shard@t=8)
Adding shards only moves the *other* videos off the hot shard. With 16 shards, half of them are under 10% busy, the bill triples ($6.15 an hour instead of $2.07), and the viral video's shard is still at 98%.
[▶ Broken: sixteen shards, the hot one still nearly full](play:broken: a viral video — sixteen@t=8)

**3. Add views up before writing them.** Look at what the database is asked to do: "add 1 to video 42" hundreds of times a second. Nobody needs those as separate writes, only their sum. So the web server no longer writes. It puts the view on a **queue** and answers at once. Consumers take views off the queue about 50 at a time, add them up per video ("video 42: +31, video 7: +4, ..."), and write the sums in one transaction: one commit for 50 views. The hot video benefits most: its 770 views a second become at most one row change per batch, about 40 a second.

The simulator models each batch as one 5 ms write, the same as a single UPDATE. A real batch changes one row per distinct video in it, so it costs somewhat more than one UPDATE. What it saves is not mainly disk writes: real databases already combine the commits of many concurrent transactions into one disk write (group commit). For the hot video it saves turns at the row lock: the hot row is locked once per batch instead of 50 times.

On the same viral day, with **one** database and no shards, the database is about 5% busy and every view is answered in about 45 ms. The web servers only talk to the queue, which accepts a message in under a millisecond.
[▶ Batching: the viral day on one database](play:batching: the viral day@t=8)

The price is freshness. A view reaches the count only when its batch is written: about 0.2 s later here, plus however long it waits in the queue. The count is **eventually consistent**: always a little behind, catching up as batches land.

That wait is only short while consumers keep up. Each consumer handles about 5 batches a second. 2,000 views a second make 40 batches a second, so 4 consumers (about 20 a second) fall behind. Users see nothing wrong: every view is accepted at once. But the backlog grows from about 100 batches (5,100 views) at 5 s to about 220 batches (10,850 views) at 10 s, and the oldest waiting view is 5 seconds old and getting older. Every count on the site is now 5 seconds stale, and getting worse.
[▶ Broken: too few consumers, the counts fall behind](play:broken: too few consumers@t=10)
This is why you watch the **age of the oldest message**: it is exactly how stale every count is.

**4. Split a hot counter, if you must write each increment.** Sometimes you cannot batch: you need the count fresh within milliseconds (for example a stock of tickets, or a rate limit). Then split the hot key itself: store video 42's count as, say, 16 sub-counters `42#0` ... `42#15` placed on different shards. Each view adds 1 to a random sub-counter, so the 770 writes a second spread over 16 rows and 16 machines. Reading the count means reading all 16 and adding them, so reads become 16 times as expensive. This stage is described, not simulated: the simulator picks keys from one Zipf curve and cannot re-map one key into sixteen.

## Why it works now

The write cost was never in the number of views; it was in the number of row changes. Each one costs CPU, and for one hot row each one also waits its turn at that row's lock. Sharding divided the changes among machines, but a single key's changes still land on one row on one machine, and a viral video is a single key.
[▶ Broken: the hot shard at 100%, the others idle](play:broken: a viral video — its shard@t=6)
Batching removes row changes instead of moving them: 2,000 views a second become about 40 writes, and the database that failed at 800 is now 5% busy.
[▶ The same traffic, batched](play:batching: the viral day@t=6)
In exchange, the count is a little late, and lateness is now the thing to watch.

What can go wrong with the queue, in words (the simulator does not crash consumers):
- A consumer takes a batch, adds it up, and dies before writing. If it had not yet **acknowledged** the messages, the queue hands them to another consumer: nothing is lost. If it acknowledged first and then died, those views are lost.
- A consumer writes the sums, then dies before acknowledging. The queue hands the same batch out again and it is counted twice. This is **at-least-once** delivery, and it is the usual default.
- To count each view exactly once, write the sums together with a record of exactly which messages they include, in one database transaction. A batch id alone is not enough: most queues (SQS, for one) do not promise that a redelivered batch holds the same messages, so "batch 917 done" might skip views that were never counted. With Kafka the record can be the partition and the last offset (position in the log) counted: store it in the same transaction as the sums, and on restart resume reading from the stored offset, so no range is summed twice. Without ordered offsets, record each view's own id, which costs far more.
- The queue itself must keep messages on disk (Kafka, SQS do) or a queue restart loses every view in it.

## What it costs

- A queue to run (or pay for) and consumers to keep up with it. Here: about $1.13 an hour for the batching design against $2.07 for four shards and $6.15 for sixteen.
- Counts that are late by the batch time plus the backlog age, and someone who must alert when that age grows.
- Exactly-once counting needs the consumed position (or every view's id) stored in the same transaction as the sums; most counters accept rare double counts instead.
- Sharding (if you still need it for size) makes any query across many videos ("top 10 today") hit every shard.
- Sub-counters make every read N times as expensive; only split the few keys that are actually hot.

## Staff notes

- First ask how exact and how fresh the number must be. "1.2M views" can be seconds late and slightly wrong; ad billing and payouts cannot be wrong but can be minutes late; inventory must be exact and fresh. Each answer is a different design.
- Batching beats sharding for counters because it removes writes rather than spreading them. Shard for data size; batch for write rate.
- Hot keys are normal, not rare: Zipf traffic always has a top key, and virality makes it 5 times hotter overnight. A hot key's limit is its row lock (one change at a time, 1 / lock hold time a second), not its shard's cores, so a bigger machine does not raise it. Batch the key's writes or split it into sub-counters.
- Alert on the oldest message's age. Backlog size alone hides whether consumers are slow or traffic is high.
- Many systems keep two counts: a fast approximate one from the stream for display, and an exact one recomputed later from the raw logs for money.

## Check yourself

- **Q:** One database handles 500 views a second. Why does it fail at 2,000 while the web servers sit at 5%?
  A: Each view costs 5 ms of database CPU and the database has 4 cores: at most 800 a second. The web servers are not where the work is. [▶ Show it](play:broken: one database@t=8)
- **Q:** With four shards, why do views of unpopular videos fail on the viral day?
  A: The web servers' workers all end up waiting on the viral video's full shard, so new requests for any video find no free worker. [▶ Show it](play:broken: a viral video — its shard@t=8)
- **Q:** Will 16 shards fix the viral video?
  A: No. One video lives on one row on one shard, and its views alone fill about 96% of that shard's CPU (a real row lock caps it even lower). More shards only empty the others. [▶ Show it](play:broken: a viral video — sixteen@t=8)
- **Q:** With batching, every view is accepted in 45 ms. How do you know whether the counts are fresh?
  A: Look at the age of the oldest message on the queue. With too few consumers it climbs past 5 seconds while users see no errors at all. [▶ Show it](play:broken: too few consumers@t=10)

## Deep dive

Why does the top video get 38% at skew 1.5? Zipf says key k gets a share proportional to 1 / k^s. The total over all keys is 1 + 1/2^s + 1/3^s + ... For s = 1 and 100,000 keys that sum is about 12.1, so the top key gets 1 / 12.1 ≈ 8%. For s = 1.5 the terms shrink much faster and the sum is about 2.6, so the top key gets 1 / 2.6 ≈ 38%, the second about 14%, the third about 7%. A small change in skew turns a spread-out workload into one dominated by a single key, which is exactly what "going viral" does to a counter.
