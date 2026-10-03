# Metrics ingestion

## What it is

- **What it is:** The pipeline that collects numbers like CPU use from every machine every few seconds, stores them in a database built for time series, and answers the dashboards and alerts engineers watch.
- **What makes it hard:** Thousands of machines write all day without pause, so a database that slows down for a few seconds turns into errors and retries that make it worse. During an incident everyone opens dashboards at once, and their heavy queries starve the very writes those dashboards are trying to show.
- **Building blocks it uses:** a durable queue between the API and the database with a fixed set of consumers ([Kafka partitions and consumer groups](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups)), bulk writes, agents that [retry with backoff](#/sd-04-traffic/015-retry-backoff-jitter), and per-minute and per-hour rollups in a separate store for dashboards.
- **Where you'll meet it:** "Design a metrics or monitoring system" is a common interview question. Prometheus, Datadog and Graphite are real systems of this kind. Facebook's Gorilla paper (VLDB 2015) describes the delta-of-delta and XOR compression that Prometheus's storage also adopted.

## Words we'll use

- **Metric** — a named number measured over time, like `cpu.busy` on host 17. A **point** is one measurement: (time, value). A **series** is one metric for one source, such as `cpu.busy{host=17}`: its points in time order.
- **Agent** — a small program on every machine that collects metrics and sends them in a **payload** (here about 200 points) every 10 seconds.
- **Time-series database** (TSDB) — a database built for series: it appends points, compresses them, and answers range queries such as "average of this metric over the last day, per minute".
- **Write-heavy** — far more writes than reads. Here 98% of requests are writes.
- **Queue**, **consumer**, **backlog** — a list of messages waiting; a worker that takes messages off it; how many are waiting.
- **Lag** — how far behind the consumers are: the age of the oldest waiting message. Every dashboard is that much out of date.
- **Bulk write** (batching) — writing many payloads in one request, so per-request work is paid once.
- **Backpressure** — a slow downstream slowing the upstream instead of being flooded by it. Here the fixed number of consumers caps the database's load (a **concurrency cap**, with the queue levelling the load); the slowness reaches the agents only when the queue's limit is hit.
- **Headroom** — spare capacity. Consumers need it to catch up after falling behind: at 90% busy, only 10% of their capacity is left to work off a backlog.
- **Downsampling** — replacing many points with one summary per interval: one point per minute (or hour) holding sum, count, min and max. The result is a **rollup**.
- **Utilization** (busy) — the share of time a machine's cores are working.

## The world we're in

- 20,000 agents, each sending one payload every 10 seconds: 2,000 writes a second, all day.
- Engineers' dashboards send queries: 2% of requests normally (40 a second), 10% during an incident (200 a second), when everyone opens dashboards at once.
- The TSDB has 8 cores. Writing one payload costs 4 ms of CPU (find each series in the index, append its point, log the write). A dashboard query over a day of raw 10-second points across many series costs 40 ms.
- We assume a bulk write of 20 payloads costs 20 ms, a quarter of writing them one by one: the request handling, logging and index lookups are shared. The real ratio depends on the database; the direction does not.
- Agents that get an error or no answer within a second wait about 100 ms, then 200 ms, and retry.
- Data may arrive on dashboards a few seconds late. It should not be lost.

## The goal

Store 2,000 payloads a second without loss, keep the agents' requests fast, survive the database slowing down, and keep dashboards fast during an incident, when they matter most.

## The naive attempt

"The ingest API writes each payload to the TSDB as it arrives. Dashboards query the same TSDB."

At 1,200 payloads a second the database is about 72% busy and nothing fails.
[▶ Direct writes at 1,200 a second](play:direct: 1,200@t=8)

At 2,000 a second it needs 1,960 × 4 ms + 40 × 40 ms ≈ 9.4 seconds of CPU a second, and it has 8. It is 100% busy and between 10% and 20% of requests fail. The failed agents retry, adding more than 1,200 extra requests a second to a database that is already full, so fewer than 1,800 payloads a second are actually stored. The API servers are under 10% busy: the work is all in the database.
[▶ Broken: direct writes at 2,000 a second](play:broken: direct writes@t=8)

## Building it up

**1. Put a queue in front and write in bulk.** The API only checks each payload and puts it on a queue, then answers. Consumers take payloads off about 20 at a time, merge them and send one bulk write. 1,960 payloads a second become about 98 bulk writes a second, about 2 seconds of database CPU a second instead of 7.8. Agents get their answer in a median of about 43 ms (the network), and the database is about 48% busy, including the dashboards. Nothing fails.
[▶ A queue and bulk writes](play:queue: 2,000@t=8)

**2. Let a slow database become lag, not errors.** Databases slow down: a compaction, a bad disk, a noisy neighbour. Slow it to a quarter of its speed for 3 seconds. In the naive design every slow write holds an API worker and the errors and retries start. Here, a fixed set of 8 consumers each waits for its own bulk write, so the database never sees more than 8 at once: the consumers slow down instead of piling on. That is a concurrency cap, with the queue levelling the load; the slowness stops at the queue and never reaches the agents. Agents notice nothing (their 99th percentile stays under 50 ms) and no request fails. What grows is the backlog: about 150 batches (3,000 payloads) by the time the database recovers, with the oldest waiting about 2 seconds. Within 2 seconds of recovery it is gone.
[▶ The database slows for 3 seconds](play:slow database@t=6)

That recovery depended on headroom. 8 consumers are about a third busy on a normal day, so after the slowdown they work through the backlog quickly. With 3 consumers they are 86% busy on a normal day: enough to keep up, and nothing looks wrong.
[▶ 3 consumers on a normal day](play:few consumers@t=8)
After the same slowdown, only 14% of their capacity is left to work off the backlog. Four seconds after the database has recovered, the backlog is about as large as it was at the worst moment, and every dashboard is still more than a second behind.
[▶ Broken: too few consumers to catch up](play:broken: too few consumers@t=10)

**3. Notice what an incident does.** When something breaks, everyone opens dashboards: 200 queries a second, each scanning a day of raw points at 40 ms. That is 8 seconds of CPU a second on their own. No request fails (the queries are allowed 5 seconds, and the queue keeps accepting payloads), but dashboards take a median of over 300 ms, and the database has no time left for the consumers' writes. The backlog more than doubles between 5 and 10 seconds and the oldest payload is over 5 seconds old, still growing. The dashboards everyone is staring at are showing data that is later every second, during the incident.
[▶ Broken: an incident's dashboards starve the writes](play:broken: an incident@t=10)

**4. Answer dashboards from rollups.** Dashboards almost never need every 10-second point. A chart of a day is a few hundred pixels wide. So as the batch writer stores each bulk write in the raw TSDB, it also adds the points into 1-minute and 1-hour rollups (sum, count, min and max per series per interval) in a separate store. A day at 1-minute resolution is 6 times fewer points than raw; a month at 1 hour is 360 times fewer. A dashboard query costs about 2 ms. That is less than the 6 times fewer points alone would give (about 7 ms): common dashboards' rollups are also pre-merged across hosts, so a query reads fewer series as well as fewer points.

During the same incident, with 200 queries a second, nothing fails, dashboards answer in a median of under 50 ms, the rollup store is about 17% busy and the raw TSDB about 22%, with no backlog.
[▶ Dashboards read downsampled rollups](play:rollups: the incident@t=8)

## Why it works now

Each stage separated two things that were fighting over one resource. The queue separated *accepting* data from *storing* it: agents are answered at once, and storage proceeds at the pace the database can take, a pace capped by the number of consumers.
[▶ Broken: direct writes, retries piling on](play:broken: direct writes@t=6)
[▶ The same 2,000 a second through a queue](play:queue: 2,000@t=6)
Rollups separated *reading summaries* from *storing raw points*, so an incident's queries land on a small store built for them, and the raw writes keep their database.
[▶ The incident, on rollups](play:rollups: the incident@t=6)

## What it costs

- Dashboards are late by the queue's lag: normally well under a second, seconds after a slowdown. Alerting rules that read the same pipeline are late by the same amount, which matters most during an incident.
- The simulator's queue never fills, so agents here never see backpressure. A real queue has a size or retention limit. When it fills, the API must refuse payloads (429 or 503), agents must buffer locally with a bound and drop the oldest data first, and someone must decide that dropping is acceptable. Every buffer in the path needs a limit and a drop policy.
- Rollups lose detail: a 1-hour average hides a 30-second spike, which is why rollups keep min and max, not just the average. Percentiles cannot be averaged at all; rollups must store histograms or sketches to answer "p99 over the day".
- Another store and a writer that must keep raw data and rollups consistent. If the writer crashes between the two writes, a replay must not double-count the rollup (store which batches it has applied, or make the update idempotent).
- Money: about $1.11 an hour for the queued design and $1.79 with the batch writer and rollup store. Cheap next to an incident with no working dashboards.

## Staff notes

- Alert on lag (the oldest message's age), not on queue size. Size consumers for catching up after an outage, not for the average day: with 14% of capacity spare, a minute behind takes about 6 minutes to recover (60 s × 0.86 / 0.14).
- Cardinality is the real enemy. Each new label value (a user id, a request id) creates a new series, and the index, memory and per-series work grow with the number of series, not points. One bad deploy that adds a high-cardinality label can take down a metrics store at the same points per second.
- Keep raw data for days, rollups for months or years. That retention split is where most of the storage savings come from.
- Separate the read path for alerts from dashboard traffic, so that the incident's crowd cannot slow the alerts that started it.
- Compression is what makes raw retention affordable: Facebook's Gorilla paper reports about 1.4 bytes per point by storing the change in the gap between timestamps (delta-of-delta) and XOR-ing consecutive values.

## Check yourself

- **Q:** At 2,000 payloads a second the direct design fails 10% to 20% of requests. Why do the retries make it worse rather than better?
  A: The database is already full. Every retry is one more request for it, more than 1,200 extra a second, so fewer payloads are stored than are sent. [▶ Show it](play:broken: direct writes@t=8)
- **Q:** The database slows to a quarter of its speed for 3 seconds. Why do agents see no errors with the queue?
  A: The API only enqueues. Consumers pull at their own pace and never send more than 8 bulk writes at once, so the slowdown becomes a backlog (about 2 seconds of lag), cleared 2 seconds after recovery. [▶ Show it](play:slow database@t=6)
- **Q:** Three consumers keep up every day. What is wrong with them?
  A: No headroom. At 86% busy only 14% of their capacity is left for a backlog, so after a slowdown the lag barely moves for many seconds. [▶ Show it](play:broken: too few consumers@t=10)
- **Q:** During an incident, nothing fails, yet the monitoring is failing its users. How?
  A: 200 raw-point queries a second fill the database, consumers' writes wait, and the lag grows past 5 seconds: dashboards show older data every second. Rollups in their own store fix it. [▶ Show it](play:broken: an incident@t=10)
