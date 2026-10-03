# Scale a web app

## What it is

- **What it is:** The path from one server running a website and its database to a setup that serves thousands of requests a second: a separate database, several app servers behind a load balancer, a cache, read copies of the database, a job queue and a CDN for files.
- **What makes it hard:** Every machine has a limit, and the first one to fill slows or fails every request, even requests that never use it. Each fix moves the limit somewhere else and adds a new way to fail (a dead server, stale copies, an empty cache), and every write still goes to one database.
- **Building blocks it uses:** [load balancing](#/sd-04-traffic/014-load-balancing) across identical, stateless app servers, read copies of the database through [leader-follower replication](#/sd-05-replication/017-leader-follower-replication), and clients that use [retries with backoff and jitter](#/sd-04-traffic/015-retry-backoff-jitter) so they do not flood a database that is recovering.
- **Where you'll meet it:** "How would you scale this app from a thousand users to millions?" is a classic opening interview question. AWS has given a re:Invent talk called "Scaling up to your first 10 million users" for years, and it walks through much the same steps.

## Words we'll use

- **Request** — one thing a user asks the app for, like loading a page. A **read** only looks at data; a **write** changes it.
- **Requests a second** (often written **QPS**, queries per second) — how much traffic arrives.
- **Latency** — how long one request takes, from the user sending it to the answer arriving.
- **p50 and p99** — sort a second's worth of latencies. **p50** is the middle one: half were faster. **p99** is the one 99% were faster than: the slow tail that 1 user in 100 feels.
- **CPU core** — one part of a processor that runs one piece of work at a time. A 4-core machine runs 4 at once.
- **Utilization** — the share of time the cores are busy. 50% means busy half the time.
- **Worker** — a slot for one request in progress: a thread in an app server, a connection in a database. A worker stays taken while its request waits for anything, including another machine.
- **Queue** — requests waiting for a free worker. When it is full, new requests are **rejected** with an error (HTTP **503**, "service unavailable").
- **Timeout** — how long a user waits before giving up. Here, 1,000 ms.
- **Bottleneck** — the part that runs out of capacity first and so limits the whole system.
- **Single point of failure** — one part whose death takes everything down.
- **Load balancer** — a component in front of several identical servers that hands each request to one of them.
- **Health check** — the load balancer asking each server "are you alive?" at a fixed interval.
- **Session** — what the app remembers about a signed-in user between requests. **Stateless** servers keep no sessions in their own memory.
- **Cache** — a fast in-memory copy of data that is read often. A **hit** finds the key there; a **miss** does not and must ask the database. **Hit rate** is the share of hits.
- **Invalidate** — delete a cached copy because the original changed.
- **Stale read** — a read that returns an older value than one already written.
- **Replica** — a copy of the database. The **primary** takes every write and passes it on; **read replicas** answer reads. **Replication lag** is how far behind a replica is.
- **Read your own writes** — a promise that after you save something, your own next read shows it.
- **Retry** — sending a request again after it failed or timed out.
- **Queue** — a list of jobs to do later. The request adds a job and returns; **consumers** take jobs off the list and do them. The **backlog** is the jobs still waiting.
- **Static file** — an image, script or stylesheet: the same bytes for everyone.
- **CDN** (content delivery network) — servers in many cities that keep copies of static files, so each user fetches them from one nearby. On a **miss** the CDN fetches the file from the **origin**, our own servers, and keeps a copy.

## The world we're in

- Users send requests one at a time, independently, so they arrive in random clumps rather than evenly spaced.
- 90% of requests are reads and 10% are writes.
- Each request costs CPU time: about 6 ms in the app to build a page (8 ms for a write), and 3 ms in the database (6 ms for a write).
- Talking between machines in one data centre costs about half a millisecond; reaching the user costs 20 ms each way.
- Machines die without warning. A dead machine forgets everything in memory.
- Some pages are far more popular than others: a few keys get most of the reads (a **Zipf** distribution).
- Outside services (an email provider) are slow and sometimes much slower, and we cannot fix them.

## The goal

Serve as much traffic as possible with every request answered fast, and keep serving when a machine dies. Find each limit before users do.

## The naive attempt

"Put the app and its database on one good machine."

At 200 requests a second this is fine: a request takes about 51 ms, almost all of it the trip to the user and back, and the cores are 48% busy.
[▶ One machine at 200 requests a second](play:one machine: 200@t=10)

Each request needs about 9.5 ms of CPU in total, and there are 4 cores, so the machine can do at most 4 / 9.5 ms ≈ 420 requests a second. Send 600 and the extra cannot be done. Requests pile up until all 50 workers are taken and 100 more are waiting, and then the machine turns about 3 in 10 away with a 503.
[▶ Broken: 600 requests a second into one machine](play:broken: one machine — past@t=10)

And when the machine dies, so does everything: there is nowhere else for a request to go.
[▶ Broken: the one machine dies at 10.5 s](play:broken: one machine — when it dies@t=11)

## Building it up

**1. Notice that slowness starts before 100%.** Why does latency rise before the machine is full? Because requests arrive in clumps. When a clump lands, some requests must wait for a core even if the average load is fine. The busier the cores, the more often a request finds them all taken, and the longer the line it joins. For one core whose work times are as random as the arrivals (the classic "exponential" model), the waiting grows like load / (1 − load): at 50% busy a request waits about 1 unit of its work time, at 90% about 9. Work that varies less waits proportionally less, but the curve has the same shape. From 200 to 300 requests a second the average latency here moves by about 3 ms; from 300 to 380 it moves by about 14, then at 420 it jumps to 188.
[▶ One machine at 380 requests a second, 90% busy](play:one machine: latency bends upward as the CPUs fill (#3)@t=15)

**2. Give the database its own machine.** On one machine the app and the database take turns on the same 4 cores. Apart, the app's cores only do app work (6.2 ms a request on average), so the app can serve 4 / 6.2 ms ≈ 640 requests a second, and the database 4 / 3.3 ms ≈ 1,200. The 500 requests a second that overloaded one machine now pass without errors.
[▶ Separate database at 500 requests a second](play:separate database: 500 requests a second that one machine could not serve (#2)@t=10)
The limit moved to the app server's CPUs, and the app server is still alone.
[▶ Broken: the app server's CPUs at 900 requests a second](play:broken: separate database — the app server's CPUs@t=10)
[▶ Broken: the app server dies, and with it everything](play:broken: separate database — the app server is still@t=11)

**3. Put identical app servers behind a load balancer.** Three app servers give three times the app CPU. The load balancer sends each request to the next server in turn (round robin). At 900 requests a second each server is under half busy.
[▶ Three app servers at 900 requests a second](play:load balancer: three@t=10)
When one dies, the load balancer does not know until its next health check, so for up to a second a third of requests still go to the dead server and fail. After the check, the other two carry everything.
This simulator checks every second, marks a server down after one failed check, and a request sent to a dead server fails at once. Real systems differ in three ways. Load balancers mark a server down only after several failed checks in a row, so detection takes about interval × threshold (AWS's Application Load Balancer defaults to a check every 30 s and 2 failures). A machine that dies outright usually does not refuse requests; they hang until a timeout. And many load balancers retry a refused connection on another server (NGINX's proxy_next_upstream, HAProxy's redispatch, Envoy's retry policy), so users may see a slow request instead of an error.
[▶ app-2 dies at 10.5 s; errors until the check at 11 s](play:load balancer: a dead server@t=10.8)

**4. Keep sessions out of the servers.** The tempting shortcut is to keep each user's session in the memory of the server they first reached, and have the load balancer send them back to that server every time ("sticky sessions"). It works until that server dies: its memory is gone, so every user it was holding, 1 in 3 of everyone with three servers, is signed out on their next click. In the ten seconds after the crash about 1,100 of the 5,000 users (22%) click again and find themselves signed out; the rest will find out later.
[▶ Broken: sticky sessions, and a server dies](play:broken: sessions in server memory@t=12)
Putting sessions in a small shared store costs one extra round trip inside the data centre per request: about 1 ms of travel plus 0.2 ms of work. In exchange, any server can answer any user, and a dead server costs nobody their session. That is what **stateless** means.

**5. Add a cache in front of the database.** Stage 3 failed at 1,500 requests a second because every read reached the database. But reads are lopsided: with this Zipf spread, the most popular 20,000 of 100,000 pages get about 87% of them. Keep those in memory. On a read, look in the cache first (**cache-aside**); only on a miss ask the database, then store the answer in the cache. The measured hit rate is lower, about 79%, because every write deletes a cached entry and the cache keeps swapping keys in and out (it evicts the least recently used key to make room). At 1,500 requests a second, the database drops from 100% busy to 44%, and every request passes.
[▶ The cache takes most reads off the database](play:cache: the 1,500 requests a second that broke stage 3 now pass (#2)@t=10)
A cached copy goes out of date the moment someone writes. If a write does not delete the cached copy, readers keep getting the old value until that key happens to fall out of the cache: here, about half of all reads.
[▶ Broken: writes that forget to invalidate](play:broken: cache without invalidation@t=10)
So the database now depends on the cache being warm. Restart the cache and it comes back empty: most reads miss (in the first second only about 3 in 10 hit), and the database is 100% busy at once. For a moment requests only wait in the full queues; from about 7 s they start failing, and errors go on for seconds while the cache slowly refills.
[▶ Broken: the cache restarts at 5 s and the database floods](play:broken: cache — a restarted cache@t=8)
What if clients retry at once? About 2,100 extra requests a second arrive. The database was already full, so most of them bounce off the app servers' full queues: the share turned away with a 503 rises from 18% to 23%. Some retries do succeed, so the share of users who end with an error actually falls, from 31% to 25%. But the slowest users now wait about twice as long (p99 1.9 s instead of 1 s), because a rescued request counts its time from the first try. Real retry storms are worse than this run shows: servers keep working on requests whose clients already gave up and retried, so the same work is done twice (case study 04). Retries should wait, with random jitter, and be capped (primitive 015).
[▶ Broken: the same restart, with clients retrying at once](play:broken: cache — clients that retry at once add load and stretch the slow tail (#2)@t=8)
The cache moved the limit, but did not remove it: misses and every write still reach one database, which fills again at about 3,200 requests a second.
[▶ Broken: 4,000 requests a second](play:broken: cache — past about 3,200@t=10)

**6. Add read replicas.** Copy the database to two more machines. Writes still go to the primary, which passes each one on; reads that miss the cache spread over the replicas. At 4,000 requests a second the primary is about 88% busy and the replicas only 25%. Writes alone account for 60% (400 a second × 6 ms over 4 cores); the rest is the price of read your own writes, below: users reloading right after a save are sent to the primary.
[▶ Read replicas at 4,000 requests a second](play:read replicas: 4,000@t=10)
Copies lag. When a replica falls a second behind and a user reloads 300 ms after saving, their read goes to a replica that has not seen the save yet: every such reload shows the old value.
[▶ Broken: users don't see what they just saved](play:broken: lagging replicas@t=10)
The fix is **read your own writes**: for a moment after a user writes, send that user's reads to the primary, skipping the cache too. They always see their own change. Other users may still see the old value for a moment: a copy of a copy can be behind. Here that is about 16% of reads while replicas lag a second, and around 8% even with the normal 50 ms lag, because the cache sometimes refills from a replica that has not caught up and keeps that old value until the next write. Fine for a news feed; not for a bank balance.
[▶ Read your own writes with lagging replicas](play:lagging replicas with read-your-writes@t=10)

**7. Move slow work out of the request.** The product now sends a confirmation email on every save, inside the request. The app worker waits for the email provider, normally 300 ms. When the provider becomes 10 times slower, those waits hold every app worker, and page views that have nothing to do with email fail too: about a third of all requests.
[▶ Broken: a slow email provider takes down page views](play:broken: email sent inside@t=8)
Instead, the request only drops a job on a **queue** and returns. Consumers take jobs off and send the emails. With the same slow provider, users notice nothing; the jobs pile up instead (at 10 s, the end of the slowdown, over 1,000 waiting, the oldest nearly 4 seconds old) and drain once it recovers.
[▶ The same slowdown with a queue](play:queue: the same slow@t=10)
A queue hides overload, it does not remove it. 300 emails a second at 0.3 s each need 90 consumers busy all the time; with 60, the backlog grows forever, and users never see an error. Watch the backlog and the age of the oldest job, not just latency.
[▶ Broken: 60 consumers for 90 consumers' worth of work](play:broken: too few consumers@t=14)

**8. Serve static files from a CDN.** So far we only counted page requests. A browser also fetches images, scripts and stylesheets, and 30% of these users are on another continent, 120 ms away. Every one of those files makes the round trip.
[▶ Broken: every static file crosses the ocean](play:broken: static files@t=10)
A CDN keeps copies on servers in many cities, about 10 ms from everyone. 94% of files are found there; the median static file now takes 20 ms instead of 44, and the app servers no longer serve files. But a miss still has to fetch the file from the origin, over the user's own distance: a far user's miss still crosses the ocean. About 6% of files miss, and 3 in 10 users are far away, so about 2 files in 100 still take over 250 ms (instead of 30 in 100). That is more than 1 in 100, so the p99 does not move: about 260 ms before and after. A CDN helps the many requests it hits; to shorten the far tail too, it needs a higher hit rate (more files kept, longer expiry) or an origin closer to those users. It is not free: billed per request, here it costs more than the app servers.
[▶ The same traffic with a CDN](play:CDN: static files come from a server nearby (#2)@t=10)

## Why it works now

Each fix gave capacity to the part that was full and to nothing else, and each one was forced by a measured failure. At stage 3 the limit was the one database: past about 1,200 requests a second its cores were full, while the app servers' workers were all taken yet their CPUs only 60% busy, each worker waiting on the database.
[▶ Broken: 1,500 requests a second, the database is the limit](play:broken: load balancer — past@t=15)
The cache and replicas removed reads from that database; the queue removed slow work from the request; the CDN removed most file requests, and the distance for the ones it hits.

What none of them removed is writes. Every write still goes to one primary. When the product starts writing more (comments, likes, view counts: 30% of requests), the primary is 100% busy while the replicas sit at 11%, and half of all requests fail.
[▶ Broken: writes fill the primary; replicas sit idle](play:broken: writes — the primary database is full@t=10)
Adding replicas changes nothing, because replicas cannot take writes.
[▶ Broken: six replicas, the same errors](play:broken: writes — six replicas@t=10)
The next step is to split the data itself across several primaries (**sharding**, see primitives 001 and 002), which is where the case studies begin.

## What it costs

- Every split adds a network round trip to each request (about 1 ms here) and another machine to pay for, patch and watch.
- The load balancer is a new component that must itself never be a single point of failure; managed ones run as several machines.
- A health check every second means up to a second of errors after a crash. Checking more often, or marking a server down after fewer failed checks, finds dead servers sooner but adds traffic and false alarms. Real defaults are much slower (AWS ALB: 30 s × 2 failures), and a machine that dies outright makes requests hang until a timeout rather than fail at once.
- The shared session store is now something every request depends on.
- A cache is another system to run, and it brings stale data, cold starts and invalidation bugs with it.
- Replicas add machines and a new kind of bug: reads that are correct but old.
- A queue moves failures out of sight: someone must watch the backlog.
- A CDN is billed per request: here it roughly triples the hourly bill, in exchange for a faster median and less load on the app servers (and, in real life, cheaper bandwidth). Far users' misses stay slow.

## Staff notes

- Alert on utilization per component long before 100%. At 80% busy a single-core request with exponential work times already waits about 4 times its work time; at 95%, 19 times.
- Read "workers full, CPUs idle" as a downstream problem. Adding threads or servers upstream only puts more requests in front of the slow part.
- A rejected request (503) costs the server almost nothing; a request that times out cost full work for nothing. Fast rejection under overload keeps the rest of the traffic healthy.
- Make app servers stateless on day one. Moving sessions out later means signing everyone out once.
- Treat a cache as an optimization the system must survive without. Plan for cold starts: warm the cache before taking traffic, or let only a few requests per key go to the database at once.
- Decide per feature how stale a read may be. Read-your-writes covers most "I just saved it" complaints; money needs reads from the primary.
- Anything slow that the user does not need to wait for (email, image resizing, webhooks) belongs on a queue. Alert on the oldest job's age.
- Scaling reads is cheap (caches, replicas, CDNs); scaling writes means sharding, which changes the data model. Know your write rate early.

## Check yourself

- **Q:** One machine serves 200 requests a second at 51 ms. Why can't it serve twice that at the same speed?
  A: Twice that is 400, about 95% of its 420 limit. Requests arrive in clumps, so at that load they usually find every core taken and wait. [▶ At 90% busy the slow tail is already nearly twice as long](play:one machine: latency bends upward as the CPUs fill (#3)@t=15)
- **Q:** After moving the database out, what limits the app at 900 requests a second, and how do you know?
  A: The app server's CPUs: they are at 100% while the database's are near half. [▶ Show it](play:broken: separate database — the app server's CPUs@t=10)
- **Q:** With a load balancer, why do some requests still fail right after a server dies?
  A: The load balancer only learns about it at its next health check, and until then keeps sending a third of requests to the dead server. [▶ Show it](play:load balancer: a dead server@t=10.8)
- **Q:** At 1,500 requests a second the app servers' workers are all busy. Should you add more app servers?
  A: No. Their CPUs are only about 60% busy; the workers are waiting on the database, which is the bottleneck. [▶ Show it](play:broken: load balancer — past@t=15)
- **Q:** The primary database is at 100% and three replicas are nearly idle. Will a fourth replica help?
  A: No. The primary is busy with writes, and replicas only take reads. Writes need sharding. [▶ Show it](play:broken: writes — the primary database is full@t=10)

## Deep dive

Why does the waiting grow like load / (1 − load)? Take one core whose requests take 1 unit of work on average, at load ρ (the share of time it is busy). A new request finds the core busy with probability ρ. If it is busy, the request waits for the work in progress plus everything already in line. In the classic model (called M/M/1), with random arrivals and work times as random as the arrivals (exponential), the average line works out to ρ / (1 − ρ) requests' worth of work. Work times that vary less wait proportionally less: the wait scales with (1 + c²) / 2, where c is how much work times vary relative to their average. This simulator's work times vary by about half their average (c = 0.5), so a single core waits about 0.625 of ρ / (1 − ρ). As ρ nears 1 the denominator nears 0 and the wait has no bound. That is why "90% busy" is not "10% spare": it means requests wait about 9 times as long as their own work. With several cores the curve is flatter at first, because a free core is more likely, but it bends up the same way near 100%.
