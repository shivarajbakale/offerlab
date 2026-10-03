# Pastebin

## What it is

- **What it is:** A site where anyone pastes a block of text, gets a link back, and anyone with the link can read it. Pastes never change after upload, and many are set to expire after an hour, a day or a week.
- **What makes it hard:** Pastes are tens of kilobytes each, and a database that copies that much text on every read fills at a few hundred requests a second. Moving the text to cheaper file storage makes every read wait on a slower, sometimes much slower, service, and expired pastes must really be deleted, not just hidden.
- **Building blocks it uses:** popular pastes kept in memory (an [LRU cache](#/sd-low-level-design/02-lru-cache-with-ttl)), a cap on how many workers may wait on file storage at once ([bulkheads](#/sd-microservices/05-bulkheads)), and background deletes of pastes that are due by time, the idea behind a [delayed job scheduler](#/sd-low-level-design/07-delayed-job-scheduler).
- **Where you'll meet it:** "Design Pastebin" is a standard interview question, a close cousin of the URL shortener. Pastebin.com and GitHub Gist are the familiar products. The split it teaches, large bytes in object storage and a small record in the database, is the same one photo, file and video services use.

## Words we'll use

- **Paste** — a piece of text a user uploads, from a few lines to about a megabyte. Uploading one gives back a link; anyone with the link can read it.
- **Request** — one thing a user asks for: reading a paste (a **read**) or uploading one (a **write**, or **upload**).
- **Requests a second** — how much traffic arrives.
- **Latency** — how long one request takes, from the user sending it to the answer arriving.
- **p50 and p99** — sort the latencies. **p50** is the middle one; **p99** is the one 99% were faster than: the slow tail that 1 user in 100 feels.
- **CPU core** — one part of a processor that runs one piece of work at a time. Each machine here has 4.
- **Utilization** (or "busy") — the share of time the cores are working.
- **Worker** — a slot for one request in progress in an app server. It stays taken while its request waits for anything, including another service. A request that finds every worker taken waits in line; when the line is full it is **rejected** (an error), and a user who waits more than 1 second gives up (a **timeout**).
- **Bottleneck** — the part that runs out of capacity first and so limits the whole system.
- **Row** — one record in a database table.
- **Blob** (binary large object) — a big chunk of bytes the system stores but never looks inside: here, the text of a paste.
- **Metadata** — small facts about a paste: its id, owner, size, when it was made, when it expires, and where its text is stored.
- **Object storage** — a service (like Amazon S3) that stores blobs by name. It holds any amount of data cheaply, but each fetch takes tens to a couple of hundred milliseconds, and we cannot make it faster.
- **Zipf popularity** — a few items get most of the attention: the paste ranked k-th is read in proportion to 1/k. Here the top 10% of pastes get about 80% of reads.
- **Cache** — a fast in-memory copy of data that is read often. A **hit** finds it there; a **miss** does not. **Hit rate** is the share of hits.
- **Cache-aside** — the app looks in the cache first, and on a miss fetches from the source and puts the answer in the cache for next time.
- **Expiry** — a paste set to disappear after a time ("delete in 1 hour"). **Physical deletion** is removing its bytes from storage; until then an expired paste is hidden but still stored.
- **Index** — a sorted list the database keeps beside a table so it can find rows by one column fast: an index on expires_at finds every paste that expired before now.
- **Lifecycle rule** (or **TTL**, time to live) — a setting on a store that deletes each item by itself once it reaches a set age.
- **Retention** — how long data may or must be kept. Keeping it past a promised time can break a law or a contract (a **compliance** problem).
- **Queue** — a list of jobs to do later. The request adds a job and returns; **cleanup workers** (also called consumers) take jobs off and do them. The **backlog** is the jobs still waiting; the **oldest job's age** says how late the work is.
- **Orphan** — a blob with no metadata row pointing to it, or a row pointing to a blob that is not there: what is left when one of two writes fails.
- **CDN** (content delivery network) — servers in many cities that keep copies of public content, so each user is answered by one nearby.

## The world we're in

- There are 100,000 pastes. Reads outnumber uploads 9 to 1.
- Pastes follow Zipf popularity: the 10,000 most popular are read about 80% of the time.
- A paste is tens of kilobytes on average. Moving that many bytes in and out of a database row is slow: 10 ms of database work to read a paste stored in its row, 20 ms to store one. A small metadata row takes 1 ms to read and 3 ms to write.
- Object storage answers in about 50 ms, sometimes much more, and sometimes becomes much slower for a while.
- The app spends 2 ms of CPU showing a paste and 3 ms accepting one. Users are 20 ms away each way and give up after 1 second.
- What the simulator leaves out: every paste is the same size, the cache holds a number of pastes rather than a number of bytes, object storage never runs out of room or concurrency, and disk space and storage bills are not modeled.

## The goal

Accept and show pastes fast, keep working when object storage has a bad minute, and make expired pastes disappear for users on time, and from storage soon after.

## The naive attempt

"Store each paste as one database row, text included."

At 250 requests a second this works: a request takes about 56 ms, and the database is about two-thirds busy.
[▶ Text in the database at 250 a second](play:paste text in the database: 250@t=8)

Each request needs on average 0.9 × 10 + 0.1 × 20 = 11 ms of database work, and there are 4 cores, so the database can do at most 4 / 11 ms ≈ 360 requests a second. At 500 a second it serves about 365 and more than a fifth of requests fail. The app servers are under 15% busy; the database is moving bytes.
[▶ Broken: 500 a second, the database is full](play:broken: paste text in the database@t=8)

The database is doing work it is bad at. It is built to find and change small rows quickly; here almost all its time goes to copying large text that it never searches.

## Building it up

**1. Put the text in object storage, and keep only metadata in the database.** An upload first stores the text in object storage under a new name, then writes a small row that says where it is. A read looks up the row (does it exist, has it expired), then fetches the text. The database now does 1.2 ms of work per request instead of 11, so at 1,000 requests a second, four times what broke it before, it is under a third busy.
[▶ 1,000 a second with the text in object storage](play:object storage: 1,000 a second, the database under a third busy, every read slower (#2)@t=8)
The price is latency: every read now waits about 50 ms for object storage, and the median request goes from 56 ms to 93 ms. Look at the app servers too: about 28% of their workers are taken, while their CPUs are only 13% busy. Those workers are not working; they are waiting for object storage.

The order of the two writes matters. Text first, row last: if the upload dies in between, there is an orphan blob that nobody can reach, which a later sweep can delete. The other order would leave a row pointing at nothing, and readers would see an error.

That waiting is the next weak point. When object storage becomes 10 times slower (500 ms a fetch) for five seconds, every read holds its worker 10 times longer. All workers fill, new requests are rejected or time out, and over 90% of requests fail, including uploads, while the app CPUs sit almost idle. It recovers only when object storage does.
[▶ Broken: object storage slows down and the site fails](play:broken: object storage@t=8)

**2. Cache popular pastes in memory.** Reads are lopsided, and a paste's text never changes after upload, so a cached copy never goes out of date. Keep the 10,000 most popular pastes in a cache: about 80% of reads find their text there, and the median request drops from 93 ms to about 48 ms. A read still checks the metadata row first, so deleting or expiring a paste takes effect at once, even if its text is still in the cache.
[▶ The cache answers 8 in 10 reads](play:cache: popular pastes come from memory, at about half the latency (#2)@t=8)
The cache also shields the site from a slow object store, but only partly. In the same 10-times slowdown, cached reads do not notice: the median stays about 48 ms. But a read that misses, and every upload, still waits 500 ms or more, so the p99 rises to about 900 ms and about 2% of requests time out.
[▶ Broken: the slowdown still stalls every uncached read](play:broken: cache — a slow object store@t=8)

**3. Delete expired pastes in the background.** Many pastes are set to expire. For users, expiry already works: every read checks the metadata row, and an expired row means "not found", even if the text is still in the cache. But the bytes are still stored. Something must delete the text from object storage and the row from the database, or storage grows forever, and data kept past its promised **retention** can break a legal or contractual promise. Doing it inside a user's request would make that user wait for object storage. Instead, cleanup workers do the deletes in the background.
How do the workers learn which pastes have expired? Common queues cannot hold a job back for an hour (Amazon SQS allows at most 15 minutes of delay). Real designs use one of three things: a periodic sweep that asks the database, through an **index** on expires_at, for every paste that expired before now; a scheduler that keeps paste ids sorted by expiry time (for example a Redis sorted set) and hands out the ones that are due; or the object store's own **lifecycle rules**, which delete objects of a set age by themselves. The simulator stands in for all of these with a queue: each upload drops a delete job on it at once. Once the service has run for a while, pastes expire about as fast as they are created, so the number of deletes a second is the same.
At 100 uploads a second, each delete waits about 50 ms on object storage, so about 5 workers are busy all the time; 20 workers are about a quarter busy.
[▶ 20 cleanup workers keep up](play:expiry: 20@t=8)
When object storage slows down, deletes slow down too. By the end of the slowdown at 10 s the backlog is about 250 jobs, and the oldest has waited over 2 seconds; when object storage recovers, the workers catch up within about two seconds. Users see nothing of this.
[▶ Deletes fall behind and catch up](play:expiry: a slow object store@t=10)
With only 4 workers for about 5 workers' worth of deletes, the backlog never stops growing: about 140 jobs at 5 s, over 300 at 14 s, and the oldest more than 3 seconds late and getting later. Users still see no errors, and expired pastes stay hidden from them because reads check the metadata. What grows is the stored data nobody should have any more: the storage bill, and the risk of keeping data past its retention. The only sign is the queue.
[▶ Broken: too few cleanup workers](play:broken: too few cleanup workers@t=14)

## Why it works now

Each kind of data lives where it is cheap. Small, searched rows stay in the database, which now only does about 1 to 3 ms of work a request. Large bytes live in object storage, which holds any amount but answers slowly. Popular bytes live in memory, so most reads skip that slow answer. And deletes, which nobody waits for, run in the background at their own pace.
[▶ Stage 3 with expiry, at 1,000 a second](play:expiry: 20@t=5)

What is still exposed: every uncached read and every upload waits on object storage, so a slow object store still hurts the slow tail. Shorter timeouts on object storage calls, and a limit on how many workers may wait on it at once, keep that from spreading to cached reads.

## What it costs

- Two stores instead of one, and every upload writes to both. A failure between them leaves orphans that need a sweep.
- Every uncached read pays about 50 ms more than the database did when it was not overloaded.
- The cache holds pastes, which are large: 10,000 pastes of tens of kilobytes is hundreds of megabytes of memory.
- The cleanup queue and its workers are one more system to run, and they can fall behind silently.
- The bill moves from database machines (expensive per gigabyte) to object storage (cheap per gigabyte, paid per request). Here the machines go from about $0.71 to $1.28 an hour for about four times the traffic.

## Staff notes

- Put large blobs in object storage and a pointer in the database. Databases are priced and tuned for small rows; large rows also slow backups, database copies and every other query on the table.
- Write the blob first and the row last, and sweep orphan blobs on a schedule.
- Check metadata on every read even when the body is cached. It is cheap, and it makes deletion, expiry and changes to who may read a paste take effect immediately.
- Cap how many workers may wait on object storage at once, and give its calls a timeout well under the user's. A slow dependency should fail fast for the requests that need it, not take every worker.
- Alert on the cleanup queue's oldest job age. Reads that check metadata keep expiry exact for users, but a backlog means data stays stored past its time: more storage cost, and a retention promise ("deleted after 1 hour") broken without any error.
- Public, popular pastes can also be served from a CDN so they never reach the origin; private pastes cannot, unless the CDN checks access.

## Check yourself

- **Q:** Storing text in the database fails at 500 requests a second while the app servers are under 15% busy. What is full, and why?
  A: The database: each request needs 11 ms of its work on average, so 4 cores manage about 360 a second, and most of that time is spent moving large text. [▶ Show it](play:broken: paste text in the database@t=8)
- **Q:** After moving text to object storage, the app's workers are 28% taken but its CPUs only 13% busy. Where are the workers?
  A: Waiting for object storage, which takes about 50 ms a fetch and uses none of our CPU. [▶ Show it](play:object storage: 1,000 a second, the database under a third busy, every read slower (#2)@t=8)
- **Q:** Object storage slows down 10 times. Why do even uploads fail, when they have nothing to do with the slow reads?
  A: Slow reads hold all the app workers, so new requests of any kind find none free and are rejected or time out. [▶ Show it](play:broken: object storage@t=8)
- **Q:** With the cache, the median stays fast during the same slowdown, but the p99 is about 900 ms. Why both?
  A: About 80% of reads hit the cache and never touch object storage; the misses and the uploads still wait 500 ms or more. [▶ Show it](play:broken: cache — a slow object store@t=8)
- **Q:** No user sees an error or an expired paste, yet expired pastes are being deleted from storage later and later. How would you notice, and what fixes it?
  A: Watch the cleanup queue's backlog and its oldest job's age. Add workers until they are clearly below 100% busy: here 100 deletes a second at 50 ms need about 5. [▶ Show it](play:broken: too few cleanup workers@t=14)
