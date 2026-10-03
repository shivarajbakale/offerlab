# News feed

## What it is

- **What it is:** The home screen of a social app: the newest posts from everyone a user follows, newest first, put together for each user and loaded every time they open the app.
- **What makes it hard:** Building a feed means gathering posts from every account the user follows, and doing that on every read overloads the database. Copying each post into every follower's feed ahead of time makes reads cheap, but one post by an account with millions of followers becomes millions of writes.
- **Building blocks it uses:** a queue of copy jobs shared out over many consumers ([Kafka partitions and consumer groups](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups)), and [load balancing](#/sd-04-traffic/014-load-balancing) across the app servers that read the timelines.
- **Where you'll meet it:** "Design Twitter's timeline" or "Design the Facebook news feed" is one of the most asked design questions. Twitter's "Timelines at Scale" talk (Raffi Krikorian, QCon 2012) described timelines of post ids kept in Redis and filled on write, and the delays that accounts with millions of followers cause; merging those accounts in at read time is the usual fix.

## Words we'll use

- **Post** — something a user publishes: a short text, a photo. Storing one is a **write**.
- **Follow** — subscribing to another account's posts. If you follow Ana, you are one of Ana's **followers**.
- **Home feed** (also **home timeline**) — the newest posts from everyone you follow, newest first. Loading it is a **read**.
- **Request** — one thing a user asks the app for: loading their feed or publishing a post.
- **Requests a second** — how much traffic arrives.
- **Latency** — how long one request takes, from the user sending it to the answer arriving. **p50** is the middle latency (half were faster); **p99** is the one 99% were faster than.
- **App server** — the program that takes a request, does the work and calls other machines. A **load balancer** in front hands each request to one of several identical app servers.
- **Database** — the machine that stores the data on disk and answers queries. Here the **posts database** stores every post exactly once.
- **CPU core** — one part of a processor that runs one piece of work at a time. **Utilization** (or "busy") is the share of time the cores are working.
- **Worker** — a slot for one request in progress inside an app server. It stays taken while its request waits for another machine. Requests that find no free worker wait, and when that line is full they are **rejected** with an error.
- **Join** — combining two sets of data: here, "who do I follow" with "what did they post".
- **Fan-out** — one action turning into many: one feed read into many database reads, or one post into many copies.
- **Fan-out on read** (also **pull**) — build the feed when someone reads it, by asking for the recent posts of every account they follow.
- **Fan-out on write** (also **push**) — build the feed ahead of time: when someone posts, add the post to every follower's timeline.
- **Timeline** — a per-user list kept ready to read: the ids of the newest posts for that user's feed. A **post id** is a short number naming a post.
- **In-memory store** — a database that keeps its data in memory (like Redis), so a lookup costs a fraction of a millisecond instead of a disk read.
- **Queue** — a list of jobs to do later. The request adds jobs and returns; **consumers** take jobs off the list and do them one at a time. The **backlog** is the jobs still waiting; the **oldest job's age** is how long the oldest one has waited.
- **Stale** — out of date: a timeline that does not yet show a post that already exists.
- **Amplification** — how many units of work one request causes. **Read amplification**: database reads per feed read. **Write amplification**: timeline writes per post.
- **Celebrity** — an account with a huge number of followers. The **celebrity threshold** is the follower count above which we treat an account as one.

## The world we're in

- Users read their feed far more than they post: here 90% of 1,000 requests a second are feed reads and 10% are new posts.
- Each user follows many accounts; a feed read needs the newest posts of the ones that posted recently. We model that as 10 accounts per read.
- A typical account has about 20 followers here (scaled down from real life, where hundreds are normal).
- Followers are wildly uneven. A few accounts have millions of followers; here 2% of posts come from accounts with 2,000, a hundred times the typical account.
- Reading one account's recent posts costs the posts database 1 ms of CPU; storing a post costs 2 ms. The posts database has 8 cores.
- A feed may be a few seconds out of date without anyone minding. Minutes is too late: people reply to posts they cannot see yet.

## The goal

Serve 1,000 requests a second with feed reads that stay fast, and new posts that reach every follower's feed within a second or two, for normal accounts and celebrities alike.

## The naive attempt

"Store each post once. When someone opens their feed, ask the database for the recent posts of everyone they follow and merge them."

At 500 requests a second this works: the posts database is 57% busy and 99% of requests finish within 70 ms.
[▶ Fan-out on read at 500 requests a second](play:fan-out on read: 500@t=8)

Count the work. Every feed read is 10 database reads, 10 ms of database CPU. At 1,000 requests a second that is 900 × 10 ms + 100 posts × 2 ms = 9,200 ms of CPU every second, and 8 cores only have 8,000. The limit is about 8,000 / 9.2 ≈ 870 requests a second. Past it, the database is 100% busy, the median request takes 740 ms instead of 64, and about 1 in 8 are rejected. The app servers' workers are all taken while their CPUs are 11% busy: every worker is waiting on the database.
[▶ Broken: fan-out on read at 1,000 requests a second](play:broken: fan-out on read@t=8)

The trouble is read amplification: the expensive join runs on the most frequent request, and it runs again for every reader even though most of them see mostly the same posts.

## Building it up

**1. Do the join once, when the post is written (fan-out on write).** A post is read many more times than it is written, so move the work to the write. Store the post once in the posts database. Then put one job per follower on a queue; each job adds the post's id to that follower's timeline in an in-memory store. A feed read is now one timeline lookup: no join at all.

At the same 1,000 requests a second, the posts database drops from 100% busy to 3%. The timeline store is 17% busy, and p99 is 51 ms.
[▶ Fan-out on write at 1,000 requests a second](play:fan-out on write: the same@t=8)

The work did not vanish, it moved. 100 posts a second × 20 followers = 2,000 timeline writes a second: write amplification of 20. Each job takes about 6 ms (5 ms of work plus the trip to the timeline store), so 2,000 jobs need about 2,000 × 0.006 ≈ 12 of the 20 consumers busy all the time: they are 63% busy. Posts reach every follower's timeline within milliseconds: the backlog stays under 200 jobs.

**2. Celebrities break fan-out on write.** Write amplification equals the author's follower count. Now 2% of posts come from accounts with 2,000 followers. Expected timeline writes: 100 posts × 20 + 2 celebrity posts × 2,000 = about 6,000 a second on average, three times as many. Twenty consumers at 6 ms a job can do about 20 / 0.006 ≈ 3,200 a second. The consumers are 100% busy and the backlog grows by about 6,000 − 3,200 ≈ 3,000 jobs every second. In this run it holds about 49,000 jobs at 15 s; other random runs give 30,000 to 60,000, because celebrity posts arrive at random and each one is 2,000 jobs. The oldest job is about 7 s old and still climbing: the consumers finish only about half of what arrives, so the job at the front of the line ages about half a second for every second that passes.
[▶ Broken: 2% celebrity posts, the backlog grows](play:broken: fan-out on write@t=15)
Nobody sees an error, and reads stay fast (p99 52 ms): every feed is simply out of date, by more each second, and normal users' posts are stuck in the same line behind the celebrities' copies.

More consumers do not fix this in real life. An account with 100 million followers makes one post into 100 million timeline writes; even at a million writes a second, that one post takes 100 seconds to reach everyone, and a few such posts a minute keep the system permanently behind.

**3. Push for most, pull for the few (hybrid).** Followers are uneven, so treat accounts differently. Normal accounts keep fan-out on write. A celebrity's post is written once, to a small in-memory store of celebrity posts. A feed read takes the reader's timeline and also pulls recent posts from the celebrities they follow, and merges the two. There are few celebrities and everyone reads their posts, so that store is small and hot: here 7% busy.

The backlog stays under 200 jobs and posts reach timelines within milliseconds again. The price is one more lookup per read: the median feed read goes from 45.2 ms to 46.5 ms. It also costs one more machine.
[▶ The hybrid with the same 2% celebrity posts](play:hybrid: celebrity posts pulled at read time, the backlog stays near zero (#2)@t=8)

The threshold matters. Set it too low and many accounts count as celebrities: their posts no longer fit in a small hot store, and each read pulls from many of them in the posts database. That is fan-out on read again, with the same failure: the posts database 100% busy and about 1 in 8 requests rejected.
[▶ Broken: the threshold set too low](play:broken: hybrid@t=8)

## Why it works now

Each request pays for the join where it is cheapest. A post by a normal account is copied 20 times, which is cheap and keeps 90% of the traffic, the reads, at one lookup. A celebrity's post would be copied millions of times, so it is copied zero times and read in place, which is cheap only because there are few such accounts and their posts are hot.

The measured trade, at 1,000 requests a second:

- **Fan-out on read**: 10 database reads per feed read, no timeline writes. Fails when the posts database fills, past about 870 requests a second.
- **Fan-out on write**: 1 timeline lookup per feed read; 20 timeline writes per post, 2,000 for a celebrity. Fails when celebrities post: the backlog grows and feeds go stale by about 7 s within 15 s, and more every second.
- **Hybrid**: 2 in-memory lookups per feed read; 20 timeline writes per normal post, 1 write per celebrity post. Holds, until the threshold is set too low.

## What it costs

- Fan-out on write stores each post id once per follower: write amplification is also storage amplification. Timelines are capped (say the newest 800 ids) to bound it.
- A queue and consumers to run, and a new number to watch: the oldest fan-out job's age, which is how stale feeds are.
- The hybrid adds a lookup and a merge to every read (about 1.3 ms here), another store to run, and a threshold to tune.
- Two code paths for posts. A user who crosses the threshold must move from one to the other without their followers' feeds losing or repeating posts.
- Deletes and edits must reach every copy: a deleted post must be removed from, or filtered out of, every follower's timeline.
- Here the hybrid costs $1.88 an hour against $1.47 for fan-out on write: one more machine.

## Staff notes

- Store ids in timelines, not post bodies. Fetch the bodies at read time from a cache of posts ("hydration"), so an edit changes one place.
- Skip fan-out to users who have not visited in weeks. Rebuild their timeline with fan-out on read when they come back; most never do.
- Alert on the age of the oldest fan-out job, not on its count. The age is the staleness users feel.
- Choose the celebrity threshold from data: the follower-count distribution and how many celebrity sources one read can afford to merge. Most accounts sit far below any sensible threshold; the problem is the top fraction of a percent.
- Give fan-out jobs from normal accounts and from large accounts separate queues or priorities, so a burst from one account cannot stall everyone's posts.
- Ranking (sorting the feed by predicted interest, not time) sits on top of all this: it still needs a candidate set built by push, pull or both.

## Check yourself

- **Q:** The posts database is 100% busy while the app servers' CPUs are 11% busy. Should you add app servers?
  A: No. Every app worker is waiting on the database's 10 reads per feed read; more app servers would only send more reads to it. [▶ Show it](play:broken: fan-out on read@t=8)
- **Q:** Fan-out on write moved the work from reads to writes. Why is that a good trade for most accounts?
  A: Reads are 9 times as frequent as posts. A post costs 20 cheap timeline writes once, instead of every one of its readers doing a 10-read join each time: the posts database goes from 100% to 3% busy. [▶ Show it](play:fan-out on write: the same@t=8)
- **Q:** With celebrities posting, nobody sees an error and reads are fast. What is wrong, and where do you see it?
  A: Feeds are stale. The fan-out backlog grows by about 3,000 jobs a second and the oldest job is about 7 s old at 15 s and climbing; only the queue's age shows it. [▶ Show it](play:broken: fan-out on write@t=15)
- **Q:** Why not treat everyone with more than 50 followers as a celebrity, to keep fan-out tiny?
  A: Then a read must pull from many accounts whose posts do not fit in a small hot store, which is fan-out on read again: the posts database fills and requests are rejected. [▶ Show it](play:broken: hybrid@t=8)

## Deep dive

Why does fan-out on write usually win, and why do celebrities break it? Count follow edges. Each follow is one edge from a follower to an account. The sum over all users of "accounts I follow" equals the sum of "followers I have": it is the same set of edges counted from each end. So the average number followed equals the average number of followers; call it F.

Fan-out on read does about R × F reads a second (R feed reads a second); fan-out on write does about P × F timeline writes a second (P posts a second). With R nine times P, push does about a ninth of the work on average, which is why it wins.

But averages hide the shape. The number of accounts one user follows is bounded (people cannot read 100,000 accounts, and services cap it), so pull's cost per read is bounded too. Followers are not bounded: one account can have 100 million. Push's cost per post is that account's follower count, so its worst case is enormous and arrives all at once. The hybrid cuts off the unbounded tail of push and keeps the bounded, cheap part, and pull is only used for the few accounts where it is cheap: few sources, read by everyone, so always in memory.

Simplifications in this model: a feed read's join is 10 sequential database reads (real systems batch them, which lowers latency but not the database's work); the simulator cannot choose a path by author, so celebrity posts take a separate path drawn as their own queue, and in the hybrid they still also make the normal 20 copies (2% extra work, too little to matter); the "too low threshold" read is modeled as 10 more posts-database reads.
