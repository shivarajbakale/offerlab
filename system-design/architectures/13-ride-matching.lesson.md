# Ride matching

## What it is

- **What it is:** The part of a ride-hailing app that keeps track of where every available driver is and, when a rider asks for a car, finds the drivers near them.
- **What makes it hard:** Drivers crowd into a few areas, like downtown or a stadium after a game, and the one machine holding that area overloads while the others sit idle. Every driver's phone also reports its position every few seconds, so writes outnumber searches about 50 to 1.
- **Building blocks it uses:** the map cut into cells named by [geohash](#/sd-01-partitioning/003-geohash), each cell's drivers kept in memory on the machine that owns it, and crowded cells split into smaller ones by the [quadtree](#/sd-01-partitioning/004-quadtree) rule.
- **Where you'll meet it:** "Design Uber" or "Design Lyft" is a standard interview question. Uber built and open-sourced H3, a grid of hexagons over the earth, and Google's S2 library cuts the sphere into cells. Redis has geo commands (GEOADD, GEOSEARCH) built on geohash.

## Words we'll use

- **Location update** — a driver's phone reporting "I am at this latitude and longitude now". It is a **write**: it changes stored data. It is tiny (a few dozen bytes) but frequent.
- **Match request** — a rider asking for a car. Our part here is finding the drivers near them: a **read** (it only looks at data).
- **Requests a second** (**QPS**) — how much traffic arrives.
- **Latency** — how long one request takes. **p50** is the middle one (half were faster).
- **CPU core** — one part of a processor that runs one piece of work at a time.
- **Utilization** (busy) — the share of time a machine's cores are working. 100% means no spare capacity.
- **Worker** — a slot for one request in progress inside a server. It stays taken while the request waits on another machine.
- **Error** — a request that failed: turned away because every worker and waiting slot was full, or given up on after 1 second.
- **Commit** — the database writing a change safely to disk so it survives a crash. It costs time on every write.
- **Spatial index** — a structure that finds "points inside this area" without checking every point.
- **Cell** — one square of a grid laid over the map. A **geohash** names cells with short strings; a longer string is a smaller cell inside the shorter one's cell. Precision 5 (five characters) is a cell about 5 km on a side (smaller east to west away from the equator). See [primitive 003, Geohash](#/sd-01-partitioning/003-geohash).
- **Shard** — one slice of the data, on its own machine. **Sharding** splits the data by a **shard key**; here the key is the cell.
- **Hot spot** — one cell (one shard key) with so much traffic that the machine holding it is overloaded.
- **Quadtree** — a map index that splits a cell into four quarters only when it holds too many points, so cells are small where points crowd and big where they are sparse. See [primitive 004, Quadtree](#/sd-01-partitioning/004-quadtree).
- **Skew** — how lopsided popularity is. Here: how much of the traffic the busiest cells get.

## The world we're in

- 40,000 drivers are online in one big city. Each phone reports its location every 4 seconds: 40,000 / 4 = 10,000 updates a second.
- Riders ask for a match 200 times a second. Writes outnumber reads 50 to 1.
- The city is covered by 100 cells of about 5 km. Drivers and riders crowd into a few of them. On a normal night the busiest cell, downtown, has 19% of the traffic. On a big night (a game just ended downtown) it has 41%.
- Only a driver's latest position matters. An update replaces the last one; a 4-second-old position is already a little wrong.
- A location service (4 servers) decodes each request and calls the store. It is never the limit here.

## The goal

Take 10,000 updates a second, answer "which drivers are near me?" in milliseconds, and survive a big night when nearly half the city is in one cell.

## The naive attempt

"Keep a table of drivers in the relational database, with a spatial index. Each report updates the driver's row."

Each UPDATE writes the change to the write-ahead log, rewrites the spatial-index entry and leaves a dead row version for vacuum to clean up. We assume 1.5 ms of database time for all of that; this is our assumption, not a law (a tuned PostgreSQL on 8 cores can do tens of thousands of simple row updates a second). At our cost, 10,000 a second need 15 cores, and the database has 8. Searches (10 ms each, 200 a second) need 2 more. The database is at 100%, about half of all requests fail, and riders fail as often as drivers because their searches wait in the same line. The location service is under 10% busy.
[▶ Broken: one database takes every location update](play:broken: one database@t=6)

Even if a tuned database could keep up, look at what it is doing for us: making every update durable, so it survives a crash. A position is replaced 4 seconds later. If one is lost, the driver's dot is a few seconds stale until the next report. We are paying for a guarantee this data does not need.

## Building it up

**1. Keep only the latest position, in memory.** Use an in-memory store (Redis is a common choice) that keeps, for each cell, the drivers in it and their positions. An update replaces a driver's position: no disk, no history. Like Redis, each shard runs every command on one thread, so it has one core. We give an update 0.25 ms, about 4,000 a second per shard. A real Redis does on the order of 100,000 simple commands a second; our shard is scaled down about 25 times so the run stays small. What matters is the ratio: the busiest cell's share of the traffic against what one shard can take. With real numbers the same story happens at a country's scale instead of a city's.

**2. Split the store by cell.** One of our scaled-down shards cannot take 10,000 updates a second, so use 8 shards, and give each a share of the cells by a hash of the cell's name. A driver's update goes to the shard that owns its cell. A search reads the rider's cell and the 8 cells around it (a nearby driver can be just across a cell edge), asking each shard involved in parallel. Because cells are hashed to shards, neighbouring cells usually live on different shards: 9 cells over 8 shards touch about 5 or 6 of them (8 × (1 − (7/8)^9) ≈ 5.6). Sharding by cell buys something else: each update goes to exactly one shard. Searches are 2% of the traffic; the simulator models each one as a single call.

On a normal night every request succeeds and a match is found in about 10 ms. The 8 shards cost about $1.51 an hour all told with the servers. But they are not equally busy: the shard that owns downtown is about 73% busy, the others between 15% and 50%. The busiest cell sets the limit.
[▶ Eight shards on a normal night](play:sharded: a normal night@t=6)

**3. See what a hot cell does.** On a big night downtown has 41% of all traffic: 4,100 updates a second, all for one cell, all on one shard that can do 4,000. Its shard is at 100%; the other seven are under 40%. And it hurts everyone. The location service's workers all end up waiting on that shard, so requests for every other cell find no free worker: about 20% of all requests fail, riders' match requests included.
[▶ Broken: the downtown shard is full](play:broken: a big night — the downtown@t=6)

More shards do not help. Sharding spreads different cells; it cannot split one cell. With 32 shards the downtown shard is still at 100%, the median shard is under 5% busy, errors are still above 5%, and the bill is $3.91 an hour instead of $1.51.
[▶ Broken: 32 shards, downtown still full](play:broken: a big night — 32@t=6)

**4. Split the crowded cells.** The cell is the problem: a 5 km square is the right size in the suburbs and far too big downtown. So let cell size follow the drivers. When a cell holds too many drivers, split it into four quarter-size cells, and split those again if they are still too full. That is the quadtree rule. Each small cell is its own shard key and can land on its own shard. With geohash the same idea works one character at a time: adding a character splits a cell into 32 smaller ones whose names start with the parent's name, so "split this area" means "use one more character here".

The simulator picks cells from one popularity curve and cannot re-map one cell into many, so we model the split as 1,600 cells with a flatter curve, where the busiest cell has about 6% of the traffic instead of 41% (that share is arithmetic on the curve, not a simulator number). On the same big night, every shard is between 25% and 45% busy, nothing fails, and a match takes about 10 ms. Same 8 shards, same cost.
[▶ Crowded cells split](play:split cells@t=6)

## Why it works now

The database failed because it made every tiny, short-lived update durable: at our assumed cost, 15 cores of commits for data replaced every 4 seconds.
[▶ Broken: one database](play:broken: one database@t=6)
In memory, the same updates cost a fraction of a core per shard. Sharding by cell sends each update to exactly one shard; a search, reading 9 hashed cells, asks about 5 or 6 shards in parallel. To keep neighbours on the same shard, assign shards by ranges of geohash prefix (neighbouring cells mostly share a prefix) instead of by hash, at the cost of hotter ranges. But traffic follows people, and people crowd: one cell's load cannot be split by adding shards.
[▶ Broken: the hot cell](play:broken: a big night — the downtown@t=6)
Making cells smaller where drivers crowd turns one hot key into many ordinary ones.
[▶ Split cells](play:split cells@t=6)

## What it costs

- No durability: a shard that restarts has no drivers until each phone reports again, about 4 seconds. That is fine for positions; trips, fares and payments go in a real database.
- Smaller cells mean a search of the same radius covers more cells, often on more shards. Searches get a little more expensive so that updates spread out.
- The cell map (which cells are split, and which shard owns each) changes over time and must be shared by every server and kept consistent, usually through a configuration service. Changing it moves drivers between shards.
- The simulator does not model searches across several shards, the moving of cells between shards, or the drivers moving between cells; its numbers are a rough guide.

## Staff notes

- Do the write arithmetic first: drivers ÷ report interval. Here 10,000 a second against 200 matches. The write path decides the design; the read path is small.
- Ask what a lost update costs before paying for durability. Here: one dot a few seconds out of date.
- Reduce the writes too: a parked driver does not need to report every 4 seconds, and a phone can skip a report when the driver has barely moved. Each halving of the rate halves the store.
- Hot spots are predictable: stadiums, airports, stations, New Year's Eve. Watch the busiest shard, not the average, and split cells before the event if you can.
- Geohash cells are rectangles that narrow toward the poles; hexagon grids such as Uber's H3 have more even neighbours and sizes, and S2 uses cells on a cube projected onto the sphere. The sharding argument is the same for all of them.

## Check yourself

- **Q:** The location service is under 10% busy and still half the requests fail. Where is the work?
  A: In the database: 10,000 durable updates a second at 1.5 ms each need 15 cores, and it has 8. [▶ Show it](play:broken: one database@t=6)
- **Q:** On a normal night, why is one shard at 73% when the average is far lower?
  A: Downtown's cell has 19% of the traffic and it all lands on the one shard that owns that cell. The busiest shard sets the limit. [▶ Show it](play:sharded: a normal night@t=6)
- **Q:** On the big night, why do riders in quiet suburbs get errors?
  A: The service's workers all wait on the full downtown shard, so requests for every cell find no free worker. [▶ Show it](play:broken: a big night — the downtown@t=6)
- **Q:** Would 32 shards fix the big night?
  A: No. One cell lives on one shard. 32 shards leave it at 100% and cost $3.91 an hour instead of $1.51. [▶ Show it](play:broken: a big night — 32@t=6)
- **Q:** What does splitting the crowded cell change?
  A: The shard key: one hot 5 km square becomes many small cells on many shards, and every shard sits between 25% and 45% busy. [▶ Show it](play:split cells@t=6)
