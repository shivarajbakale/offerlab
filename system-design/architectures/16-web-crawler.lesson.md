# Web crawler

## What it is

- **What it is:** A program that downloads web pages, finds the links in them, downloads those too, and comes back later to pages that may have changed, the way search engines build their index.
- **What makes it hard:** Almost all of a fetch is waiting on someone else's server, so speed depends on keeping thousands of fetches in flight. The crawler must not fetch the same address twice among billions, must not overload any one site, and must keep recrawls from crowding out new pages and filling the network link.
- **Building blocks it uses:** a [Bloom filter](#/sd-02-probabilistic/005-bloom-filter) to remember billions of addresses already seen in little memory, and recrawls kept as jobs that wake up when they are due, the idea behind a [delayed job scheduler](#/sd-low-level-design/07-delayed-job-scheduler).
- **Where you'll meet it:** "Design a web crawler" is a classic interview question. The Mercator paper (1999) described per-host queues for politeness. Googlebot and Common Crawl crawl at web scale, and RFC 9309 (2022) made robots.txt a standard.

## Words we'll use

- **Crawler** — a program that downloads web pages, finds the links in them, and downloads those too.
- **Fetch** — downloading one page: connect to the site's server, ask for the URL, wait, receive the page.
- **Host** — one website's server name, such as `en.wikipedia.org`. One host can have millions of URLs.
- **Frontier** — the crawler's list of URLs still to fetch. Here it is a **queue**: a list of jobs waiting to be done, taken off by **consumers**. The **backlog** is how many are waiting; the **oldest job's age** is how long the unluckiest one has waited.
- **In flight** — started and not finished. For a crawler, the number of fetches in flight at once is what sets its speed.
- **Worker** — a slot for one request in progress inside a server. A worker that waits for a fetch is taken for the whole wait.
- **Dedup** (deduplication) — not fetching a URL we have already fetched. The **seen set** is the record of every URL we know about.
- **Politeness** — limiting how hard we hit any one host, so the crawler does not overload someone else's server. Usually a cap on connections to a host at once, plus a pause between requests.
- **robots.txt** — a file at the root of a site that tells crawlers what they may fetch.
- **Bandwidth** — how many bits a second a network link can carry. 1 Gbps (gigabit a second) is 125 MB a second.
- **Recrawl** — fetching a page again later to see whether it changed. A **delayed job** is a job that a queue keeps hidden until its due time.
- **Utilization** (busy) — the share of time a machine is working. **Error** — a request that failed: turned away by a full server, or given up on after its timeout.

## The world we're in

- A typical site answers a fetch in about 0.5 s. That is its time, not ours: our machines just wait.
- One large host holds 30% of the new URLs we find. It answers in 0.2 s but serves at most 20 requests at once: about 100 pages a second, for everyone, not only us.
- A page is about 100 KB. Every page comes in through our internet link, 1 Gbps. (The simulator limits a machine's outgoing bandwidth, so the link is drawn as a gateway machine whose answers to the fetchers carry the pages.)
- Parsing a page costs 5 ms of CPU. Pages are saved to object storage in about 20 ms.
- The parsers find 2,000 links a second. 80% of them we have seen before, so 400 a second are new.

## The goal

Fetch the new URLs as fast as they appear, without overloading any site, without fetching the same URL twice, within our bandwidth, and come back to pages that change.

## The naive attempt

"A crawler server takes each URL and fetches it while the scheduler waits for the answer."

Each fetch holds a worker for about 0.6 s, almost all of it waiting on the remote site. Two servers with 50 workers each have 100 workers, so they can finish about 100 / 0.6 ≈ 170 fetches a second, whatever their CPUs could do. 400 URLs a second arrive: every worker is taken, the CPUs are about 10% busy, and more than half the URLs are turned away.
[▶ Broken: fetching inside requests](play:broken: fetching inside@t=8)

The arithmetic is Little's law: fetches a second = fetches in flight / time per fetch. Faster CPUs change nothing. Only more fetches in flight do.

## Building it up

**1. Separate deciding from fetching: the frontier.** The parsers hand each link to a **frontier API**. It checks the link against the **seen set** ("insert this URL unless it is already there"); only new URLs go on the frontier queue, and the API answers at once. **Fetchers** take URLs off the queue. They do their network I/O without a thread per fetch (asynchronous I/O), so thousands of fetches can be in flight per machine; here the frontier allows up to 250 at once.

All 400 new URLs a second are fetched and nothing is refused. The dedup check is the busiest thing we own for its size: 2,000 lookups a second, five for every page fetched, keeping the seen store about 25% busy. About 160 of the 250 fetch slots are in use, and the link is under a third full.

But look at the large host. 30% of the new URLs are on it, so we ask it for about 120 pages a second, and it can serve about 100. It is pinned at 100%, and requests pile up waiting at its door: we are overloading someone else's site. A real site would slow down for its own users, then start answering 429 or 503, then block our crawler entirely.
[▶ Broken: no politeness, the large host pinned](play:broken: no politeness@t=8)

**2. Be polite: a connection budget per host.** Give each host its own queue, and a fixed number of connections it may have open at once: 10 for this host. Its URLs now wait in *our* queue rather than at its door.

The large host is about a third busy, serving us 32 to 42 pages a second, and nothing waits on its side. Our queue for it grows: over 600 URLs waiting by 10 s, the oldest over 5 seconds old. A big site takes longer to crawl, by design, and the frontier, not the site, carries the wait. But this queue also never stops growing: about 80 URLs a second more arrive than we fetch. Real crawlers keep per-host queues on disk, prioritise within them, and accept that a large host is never fully crawled; some URLs are dropped or deferred. Every other site is unaffected: the main frontier has no backlog.
[▶ Politeness: 10 connections to the large host](play:polite@t=8)

Real crawlers add a pause between requests to the same host and slow down when the host's answers slow down or turn into 429s and 503s. They also fetch and obey robots.txt. (Its Crawl-delay line is a non-standard extension; RFC 9309 does not define it.) With millions of hosts, the frontier keeps one queue per host and a schedule of when each host may be asked again; the Mercator crawler (1999) worked this way.

**3. Count the bandwidth.** The polite crawl fetches about 300 pages a second (most sites, plus about 37 from the large host's queue). 300 × 100 KB = 30 MB a second = 240 Mbps, about 25% of the link. If pages are five times bigger (images, PDFs, bloated HTML), 300 × 500 KB ≈ 1.2 Gbps, for a 1 Gbps link. The link is 100% full; every fetch takes longer because its bytes wait for their share of the link; the fetch slots are all taken; fetches fall below 280 a second; and the frontier backlog grows (over 200 URLs and over 1 s old by 10 s).
[▶ Broken: pages five times bigger fill the link](play:broken: pages five@t=8)

Bandwidth is a resource like CPU. Cap the bytes per fetch (stop reading after, say, 2 MB), ask for compressed pages (`Accept-Encoding: gzip`), skip file types you do not index, and size the link for the peak.

**4. Recrawl with delayed jobs.** Pages change, so after fetching a page, schedule its next fetch: a **delayed job** that the recrawl queue keeps hidden until it is due (3 s here, standing in for days). When it comes due, the page is fetched again, and that fetch schedules the next recrawl.

Do that for every page and fetch each recrawl as soon as it is due. The fetch rate starts at about 340 a second. After one delay period every page fetched so far comes due again, on top of the new pages: the first period adds about 280 fetches a second, the new-page rate again. Every period adds more, because recrawl load is everything you have ever fetched divided by the recrawl interval, and the corpus only grows. The rate reaches over 1,050 a second in 14 s (later periods add a little less, as the link fills). The link is over 85% full and still rising, and over 2,800 recrawls are waiting to come due. In a real crawl the corpus is billions of pages and the delay is days, but the shape is the same: recrawls grow with everything you have ever fetched, until they crowd out new pages.
[▶ Broken: recrawling every page when due](play:broken: recrawling every@t=13)

Recrawling a fixed share of pages does not fix this: a quarter of a growing corpus still grows. Only a fixed budget does.

**5. Recrawl by budget.** Decide how many fetches a second go to recrawls, and give the recrawl queue only that many fetches in flight: 60 here, each held about 0.6 s, so at most about 100 recrawls a second. Every page still schedules its recrawl. The fetch rate rises from about 340 to between 370 and 440 a second and stays there, the link stays under 40% full, and nothing fails. What grows instead is the recrawl queue: about 900 due recrawls waiting at 8 s, over 2,300 at 14 s, the oldest over 5 seconds late. That queue is the point: it holds pages that are due, and the crawler chooses which to spend the budget on: pages most likely to have changed (seen to change often before) or most important, with a delay per page that grows when it does not change and shrinks when it does. The simulator takes due recrawls oldest first; it does not model that choice.
[▶ Recrawl on a budget](play:recrawl on a budget@t=13)

## Why it works now

A fetch is mostly waiting on someone else, so a crawler is fast only if many fetches are in flight; threads blocked on slow sites cap it.
[▶ Broken: workers waiting](play:broken: fetching inside@t=8)
A frontier separates *what to fetch next* (new or seen? which host may take another request? which page is due?) from *fetching*, so each of those decisions can protect something: the seen set protects our work, per-host queues protect other people's servers, and a recrawl budget protects the link and the room for new pages.
[▶ Politeness](play:polite@t=8)
[▶ A recrawl budget](play:recrawl on a budget@t=13)

## What it costs

- The seen set is huge: billions of URLs. Exact sets at that size live on disk and every link costs a lookup. A **Bloom filter** in memory answers "definitely new" or "probably seen" with a few bits per URL, at the price of now and then skipping a new URL it wrongly thinks it has seen.
- URL dedup is not enough: many URLs serve the same page (tracking parameters, session ids, mirrors). Normalize URLs, and fingerprint page contents to skip duplicates.
- Per-host queues for millions of hosts, with their schedules, are a large data structure of their own.
- Crawler traps (calendars with a "next month" link forever, endless generated URLs) need limits on depth and on URLs per host.
- Not simulated: robots.txt, pauses between requests, slow-site timeouts, content dedup and crawler traps. The large host's pages are left out of recrawls to keep its queue simple.

## Staff notes

- Write the throughput equation first: pages a second = fetches in flight / seconds per fetch, then check bandwidth (pages a second × page size) and the dedup rate (links a second, several times the pages).
- Put a timeout and a size cap on every fetch. A few sites that send one byte a second can otherwise hold thousands of fetch slots.
- Identify the crawler (a User-Agent with a contact URL) and give site owners a way to slow it down. Being blocked is worse than being slow.
- DNS lookups are a hidden cost at crawl scale: cache them.
- Budget recrawls explicitly, separately from new pages. "Recrawl when due" without a budget grows with the corpus.

## Check yourself

- **Q:** The crawler's CPUs are 10% busy and more than half the URLs are refused. What limits it?
  A: Workers: 100 of them, each held about 0.6 s while a remote site answers, so about 170 fetches a second. [▶ Show it](play:broken: fetching inside@t=8)
- **Q:** With a frontier, every URL is fetched. What is wrong at the large host?
  A: We ask it for about 120 pages a second and it can serve about 100: it is pinned at 100% and requests pile up at its door. [▶ Show it](play:broken: no politeness@t=8)
- **Q:** With 10 connections to the large host, where do its extra URLs go?
  A: Into our own queue for that host, which grows. The host stays about a third busy and the rest of the crawl is unaffected. [▶ Show it](play:polite@t=8)
- **Q:** Pages get five times bigger. Why do fetches slow down when no CPU is busy?
  A: About 300 pages a second × 500 KB is about 1.2 Gbps on a 1 Gbps link. The link is full and every fetch waits for its share of it. [▶ Show it](play:broken: pages five@t=8)
- **Q:** Why does recrawling every page when due never level off, and what does?
  A: Recrawl load is everything fetched so far divided by the recrawl interval, and the corpus only grows, so each period adds about another new-page rate of fetches. A fixed budget of recrawl fetches levels the rate off; the due pages wait in the queue and the crawler picks which go first. [▶ Show it](play:recrawl on a budget@t=13)
