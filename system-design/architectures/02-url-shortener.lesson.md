# URL shortener

## What it is

- **What it is:** A service that turns a long web address into a short one, like sho.rt/aZ3k9, and sends anyone who opens the short link on to the original. It stores one small record per link and looks it up on every click.
- **What makes it hard:** Every click is a database lookup, so the one database fills long before the data is big, and one viral link can take a third of all clicks. About 99 of every 100 requests are lookups, new links cannot be cached away, and splitting links over several databases does not split the load of one popular link.
- **Building blocks it uses:** an in-memory cache of the most clicked links that drops the least used ones (the idea behind an [LRU cache](#/sd-low-level-design/02-lru-cache-with-ttl)), and the link table split over several databases by short code, which can grow while moving few links by using [consistent hashing](#/sd-01-partitioning/001-consistent-hashing).
- **Where you'll meet it:** "Design TinyURL" or "Design bit.ly" is one of the most common first system design questions. Bitly and TinyURL are the best-known services, and X (formerly Twitter) wraps every link posted on it in its own t.co short link.

## Words we'll use

- **Short link** — a short address like `sho.rt/aZ3k9` that stands for a long one. The part after the slash is the **short code**.
- **Redirect** — the answer to opening a short link: "go to this long URL instead". The browser then loads the long URL itself. A **301** redirect says "moved forever", and browsers remember it; a **302** says "moved for now", and browsers ask again next time.
- **Request** — one thing a user asks for: here, a redirect (a **read**) or creating a new short link (a **write**).
- **Requests a second** — how much traffic arrives.
- **Latency** — how long one request takes, from the user sending it to the answer arriving.
- **p50 and p99** — sort the latencies. **p50** is the middle one; **p99** is the one 99% were faster than: the slow tail that 1 user in 100 feels.
- **CPU core** — one part of a processor that runs one piece of work at a time. Each machine here has 4.
- **Utilization** (or "busy") — the share of time the cores are working. 100% means no spare time at all.
- **Worker** — a slot for one request in progress. A request that finds every worker taken waits in line; when the line is full it is **rejected** (an error), and a user who waits more than 1 second gives up (a **timeout**).
- **Bottleneck** — the part that runs out of capacity first and so limits the whole system.
- **Row** — one record in a database table: here, one short code and its long URL. An **index** lets the database find a row by its short code without reading the whole table. A **unique index** also refuses a second row with the same code.
- **Immutable** — never changes after it is written. A short link always points to the same long URL.
- **Zipf popularity** — a few items get most of the attention: the link ranked k-th gets clicks in proportion to 1/k. Here the top 10% of links get about 80% of clicks.
- **Viral link** — one link that suddenly gets a large share of all clicks; here about a third.
- **Hot key** — one key (one short code) that gets so much traffic that whatever machine holds it is busier than the rest.
- **Cache** — a fast in-memory copy of data that is read often. A **hit** finds the key there; a **miss** does not and must ask the database. **Hit rate** is the share of hits.
- **Cache-aside** — the app looks in the cache first, and on a miss reads the database and puts the answer in the cache for next time.
- **Replica** — a copy of a database. The **primary** takes every write; **read replicas** only answer reads.
- **Single point of failure** — one part whose death takes everything down.
- **Shard** — one of several databases that each hold part of the data. The **shard key** decides which part: here the short code. A **logical shard** is a slice of the keys that can be moved from one machine to another as a unit.
- **Hash** — a function that turns a key into a number that looks random. **hash(code) mod 4** picks one of 4 shards, so codes spread evenly and the same code always lands on the same shard. **Consistent hashing** instead places shards and keys on a circle, so adding a shard moves only the keys next to it.
- **CDN** (content delivery network) — servers in many cities (the **edge**) that keep copies of answers, so each user is answered by one nearby. The **origin** is our own servers behind it.
- **Base 62** — writing a number with 62 symbols (a–z, A–Z, 0–9) instead of 10 digits, so it fits in fewer characters.
- **Collision** — two different long URLs given the same short code.
- **Counter** — a number that goes up by one for each new link, so every link gets a different number.
- **Birthday paradox** — among many random picks, the chance that some two are equal grows much faster than the number of picks: with 23 people, two likely share a birthday.

## The world we're in

- There are 100,000 links. For every new link created, 99 redirects are served: the system is read-heavy.
- Links follow Zipf popularity: the 10,000 most popular get about 80% of clicks. On a viral day, one link gets about a third of all clicks.
- A link never changes after it is created.
- A redirect costs the app 1 ms of CPU and the database 2 ms (find one row by its short code). Creating a link costs the app 2 ms and the database 5 ms (insert a row and update the index).
- Users are 20 ms from our servers each way, so even a perfect redirect takes about 40 ms. In stage 4, 30% of users are on another continent, 120 ms away each way.
- Users give up after 1 second.
- The simulator does not model how short codes are made, or how many bytes the table takes on disk. The **Deep dive** covers code generation in words.

## The goal

Answer every redirect fast, including when one link goes viral, and keep accepting new links as their number and rate grow.

## The naive attempt

"Store every link as a row in one database. A redirect looks up the row and answers with its long URL."

At 1,000 redirects a second this is fine: a redirect takes about 46 ms, almost all of it the trip to the user and back, and the database is about half busy.
[▶ One database at 1,000 redirects a second](play:one database: 1,000@t=8)

Each redirect needs about 2 ms of database CPU and there are 4 cores, so the database can do at most about 4 / 2.03 ms ≈ 1,970 a second. Then a link goes viral and traffic triples to 3,000 a second. The database still serves about 1,970 a second; the rest wait, time out or are rejected: about a third of all clicks fail. The app servers are only 16% busy: they are waiting on the database.
[▶ Broken: a viral link floods the one database](play:broken: one database — a viral link@t=8)

Notice that it does not matter which link went viral. Without a cache, every click is one database read, whatever the link.

## Building it up

**1. Cache the redirects.** Two facts make a redirect the perfect thing to cache. A link never changes, so a cached copy is never out of date and nothing ever needs deleting from the cache. And clicks are lopsided: keep the 10,000 most popular links (10% of them) in memory and about 80% of redirects are answered there, without touching the database. At 3,000 a second the database is now about a third busy.
[▶ The cache answers 8 in 10 redirects](play:cache: ordinary@t=8)
The viral link helps rather than hurts: it is the most popular key, so it is always in the cache. With the same viral 3,000 a second that broke the naive design, over 98% of redirects hit the cache and the database is under 10% busy.
[▶ The viral link with the cache](play:cache: the viral@t=8)

**2. Notice what the cache cannot take: writes.** A large customer starts creating links through the API. Now 15 in every 100 requests create a link, at 5,000 requests a second: 750 inserts a second at 5 ms each is almost 4 cores of work on their own, before any redirect that misses the cache. The database is 100% busy and about a quarter of all requests fail, while the cache still answers 8 in 10 redirects. A cache only saves reads.
[▶ Broken: new links fill the one database](play:broken: cache — many new links@t=8)
Read replicas (copies of the database that answer reads) would not help either: every insert must still go to the one primary copy. The table also keeps growing, and one machine's disk is finite. (The simulator does not model disk space; in real systems that is often what forces the next step first.)

**3. Shard the link table by short code.** Split the table over 4 databases. To find a link, compute hash(short code) mod 4: that names the one shard that holds it. Every redirect and every insert goes to exactly one shard, so each does a quarter of the work. The short code is the right shard key because it is what every redirect looks up; sharding by, say, user would make every redirect ask all four. The same 5,000 requests a second with 15% writes now pass, with each shard between 25% and 45% busy.
[▶ Four shards share the inserts](play:shards: four@t=8)
Sharding spreads keys, not clicks. A viral link is one key, so it lives on one shard. Without the cache in front, at 5,000 clicks a second its shard is 100% busy while the other three are at about half or less, and about 1 in 8 clicks fail.
[▶ Broken: the viral link's shard is full](play:broken: shards — without the cache@t=8)
More shards do help a little, and here they even stop the errors: with 8 shards the hot one is 96% busy, with 16 it is 86%. But all they do is move the other keys off the viral link's shard. They can never take the viral link's own load: a third of 5,000 clicks at 2 ms each over 4 cores is about 80% of one shard, whatever the number of shards. That leaves no headroom: a little more traffic and that shard fails again, while the other 15 sit mostly idle.
[▶ 8 shards: no errors, but the hot shard is 96% busy](play:more shards: 8@t=8)
[▶ 16 shards: the hot shard is still 86% busy](play:more shards: 16@t=8)
This is why the cache stays in front of the shards. With it, the viral link's clicks never reach any shard: over 98% hit the cache and every shard is under 6% busy.
[▶ The same viral link with the cache in front](play:shards with the cache@t=8)

**4. Answer redirects at the edge.** Now 30% of users are on another continent, 120 ms away each way. However fast our servers are, a redirect cannot be faster than the trip. The median redirect takes 45 ms, but the slow tail (p99) is about 250 ms: those are the far users.
[▶ Broken: far users wait for every redirect](play:broken: redirects from one region@t=8)
A CDN keeps copies of the popular redirects on servers about 10 ms from everyone. Keeping 10,000 links there answers about 80% of redirects at the edge; the median drops to 20 ms. The slow tail does not: the p99 stays about 260 ms. A redirect the edge does not have must still be fetched from the origin, over the user's own distance, so a far user's miss still crosses the ocean twice. About 20% of redirects miss and 30% of users are far away, so about 6 in 100 redirects are far misses: more than 1 in 100, so they set the p99. The app servers go from about 26% to 5% busy. Something surprising happens to our own cache: its hit rate falls to under 15%, because the edge already took the popular links and only the rarely clicked ones reach the origin. And the bill goes up about five times: the CDN charges for every request it answers.
[▶ Redirects from a CDN](play:CDN: redirects answered near every user (#2)@t=8)
Making the edge bigger helps slowly, because popularity has a long tail: holding 60,000 links, 96% hit, and still more than 1 in 100 redirects are far misses. To cut the far users' tail, the origin itself must move closer to them (a second copy of the servers and databases on their continent), not just the copies of answers.
[▶ Broken: 60,000 links at the edge, and the slow tail stays](play:broken: CDN — even 60,000@t=8)
(The simulator calls a request that a CDN can answer a "static" request, so in stage 4 redirects are sent as that kind. The work and the popularity are the same.)

## Why it works now

Each part of the traffic has its own home. Redirects, which are 99% of requests and never change, are answered from memory: at the edge, or in the cache. Only the long tail of rarely clicked links reaches a database. Inserts, which cannot be cached, are spread over shards by short code. And a viral link, the one key that sharding cannot spread, is the key the cache is best at holding.
[▶ A viral link on shards with the cache](play:shards with the cache@t=5)

What is left: the viral link still lives on one cache machine (here one cache at about a quarter busy, so fine), and a link that is deleted or blocked as spam stays in edge copies until they expire or are purged (CDNs offer an API call that deletes a copy from every edge server).

## What it costs

- The cache is another system to run. If it restarts empty, every redirect reaches the databases at once; size the databases to survive a cold cache, or warm it first.
- Sharding makes any question that is not "find this code" expensive: "all links created by this user" must ask every shard, or needs a second table keyed by user.
- Moving to more shards later means moving rows. Going from hash(code) mod 4 to mod 8 moves half the codes; mod 4 to mod 5 moves 4 in 5. Consistent hashing (primitive 001) moves only about 1 in n when adding the n-th shard.
- The CDN here costs about five times the rest of the system. It buys a fast median for everyone and takes load off the origin, but far users' misses stay slow.
- Redirects answered at the edge, or remembered by browsers after a 301, never reach your servers, so you cannot count those clicks there. Click analytics then come from the CDN's logs.

## Staff notes

- Size a cache from the popularity curve, not the data size. Here 10% of the links covered 80% of clicks; measure your own curve before buying memory.
- Immutable data is the easiest data to cache. Say so in an interview: no invalidation, no stale reads, cache as long as you like.
- Choose the shard key from the main lookup. Every redirect has a short code and nothing else.
- Create many more logical shards than machines (say 1,024 on 4 machines), and map logical shards to machines in a small table. Growing then means moving whole logical shards, not re-hashing every key.
- Hot keys survive sharding. Protect them with a cache in front, and for extreme cases keep several copies of the hot key on different cache machines.
- 301 or 302 is a product decision: 301 is cheaper (browsers stop asking) but hides repeat clicks from your servers; 302 keeps every click visible, at the cost of serving it.
- Abuse is a real cost: shorteners are used to hide phishing links. Expect to check new long URLs against block lists and to take links down, which edge copies make slower.

## Check yourself

- **Q:** The one database fails at 3,000 a second while the app servers are only 16% busy. Will more app servers help?
  A: No. Each redirect needs 2 ms of database CPU and the database can do about 1,970 a second; the app servers are waiting on it. [▶ Show it](play:broken: one database — a viral link@t=8)
- **Q:** Why does the cache never serve an old redirect, even though writes never delete anything from it?
  A: A short link never changes after it is created, so the cached copy is always the current one. [▶ 8 in 10 redirects from the cache](play:cache: ordinary@t=8)
- **Q:** With the cache at an 80% hit rate, the database is full. Will a bigger cache fix it?
  A: No. The database is full of inserts, which a cache cannot absorb. Shard the table so the inserts spread out. [▶ Show it](play:broken: cache — many new links@t=8)
- **Q:** One shard is at 100% and the other three are at half or less. Will 8 shards fix it?
  A: Barely. The errors stop, but the hot shard is still 96% busy, because the viral link alone is about 80% of a shard and one key always lives on one shard. Put the cache in front so its clicks never reach a shard. [▶ Show it](play:more shards: 8@t=8)
- **Q:** After adding a CDN, the origin cache's hit rate drops from 80% to under 15%. Is something broken?
  A: No. The CDN now answers the popular links, so only rarely clicked ones reach the origin, and those are rarely cached. [▶ Show it](play:CDN: redirects answered near every user (#2)@t=8)

## Deep dive

How are short codes made? The simulator does not model this; every link here already has its code. There are three common ways, and each answers one question differently: how do we make sure two links never get the same code?

**A counter.** Keep one number that goes up by one for each new link, and write it in base 62. Link number 125 becomes `21` (2 × 62 + 1). Seven base-62 characters hold 62^7 ≈ 3.5 trillion codes. Codes never collide, by construction. The catch is the counter itself: if every new link asks one counter, that counter is a single point of failure and a bottleneck. The usual fix is to hand each app server a block of numbers (say 1,000 at a time) and let it use them without asking again. A second catch: consecutive codes are guessable, so anyone can walk through every link. Shuffle the number with a reversible scramble before writing it in base 62 if that matters.

**A random code.** Pick 7 random base-62 characters. No coordination is needed, and codes are not guessable. But two links can draw the same code. With n links already stored out of N ≈ 3.5 trillion possible codes, a new random code collides with probability about n / N: with 1 billion links, about 3 in 10,000 inserts. So the insert must say "only if this code is not taken" (a unique index does this), and on a collision draw again. Collisions arrive sooner than intuition says (the **birthday paradox**: among k random codes, the chance that some two match grows with k², not k), which is why the check is required, not optional.

**A hash of the long URL.** Hash the long URL and keep the first 7 base-62 characters. The same long URL always gets the same code, which removes duplicates for free. But two different URLs can still share the first 7 characters, so the same collision check is needed, and on a collision you must change the input (append a number) and hash again. And you lose the ability to give two users different short links to the same page with separate click counts.

Most real systems use a counter handed out in blocks, or random codes with a unique index. Either way, the code is the shard key, so it should spread evenly over shards: a counter does once hashed, a random code does already.
