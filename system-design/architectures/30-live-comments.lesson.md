# Live comments

## What it is

- **What it is:** The chat that scrolls beside a live stream or a big match, where a million people watch one room at once and anyone can post a comment that the others see within a second or two.
- **What makes it hard:** Sending every comment to every viewer means hundreds of millions of messages a second, more than any fleet can write or any network card can carry. When a goal goes in, comments jump five times, and the one server that ranks a room's comments fills up.
- **Building blocks it uses:** open connections held by connection servers, as in [chat messaging](#/sd-architectures/12-chat-messaging), a room that sends one copy per connection server through [publish-subscribe](#/sd-low-level-design/06-pub-sub-event-bus), and batching and sampling so the work depends on viewers, not on how many people type.
- **Where you'll meet it:** "Design live comments for Facebook Live" or "Design Twitch chat" are common interview questions. Twitch chat has slow mode, and YouTube live chat offers a "Top chat" view that filters what is shown, the same idea as sending each viewer a ranked sample.

## Words we'll use

- **Room** — everything about one live event's chat: who is watching, and the comments. Here, one room: the final.
- **Viewer** — someone watching. Each keeps a **connection** open (a **WebSocket**: a network connection that stays open so the server can push messages at any time).
- **Connection server** — a server holding many viewers' connections. Here 20 of them, 50,000 viewers each.
- **Room server** — the server that owns a room's live state. Every comment for the room passes through it: filters, spam checks, ranking. Here a room has one room server; splitting a room means merging rankings across servers.
- **Fan-out** — copying one message to many receivers. The **fan-out cost** is messages × receivers.
- **Batch** — several comments sent together in one message.
- **Sample** — a chosen subset. Here, at most 10 comments a second are shown to each viewer, picked by the room's ranking.
- **Bandwidth** — how many bits a second a network card can send. Here each connection server has a 10 Gbps card: 1.25 GB a second.
- **In flight** — started but not finished. **Little's law**: things in flight = arrivals a second × seconds each one takes. So if 100 batches start a second and 700 are in flight, each takes about 7 s.
- **Load shedding** — on purpose not doing some work, so the work that matters still gets done.

## The world we're in

- A million viewers, 50,000 on each of 20 connection servers with 8 cores each.
- Viewers post 500 comments a second on a normal minute, 2,500 a second for a while after a goal.
- A comment is about 200 bytes.
- Writing one message to one viewer's socket costs a connection server about 2 µs of CPU. So one message for all its 50,000 viewers costs about 100 ms.
- The room server spends 2 ms on each comment (filters, ranking) on 4 cores: at most about 2,000 a second.
- A human can read a few comments a second at most. Comments in a huge room scroll by as a blur.

## The goal

Every viewer sees the room's comments scroll by within a second or two, posting a comment never fails, and a goal does not knock anything over.

## The naive attempt

"When a comment arrives, send it to every viewer."

The room server hands each comment to all 20 connection servers, and each writes it to its 50,000 viewers. That is 500 comments × 20 servers × 100 ms = 1,000 cores' worth of work a second, and there are 160 cores. The connection servers are 100% busy. Posting still works, because the API only hands the comment on, so nobody sees an error. But deliveries fall behind: comments reach viewers over 2 s late after 5 s, over 5 s late after 8 s, and over 50,000 deliveries are waiting.
[▶ Broken: every comment to every viewer](play:broken: every comment to every viewer@t=8)

Count the messages: 500 comments × 1,000,000 viewers = 500 million socket writes a second. Each write is cheap; there are just too many.

## Building it up

**1. Batch.** A viewer does not need each comment the instant it is posted. So the room collects comments for 200 ms and sends one batch per connection server, which writes one message to each viewer holding all of them. That is 5 messages a second per viewer, whatever the comment rate: the CPU work no longer grows with comments. The connection servers' CPUs fall under 10%.

But every comment is still sent. 100 comments per batch × 200 bytes × 5 a second is 100 KB a second per viewer; 50,000 viewers is about 40 Gbps per server, on a 10 Gbps card. The cards are full. Batches go out half-sent and pile up: about 360 in flight at once at 4 s, about 780 at 8 s, and still climbing. 100 start a second, so each now takes several seconds to reach viewers.
[▶ Broken: batches fill the network cards](play:broken: batches@t=8)
Across a million viewers that is 100 GB a second leaving the data centre. At $0.09 a GB, about $32,000 an hour. (The simulator counts these bytes on the cards but does not bill them, since it does not model each viewer.)

**2. Send a sample.** Nobody reads 500 comments a second. So decide what a viewer can use: at most 10 comments a second, 2 per batch. The room's ranking picks them, the same 2 for everyone: say verified accounts and replies from the streamer first, then random. To favour each viewer's friends, the room would send each connection server a larger candidate batch (say 20 per 200 ms, 4 KB per server, trivial) and let it pick 2 per viewer; that adds per-viewer CPU on machines you can add. Every other comment is kept (its author sees it, moderators can see it) but not broadcast.

Now each batch is 2 × 200 bytes per viewer: 2 KB a second per viewer, 100 MB a second per server. The connection servers are about 7% busy on CPU and about 8% on their cards, and batches go out with no wait. The room server is about 25% busy.
[▶ Send a sample](play:sample: 10 comments@t=8)
The delivery cost is now viewers × batches a second. It does not depend on the comment rate at all. Across a million viewers this is about 2 GB a second, about $650 an hour of egress at $0.09 a GB.

**3. A goal: sample before the room server too.** A goal goes in and comments jump to 2,500 a second. Delivery is fine: still 5 batches a second. But every comment still goes through the room server, which can rank about 2,000 a second. It is full. The comment API's workers all wait on it, about 18% of posts fail, and half of the posts that succeed take over 300 ms. The connection servers are under 10% busy: delivery is not the problem.
[▶ Broken: a goal fills the room server](play:broken: a goal@t=6)

The room only fills 10 slots a second. It does not need 2,500 candidates. So every comment is first saved to a comment store, spread over 8 machines by comment id (any room's comments spread evenly). Then only a random 10% go on to the room server as candidates for the broadcast: 250 a second for 10 slots. In the same goal, no post fails, posts take under 55 ms, all 2,500 a second are saved, and the room server is about 13% busy.
[▶ Sample before the room server](play:sample at intake@t=6)

The random sample is a simplification. A real system would keep the priority comments (the streamer's, verified accounts') out of the random cut, and might switch the sampling on only when the room is busy.

## Why it works now

The cost of fan-out is messages × receivers. The number of viewers is the product; you cannot cut it. So the design cuts messages: batching makes it a fixed number of messages per viewer per second, and sampling makes each message a fixed size. A room with ten times more comments now costs the same to deliver. Sampling at intake does the same for the room server: its work is set by the slots it fills, not by how many people type.
[▶ Broken: every comment to every viewer](play:broken: every comment to every viewer@t=6)
[▶ A sample in batches](play:sample: 10 comments@t=6)

## What it costs

- Most comments in a huge room are seen only by their author. That is the design, and the product must be honest about it (and users love seeing their own comment appear, so show it to them at once).
- Comments arrive up to one batch interval late (here 200 ms), and with per-viewer picks (friends first) different viewers see different samples.
- Ranking is product work: what counts as a "good" comment, and how to keep it fair and free of spam.
- The simulator simplifications: batch jobs are made per comment (sized for the normal comment rate), every comment is written to every server's viewers in one go, and egress to viewers is computed in the text, not billed by the simulator.
- Still not covered: viewers joining (a goal can also bring a rush of new connections), and moving viewers when a connection server dies (they all reconnect at once).

## Staff notes

- Set the display budget first: comments per second per viewer. Then derive batch size and interval, and the bandwidth: viewers × batches a second × batch bytes.
- Connection servers subscribe to the room once each, through a pub/sub layer, so the room server sends one copy per connection server, not one per viewer. The per-viewer copying happens on machines you can add.
- Small rooms need none of this. Switch to batching and sampling by room size: a 20-person room can get every comment, as it arrives.
- Slow mode (one message per user every N seconds) cuts the input. It is a product lever as well as a technical one: it changes the chat's culture too.
- A connection server that restarts drops 50,000 connections, and they all reconnect at once. Add random delay to reconnects, and spread them over servers.

## Check yourself

- **Q:** Posting never fails in the first design. What is broken?
  A: Deliveries. 500 comments × 1,000,000 viewers is far more socket writes than 160 cores can do, so comments reach viewers later and later. [▶ Show it](play:broken: every comment to every viewer@t=8)
- **Q:** Batching made the CPUs idle. Why are viewers still waiting?
  A: Every comment is still sent: 100 KB a second per viewer fills each 10 Gbps card, and batches go out half-sent. [▶ Show it](play:broken: batches@t=8)
- **Q:** After sampling, what does the delivery cost depend on?
  A: Viewers × batches a second × batch size. Not on the comment rate. [▶ Show it](play:sample: 10 comments@t=8)
- **Q:** On a goal, delivery is fine, yet posts fail. Where, and what fixes it?
  A: The room server, which still ranks every comment. Save every comment, but send only a sample to the room as candidates. [▶ Show it](play:broken: a goal@t=6)
