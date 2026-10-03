# Ad click aggregation

## What it is

- **What it is:** The pipeline that counts clicks on ads, per ad per minute, so advertisers can be billed and see their numbers. Every click is money, so the counts must be exactly right.
- **What makes it hard:** A retried click, or a counter that crashes between saving its sums and recording how far it has read, counts the same click twice with no error anywhere: the advertiser is simply overbilled. Clicks also arrive late, and invoices must be provable afterwards.
- **Building blocks it uses:** a durable log of raw clicks ([Kafka partitions and consumer groups](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups)), sums and read position saved in one transaction (the [idempotent consumer](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)), and a conditional commit that shuts out a paused worker ([fencing tokens](#/sd-05-replication/023-leases-and-fencing-tokens)).
- **Where you'll meet it:** "Design an ad click aggregator" is a staple interview question. Kafka transactions and Flink's checkpoints with transactional sinks are the standard tools for exactly-once counting. Google's Photon paper (SIGMOD 2013) describes joining ad clicks to queries exactly once across data centres.

## Words we'll use

- **Click** — one person clicking one ad. The click is recorded, then the person is redirected to the advertiser's site. Advertisers pay per click, so every click is money. Here every click is a **write**.
- **Window** — a slice of time the clicks are added up over: here one minute. "Ad 42, 12:01 to 12:02: 318 clicks" is one window's **aggregate**.
- **Ad SDK** — the code inside the app or page that sends the click to us. If it hears nothing within 500 ms, it sends the same click again (a **retry**).
- **Duplicate** — the same click counted twice. Here that means an advertiser **overbilled**.
- **Click id** — a unique id for each click, the same on every retry of it. It is how a duplicate is recognised. Dropping recognised duplicates is **deduplication**.
- **Log** — a durable, ordered list of messages (Kafka is the common one). Messages are kept on disk and read by **consumers**, each remembering its **offset**: the position in the log it has read up to.
- **Committing an offset** — saving "I have handled everything up to position 81,723". After a crash, a consumer restarts from its last committed offset, so anything handled after that commit is handled again.
- **Aggregator** — a consumer that adds up a batch of clicks per ad per window and writes the sums.
- **Transaction** — a group of writes to one database that all happen or none do.
- **Exactly once** — each click affects the totals exactly one time, even across crashes and retries. Logs alone give **at least once**; exactly once has to be built on top.
- **Late click** — a click that reaches us well after it happened: a phone that was offline, a slow network, a backed-up pipeline. **Allowed lateness** is how long a window stays open for them.
- **Reconciliation** — recounting the same raw clicks later, in a batch job, and comparing with the fast count.

## The world we're in

- 4,000 clicks a second, from 20,000 people at a time.
- The ad SDK waits 500 ms for each click to be recorded and sends it once more if it hears nothing.
- The counts table has one row per ad per minute. Adding 1 to a row costs the database 0.5 ms; four cores make it about half busy at 4,000 clicks a second.
- Databases stall now and then: a checkpoint, a failover, a noisy neighbour. Here, 4 times slower for 1 second.
- Machines die. Clicks arrive late. Advertisers check their invoices against their own numbers.

## The goal

Count every click exactly once per window, survive stalls, crashes and retries without overbilling or underbilling, and be able to prove the totals afterwards.

## The naive attempt

"For every click, add 1 to that ad's row for this minute, then redirect."

On a normal day this is fine: the database is half busy, every click takes under 50 ms, and the database holds as many clicks as people made.
[▶ 4,000 clicks a second, counted in place](play:add 1 per click: 4,000@t=4)

Then the database stalls for one second. Clicks queue up; for a while they take longer than 500 ms, so the SDKs give up and send them again. But the first copies were not lost, only slow: the database records them, and then records the retries too. About 700 clicks are counted twice, and nothing anywhere reports an error. Every user got their redirect. The only sign is that the database now holds about 700 more clicks than people made, and the advertiser's invoice is wrong.
[▶ Broken: a 1 s stall, ~700 clicks counted twice](play:broken: add 1 per click@t=6)

The trouble is that "add 1" is not **idempotent**: doing it twice is different from doing it once, and a retry cannot tell whether the first try worked.

## Building it up

**1. Record the click, not the count.** Give every click an id when the ad is shown (so all retries carry the same id), append the click to a durable log and answer at once. Counting happens later, in consumers that can be careful. The click endpoint now only writes to the log, so the same database stall does not reach it: no click is slow, no SDK retries, nothing is recorded late.
[▶ The same stall, through a log](play:count in the stream@t=6)
Aggregators take about 100 clicks at a time, add them up per ad per minute, and write the sums: about 40 database writes a second instead of 4,000, with the database under 5% busy. (Case study 10 does the same batching for view counts. The difference here is that every click must be counted exactly once.)

SDK retries still happen (a phone loses signal after sending), so the aggregator drops any click id it has already counted. That means remembering ids for as long as repeats can arrive: at 4,000 a second, about 14 million ids an hour. A Bloom filter (primitive 005) can hold them in far less memory, but a false positive drops a real click, which underbills; exact sets are the safer default for money. Keep each set with its log partition (by ad id, since every retry of a click carries the same ad), so the check is local, and save it in the same transaction as the sums (step 3), or a crash forgets ids and lets later retries through.

**2. See where "commit after" double counts.** The aggregator writes a batch's sums, then commits its offset to the log. Offsets are committed once a second here (Kafka's default auto-commit interval is 5 s), so a batch waits about half a second, already written, before it counts as done. Now one aggregator dies. It was in the middle of about 6 batches, and nearly all of them had already written their sums. Their offsets were never committed, so the log hands them out again, and their sums are added a second time: about 600 clicks counted twice.
[▶ Broken: an aggregator dies after writing, before committing](play:broken: commit after writing@t=6.1)
The writes and the commit are two systems, and no crash can be prevented from landing between them. This is the dual-write problem from primitive 026.

**3. Write the sums and the offset in one transaction.** Store the offset in the counts database itself, in the same transaction as the sums: "ad 42 +31, ad 7 +4, ..., and this aggregator has now read partition 3 up to offset 81,723". On restart the aggregator reads its offset from the database, not from the log. Now a crash either lands before the commit (nothing written, the batch is read again and counted once) or after it (both the sums and the offset are saved, and the batch is skipped). The same crash cuts off no batch that had written anything, and the aggregators' workers are almost never busy, because a batch is in flight only for the few ms before its commit.
[▶ The same crash, sums and offset together](play:sums and offset in one transaction@t=6.1)
One gap remains: an aggregator that is paused (a long GC, a frozen VM), not dead. Its partition is handed to another aggregator, then it wakes up and commits the batch it was holding, and both sums land. So make the commit conditional: `UPDATE offsets SET offset = 81723 WHERE partition = 3 AND offset = 81623` (or carry a generation number). The zombie's commit then matches no row, its transaction rolls back, and its sums are never added (fencing, primitive 023).
This is the idempotent consumer of primitive 026, with the offset as the record of what has been applied. Kafka transactions and Flink's checkpoints with transactional sinks package the same idea.

**4. Wait for late clicks, then recount.** A click made at 12:01:59 may arrive at 12:04. If the 12:01 window was already final, it is either lost or must correct an invoice. So each window stays open for an allowed lateness (2 s here, standing in for minutes): each batch schedules a "close" job for its windows that runs that much later and marks them final. About 70 batches' windows are waiting to close at any moment (36 batches a second × 2 s), and the database is still under 2% busy. Clicks that arrive later still go to a correction, not the closed window.
[▶ Windows held open for late clicks](play:wait for late clicks@t=8)
A second reader of the same log copies the raw clicks to cheap object storage, about 4 files of 1,000 clicks a second. Every night a batch job recounts each ad's day from those raw clicks, deduplicating by click id with all the time in the world, and the invoices are made from that recount. The stream count is for dashboards and budget alarms; the batch count is for money. If the two disagree by more than a small, known amount, something is broken.

## Why it works now

Every click has an id, so a repeat can be recognised. Every click is kept in a durable log, so none is lost. Every applied batch is recorded in the same transaction as its effect, so a crash can never leave "counted" without "recorded as counted".
[▶ A crash that double counts nothing](play:sums and offset in one transaction@t=6.1)
And because the raw clicks are kept, any count can be recomputed and checked later.

## What it costs

- **Freshness.** Counts lag by the batch time, and windows are final only after the allowed lateness. Real-time dashboards show provisional numbers.
- **Deduplication memory.** Every click id must be remembered for as long as a repeat can arrive. Longer windows catch more repeats and cost more memory.
- **Offsets live in our database.** Rebalancing partitions between aggregators must read and respect those stored offsets, not the log's.
- **Two counts.** The raw archive and the nightly recount double the storage and add a batch system to run, but they are the only way to prove an invoice.
- **Simplifications here.** The simulator cannot skip a duplicate, so deduplication is described, not simulated. It shows offset commits as a 0.5 s wait per batch (the average wait for the next periodic commit).

## Staff notes

- Ask first: is this number money? Billing needs exactly-once and an audit trail; a "clicks today" chart does not.
- Generate the click id when the ad is served and sign it, so retries share it and nobody can mint new ones. The same id is what click-fraud filters key on.
- Partition the log by ad id so one ad's clicks for a window meet in one aggregator; a hot ad then needs pre-aggregation in several aggregators before a final merge.
- Decide the late-click policy with the business: how late is accepted, and whether a late click corrects an issued invoice or goes on the next one.
- Alert on the gap between the stream count and the batch recount, per ad and in total. A gap that grows is a bug in one of them.

## Check yourself

- **Q:** During the stall no request failed and every user was redirected. What went wrong?
  A: Clicks took over 500 ms, the SDKs resent them, and the database recorded both copies: about 700 clicks counted twice, with no error to see. [▶ Show it](play:broken: add 1 per click@t=6)
- **Q:** Why does putting clicks on a log protect the click endpoint from the same stall?
  A: The endpoint only appends to the log and answers; the database is written later by aggregators, so its stall never makes a click slow enough to be retried. [▶ Show it](play:count in the stream@t=6)
- **Q:** The aggregator writes the sums, then commits its offset. Why does a crash between the two double count?
  A: After restart it reads from the last committed offset, so batches that were written but not committed are read and written again: here about 6 batches. [▶ Show it](play:broken: commit after writing@t=6.1)
- **Q:** How does storing the offset in the same transaction fix it?
  A: Sums and offset are saved together or not at all, so on restart the aggregator knows exactly which batches are in the totals and skips them. [▶ Show it](play:sums and offset in one transaction@t=6.1)
- **Q:** Why keep a nightly recount if the stream is exactly once?
  A: Late clicks, bugs and replays happen; the raw clicks let you recompute and prove every invoice, and a gap between the two counts reveals a bug. [▶ Show it](play:wait for late clicks@t=8)
