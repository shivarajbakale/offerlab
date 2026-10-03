# Log pipeline

## What it is

- **What it is:** The pipeline that carries the lines of text every service writes about what it is doing to a search index, so engineers can find "every error from payments in the last hour" within seconds.
- **What makes it hard:** When the index slows down, services that wait on their own log calls slow down with it, and logging can take a healthy service down. Turning on debug logging triples the bytes, which fills network cards and runs up the bill for data leaving the cloud long before any CPU is busy.
- **Building blocks it uses:** collectors that append batches to a durable buffer read by indexers ([Kafka partitions and consumer groups](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups)), the same queue shape as [metrics ingestion](#/sd-architectures/21-metrics-ingestion), plus dropping instead of blocking, and sampling and compression at the source.
- **Where you'll meet it:** "Design a logging system" is a common interview question. The ELK stack (Elasticsearch, Logstash, Kibana), Splunk, and agents like Fluent Bit and Vector are real systems of this shape, and Kafka is a common buffer in front of the indexers.

## Words we'll use

- **Log line** — one line of text a program writes about what it is doing: `2026-10-03T12:00:01Z ERROR payment 4411 declined`.
- **Batch** — many log lines sent together in one request. Here a batch is about 64 KB, some 400 lines.
- **Logging library** (or **agent**) — the code inside each service, or a small program on each host, that collects log lines and sends them in batches.
- **Index** — the search structure that makes "every ERROR from payments in the last hour" fast. An **indexer** is a server that parses batches and adds them to the index. That costs CPU.
- **Collector** — a server whose only job is to receive batches and hand them on. It does almost no CPU work.
- **Buffer** — a durable **queue** (like Kafka) between the collectors and the indexers. Batches wait there until a **consumer** takes them to an indexer. The **backlog** is how many are waiting; the **oldest message's age** is how far behind search is.
- **Bandwidth** — how many bits a second a network card can move. **Gbps** is a billion bits a second; 1 byte is 8 bits, so 1 Gbps is 125 MB a second.
- **Egress** — data leaving a cloud provider's network to the internet. Providers charge for it per GB: about $0.09 at AWS's first price tier.
- **Backpressure** — a slow receiver making its senders slow down or wait.
- **Blocking** — the service's code waits for the log call to finish before going on. **Dropping** — the logging library gives up on a batch, counts it as lost, and carries on.
- **Sampling** — keeping only some lines, for example 1 in 10 debug lines.
- **Compression** — encoding the same text in fewer bytes (gzip, zstd). Log text is repetitive, so it often shrinks 5 to 10 times or more.
- **In flight** — log calls sent but not yet answered or given up. With blocking logging, each one is a service thread that is stuck.

## The world we're in

- Services send 5,000 batches a second, 64 KB each: 320 MB a second, about 2.6 Gbps.
- The services run in a different network from the log pipeline, so every byte shipped is egress, billed at $0.09 a GB. 320 MB a second is about 1,150 GB an hour: about $100 an hour.
- Indexing a batch costs 8 ms of CPU. Six indexers with 8 cores each: 48 cores for 40 cores of work.
- Indexers slow down now and then (merging index segments, for example), here to a quarter of their speed for 3 seconds.
- Someone will turn on debug logging during an incident. Batches become three times bigger.
- A service must never fail because logging is slow. Losing some logs is bad; losing the service is worse.

## The goal

Get logs searchable within seconds, survive the index being slow and the volume tripling, and never let logging hurt the services that write it. Do it without paying hundreds of dollars an hour to move bytes nobody reads.

## The naive attempt

"Each service's logging library sends its batch to an indexer and waits for the answer, retrying if it fails."

On a normal day the indexers are about 82% busy and about 250 log calls are in flight at any moment.
[▶ Straight to the index](play:straight to the index: 5,000@t=4)

Then the indexers slow down for 3 seconds. They can now do a quarter of the work, so requests wait, time out and are retried, which adds even more work. During the slowdown about 2,700 log calls are in flight: 2,700 service threads waiting on logging, ten times the usual. Half of the log calls that succeed take over 600 ms, and from 4 s to 8 s about 46% of batches are lost even after three tries. The services were fine; their logging made them slow.
[▶ Broken: a slow index blocks the services](play:broken: straight to the index@t=6.5)

## Building it up

**1. Put a buffer between the services and the index.** Collectors receive a batch, append it to a durable queue and answer at once: 0.5 ms of CPU, so four collectors are about 16% busy. Consumers feed the indexers from the queue at whatever pace the indexers can take. Now the same 3 s slowdown never reaches the services: no batch is lost and 99% of log calls take under 55 ms. What grows is the backlog: about 10,000 batches waiting by the end of the slowdown, the oldest about 2 seconds old. So for a while search is 2 seconds behind. The indexers have only 8 spare cores, about 1,000 batches a second, so the backlog takes 10 to 11 seconds to drain after they recover (about 10,400 batches at a little under 1,000 a second): it is empty just after 18 s.
[▶ The slowdown grows a backlog, not errors](play:collectors and a buffer@t=7)
[▶ The backlog drained](play:collectors and a buffer@t=19)

**2. Count bytes, not requests.** The collectors barely use their CPUs, but each moves 80 MB a second into a 1 Gbps (125 MB/s) network card: about 64% of its bandwidth on a normal day. (The simulator moves bytes in answers, so the collector's answer carries the batch's size: the same bytes through the same card, counted the other way round.)

Now debug logging is turned on everywhere. Each batch is 192 KB: 7.7 Gbps arrives at 4 Gbps of network cards. The cards are 100% busy while the collectors' CPUs are 8% busy. Only about 2,600 batches a second fit through, so about 48% of logs are lost. With blocking, retrying logging that is the least of it: the services resend each refused batch, so about 2.4 times as many attempts arrive, around 2,000 log calls are stuck in the services at any moment, and half of the calls that succeed take over 300 ms.
[▶ Broken: debug logging, the callers block and retry](play:broken: debug logging@t=8)

**3. Drop instead of blocking.** The network can carry about 2,600 batches a second whatever the services do. Retrying cannot create bandwidth, so the only choice is who pays for the excess. Make the collectors refuse at once when they are full (each takes at most 16 batches at a time, and has no waiting line), and make the logging library drop a refused batch, count it and carry on. The same 48% of logs is lost, but a refused batch is turned away at once and a stored one takes about 65 ms (192 KB through a full card), so no log call waits more than about 65 ms, nothing is retried, and in-flight calls stay around 270, as on a normal day. The services do not notice.
[▶ Debug logging, the callers drop](play:debug logging, callers drop@t=8)
The one thing that rose is the bill: about 500 MB a second still leaves the services' network, about $160 an hour of egress.

**4. Cut the bytes at the source.** The cheapest byte to handle is one never sent. The agent on each host keeps 1 debug line in 10 (all warnings and errors) and compresses each batch. A debug-mode batch of 64 KB of normal lines plus 128 KB of debug lines becomes about 77 KB, then about 10 KB once compressed (assuming 8x). Now the same debug flood is about 0.4 Gbps: the collectors' network cards are about 10% busy, nothing is dropped, and egress costs about $16 an hour, against $100 for uncompressed normal logs.
[▶ Sampled and compressed at the source](play:sample and compress@t=8)

## Why it works now

The services used to depend on the slowest part of the pipeline. The buffer cuts that link: the indexers can fall behind and catch up, and only search freshness suffers.
[▶ 10,000 batches waiting, no errors](play:collectors and a buffer@t=7)
When the network itself is full, no design can store everything. Dropping fast keeps the loss from spreading to the services.
[▶ The same flood, dropped fast](play:debug logging, callers drop@t=5)
And the volume is cut where it is born, before it costs bandwidth, egress, queue space and indexing.

## What it costs

- **Freshness.** With a buffer, a log line is searchable only once its batch is indexed: seconds normally, longer after a slowdown. Alert on the buffer's oldest message.
- **Lost logs.** Dropping and sampling lose lines, and an incident is exactly when you want them. Count drops per service and keep errors unsampled.
- **CPU on every host.** Compression moves work from the network to the services' own machines, typically a few percent of a core per host.
- **Durable buffers cost storage.** Kafka keeps batches on disk for a set time; 320 MB a second is about 28 TB a day before replication.
- **Simplifications here.** The simulator charges an indexer 8 ms per batch whatever its size. Real debug batches would also triple the indexing work, and the backlog would grow during the flood: one more reason to sample at the source. It also charges egress on the collectors' answers rather than on the services' sends; the bytes and the price are the same.

## Staff notes

- Size log pipelines in bytes per second, then check every hop: the service's network card, the collectors', the queue's disks, the indexers' CPU per MB.
- Give each service a byte budget enforced in the agent. One noisy deploy should lose its own debug logs, not everyone's errors.
- Log calls must never block on the network in the request path. Write to a local buffer (memory or a file the agent reads) with a size limit, and drop the oldest or newest when it is full; choose which on purpose.
- Keep the raw logs in cheap object storage and index only what people search. Many teams index a few fields and keep the full text compressed for rare searches.
- Logs leaving a cloud or region are billed per GB. At hundreds of MB a second, egress can cost more than the whole pipeline's machines; compress before the bytes cross a billed boundary.

## Check yourself

- **Q:** The indexers slow down for 3 seconds. Why does the service, not just search, suffer in the naive design?
  A: Its log calls wait for the indexer and are retried. About 2,700 are stuck at once instead of 250, so service threads are busy waiting on logging. [▶ Show it](play:broken: straight to the index@t=6.5)
- **Q:** With collectors and a buffer, what does the same slowdown cost?
  A: Freshness: about 10,000 batches wait, the oldest about 2 s old, and they take 10 to 11 s to drain. No batch is lost. [▶ Show it](play:collectors and a buffer@t=7)
- **Q:** During the debug flood the collectors' CPUs are 8% busy. Why are half the logs lost?
  A: Their network cards are full: 7.7 Gbps arrives at 4 Gbps of cards. The work is bytes, not CPU. [▶ Show it](play:broken: debug logging@t=8)
- **Q:** Blocking and dropping lose the same share of logs. Why prefer dropping?
  A: Dropping turns a batch away at once (a stored one takes about 65 ms) and retries nothing, so in-flight calls stay around 270. Blocking keeps about 2,000 calls stuck in the services and sends 2.4 times the attempts. [▶ Show it](play:debug logging, callers drop@t=8)
- **Q:** What removes the loss entirely?
  A: Sending fewer bytes: sample debug lines and compress at the source. The flood becomes about 0.4 Gbps and egress falls to about $16 an hour. [▶ Show it](play:sample and compress@t=8)
