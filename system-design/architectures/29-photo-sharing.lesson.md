# Photo sharing

## What it is

- **What it is:** The backend of an app like Instagram or Flickr: people upload photos, the app makes smaller copies for grids, and everyone else views the photos and each account's list of latest posts.
- **What makes it hard:** Photo views move hundreds of megabytes a second, which fills the app servers' network cards while their CPUs idle, and serving those bytes straight from storage makes the charge for data sent out to the internet almost the whole bill. Caching each account's photo list for speed also means it can show old posts.
- **Building blocks it uses:** photos kept in object storage and served from a CDN, thumbnails made by queue workers that are safe to run twice ([idempotent consumer](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)), and a cache of each account's photo list cleared on every change. The [video upload](#/sd-architectures/08-video-upload-and-streaming) study uses the same storage-plus-CDN split.
- **Where you'll meet it:** "Design Instagram" is one of the most common interview questions. Facebook's Haystack paper (OSDI 2010) describes its photo storage, and "Scaling Memcache at Facebook" (NSDI 2013) describes the leases that stop a slow reader putting an old value back into a cache.

## Words we'll use

- **Photo view** — loading one image in the app. Here every view moves about 200 KB. A **feed read** loads the list of an account's latest photos (who posted, captions, links): about 20 KB of text.
- **Upload** — sending a new photo. Here a "change" also covers editing a caption or deleting a photo: anything that changes what an account's page shows.
- **Object storage** — a service that stores files ("objects") by name, in any amount, like Amazon S3. Each photo is one object. It is not a database: you put and get whole files.
- **Thumbnail** — a smaller copy of a photo for lists and grids. Making them (resizing) costs CPU: about 200 ms per upload here.
- **Queue** — a list of jobs waiting to be done, with **workers** that take jobs off it. The **backlog** is how many wait.
- **Bandwidth** — how many bits a second a network card can send. Here each app server has a 1 Gbps card: 125 MB a second.
- **Egress** — data sent from our cloud to the internet. Clouds charge for it by the GB: $0.09 a GB from servers or storage here (AWS's first price tier). Data coming in is usually free.
- **CDN** (content delivery network) — servers near users (**edges**) that keep copies of files. A **hit** is a request the edge answers from its copy; a **miss** fetches the file from the **origin** (here, object storage) and keeps it. We pay the CDN per request and per GB, about $0.02 a GB here (a price for large, negotiated volumes).
- **TTL** (time to live) — how long a copy may be used before it must be fetched again.
- **Cache** — a fast in-memory store in front of a database. **Cache-aside**: look in the cache first; on a miss read the database and put the answer in the cache.
- **Stale** — a read that returns an older version than what was already saved.
- **Invalidate** — drop a key from the cache so the next read fetches it fresh.

## The world we're in

- 3,000 requests a second from 20,000 people at a time: 89% are photo views (about 2,670 a second), 10% feed reads (300), 1% changes (30).
- A million photos and accounts. Popularity is Zipf-shaped: a few are viewed far more than the rest.
- Photo views are 2,670 × 200 KB = about 530 MB a second. That is the size of this problem; everything else is small.
- Four app servers, 8 cores each, each with a 1 Gbps network card: together they can send 500 MB a second.
- Object storage holds every photo and answers in about 20 ms. It has no practical limit on bandwidth.
- A feed read costs the metadata database 10 ms; the database has 8 cores.

## The goal

Uploads that finish quickly, photos that load fast, feeds that show the newest photos, and a bill that does not grow faster than the traffic.

## The naive attempt

"The app does everything: it resizes each upload before answering, and it serves each photo by reading it from storage and sending it to the user."

It fails on bytes, not CPU. Photo views need about 530 MB a second, and the four network cards together carry 500. The cards sit at 100% while the CPUs are under 35% busy. Each answer waits its turn on a full card, so the app's workers fill up holding half-sent photos. Photos take about 780 ms to load, and some requests fail. Uploads take over 300 ms: they wait for their own resize and behind the photo traffic. The egress bill is already about $164 an hour.
[▶ Broken: app servers do everything](play:broken: app servers do everything@t=8)

## Building it up

**1. Take the photos and the resizing out of the app.** Two changes. First, the upload is stored and answered at once; a queue job makes the thumbnails, done by 20 workers. Second, the feed links each photo straight to its object in storage, so the user's phone fetches it from there. The app now only handles small metadata: its network cards are under 2% busy. Uploads answer in under 100 ms and photos load in about 80 ms.

The thumbnail queue needs enough workers. 20 workers at 200 ms each make 100 sets a second, against 30 uploads. With only 5 workers (25 a second), the backlog grows every second and new photos wait more than a second for thumbnails, longer and longer. Nobody sees an error; they see a grey square. Watch the oldest job's age.
[▶ Broken: too few thumbnail workers](play:broken: too few thumbnail workers@t=10)

But look at the bill. Every photo byte now leaves object storage for the internet at $0.09 a GB: 530 MB a second is about 1.9 TB an hour, about $175 an hour. Almost the whole bill is egress.
[▶ Broken: photos straight from storage](play:broken: photos straight from storage@t=8)

**2. Serve photos from a CDN.** Photos never change once uploaded. That makes them perfect for a CDN. Point photo links at the CDN; an edge that has the photo answers from its copy, and one that does not fetches it from storage once and keeps it for a day. Each edge keeps the 100,000 most recently viewed photos. Because views are Zipf-shaped, those 10% of photos are about 84% of all views. Photos load in about 20 ms, from an edge near the user. Storage sees under 550 requests a second instead of 2,670.

The bill falls to about $49 an hour, about $40 of it the CDN's $0.02 a GB, and most of the rest its per-request price. Data sent from storage to the CDN is not charged here (AWS does not charge for S3 to CloudFront).
[▶ Photos from a CDN](play:cdn: 84%@t=8)

The TTL matters. If every copy expires after 1 second, say because the origin was told to send "cache for 1 s" out of fear of serving an old photo, only popular photos are viewed often enough to be found at the edge. The hit rate falls to about 34%, photos take about 93 ms, and storage gets over 1,600 requests a second.
[▶ Broken: a 1-second TTL](play:broken: a 1-second TTL@t=8)
The right fix for "an old photo" is not a short TTL. Never change a photo in place: an edit makes a new object with a new URL, so every cached copy of the old one can be kept for as long as you like.

**3. Cache feed reads, and clear them on change.** Feed reads cost the database 10 ms each. A cache in front of it holds 100,000 feeds for up to 30 s. It answers about 70% of feed reads, and the database falls under 15% busy.

But with only a TTL, a feed in the cache does not change when its account posts. About one feed read in five returns an out-of-date list: a new photo missing, or a deleted one still there, for up to 30 s. That number is high here because the simulator gives changes the same popularity as reads, so popular accounts change their pages very often. Your real share depends on how often the accounts people read actually change.
[▶ Broken: a feed cache with only a TTL](play:broken: a feed cache with only a TTL@t=8)

So every upload, edit or delete also drops that account's cached feed. The next read fills it fresh. The hit rate stays above 65%, and no read is out of date in this run. (In a real cache-aside, a slow reader that missed before the change can put the old feed back after the drop; the TTL bounds that, and leases like those in Facebook's memcache close it.) The TTL stays as a safety net, in case a drop is lost.
[▶ Feed cache cleared on every change](play:feed cache cleared@t=8)

## Why it works now

The design separates two kinds of data. Metadata is small, changes, and needs to be fresh: it lives in a database with a cache that is cleared on change. Photos are big, many and never change: they live in object storage and are served from edges near users, kept for a long time. Each part of the system now moves the kind of data it is good at.
[▶ Broken: photos through the app](play:broken: app servers do everything@t=6)
[▶ Photos from the edge](play:cdn: 84%@t=6)

## What it costs

- The CDN is the biggest line on the bill: about $49 an hour here, versus $175 from storage. At large scale companies negotiate CDN prices or build their own.
- A CDN copy outlives a delete. If a user deletes a photo for privacy, you must purge it from the CDN (CDNs take seconds to minutes) or make the URL stop working, for example with signed URLs that expire.
- Thumbnails appear a moment after an upload; the app must show a placeholder.
- Clearing the cache on every change adds work to every write, and a lost "drop" leaves a stale page until the TTL.
- Not simulated: storage costs (every photo kept forever, in several sizes), the upload bandwidth (here the app receives the photo; better to upload straight to storage with a pre-signed URL), and per-request storage prices.

## Staff notes

- Start with the egress maths in an interview: views a second × bytes per view × price per GB. It is usually the biggest number in the design, and it decides where photos are served from.
- Upload straight to object storage with a pre-signed URL (a link that allows one upload for a short time). The app never carries the bytes; it only records the photo once the upload is done, and a storage event starts the thumbnail job.
- Make every version immutable with its own URL. Then a TTL of a year is safe, and "old photo" bugs disappear.
- Make the sizes the app actually shows (a few fixed widths) and serve the smallest that fits. Sending 200 KB where 30 KB would do is egress paid for nothing.
- Keep thumbnail jobs idempotent: the same job run twice should write the same files, because queues redeliver.

## Check yourself

- **Q:** The app servers' CPUs are under 35% busy, yet photos take 780 ms. What is full?
  A: The network cards. Photos need about 530 MB a second and four 1 Gbps cards carry 500. [▶ Show it](play:broken: app servers do everything@t=8)
- **Q:** Photos from storage are fast. Why is that design still broken?
  A: Every byte is internet egress at $0.09 a GB: about $175 an hour, almost the whole bill. [▶ Show it](play:broken: photos straight from storage@t=8)
- **Q:** Why does the CDN serve 84% of views while holding only 10% of the photos?
  A: Views are Zipf-shaped: the most popular 100,000 photos get most of the views. [▶ Show it](play:cdn: 84%@t=8)
- **Q:** What goes wrong with a 1-second TTL, and what is the better way to avoid old photos?
  A: The edge keeps little, so most views go back to storage and load slower. Give every version its own URL and keep copies long. [▶ Show it](play:broken: a 1-second TTL@t=8)
- **Q:** A 30-second feed cache is fast. Why do users see old feeds, and how do you fix it?
  A: The cache does not know the account posted until its copy expires. Drop the cached feed on every change. [▶ Show it](play:broken: a feed cache with only a TTL@t=8)
