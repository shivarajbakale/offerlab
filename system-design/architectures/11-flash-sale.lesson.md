# Flash sale

## What it is

- **What it is:** Selling a small, fixed stock at one announced moment, such as sneakers, concert tickets or a new console, when far more people want it than there are units and nearly all of them arrive in the same few seconds.
- **What makes it hard:** Every purchase of the popular item must change the same stock row, one at a time, so the database can sell only a few hundred a second however big it is. Buyers waiting on that row hold server workers until page views fail too, bots and instant retries multiply the load, and the shop must never sell more than it has.
- **Building blocks it uses:** a [token bucket](#/sd-04-traffic/012-token-and-leaky-bucket) per user to turn bots away, clients that use [retries with backoff and jitter](#/sd-04-traffic/015-retry-backoff-jitter), and orders made safe to repeat with [idempotency keys](#/sd-api-design/02-idempotency-keys), in front of a waiting-room queue and a CDN for the product page.
- **Where you'll meet it:** "Design a flash sale" or "Design Ticketmaster" is a common interview question. Ticketmaster's 2022 presale for Taylor Swift's Eras Tour is the famous case of demand far beyond capacity. Cloudflare Waiting Room and Queue-it sell waiting rooms for exactly these moments.

## Words we'll use

- **Flash sale** — a fixed, small stock of an item that goes on sale at one announced moment, so nearly every buyer arrives in the same few seconds.
- **Request** — one thing a user's browser asks the site for. Here, either loading the **product page** (a **read**: only looks at data) or pressing **Buy** (a **write**: changes data).
- **Requests a second** (often written **QPS**) — how much traffic arrives.
- **Latency** — how long one request takes, from sending it to the answer arriving. **p50** is the middle latency (half were faster); **p99** is the one 99% were faster than.
- **CPU core** — one part of a processor that runs one piece of work at a time.
- **Utilization** (busy) — the share of time a machine is working. 100% means no spare capacity.
- **Worker** — a slot for one request in progress inside a server. It stays taken while the request waits for anything, including the database.
- **Error** — a request that failed: **rejected** (turned away at once because every worker and waiting slot was full, or by a rate limit) or **timed out** (the user gave up after 1 second).
- **Bottleneck** — the part that runs out of capacity first and so limits the whole system.
- **Row** — one record in a database table. The stock of the item is one row holding one number.
- **Lock** — while the database changes a row, it stops any other change to that row until the first one is **committed** (saved for good). So changes to one row happen one at a time.
- **Hot row / hot key** — one row (one key) that so much traffic wants to change that it limits everything.
- **Shard** — one slice of the data, held by its own database machine. **Sharding** splits rows over several machines.
- **Retry** — trying a failed request again. **Instant retry** goes again at once; **backoff** waits longer after each failure (100 ms, 200, 400), with random **jitter** so clients that failed together do not return together.
- **Bot** — a program that sends requests automatically, far faster than a person (scalpers use them).
- **Rate limit** — a cap on how many requests one user may send. A **token bucket** gives each user tokens at a steady rate (here 2 a second, holding at most 4); each request spends one; with none left, the answer is **429** ("too many requests") at once.
- **Load balancer** — the component in front of the app servers that hands each request to one of them; the rate limit runs here.
- **Queue** — a list of jobs waiting to be done in order. A **consumer** takes jobs off it and does them. The **backlog** is the number waiting. A **waiting room** is a queue of buyers.
- **CDN** (content delivery network) — servers in many cities that keep copies of pages and files that are the same for everyone, so users fetch them nearby and the origin servers never see those requests.
- **Oversell** — selling more units than exist.
- **Atomic** — done as one indivisible step: no other change can happen in the middle.
- **Idempotent** — safe to repeat: doing it twice has the same effect as doing it once.

## The world we're in

- The sale opens at noon. Demand is far above stock, and nearly everyone arrives in the first seconds.
- 60% of requests load the product page; 40% press Buy.
- There are 20 items on sale but one is the item everyone wants: about 83% of requests are for it.
- 5,000 people are buying. 20 bots send 40% of all requests between them: each bot sends about as much as 170 people.
- People press Buy again when it fails. Many clients retry at once.
- Every purchase of the item must take one unit from the same stock row: `UPDATE stock SET n = n - 1 WHERE item = 1 AND n > 0`. The database locks that row for each update until it commits, 4 ms. So purchases of that item go one at a time, however many cores the database has: at most 1,000 / 4 = **250 purchases a second**. The simulator models the row as a database with one core.
- A product page costs 4 ms in an app server and 5 ms in a 4-core catalog database (at most 800 pages a second).

## The goal

Keep the site answering through the spike, sell every unit and never more, and let real people (not bots) get a fair chance. When the stock is gone, say so quickly.

## The naive attempt

"Every Buy runs the UPDATE on the stock row."

At 500 requests a second (200 purchases) the row is 83% busy and everyone is served.
[▶ 500 requests a second, straight to the database](play:every buyer hits the database: 500@t=8)

At 800 requests a second, 320 purchases a second arrive for a row that can do 250. The row is 100% busy, purchases wait in line for its lock, and each one holds an app server worker while it waits. Soon every app worker is waiting on the row (their CPUs are only 10% busy), and new requests of any kind, product pages included, find no free worker. Purchases are 40% of requests, yet about 6 in 10 requests fail. The catalog database is only 35% busy: product pages fail for a reason that has nothing to do with them.
[▶ Broken: the stock row is full and page views fail too](play:broken: every buyer hits the database — the stock row@t=8)

## Building it up

**1. See why retrying at once makes it worse.** When a request fails, these clients send it again immediately, up to 3 times. Every retry is one more request for a row that is already full. At 800 a second, retries add about 1,100 requests a second. Compared with clients that give up after one try, fewer requests succeed (about 314 a second instead of 403) and the error rate rises from 47% to 59%. More work, less done.
[▶ Broken: the same sale with instant retries](play:broken: instant retries — more requests, fewer purchases (#2)@t=8)

**2. See why sharding does not help.** Sharding is the usual answer to too many writes: split the stock table over 4 databases by item. But 83% of purchases are for one item, and one item is one row on one shard. At 1,000 requests a second that shard is at 100%, the other three are under 13% busy, the bill goes from $1.39 to $2.41 an hour, and more than half of all requests still fail. The limit is one row, and a row cannot be split by adding machines.
[▶ Broken: four shards, one of them full](play:broken: sharding the stock table — the hot item's shard is full, the rest idle (#2)@t=8)

**3. Turn away the bots, and make clients back off.** Each person sends a request every 4 to 10 seconds; each bot sends 16 or more a second. So limit every user to 2 requests a second (with a burst of 4) at the load balancer. A request over the limit gets a 429 at once, which costs the load balancer almost nothing and never reaches an app server. And clients that fail now wait 100 ms, then 200, then 400, with jitter, instead of retrying at once.

The 800 requests a second that broke stage 1 now pass. The only errors are 429s for bots: about 35% of requests, nearly all of the bots' 40%. Nothing times out, the stock row drops from 100% to 88% busy, and the median request takes 54 ms.

This works because each bot here keeps one identity. Real scalpers rotate thousands of accounts and IP addresses, so each one looks like a polite person under the limit. A per-user limit is still worth having, but in a real sale it needs help: bot detection (challenges, device and behaviour signals) and gates such as verified-buyer or invite-only access.
[▶ Rate limit and backoff at 800 requests a second](play:rate limit: the 800@t=8)

A rate limit removes abusive traffic; it cannot make the row faster. At 2,000 requests a second, real people alone press Buy about 480 times a second, twice what the row can take. The row is full again, every app worker waits on it, and 85% of requests fail.
[▶ Broken: 2,000 a second, real demand twice the row](play:broken: rate limit — at 2,000@t=8)

**4. Make buyers wait in line instead of fail.** The row can do 250 purchases a second no matter what. Demand above that cannot be served now; it can only be served later, or refused. So stop sending purchases to the row. Buy now puts the purchase in a **waiting room** (a queue) and answers at once: "you are in line". One consumer takes purchases off the line in order and runs each on the row. One consumer with one purchase at a time feeds the row about 167 purchases a second, so the row is busy (67%) but never full, and never makes anyone's request wait.

At 2,000 requests a second, the load that failed 85% of requests in stage 2, nothing times out, the only errors are the bots' 429s, and the median request takes 52 ms. Page views are fast again because no app worker waits on the row.
[▶ A waiting room at 2,000 requests a second](play:waiting room: 2,000@t=8)

The waiting moves into the line. About 500 purchases a second join and 167 leave, so the line grows by about 340 a second: 1,702 people at 5 s, 3,400 at 10 s. The person at the front has waited 6.8 seconds. Someone joining at 10 s is number 3,400 and will wait about 3,400 / 167 ≈ 20 seconds. That number is what a waiting room page shows: your place, and the time it means. (In the simulator the user's request ends when they join the line; the wait is the age of the oldest purchase in the queue.)

The line protects the row, not the rest of the site. At 2,500 requests a second, real people's product page views alone, about 900 a second, need more than the catalog database's 800. It is 100% busy, app workers wait on it, and real page views fail on top of the bots' 429s. The stock row is fine at 67%.
[▶ Broken: product pages fill the catalog database](play:broken: waiting room — at 2,500@t=8)

**5. Serve the product page from a CDN.** The product page is the same for every buyer: name, price, photos. So make it a static page and let a CDN keep copies near every user. Those requests never reach the load balancer, the app servers or the catalog. Only purchases do. At 2,500 requests a second, the page comes back in 20 ms from a nearby server, the catalog database is idle and the app servers are 8% busy. The only errors are the bots' purchases, now about 15% of requests (the bots' page loads are served by the CDN). The CDN is billed per request: the hourly cost goes from about $1.44 to $5.45.
[▶ The same 2,500 a second with the page on a CDN](play:CDN: 2,500 a second, the product page from nearby, the catalog idle (#2)@t=8)
The page can no longer show a live stock count: the copy is minutes old. Show "selling fast" from the page, and the real answer when the buyer reaches the front of the line.

## Why it works now

Every stage removed load from the one part that cannot grow. The rate limit removed bots, backoff removed retry storms, the CDN removed page views, and the waiting room turned the rest of the demand from "now, all at once" into "in order, at a rate the row can take". Before the waiting room, any purchase above 250 a second took an app worker hostage and made unrelated requests fail.
[▶ Broken: purchases wait on the row and take the whole site down](play:broken: rate limit — at 2,000@t=6)
After it, the row runs at a steady 67% and nobody's request waits on it.
[▶ The waiting room at the same load](play:waiting room: 2,000@t=6)

What the line cannot do is make the row faster. Let 10 consumers in at once and the row is at 100%, yet the line still grows: from about 2,000 at 5 s to 3,864 at 10 s. The row's 250 a second is the end of this design. That is fine for a flash sale, because the stock runs out: with 500 units, the first 500 people in line get one, and everyone after them should be told "sold out" at once instead of waiting. The waiting room should stop admitting buyers once the line is longer than the stock.
[▶ Broken: ten consumers, the row full, the line still growing](play:broken: where this design ends@t=10)

**Preventing overselling** (described, not simulated: the simulator does not track units). The queue gives order, not correctness; correctness comes from the database:
- Decrement atomically and conditionally: `UPDATE stock SET n = n - 1 WHERE item = 1 AND n > 0`, then check how many rows changed. If 0, the item is sold out. Two buyers can never both take the last unit, because the row lock makes the check and the change one atomic step. Reading the stock, checking it in the app, then writing it back is the classic bug: two buyers both read "1 left" and both buy.
- Use a **reservation**: at the front of the line, take a unit and hold it for 10 minutes while the buyer pays. If payment does not finish in time, a cleanup job puts the unit back. Users who never pay do not lock stock forever.
- Make "place order" idempotent: the client sends an order id it made up, and the database refuses a second order with the same id. A retried click, or a consumer that runs the same job twice, cannot buy two units.
- If one row's 250 a second is truly too slow, split the stock into buckets: 500 units as 10 rows of 50 on different shards, each buyer taking from a random bucket that still has stock. Each row still locks, but 10 of them work in parallel. The cost: "sold out" now means all 10 are empty.

## What it costs

- Users wait instead of being served at once; the waiting room page, place in line and "sold out" notice are product work, not just plumbing.
- The rate limit can catch real people behind one shared IP address (an office, a mobile carrier) if it limits by IP instead of by account. And it only stops bots that keep one identity; scalpers who rotate accounts and addresses need bot detection or verified-buyer gates as well.
- This waiting room is a purchase queue behind the app servers: everyone can load the site, and only purchases wait. Products such as Cloudflare Waiting Room and Ticketmaster's queue work one step earlier, holding visitors before any page loads and admitting them to the site at a set rate, which also protects the app servers and pages.
- The line is a new component every purchase depends on. If it loses jobs, people who were "in line" never get an answer; it must keep jobs on disk.
- A CDN copy is out of date by design: it cannot show live stock. Here it is also the biggest line on the bill (about $5.45 an hour against $1.44).
- Reservations need a cleanup job and a decision on how long to hold a unit.

## Staff notes

- Find the true limit first: here, one row's lock time. No number of app servers, shards or caches changes it. Everything else is about protecting it.
- Fail cheap and early. A 429 at the load balancer costs microseconds; a request that waits on a full database for a second holds a worker, a connection and the user's patience, and then fails anyway.
- Retries without backoff turn an overload into a longer, bigger overload. Every client library in the path should back off with jitter and cap its attempts.
- Correctness (never oversell) belongs in one atomic database operation. Queues and rate limits make the load survivable; they do not make the count right.
- Close the line when the stock is gone. A fair, fast "sold out" is a better experience than a 20-minute wait for nothing.
- Rehearse: replay the expected spike against a staging copy before the sale, and have a switch that turns the waiting room on before noon.

## Check yourself

- **Q:** At 800 requests a second, purchases are 40% of traffic. Why do about 60% of requests fail, product pages included?
  A: Purchases wait for the full stock row while holding app workers. Once every worker is waiting, new requests of any kind find none free. [▶ Show it](play:broken: every buyer hits the database — the stock row@t=8)
- **Q:** Will four shards fix it?
  A: No. 83% of purchases are for one item, which is one row on one shard. That shard is full while the others are nearly idle. [▶ Show it](play:broken: sharding the stock table — the hot item's shard is full, the rest idle (#2)@t=8)
- **Q:** With a rate limit, 35% of requests still fail at 800 a second. Is the site broken?
  A: No. Those are 429s for bots, which send 40% of requests. Nothing times out and the median request takes 54 ms. [▶ Show it](play:rate limit: the 800@t=8)
- **Q:** In the waiting room, users get an answer in 52 ms. Where did the waiting go?
  A: Into the line: it grows by about 340 a second, and the person at the front has waited 6.8 s by 10 s. The oldest job's age is the wait. [▶ Show it](play:waiting room: 2,000@t=10)
- **Q:** Why not add more consumers to drain the line faster?
  A: The row takes 250 a second whatever feeds it. With 10 consumers it is at 100% and the line still grows. [▶ Show it](play:broken: where this design ends@t=10)

## Deep dive

Why does the stock row act like one core even on a big database? To change a row safely the database takes a lock on it, makes the change, writes a log record and waits for the disk to confirm the commit, then releases the lock. Other transactions that want the same row wait in a line for that lock. The row's throughput is therefore 1 / (time the lock is held). Holding it 4 ms caps the row at 250 changes a second; a faster disk or a shorter transaction (no other work while holding the lock) raises the cap, which is why flash-sale code keeps the stock update as small as possible and does payment, emails and everything else outside it. Some databases go further and group many waiting updates into one commit, or let a single in-memory store (such as a Redis counter decremented with one atomic command) hand out units far faster than a disk-backed row, then record the orders in the database afterwards.
