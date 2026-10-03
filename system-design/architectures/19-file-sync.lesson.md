# File sync

## What it is

- **What it is:** The backend of an app like Dropbox or Google Drive's desktop sync: a folder on each of your devices is kept the same, so a file saved on the laptop appears on the phone within seconds.
- **What makes it hard:** Files are large and every edit must reach every other device, so a naive design sends whole files through its own servers and fills their network cards while the CPUs sit idle. Devices that keep asking "anything new?" then fill the database as the number of devices grows.
- **Building blocks it uses:** files cut into chunks named by their hash and fetched straight from object storage, a version commit that checks the version it is based on ([optimistic concurrency](#/sd-api-design/03-optimistic-concurrency)), and a push gateway holding one open connection per device, the same shape as [chat messaging](#/sd-architectures/12-chat-messaging).
- **Where you'll meet it:** "Design Dropbox" and "Design Google Drive" are classic interview questions. Dropbox's API documents its content hash as SHA-256 over 4 MB blocks. rsync, restic and borg solve the same "send only what changed" problem with rolling checksums or content-defined chunks.

## Words we'll use

- **Device** — one laptop, phone or desktop running the sync app. A person has several.
- **Metadata** — the small facts about files: names, folders, versions, which chunks make up each version, and each device's **cursor** (how far through the list of changes it has read).
- **Object storage** — a service such as Amazon S3 or Google Cloud Storage that stores blobs of bytes (**objects**) by name, and serves them to many clients at once. You pay per GB stored, per request and per GB sent out.
- **Chunk** — a fixed-size piece of a file, here 4 MB. A file version is a list of chunks.
- **Hash** — a short fingerprint computed from bytes (SHA-256 here). The same bytes always give the same hash, and different bytes practically never do. Naming a chunk by its hash is **content addressing**.
- **Deduplication** (dedup) — storing or sending a chunk only once, however many files or versions contain it, because its hash says it is already there.
- **Presigned URL** — a link to one object, signed by our server with an expiry time, that lets a device upload or download that object directly from storage without our servers in the path.
- **Bandwidth** — how many bits a second a network link can carry. A **network card** (NIC) of 1 Gbps carries at most 125 MB a second, shared by everything the machine sends.
- **Egress** — data sent out of a cloud to the internet. It is billed per GB (about $0.09 at list price for the first tier); data coming in (**ingress**) is free on the major clouds.
- **Polling** — a device asking "anything new?" on a timer, whether or not anything changed.
- **Push notification** — the server telling a device "something changed" over a connection the device keeps open.
- **Worker** — a slot for one request in progress in a server. Here it stays taken until the answer has been fully sent.

## The world we're in

- 2,000 requests a second today: 90% are polls, 5% are edits being committed, 5% are downloads to other devices.
- An average file is 20 MB. A typical edit changes a small part of it: one 4 MB chunk.
- Each device's own connection runs at about 100 Mbps, so a 20 MB download takes at least 1.6 seconds, and a 4 MB one 0.32 seconds.
- The four app servers each have a 1 Gbps network card and 4 cores.
- The metadata database has 8 cores; a poll costs 1 ms of its CPU, committing an edit 3 ms.
- Growth is coming: five times the devices.
- The simulator counts the bytes of answers (downloads), not of uploads. Uploads are modeled by their time and CPU; what chunking saves on uploads is explained in words.

## The goal

Get each edit to the owner's other devices within seconds, move as few bytes as possible, keep our servers out of the byte path, and keep up with five times the devices.

## The naive attempt

"The app servers handle everything: a device uploads the whole file to an app server, which stores it; other devices download the whole file from an app server, which reads it from storage and streams it on."

At 400 requests a second (5% of them, about 20 a second, are downloads of 20 MB) nothing fails. But look at what is busy: the app servers' network cards are about 75% full while their CPUs are under 5% busy. Each download takes a median of about 1.7 seconds. We send about 350 MB a second to the internet: about $115 an hour of egress.
[▶ Whole files at 400 a second](play:whole files: 400@t=8)

At 2,000 a second there are 100 downloads a second of 20 MB: 2 GB a second, against four cards that carry 0.5 GB a second together. The cards are 100% full and the CPUs still under 5%. Each worker stays taken while its download trickles out, so the workers run out, and a 1 ms poll finds no worker either: over 70% of all requests fail, polls included. The downloads that do finish take over 7 seconds.
[▶ Broken: whole files at 2,000 a second](play:broken: whole files at 2,000 a second@t=8)

## Building it up

**1. Split files into chunks named by their hash.** The client cuts each file into 4 MB chunks and hashes each one. A file version is now its list of chunk hashes, stored in the metadata database. To upload an edit, the client sends the new list; the server answers with the hashes it does not already have; the client uploads only those. To download, a device compares the new list with the chunks it already holds and fetches only the missing ones. An edit that changes one chunk of a 20 MB file now moves 4 MB, not 20, in each direction. The same mechanism deduplicates: a chunk that appears in many versions or files is stored once.

**2. Take our servers out of the byte path.** The app server's job becomes metadata only. For each chunk to upload or download it hands the device a presigned URL, and the device talks to object storage directly. Storage is built to serve many large transfers at once; our app servers are not, and every byte through them cost a worker and a share of a 1 Gbps card.

At the same 2,000 requests a second, nothing fails. The app servers' cards are under 1% busy. A chunk download takes a median of about 0.4 seconds (0.32 at the device's speed, plus the trip to storage). We send about 400 MB a second, about $130 an hour of egress, for five times as many downloads as the naive design served for $115 at 400 a second. The machines cost under $1.20 an hour: almost the whole bill is bytes.
[▶ Chunks, straight from storage](play:chunks: 2,000@t=8)

**3. See what polling costs.** Most requests are still polls: every device asks "anything new?" every few seconds, and almost every answer is "no". Polls grow with devices, not with edits. With five times the devices there are about 9,000 polls a second, and the metadata database is 100% busy. Edits fail with them (more than 15% of commits fail), since they need the same database; downloads, which never touch our servers now, are unaffected.
[▶ Broken: five times the devices, still polling](play:broken: five times the devices@t=4)

**4. Tell devices when something changed.** Each online device keeps one connection open to a push gateway. When an edit is committed, the app puts one notification on a queue for each of the owner's other online devices (one on average here), and the gateway sends it down that device's connection. Only then does the device ask the metadata service what changed, and download what it lacks. The 9,000 polls a second become 500 lookups a second: one per notification.

With the same five-times-larger fleet and the same edits and downloads (500 of each a second), there are about 1,500 requests a second, nothing fails, and the metadata database is about 25% busy. The gateway sends about 500 notifications a second.
[▶ Notify devices instead of polling](play:notify: the same devices@t=8)

## Why it works now

Each stage matched a cost to the thing that causes it. Bytes were moving in proportion to file size; chunking made them move in proportion to what changed. Bytes were moving through machines built for requests; presigned URLs moved them through a service built for bytes. Metadata reads were growing with the number of devices; notifications made them grow with the number of edits. The naive design's cards were full while its CPUs idled:
[▶ Broken: full cards, idle CPUs](play:broken: whole files at 2,000 a second@t=6)
and in the final design the database that polls filled is a quarter busy with five times the devices.
[▶ Notifications](play:notify: the same devices@t=6)

## What it costs

- Egress is the bill. At 500 chunk downloads a second it is about $640 an hour, over 99% of the total. The machines are a rounding error. (List prices drop at higher volumes, but bytes stay the dominant cost.) This is why large sync and storage companies care so much about not sending a byte twice, and why some eventually run their own storage.
- A smarter client: splitting, hashing, comparing chunk lists, reassembling files, resuming interrupted transfers. Bugs there corrupt user files, so the client must verify every chunk's hash after download.
- Fixed-size chunks only help when an edit changes bytes in place or appends. Inserting one byte at the start of a file shifts every chunk boundary, so every chunk's hash changes and the whole file moves again. Content-defined chunking (cutting where a rolling hash of the bytes hits a pattern, as LBFS, restic and borg do) keeps most boundaries in place after an insert, at the cost of variable chunk sizes. rsync solves the same insert problem differently, with a rolling checksum that finds matching fixed-size blocks at any offset.
- Deduplication across different users leaks information: if uploading a chunk is skipped because "we already have it", an attacker can test whether anyone stores a given file. So systems often deduplicate only within one account.
- A push gateway holds one open connection per online device: millions of mostly idle connections. That costs memory and needs reconnection logic, and a notification can be lost while a device reconnects. Devices should still poll, rarely (every few minutes), as a safety net.
- Chunks are immutable and shared between versions, so deleting a file cannot delete its chunks at once. A garbage collector later removes chunks no version references.

## Staff notes

- Draw the byte path and the metadata path separately in every design review. They have different sizes, rates, consistency needs and costs.
- Price the design in GB moved before pricing machines. A 5x cut in bytes per edit is worth more than any server optimization here.
- Metadata is where correctness lives: committing a new version should be one transaction that checks the version it is based on, so two devices editing the same file produce a detected conflict, not a silent overwrite. Most products keep both copies ("conflicted copy") and let the person choose.
- The notification only says "something changed". The device then reads the truth from the metadata service with its cursor. A lost, late or duplicated notification therefore costs freshness, never correctness.

## Check yourself

- **Q:** At 2,000 a second the naive app servers' CPUs are under 5% busy. What is full, and why do 1 ms polls fail?
  A: The network cards: 2 GB a second of downloads against 0.5 GB a second of capacity. Each download holds a worker until it is sent, so polls find no free worker. [▶ Show it](play:broken: whole files at 2,000 a second@t=8)
- **Q:** The naive design paid about $115 an hour of egress for about 20 downloads a second. What lets 100 a second cost only about $130?
  A: Only chunking cuts the bill: each download is the 4 MB chunk that changed instead of the 20 MB file, so five times the downloads cost about the same. Sending from object storage costs the same per GB; what it does is keep the app servers' network cards and workers free. [▶ Show it](play:chunks: 2,000@t=8)
- **Q:** With five times the devices, the metadata database is full, but edits have not grown much. What filled it?
  A: Polls: about 9,000 a second, nearly all answered "nothing new". Polls grow with devices, not with edits. [▶ Show it](play:broken: five times the devices@t=4)
- **Q:** A push notification is lost. What does the device miss, and for how long?
  A: Nothing permanently: the notification only says "ask". The device's next lookup with its cursor returns every change since, whether it was triggered by a later notification or the rare safety-net poll. [▶ Show it](play:notify: the same devices@t=8)
