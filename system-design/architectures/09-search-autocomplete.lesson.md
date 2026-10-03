# Search autocomplete

## What it is

- **What it is:** The list of suggestions that appears under a search box as you type, showing the most popular complete searches that start with the letters typed so far.
- **What makes it hard:** Every keystroke is a request, so one search is ten or more requests, and each answer must arrive within about 100 ms. Looking up and sorting matches on every keystroke overloads the database, and caching the answers makes the database depend on a cache that can restart empty.
- **Building blocks it uses:** popular searches counted from the query log with a [count-min sketch](#/sd-02-probabilistic/006-count-min-sketch), each prefix's suggestions kept in an [LRU cache](#/sd-low-level-design/02-lru-cache-with-ttl), and that cache spread over several machines with [consistent hashing](#/sd-01-partitioning/001-consistent-hashing).
- **Where you'll meet it:** "Design search autocomplete" or "Design typeahead" is a standard interview question. The search boxes of Google, Amazon and YouTube suggest as you type. A trie that stores the top few results at each node is the textbook answer.

## Words we'll use

- **Keystroke** — one key the user presses in the search box. Here each keystroke sends one request.
- **Prefix** — the text typed so far: "n", "ne", "new", "new y". A request asks for suggestions for one prefix.
- **Suggestions** — the few complete searches shown under the box, most popular first: for "new y", "new york times", "new year", ...
- **Top-k** — the k most popular items in a set; here, the k most searched queries that start with a prefix (k is usually 5 to 10).
- **Query log** — the record of every search users actually ran. Popularity is counted from it.
- **Trie** (prefix tree) — a tree where each edge is one character, so every prefix is one path from the root. All queries starting with "new" live under the node for "new".
- **Request**, **requests a second** — one question sent to our servers, and how many arrive each second.
- **Latency** — how long a request takes, from the keystroke to the suggestions arriving. **Latency budget** — the most a request may take before users notice; for suggestions, about 100 ms.
- **p50 and p99** — sort a second's latencies. **p50** is the middle one; **p99** is the one 99% were faster than, the slow tail 1 user in 100 feels.
- **CPU core**, **utilization** — one part of a processor that runs one piece of work at a time; the share of time the cores are busy.
- **Worker** — a slot for one request in progress: a thread in an app server, a connection in a database.
- **Rejected (503)** — when every worker is busy and the waiting line is full, a server turns new requests away at once with HTTP 503.
- **Bottleneck** — the part that runs out of capacity first and limits the whole system.
- **Cache** — a fast in-memory store of answers already computed. A **hit** finds the answer there; a **miss** does not. **Hit rate** is the share of hits.
- **Cache-aside** — the app looks in the cache first; on a miss it asks the database and then stores the answer in the cache.
- **Least recently used (LRU)** — when the cache is full, it forgets the entry used longest ago.
- **Cold cache** — a cache that has just started and holds nothing, so every lookup misses. **Warm-up** is filling it before it takes real traffic.
- **Zipf skew** — a pattern where a few items get most requests: the item ranked k gets traffic in proportion to 1/k^s. The **exponent** s says how lopsided: 1.1 is very lopsided, 0.7 much flatter.
- **Hash** — a function that turns a key into a number that looks random; "hash of the prefix, modulo 3" picks one of three machines.
- **Shard** — one of several machines that each hold part of the data, picked by the hash of the key.
- **CDN** and **edge server** — a content delivery network: servers in many cities that keep copies of answers that are the same for everyone, so users get them from one nearby.
- **Debounce** — the client waits until the user pauses typing (say 100 ms) before sending a request, so fast typists send one request for several keystrokes.

## The world we're in

- Every keystroke is a read. Nobody writes suggestions while typing; they are rebuilt in the background from the query log. In this simulator there are no writes at all: suggestions never change during a run.
- 100,000 distinct prefixes are in play, and traffic is very lopsided (Zipf, exponent 1.1). One-letter and two-letter prefixes are typed by almost everyone; "new york pizza near" by few.
- Finding the top suggestions for a prefix in the database costs 10 ms of database CPU: find the matching queries, sort them by popularity, keep the top few. The database has 16 cores, so at most 16 / 10 ms = 1,600 a second.
- The app servers do little work: 1 ms a request.
- Users are 20 ms from our data centre each way, so 40 ms of every answer is the network. From stage 4, 30% of users are on another continent, 120 ms away each way.
- Machines restart without warning, and a restarted cache is empty.

## The goal

Suggestions for every keystroke within the 100 ms budget, for users everywhere, at 4,000 to 5,000 keystrokes a second, and still within budget when a machine dies.

## The naive attempt

"On every keystroke, ask the database for the most popular queries starting with the prefix."

At 500 keystrokes a second this works: suggestions arrive in 53 ms (40 of it the network), and the database is 32% busy.
[▶ The database on every keystroke, 500 a second](play:database per keystroke: 500@t=8)

But each keystroke costs the database 10 ms, and it can do 1,600 a second. At 4,000 keystrokes a second it is full, requests queue for it, the median answer takes 322 ms, and 60% of keystrokes are turned away. Typing is the busiest thing users do: one search of 12 characters is 12 requests.
[▶ Broken: 4,000 keystrokes a second](play:broken: database per keystroke@t=8)

## Building it up

**1. Where suggestions come from.** Doing "find and sort" per keystroke is waste: the answer for "new y" is the same for everyone and changes slowly. So compute it ahead of time. A background job reads the query log every few minutes or hours, counts how often each query was searched, and builds a **trie** of all queries. At each trie node it stores the **top-k** queries below that node. Answering a prefix is then one walk down the trie (one step per character) and reading a stored list: no sorting at request time. The finished index is served read-only and replaced as a whole when the next one is built. Counting the most frequent queries in a huge log with little memory is what a count-min sketch does (primitive 006). In this simulator the database's 10 ms stands for that lookup without precomputation; the index build itself is not simulated.

**2. Cache each prefix's suggestions.** Even a precomputed lookup costs something, and the same prefixes come again and again. Keep each prefix's suggestions in a cache. On a miss, ask the database once and store the answer. At 4,000 keystrokes a second with room for 20,000 prefixes, 93% of keystrokes are hits, the database is 18% busy, and suggestions arrive in 44 ms (p99 60 ms).
[▶ The cache at 4,000 keystrokes a second](play:cache: 4,000@t=8)

How big must the cache be? Because traffic is so lopsided, very small caches already catch most keystrokes. With room for only 1,000 prefixes, two thirds hit (the database is 85% busy). With 50,000, 97% hit. Try the cacheKeys knob.
[▶ A cache of 1,000 prefixes](play:cache: 1,000 prefixes@t=8)
[▶ A cache of 50,000 prefixes](play:cache: 50,000@t=8)

The skew is doing the work, and it is a property of the traffic, not of the design. If prefixes were less lopsided (exponent 0.7 instead of 1.1: say a product catalogue where users type long, varied names), the same 20,000-prefix cache catches only 58%. The database fills again and the slow tail reaches 214 ms, twice the budget. Measure the real distribution before trusting a cache size.
[▶ Broken: the same cache with flatter traffic](play:broken: less skewed@t=8)

**3. Survive losing the cache.** The database now depends on the cache: at the evening peak of 5,000 keystrokes a second it is 23% busy only because 93% of keystrokes never reach it. When the one cache machine restarts, it comes back empty. Every keystroke misses, and 5,000 a second land on a database built for 1,600. For the next second and a half it is full, the median answer takes 129 ms, and 1 keystroke in 5 fails. The cache refills quickly for popular prefixes, but the slow tail stays over budget for seconds more.
[▶ Broken: the one cache machine restarts](play:broken: one cache machine@t=5)

Two fixes, used together:
- **Warm-up.** Do not let an empty cache take traffic. Before putting it in service, load the top prefixes (the precomputed index already says which they are), or let it read from the old machine first. Not simulated here.
- **Split the cache.** Use three machines; the hash of the prefix picks the one that holds it. When one restarts, only the third of prefixes it held miss. Here the hit rate dips from 93% to 82%, the database goes from 23% to 58% busy, and users notice nothing: p99 stays at 67 ms. To keep that third small when machines are added or removed, real systems pick the machine by consistent hashing (primitive 001), so changing the count moves only a few keys.
[▶ Three cache machines, one restarts](play:three cache machines@t=5)

**4. Bring the answers to the user.** The product launches on another continent. 30% of users are now 120 ms away, so their round trip alone is 240 ms. The median stays at 44 ms, but the slow tail is 255 ms, far over budget, and no server-side cache can fix distance.
[▶ Broken: users on another continent](play:broken: users on another continent@t=8)

The suggestions for a prefix are the same for everyone, so a CDN can keep them. Edge servers about 10 ms from every user keep the suggestions for the 2,000 most popular prefixes. 71% of keystrokes are answered there, in about 20 ms for everyone, near or far: the median falls from 44 ms to 20. The slow tail does not improve. The 29% that miss still travel to our servers, and for a far user that is the ocean both ways plus the hop to the edge: about 275 ms, a little worse than the 255 ms before. 30% of users are far and 29% of keystrokes miss, so about 9% of all keystrokes are far misses, far more than 1 in 100: they set the p99. Only a higher edge hit rate, or servers on that continent, fixes the tail. The edge is billed per request: the hourly cost goes from $1.33 to about $12.
[▶ The same users with an edge cache](play:edge cache: popular prefixes answered nearby, for everyone (#2)@t=8)
(The simulator only lets a CDN answer requests marked as static files, so in this design keystrokes are sent as static requests. That is honest for suggestions that are the same for every user; personalized suggestions could not be cached at the edge.)

Notice what the edge did not change: the database is still about 20% busy. The edge takes the popular prefixes, which our own cache was already catching. What reaches our servers now is mostly the long tail, so our cache's hit rate falls from 93% to 72%. Grow the edge to 10,000 prefixes and 88% are answered there, while our cache catches only 36% of the rest. A cache behind another cache sees only the leftovers. And the tail is still about 275 ms: 30% × 12% ≈ 3.5% of keystrokes are still far misses.
[▶ A bigger edge, and our cache's hit rate falls](play:edge cache: a bigger edge@t=8)

Hold 50,000 prefixes at the edge and 97% hit. Far misses drop to about 30% × 3% ≈ 0.9%, under 1 in 100, and the overall p99 falls to about 85 ms, inside the budget. A far user still waits about 275 ms on the 3% of keystrokes that miss; only servers on their continent remove that. (The simulator's edge is one shared cache. A real CDN has a separate cache in each location, each seeing only its own users, so the real hit rate per location is lower for the long tail.)
[▶ An edge holding 50,000 prefixes](play:edge cache: holding 50,000@t=8)

Finally, the cheapest request is the one never sent. The client **debounces**: it waits until the user pauses for about 100 ms before asking. Here we assume that cuts requests to about a third, 1,300 a second (the real ratio depends on how fast people type). The edge bill falls from about $12 an hour to about $5, and the database to 6% busy. Browsers can also cache answers for prefixes the user already typed, so deleting a character costs nothing.
[▶ Debounced: a third of the requests](play:debounce@t=8)

## Why it works now

The answer for a prefix depends only on the prefix, and it changes slowly. That one fact allows everything here: computing it once in the background, caching it in our data centre, caching it at the edge near the user, and caching it in the browser. Each layer catches the most popular part of what reaches it, and the skew of typing makes each layer worth having. Splitting the server-side cache over three machines bounds how much the database ever sees at once.

## What it costs

- Suggestions are as old as the last index build plus the cache time. A breaking news event will not appear in suggestions until the next rebuild; systems that need that add a small fast-updating index for trending queries.
- The database is sized for a warm cache. Without warm-up, a full cache restart at the peak is an outage.
- Three cache machines cost more than one, and a hash function now decides where every prefix lives.
- The edge cache is billed per request: here about $12 an hour instead of $1.33. Debouncing pays for much of it.
- Every cache layer is another place a wrong or offensive suggestion must be removed from when it is found. Removing one needs a purge at every layer.

## Staff notes

- Ask first: is the answer the same for everyone? If yes, it can be cached at every layer. If suggestions are personalized, split them: a shared, cacheable popular list, merged in the client or app with a small personal list.
- Precompute top-k per prefix offline from the query log and serve a read-only index. Request-time work should be a lookup, never a sort.
- Treat cold start as a normal event: warm caches before they take traffic, and roll restarts one machine at a time.
- Report hit rate per layer, and expect inner layers' hit rates to fall as outer layers grow. That is not a regression; check the database load instead.
- Short prefixes carry most traffic and almost never change. Give them long cache lifetimes; give long, rare prefixes short ones or none.
- Filter suggestions (abuse, legal removals) at index build time, and keep a fast kill switch that bypasses the caches.

## Check yourself

- **Q:** Each suggestion lookup takes the database 10 ms and it has 16 cores. Why does it fail at 4,000 keystrokes a second?
  A: It can do at most 16 / 10 ms = 1,600 lookups a second. The rest wait in line, then are turned away. [▶ Show it](play:broken: database per keystroke@t=8)
- **Q:** A cache holding only 1% of prefixes catches two thirds of keystrokes. Why?
  A: Typing is very lopsided: a few short prefixes are typed by almost everyone, so the most popular 1,000 cover most requests. [▶ Show it](play:cache: 1,000 prefixes@t=8)
- **Q:** The same cache works for one product and fails for another. What differs?
  A: The skew of the traffic. With flatter traffic the popular prefixes are a smaller share, so the hit rate falls and the database fills. [▶ Show it](play:broken: less skewed@t=8)
- **Q:** Why do three cache machines survive a restart that one machine does not?
  A: The restarted machine held only a third of the prefixes, so only that third misses. The database sees about 2.5 times its usual load. With one machine, every keystroke misses: about 13 times the usual load. [▶ Show it](play:three cache machines@t=5)
- **Q:** After adding an edge cache, our own cache's hit rate drops from 93% to 72%. Is something broken?
  A: No. The edge now answers the popular prefixes; our cache only sees the long tail the edge missed. The median latency improved and the database load did not change. [▶ Show it](play:edge cache: popular prefixes answered nearby, for everyone (#2)@t=8)

## Deep dive

How a trie with top-k answers a prefix. Each node of the trie stands for one prefix. Building it: insert every query from the log with its count, character by character. Then, from the leaves up, give each node the k highest-count queries found anywhere below it (merge the children's lists, keep the top k). Answering "new y" means following n → e → w → space → y, five steps, then reading that node's list. The cost depends on the length of the prefix, not on how many queries exist. The price is memory: the top-k list is stored at every node, so a popular query is copied into the list of each of its prefixes. Real systems limit this by storing lists only for prefixes up to some length, or only for nodes with enough traffic, and by keeping the trie compact (merging chains of single-child nodes, or using a finite-state structure as Elasticsearch's completion suggester does). The trie can also be sharded by prefix range, which is the same hashing question as the cache in stage 3, with one twist: the prefix "a" alone gets a large share of all traffic, so whichever machine holds it is hot. Caching is what spreads that one key's load.
