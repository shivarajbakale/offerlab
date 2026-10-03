# Video upload and streaming

## What it is

- **What it is:** The backend of a site like YouTube: people upload videos, the service converts each one into the formats and sizes that phones and browsers need, and viewers stream them a few seconds at a time.
- **What makes it hard:** Converting a video takes hundreds of times more computing than sending a piece of one, so a burst of uploads starves every viewer if they share machines. Viewing is huge, constant and worldwide, so sending every piece from your own servers is slow for far viewers and costs a fortune in bandwidth.
- **Building blocks it uses:** uploads that answer at once and hand the slow conversion to a queue ([async events between services](#/sd-microservices/06-async-events-between-services)), and conversion jobs that are safe to run twice ([idempotent consumers](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)), with a CDN serving the pieces near each viewer.
- **Where you'll meet it:** "Design YouTube" or "Design Netflix" is a standard interview question. HLS (from Apple) and MPEG-DASH are the standard formats for streaming video as short segments listed in a manifest. Netflix runs its own CDN, Open Connect, with servers placed inside internet providers' networks.

## Words we'll use

- **Request** — one thing a user's app or browser asks a server for. **Requests a second** measures traffic.
- **Latency** — how long one request takes, from sending it to the answer arriving.
- **p50 and p99** — sort the latencies of a second. **p50** is the middle one; **p99** is the one 99% were faster than: the slow tail 1 viewer in 100 feels.
- **CPU core** — one part of a processor that runs one piece of work at a time. **Utilization** is the share of time the cores are busy.
- **Worker** — a slot for one request in progress on a server. It stays taken while the request waits for anything.
- **Rejected (503)** — a server whose workers and waiting line are all full turns new requests away at once with HTTP 503, "service unavailable".
- **Bottleneck** — the part that runs out of capacity first and so limits the whole system.
- **Raw video** — the file a camera or phone records. Large, and in one format and size only.
- **Codec** — a method for compressing video (H.264, VP9, AV1 are common ones). A player must support the codec to play the file.
- **Bitrate** — how many bits one second of video takes. Higher bitrate means better picture and a bigger download.
- **Transcoding** — decoding an uploaded video and encoding it again into the codecs, sizes and bitrates that players need. It is heavy CPU work: real systems spend minutes of CPU per minute of video.
- **Rendition** — one encoded version of a video, say 1080p at 5 Mbit/s or 360p at 0.7 Mbit/s.
- **Segment** — a short piece of a rendition, a few seconds long, stored as its own small file. A player downloads segments one after another.
- **Manifest** — a small file that lists a video's renditions and the address of each segment.
- **Adaptive bitrate** — the player measures how fast segments arrive and picks the rendition for the next segment to match: lower when the network is slow, higher when it is fast.
- **Object storage** — a service that stores files by name and returns them on request (Amazon S3, Google Cloud Storage).
- **Static file** — a file that is the same for everyone who asks. Video segments are static files.
- **Metadata** — facts about a video kept in a database: title, owner, which renditions exist.
- **Queue** — a list of jobs to do later. A request adds a job and returns at once; **consumers** take jobs off the list and do them. The **backlog** is the jobs still waiting.
- **Origin** — our own servers, where the real copy of every file lives.
- **CDN** (content delivery network) — servers in many cities (**edge servers**) that keep copies of popular static files, so a user fetches them from one nearby. A **hit** finds the file there; a **miss** fetches it from the origin first, over the same distance the viewer would have travelled. **Hit rate** is the share of hits.
- **Purge** — telling the CDN to forget its copies, so the next request for each file is a miss.
- **Zipf popularity** — a pattern where a few items get most of the requests: the second most popular gets half the views of the first, the third a third, and so on.
- **Egress** — data sent out of a data centre to users. Cloud providers and CDNs bill for it per gigabyte.
- **Cost per million** — the hourly bill divided by the millions of requests answered in that hour.

## The world we're in

- Two kinds of traffic share the service. **Uploads** are rare: here 3 in 1,000 requests. **Viewing** is constant: a player fetches the manifest and some metadata, then one segment every few seconds for as long as the video plays.
- 90% of requests are segment fetches, 10% are page and metadata reads.
- Each upload must be transcoded before anyone can watch it. Here that is 2 seconds of one CPU core. Real transcoding takes far longer; we shrink it so a run fits in 15 seconds, and keep it about 670 times heavier than serving a segment (2,000 ms against 3 ms).
- Sending one segment costs the app server 3 ms of CPU, plus a 10 ms read from object storage.
- Popularity follows Zipf: out of 100,000 segments, a few thousand get most of the views.
- 30% of viewers are on another continent: 120 ms each way instead of 20.
- A user waits up to 5 seconds for an answer, then gives up.

What the simulator counts: requests, CPU time, waiting, network delay and hits. What it does not count: bytes. A real segment is about a megabyte, and moving those bytes (network bandwidth, egress bills) is the largest real cost of video. Here a segment is one request like any other. Adaptive bitrate and renditions are explained in words, not simulated.

## The goal

Uploads should succeed and become watchable soon. Viewing should be fast for everyone, everywhere, and keep working however many uploads arrive at once. Find what each design can carry.

## The naive attempt

"The upload request receives the video, transcodes it, and answers when it is done. The same app servers serve the segments."

Four app servers (16 cores) take 600 requests a second, about 2 uploads a second. Nothing fails, and the cores are 42% busy on average. Most seconds the segment slow tail (p99) is about 270 ms: the far viewers' trip across the ocean and back. But every so often several transcodes land on one server at once and fill its 4 cores. A segment that needs 3 ms of CPU then waits behind 2-second transcodes, and for those seconds (seconds 3 to 6 of this run) the segment p99 jumps to about 1 s.
[▶ Two uploads a second: transcodes fill one server's cores](play:transcode in request: at 2 uploads@t=5)

Now a popular creator posts and their followers re-upload clips: uploads jump to 9 a second. That is 18 seconds of transcoding arriving every second, for 16 cores. The cores fill, transcodes hold the workers, and viewers who never uploaded anything wait: the median segment takes 780 ms and 1 request in 5 fails.
[▶ Broken: an upload spike starves every viewer](play:broken: transcode in request@t=10)

## Building it up

**1. Take the heavy work out of the request.** The upload request now only stores the original file in object storage, records it in the database, and drops a "transcode this" job on a queue. It answers in milliseconds. A separate pool of 12 transcoding cores takes jobs off the queue, one per core. Viewers no longer share cores with transcodes, so those episodes are gone: in every second of the run the segment p99 stays near 270 ms, which is the trip to the far continent and back. Where the first design had seconds at about 1 s, this one has none.
[▶ The transcode on a queue, the same traffic](play:queue: the transcode leaves@t=10)

The same spike of 9 uploads a second now does not touch viewers at all. It lands on the pool instead: 12 cores can finish 6 transcodes a second, so the pool is 100% busy and the backlog grows, 2 to 3 more jobs every second. After 15 seconds the oldest job has waited over 5 seconds. Users see "processing..." for longer; nothing fails.
[▶ Broken: the upload spike fills the transcoding pool](play:broken: queue@t=14)

The fix is more transcoding cores, and only those: with 24 the pool is 71% busy and the backlog stays empty. The two flows now scale separately. In a real system the pool grows and shrinks with the queue's length, and the queue's oldest job is the number to alert on.
[▶ Twice the transcoding cores](play:queue: twice@t=10)

**2. Notice what viewing really costs.** Viewing grows to 3,000 requests a second. The app servers still send every segment: 58% busy. Near viewers get a segment in 59 ms. Far viewers wait about 270 ms for every segment, because each one crosses the ocean twice.
[▶ 3,000 requests a second, all segments from the app servers](play:segments from the app servers: 3,000@t=8)

At 6,000 requests a second the four app servers are full: every worker taken, the median segment at 159 ms, and 13% of requests turned away. Every viewer of the same popular video makes the origin read and send the same file again.
[▶ Broken: 6,000 requests a second at the origin](play:broken: segments from the app servers@t=6)

**3. Serve segments from a CDN.** A segment never changes once written, and the same few thousand are wanted by everyone. So keep copies near the viewers. The player fetches segments from a CDN edge server about 10 ms away. The first request for a segment is a miss: the edge fetches it once from the origin and keeps it. At 6,000 requests a second, 86% of segment requests are hits. The median segment takes 20 ms instead of 59, the app servers drop to 30%, and nothing fails.

The slow tail improves less: from 372 ms to about 280. A hit is about 20 ms for everyone, near or far. But a far viewer's miss still crosses the ocean to the origin and back, about 2 × 120 ms plus the origin's work. 30% of viewers are far and 14% of segments miss, so about 4% of segment requests are far misses: more than 1 in 100, so they set the p99. Only a higher hit rate at the edges or an origin on that continent fixes it.

One more simplification: the simulator's CDN is one shared cache, so a segment fetched by anyone is a hit for everyone. A real CDN keeps a separate cache in each location, and each one must miss once per segment; for the long tail of rarely watched segments, the real hit rate per location is lower than the 86% measured here.
[▶ The same 6,000 requests a second with a CDN](play:CDN: 6,000 a second, segments from nearby, the origin a third busy (#2)@t=6)

Why does a CDN holding 20,000 of 100,000 segments answer 86% of requests? Zipf. Holding the top 2,000 answers 58%; the top 50,000, 94%. Each extra segment kept is requested less often than the one before.
[▶ A CDN holding 2,000 segments](play:CDN: holding 2,000@t=8)
[▶ A CDN holding 50,000 segments](play:CDN: holding 50,000@t=8)

The CDN made the origin look large: at 6,000 requests a second it is 30% busy, so it is tempting to cut it to 2 app servers. Then someone purges the CDN (a bad file was cached; a new region opens empty). For the next second only 37% of requests hit, the two app servers are full, and about 20% of requests fail. Three seconds later the hit rate is still only 64%: popular segments come back fast, but the long tail refills one viewer at a time, and errors continue.
[▶ Broken: the CDN is purged, the origin floods](play:broken: CDN@t=4)

## Why it works now

The two flows have opposite shapes, so each got its own answer.

- Uploads are rare and heavy, and nobody needs the result within the second. That is queue work. The request does the cheap part, the queue absorbs bursts, and a pool sized for the average upload rate does the rest. A spike costs waiting time, not errors, and cannot reach the viewers' machines.
- Viewing is frequent and light, the answer is the same for everyone, and it never changes. That is cache work. Zipf popularity makes a cache of the top fifth answer most requests, and putting the cache near the viewer removes the ocean from the trip.

Segments are what make adaptive bitrate possible. Because the video is cut into small independent files, each one can be cached separately, and the player can switch rendition between segments when the network slows, instead of stalling. The cost is paid at upload: each video is transcoded into every rendition, several times the work of one encode.

## What it costs

- A queued upload is not watchable at once. The product must show "processing" and tell the uploader when it is done.
- The transcoding pool is a second fleet to size, pay for and watch. Its backlog is invisible to users until someone asks why their video is still processing.
- The CDN is billed per request, and in real life per gigabyte, which for video is most of the bill. Here, at 6,000 requests a second, the hourly bill goes from about $1.30 to about $16, and the cost per million requests from 7 cents to 73. Video services negotiate bandwidth prices or build their own CDN (Netflix's Open Connect) because this line dominates.
- The origin must still be sized for a cold CDN: purges, new regions and a new viral video all send traffic back to it.
- The far viewers' page and metadata reads, and their segment misses, still cross the ocean (the overall p99 stays near 280 ms). Caching those, or running origins in each region, is the next step.

## Staff notes

- Split work by its shape: latency-sensitive and light stays in the request; heavy and deferrable goes to a queue with its own machines. Never let a request path share CPU with batch work.
- Alert on the age of the oldest transcode job and on the backlog's trend, not on errors: the queue hides overload by design.
- Make transcode jobs safe to run twice (idempotent: the same job writes the same output files), because consumers crash and jobs are retried. Primitive 026 shows the outbox and idempotent consumer.
- Transcode the popular renditions first and the rest later, so a video becomes watchable in minutes even if the full ladder takes longer.
- Size the origin for the CDN's worst day, or put a second cache layer in front of it (an "origin shield") so a cold edge fetches each segment from the origin once, not once per edge server.
- Segments are immutable: give them names that change when the content changes, and cache them forever. Only the manifest of a live stream needs a short cache time.
- In a real system, model bytes: egress per month, peak bandwidth per edge, and storage for every rendition of every video. The request counts here are the easy part.

## Check yourself

- **Q:** At 2 uploads a second the app servers are only 42% busy on average. Why does the viewers' slow tail jump to about 1 s for a few seconds?
  A: Now and then several transcodes land on one server and fill its 4 cores. A segment needs 3 ms of CPU but finds every core busy with 2-second transcodes, and waits for one to finish. Long and short work sharing cores makes the short work slow. [▶ Show it](play:transcode in request: at 2 uploads@t=5)
- **Q:** With the queue, uploads jump to 9 a second. What do viewers see, and what do uploaders see?
  A: Viewers see nothing: their latency does not move. Uploaders wait longer for "processing" to finish, because the 12-core pool finishes only 6 a second and the backlog grows. [▶ Show it](play:broken: queue@t=14)
- **Q:** The CDN holds a fifth of all segments. Why does it answer 86% of requests?
  A: Popularity is Zipf: the most popular segments get far more requests than the rest, so the top fifth covers most views. [▶ Show it](play:CDN: 6,000 a second, segments from nearby, the origin a third busy (#2)@t=6)
- **Q:** With the CDN the origin is 30% busy. Why not cut it from 4 app servers to 2?
  A: Because the CDN can go cold. After a purge most requests miss and land on the origin at once, and 2 servers are flooded for seconds. [▶ Show it](play:broken: CDN@t=4)

## Deep dive

Why does a cache of the top N items catch so much under Zipf? With exponent 1, item k is requested in proportion to 1/k. The share of requests for the top N of M items is the sum of 1/k up to N divided by the sum up to M, which is about ln(N) / ln(M) (the harmonic numbers grow like the logarithm). For N = 20,000 and M = 100,000 that is about 0.86; for N = 2,000, about 0.66. Those are the best case: a real cache that forgets the least recently used item holds slightly the wrong set, which is why the simulator measures 58% rather than 66% for the smallest CDN. They are also for one shared cache, which is what the simulator models. A real CDN has a cache in each location, each seeing only its own viewers' requests; each must miss once per segment, so rarely watched segments hit less often and the hit rate per location is lower. The lesson is the shape: each tenfold increase in cache size adds the same slice of hit rate, so the first few thousand items are worth far more than the next hundred thousand.
