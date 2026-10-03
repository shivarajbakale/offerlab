# Ticket booking

## What it is

- **What it is:** The system behind a site like Ticketmaster: people load an event's seat map, hold a seat for a few minutes while they pay, and the seat is either sold to them or released back on sale.
- **What makes it hard:** Two people must never buy the same seat, yet on a big on-sale morning one event takes most of the traffic, bots fire requests as fast as they can, and that event's seats all live on one database machine that cannot be split without giving up the simple guarantee.
- **Building blocks it uses:** a hold that is one conditional update on the seat's row (compare-and-set, as in [optimistic concurrency](#/sd-api-design/03-optimistic-concurrency)), [delayed jobs](#/sd-low-level-design/07-delayed-job-scheduler) that release unpaid holds, a per-user [token bucket](#/sd-04-traffic/012-token-and-leaky-bucket) at the load balancer, and a waiting room like the line in the [flash sale](#/sd-architectures/11-flash-sale).
- **Where you'll meet it:** "Design Ticketmaster" is a well-known interview question. Ticketmaster's Smart Queue and Cloudflare's Waiting Room are commercial waiting rooms, and the 2022 Taylor Swift Eras Tour presale is the famous case of fans and bots overwhelming a ticket on-sale.

## Words we'll use

- **Event** — one concert or game, with its own set of seats. There are 1,000 events on sale here.
- **Seat map** — the picture of an event's seats showing which are free. Loading it is a **read**.
- **Hold** — a seat reserved for one person for a short time (10 minutes on many sites) while they pay. Placing one is a **write**. A hold ends in a **sale** (paid in time) or a **release** (seat free again).
- **Oversell** — selling the same seat to two people. The one thing this system must never do.
- **Conditional update** (compare-and-set) — "change this row only if it is still in the state I expect": `UPDATE seats SET holder = 42, until = now() + 10 min WHERE id = 7 AND NOT sold AND (holder IS NULL OR until < now())`. The database tells you how many rows changed: 1 means the hold is yours, 0 means someone got there first.
- **Primary** — the one database machine that accepts writes for some data. A **shard** is one slice of the data with its own primary.
- **Delayed job** — a job put on a queue now that consumers may take only after a set time. Here: "release this hold in 10 minutes, if it is still unpaid".
- **Cache**, **TTL** — a fast in-memory copy of data, used for at most its TTL (time to live) before being fetched again.
- **Rate limit** — a cap on requests per user per second; over it, the load balancer answers **429** (too many requests) at once.
- **Flash crowd** — a sudden surge of people arriving at the same moment for the same thing.
- **Stale** — showing an older state than the latest one: here, a seat map showing a seat as free after someone has held it.

## The world we're in

- A read loads one event's seat map: 4 ms of database CPU. A write places one hold: 2 ms. Reads are 70% of requests.
- A normal day: 1,000 requests a second; events' popularity is Zipf-shaped, so the top event gets about 13%.
- On-sale morning for a huge tour: 4,000 requests a second, and that one event gets about 75% of them.
- 30% of requests come from 20 bots trying to grab seats to resell.
- Failed requests are retried by clients after about 100 ms, then 200 ms.
- Holds last 10 minutes. The simulator shortens that to 5 seconds so you can watch them expire.
- The seats table lives in an 8-core database.

## The goal

Never sell a seat twice. Let real fans get seats on the busiest on-sale, quickly, and release unpaid holds so the seats go back on sale.

## The naive attempt

"One database holds every seat. A hold is a conditional update. Each hold also puts a delayed release job on a queue."

The conditional update is the right foundation: the database runs it atomically on the seat's row, so of two people holding seat 7 at once, exactly one sees "1 row changed". On a normal day, at 1,000 requests a second, the database is about 47% busy and nothing fails. About 300 holds a second each schedule a release, so about 1,500 release jobs are waiting for their 5 seconds to pass at any moment.
[▶ One database on a normal day](play:one database: 1,000@t=8)

On the on-sale morning, 4,000 requests a second need 4,000 × (0.7 × 4 ms + 0.3 × 2 ms) ≈ 13.6 seconds of CPU a second, and the database has 8. It is 100% busy; between 30% and 50% of all requests fail, for every event, since the app servers' workers are all waiting on it. The release jobs that come due need the same database, so they fall behind too: hundreds of releases are due but not done, and those seats stay held after their time is up.
[▶ Broken: one database on the on-sale morning](play:broken: one database, on-sale@t=5)

## Building it up

**1. Make the hold the only decision, and make it self-contained.** Notice what the release job falling behind means. If a seat counts as held until its release job runs, a backlog of jobs blocks seats nobody is paying for. So the hold's own condition checks the time: a seat is free if it is not sold and has no holder *or its hold has expired* (`NOT sold AND (holder IS NULL OR until < now())`). The `NOT sold` matters: paying leaves `until` as it was, so ten minutes later a sold seat's hold looks expired. A sold seat must never match the hold condition. The release job becomes housekeeping (show the seat as free on maps, notify waiting users), not something correctness depends on. Paying is conditional the same way: `UPDATE ... SET sold = true WHERE id = 7 AND holder = 42 AND until > now()`. If it changes 0 rows, the hold expired and the payment must not be taken (or must be refunded).

**2. Shard by event.** Different events never share a seat. So split the seats over four primaries by a hash of the event id, keeping each event's seats together on one primary. A hold is still one conditional update on one machine: no transaction ever spans two shards, so the oversell guarantee is exactly as strong as before. On a normal day at 4,000 a second the four shards are between 30% and 65% busy and nothing fails.
[▶ Four shards on a normal day](play:shards: four primaries@t=5)

On the on-sale morning, the tour is one event: one key, one shard. That shard is 100% busy while the others are under 25%. Between 15% and 30% of all requests fail, including requests for other events, because the app servers' workers are stuck waiting on the hot shard.
[▶ Broken: the on-sale event pins its shard](play:broken: sharded, on-sale@t=5)
Splitting one event across shards (by section, say) would need a transaction across shards whenever someone asks for "best available" or several seats together. It can be done, but it gives up the simple guarantee. Look first at what is filling the shard.

**3. Keep reads and bots off the hot shard.** Most of the hot shard's work is seat maps: they are 70% of requests and cost twice what a hold does, so over 80% of its CPU time goes to thousands of people a second loading the same event's map. That map is allowed to be a second old, because a map never sells a seat; only the conditional update does. So the app reads maps through a cache with a 1 second TTL: about one database read per event per second. And the load balancer limits each user to 2 requests a second (a burst of 4), answering the rest with 429 at once. People clicking at human speed never hit it; bots firing as fast as they can are turned away before they reach a server.

On the same on-sale morning, the hot shard is about 18% busy. About 98% of map loads hit the cache. Nearly 30% of requests are turned away, almost exactly the bots' share, and under 1% of real people's requests fail. No request times out.
[▶ Cached seat map and a per-user limit](play:protected: the on-sale@t=5)

The price is visible: over 90% of cached maps miss at least one hold made in the last second, because the hot event takes hundreds of holds a second. Some people will click a seat the map showed as free and be told it was just taken. That is a failed hold, not an oversell, and the screen should offer the next-best seat at once.

**4. For the very biggest on-sales, a waiting room.** A rate limit per user does not cap the total: a million real fans at 2 requests a second each is still far more than one shard can take. A waiting room puts arriving people in a line before the sale page and lets them in at the rate the hot shard can handle, telling each one their place. Case study 11 (flash sale) builds a line for purchases; commercial waiting rooms (Ticketmaster's Smart Queue, Cloudflare's Waiting Room) work at the front door instead. This stage is described, not simulated: the simulator's load balancer limits per user only.

## Why it works now

Oversell prevention never moved: it is always one conditional update on the one primary that owns the event. Everything else was arranged so that primary has spare capacity when it matters. Sharding gave other events their own primaries; the cache took the maps off it; the rate limit took the bots off it. The hot shard went from full
[▶ Broken: hot shard full](play:broken: sharded, on-sale@t=4)
to under a fifth busy with the same 4,000 requests a second.
[▶ Same traffic, protected](play:protected: the on-sale@t=4)

## What it costs

- Stale maps mean failed holds and a "seat just taken" screen. Short TTLs keep it rare for most events; for the hottest event in its first minutes it will happen a lot.
- One event cannot outgrow one primary in this design. Size that primary for the biggest on-sale's holds, and test it before the day.
- Every hold creates a release job. Here the simulator spreads release jobs over all shards; in reality they land on the hot event's shard, adding one cheap conditional update per hold, which changes nothing for holds that were paid.
- Rate limits by user can be dodged by bots with many accounts or addresses; real systems add bot detection, verified fan programs and purchase limits per account.
- Money: about $2.29 an hour for the protected design against $2.14 for plain shards and $1.12 for one database. The cache is cheap; the hard part is correctness and testing.

## Staff notes

- Write down the one place that decides, and check that nothing else (cache, replica, queue) can sell a seat. Then every other component may be eventually consistent.
- Never let correctness depend on a timer firing. Expiry belongs in the condition (`NOT sold AND (holder IS NULL OR until < now())`); release jobs are cleanup. Leave out `NOT sold` and a paid seat becomes holdable again once its old hold time passes.
- Make "pay" idempotent and conditional on the hold still being yours. If the payment provider charges after the hold expired, refund automatically, and alert, because it means the hold was too short for real people.
- Holds are inventory on loan: hold too long and bots park seats for 10 minutes at a time; too short and real people lose seats while typing card numbers. Limit holds per account.
- Do not read seat availability from a lagging replica for the hold decision. The map can come from anywhere; the hold must go to the primary.

## Check yourself

- **Q:** Two people click seat 7 at the same instant. What stops both from getting it?
  A: The hold is one conditional update on the seat's row on the event's primary. The database applies them one after the other; the second sees the seat already held and changes 0 rows. Sharding by event keeps that a single-machine operation. [▶ Show it](play:shards: four primaries@t=5)
- **Q:** On the on-sale morning, release jobs fall behind. Why does that not block seats forever in the final design?
  A: The hold condition treats an unsold seat with an expired hold as free (`NOT sold AND (holder IS NULL OR until < now())`), so a late release job only delays the map showing the seat free; it never stops someone holding it. [▶ Show it](play:broken: one database, on-sale@t=5)
- **Q:** Four shards are fine on a normal day. Why does the on-sale break them, and why would more shards not help?
  A: The on-sale event is one key on one shard, taking 75% of requests. More shards only move other events away from it. [▶ Show it](play:broken: sharded, on-sale@t=5)
- **Q:** The cached seat map is stale for over 90% of loads during the on-sale. Why is that acceptable?
  A: A map never sells a seat; only the conditional hold does. A stale map can make a hold fail, never succeed twice. In exchange the hot shard drops to about 18% busy. [▶ Show it](play:protected: the on-sale@t=5)

## Deep dive

Why is the conditional update safe without an explicit lock or a serializable transaction? Take PostgreSQL at its default isolation (read committed). Two transactions run `UPDATE seats SET holder = ... WHERE id = 7 AND holder IS NULL`. The first finds the row free, locks it and changes it. The second finds the same row, sees it is locked, and waits. When the first commits, the second re-reads the newest version of the row and checks its WHERE clause again: `holder IS NULL` is now false, so it changes nothing and reports 0 rows. MySQL's InnoDB behaves the same way for updates, which read the latest committed row and lock it. The pattern breaks only if you split it into "SELECT to check, then UPDATE": two transactions can both see the seat free in their SELECTs and both update it. Keep the check inside the UPDATE's WHERE clause and read the row count.
