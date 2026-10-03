# Nearby places

## What it is

- **What it is:** The search behind "restaurants near me" in an app like Yelp or Google Maps: given where the user is standing, return the places within a few hundred metres, ranked.
- **What makes it hard:** An ordinary database index sorts by one number, but a location is two, so a box query reads every place in a strip around the planet. Then on a Friday night one downtown neighbourhood takes a third of all searches, and its cell lives on one machine.
- **Building blocks it uses:** [geohash](#/sd-01-partitioning/003-geohash) cells that turn "near me" into 9 range scans of a sorted [B+ tree index](#/sd-03-storage/010-b-plus-tree), databases sharded by cell, a cache of each cell's results cleared on writes, and a CDN serving rounded-to-the-cell requests.
- **Where you'll meet it:** "Design Yelp" or "Design a proximity service" is a classic interview question. Redis's GEO commands store geohash-encoded positions in sorted sets, Elasticsearch has a geohash grid aggregation, and PostGIS answers the same queries with an R-tree style GiST index.

## Words we'll use

- **Place** — a restaurant, shop or bar, stored with its latitude and longitude, its name and its rating.
- **Search** — "what is near me?": the places within about 500 metres of the user's location, ranked. Here a search is a **read**.
- **Write** — adding a place or a review. Writes are rare: 1 in 100 requests.
- **Box query** — `WHERE lat BETWEEN a AND b AND lng BETWEEN c AND d`. An ordinary index sorts rows by one column, so it can narrow the latitude, but every row in that latitude band (a strip right around the planet) must then be checked for its longitude.
- **Geohash** — a short text such as `gcpuzg` that names a rectangle of the map (a **cell**). Each extra character names a cell 32 times smaller inside the last one. Six characters is a cell about 1.2 km wide by 0.6 km tall at the equator; the width shrinks away from it (about 0.75 km at London's latitude). Primitive 003 builds it from scratch.
- **Neighbours** — the 8 cells of the same size around a cell. A search reads its own cell and the 8 neighbours, because a place 50 metres away can sit across a cell edge.
- **Shard** — one slice of the data on its own database machine. **Sharding by cell** puts each cell's places on one shard.
- **Zipf distribution** (**skew**) — popularity where the top key gets the most traffic, the second about half as much, and so on. Higher skew makes the top keys take a bigger share. Here a key is a cell, and the top cells are dense city blocks.
- **Hot spot** — one cell (or one shard) that gets far more traffic than the rest.
- **Cache-aside** — the app first asks an in-memory **cache** for the answer; on a **miss** it asks the database and stores the answer in the cache for next time. A **hit** is an answer found in the cache. **Hit rate** is the share of lookups that hit.
- **TTL** (time to live) — how long a cached copy may be used before it is thrown away and fetched again.
- **CDN** — servers near every user that keep copies of answers. An **edge** server is one of them.
- **Stale** — an answer older than the latest write: here, a search result that does not yet show a review someone just posted.
- **Utilization** (busy) — the share of time a machine's cores are working. **p50** is the median latency.

## The world we're in

- 5,000 requests a second. 99 in 100 are searches, 1 in 100 adds a place or a review.
- A request is about one cell. 50,000 cells hold places. Their popularity is Zipf-shaped with skew 1.2: the busiest city cell gets about 20% of all searches.
- On a Friday night downtown the skew rises to 1.4 and the busiest cell gets about 33%.
- Four app servers (never the limit here). A database machine has 4 cores.
- Searches need to be fast (the user is standing on a street corner) and a little out of date is fine: a review posted ten seconds ago can wait.

## The goal

Answer 5,000 searches a second, including on Friday night when one neighbourhood takes a third of them, without paying for a database fleet that sits idle the rest of the time.

## The naive attempt

"Put the places in a table with latitude and longitude columns, index them, and run a box query."

The index narrows the latitude, but not the longitude: every place in a strip around the planet is read and checked. (A real spatial index, such as an R-tree like PostGIS's GiST index, answers a box query on one machine without that scan. Geohash cells win here for another reason: a cell id is a plain key you can shard, cache and put in a CDN URL.) Say that costs 10 ms of database CPU a search. Four cores then answer at most 4 / 10 ms = 400 searches a second. At 300 a second the database is 75% busy and fine.
[▶ 300 searches a second](play:box query: 300@t=8)

At 5,000 a second, about 400 a second reach the database and the rest are turned away: almost no search succeeds. The app servers are under 5% busy, so more app servers do nothing.
[▶ Broken: the box query at 5,000 searches a second](play:broken: box query@t=8)

## Building it up

**1. Turn the 2-D search into a few key lookups.** Store each place under its 6-character geohash and keep the table sorted by it. A search computes the user's cell and its 8 neighbours and reads those 9 cells: 9 short range scans of a sorted index, say 2 ms in all instead of 10. Then shard: four databases, each holding a range of geohashes, so a cell and nearly all its neighbours live on one shard. On a normal night the four shards carry 5,000 searches a second with no errors and a 47 ms median. They are not even: the busiest is about 94% busy, because the hottest city cells happen to live on it.
[▶ Four shards by cell](play:geohash cells: four@t=8)

**2. See what happens when the city fills up.** On Friday night one cell takes a third of all searches: 1,600 a second × 2 ms is about 80% of one shard on its own. That shard is 100% busy while the other three are about half busy or less. App workers pile up waiting for the full shard, so searches of quiet cells fail too: about 14% of all searches fail.
[▶ Broken: the city's shard is full](play:broken: Friday night@t=8)
Sixteen shards stop the errors only by moving the other cells away. The city's shard is still 86% busy, half the shards are under 10% busy, and the bill is three times bigger ($6.15 an hour instead of $2.07).
[▶ Sixteen shards, the hot one still 86% busy](play:sixteen shards@t=8)
(The simulator spreads cells over shards by hashing them. Real range shards keep a whole city on one or two shards, so the hot spot is worse than this, not better.)

**3. Cache each cell's results.** The hot cell is the same answer for everyone standing in it, and it changes only when a place or review in it is added. That is the ideal thing to cache. Keep the results of 5,000 cells (10% of them) in memory, cache-aside. When a review is written, delete that cell's cached copy, so the next search refills it. On Friday night 95% of searches are answered by the cache, every shard is under 10% busy, the median is about 44 ms, and no search sees an old cell. (In the simulator. In a real cache-aside, a slow reader that missed before the write can put the old answer back after the delete; the TTL bounds that, and leases like those in Facebook's memcache close it.) The bill is $2.22 an hour.
[▶ Friday night with the cell cache](play:cell cache: on Friday@t=8)
The hot spot that broke the shards is now what makes the cache work: the busiest cells are always in it. On a normal night, with popularity more spread out, 89% hit and the busiest shard is about 10% busy.
[▶ A normal night with the cell cache](play:cell cache: a normal@t=8)

**4. Round to the cell and answer at the edge.** If the app sends the cell id, not the exact coordinates, everyone in a cell sends the same request, so a CDN can keep the answer. With 10 s copies, the edge answers 87% of searches, the median falls from 44 ms to 20 ms (the edge is 10 ms away, our servers 20), and the app servers drop to about 5% busy.
[▶ Searches answered at the edge](play:edge: the CDN@t=8)
Two prices. The CDN charges per request: the bill goes from about $2.2 to about $15.7 an hour. And here the edge copies are not deleted when a review is written, they only expire. The hot cells get a review every fraction of a second, so about half of all searches show a copy that is missing a review posted in the last 10 s.
[▶ Broken: 10 s edge copies, half the searches stale](play:broken: edge@t=8)
Shorter copies trade one price for the other: with 1 s copies a quarter of searches are stale, the edge answers only 72%, and the origin does about twice the work.
[▶ 1 s edge copies](play:edge with 1 s copies@t=8)

## Why it works now

The box query was slow because one index can only sort by one number. A geohash turns two numbers into one key whose prefixes are cells, so "near me" becomes 9 range scans. Cells then give us the right key for everything after: the unit to shard, to cache and to serve from the edge.
[▶ Four shards by cell](play:geohash cells: four@t=5)
Sharding alone could not take the city's hot spot, because one cell lives on one shard. The cache could, because a hot cell is one answer read by many people.
[▶ The city's cell in the cache](play:cell cache: on Friday@t=5)

## What it costs

- **Cache invalidation.** Every write must delete its cell's cached copy. A write that forgets (or a delete that fails) leaves that cell stale until the copy's TTL, 30 s here.
- **Staleness at the edge.** Many CDNs make per-write purges slow or billed per path (CloudFront invalidations can take minutes); some purge by tag in about a second (Fastly's surrogate keys). Without that, an edge copy is only as fresh as its TTL. Fine for reviews; wrong for anything that moves, like drivers or delivery couriers.
- **The CDN bill.** Per-request pricing makes it about seven times the rest of the system here. Pay it for latency, not for load: the cell cache already took the load.
- **Cell edges.** A search near a shard boundary reads cells on two shards. A search of 9 cells costs 9 scans, and the results must still be filtered by real distance.
- **One cell size.** A 6-character cell holds thousands of places downtown and none in the desert. A quadtree (primitive 004) splits only the crowded cells, at the cost of keeping the tree's shape somewhere every server can read it.

## Staff notes

- Ask first how fresh results must be. Places and reviews: seconds to minutes. Drivers and couriers: under a second, which rules out long caching and calls for an in-memory index that is updated with every location report.
- Keep the place index small and separate from the reviews. A search needs id, location, name and rating; review text is read only when someone opens a place.
- The search radius picks the cell size: the 3-by-3 block of cells must cover the radius. Store a long geohash per place and query with the prefix length you need.
- Hot spots move with the clock (lunch in offices, nights in bar districts) and with events (a stadium). Cache by cell rather than buying shards for the worst hour.
- Rounding the user's location to a cell before the request leaves the device also limits how precisely the server learns where the user is.

## Check yourself

- **Q:** The box query fails at 5,000 searches a second while the app servers are under 5% busy. Why doesn't a better index on (latitude, longitude) save it?
  A: A sorted (B-tree) index narrows its first column only. Every place in the latitude band still has to be checked for its longitude, about 10 ms a search, so 4 cores answer about 400 a second. [▶ Show it](play:broken: box query@t=8)
- **Q:** With four shards by cell, why do searches of quiet suburbs fail on Friday night?
  A: The city's shard is full, and app workers wait on it until none are free for anyone else. [▶ Show it](play:broken: Friday night@t=8)
- **Q:** Will 16 shards fix Friday night?
  A: The errors stop, but the city's shard is still 86% busy: one cell's searches always land on one shard. More shards only move the other cells away, at three times the bill. [▶ Show it](play:sixteen shards@t=8)
- **Q:** Why does the cache hit more often on Friday night (95%) than on a normal night (89%)?
  A: Higher skew means more searches go to the few hottest cells, and those are always in the cache. [▶ Show it](play:cell cache: on Friday@t=8)
- **Q:** The CDN halves the median. What do you pay for it besides money?
  A: Freshness: edge copies are not deleted on a write, so with 10 s copies about half the searches miss a review written in the last 10 s. [▶ Show it](play:broken: edge@t=8)
