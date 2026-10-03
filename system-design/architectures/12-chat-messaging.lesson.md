# Chat messaging

## What it is

- **What it is:** The backend of an app like WhatsApp or Slack: people send short messages to one person or a group, and every member should see them within a second if online, or as soon as they come back if not.
- **What makes it hard:** Millions of phones must hold an open connection so the server can push to them, one message to a big group becomes thousands of deliveries, and every member must see a conversation's messages in the same order even when they are sent at the same moment from different phones.
- **Building blocks it uses:** a durable store written before anything is delivered (the idea behind a [write-ahead log](#/sd-03-storage/008-write-ahead-log)), a queue that fans each message out to recipients ([Kafka partitions and consumer groups](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups)), retried deliveries made safe by sequence numbers, so a phone that gets a message twice keeps one (the [idempotent consumer](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer) idea), and random delays on reconnects ([jitter](#/sd-04-traffic/015-retry-backoff-jitter)) so phones dropped by a dead gateway do not all return in the same second.
- **Where you'll meet it:** "Design WhatsApp" or "Design Slack" is one of the most common design interview questions. The same push-over-open-connections shape runs live comments, multiplayer presence and collaborative editors.

## Words we'll use

- **Message** — one piece of text one person sends into a **conversation**: a one-to-one chat, or a **group** with many members.
- **Send** — the phone asking our servers to store a new message. It is a **write**: it changes stored data.
- **Delivery** — getting a stored message onto every other member's phone. A **recipient** is one member who should get it.
- **Online / offline** — a phone is online when it has a live network connection to us, offline when it has none (switched off, in a tunnel, or the app was closed by the phone to save battery).
- **Poll** — the phone asking "anything new for me?" on a timer, whether or not anything is new.
- **Persistent connection** — a network connection the phone opens once and keeps open, so the server can send to the phone at any moment. A **WebSocket** is the common way to do this from apps and browsers.
- **Gateway** — a server whose job is to hold many phones' open connections and pass messages down them.
- **Push** — the server sending something down an open connection without being asked. A **push service** (Apple's APNs, Google's FCM) is the phone maker's own channel for waking a phone that is not connected to us.
- **Queue** — a list of jobs waiting to be done. A **consumer** is a worker that takes jobs off it and does them. The **backlog** is how many are waiting; the **oldest job's age** is how long the unluckiest one has waited.
- **Fan-out** — one event becoming many jobs: one message becoming one delivery job per recipient.
- **Sequence number** — a number that goes up by one for each message in a conversation: 1, 2, 3. It defines the order.
- **Latency** — how long one request takes, from sending it to the answer arriving. **p50** is the middle one (half were faster).
- **Utilization** (busy) — the share of time a machine's cores are working. 100% means no spare capacity.
- **Error** — a request that failed: turned away because every worker and waiting slot was full, or given up on after 1 second.

## The world we're in

- 10,000 people are online at once. Together they send 1,000 messages a second.
- Most conversations are one-to-one; some are small groups. A message has 2 recipients on average: 1.5 of them online, 0.5 offline.
- People also open conversations and load the latest messages: 250 of those a second.
- One database stores the messages, each in its conversation. It has 8 cores; storing a message or loading a conversation's latest 50 costs 2 ms of CPU. That is about 4,000 operations a second.
- Phones are 1 ms from our servers here, so every latency below is time spent inside our systems.
- Messages must not be lost. Online recipients should see a message within a fraction of a second. Every member must see a conversation's messages in the same order.

## The goal

Store each message once, get it to every online recipient at once and to every offline one later, keep conversations in order, and survive the group with 2,000 members.

## The naive attempt

"Phones ask for new messages every 2 seconds."

10,000 phones polling every 2 seconds is 5,000 polls a second, on top of the 1,000 sends. Most polls find nothing. A person gets 1,000 × 2 / 10,000 = 0.2 messages a second on average, so a 2-second window holds 0.4 messages, and the chance that it holds none is e^(−0.4) ≈ 67% (counting arrivals as random). Two polls in three do a database lookup for nothing.

The lookups add up. At 1.5 ms each, the 5,000 polls need 7.5 cores, and the 1,000 sends need 2 more: 9.5 cores' work for 8 cores. The database is at 100%. Sends wait in the same line as polls: about 15% of them fail, and the ones that succeed take about 120 ms. The API servers in front are under 25% busy. They are not the problem.
[▶ Broken: polling fills the database](play:broken: polling@t=8)

Polling less often (every 10 s) cuts the load by 5 but makes a message wait 5 s on average before anyone sees it. Polling trades load for delay. It cannot be cheap and fast at once.

## Building it up

**1. Keep a connection open and push.** Each phone opens one WebSocket to a **gateway** server and keeps it open. Now the server can tell the phone about a message the moment it exists, and an idle phone costs no database work at all.

A send now goes like this. The phone sends the message over its connection. The gateway stores it once in the conversation (2 ms of database time). Then it puts one **delivery job** per online recipient on a queue, and one **push job** per offline recipient on another, and answers the sender. Consumers take each delivery job, look up which gateway holds the recipient's connection (a **presence registry**: a map from user to gateway, kept in memory), and hand the message to that gateway, which writes it down the connection. Push jobs ask APNs or FCM to wake the phone; when it reconnects it loads what it missed from the database.

The sender's answer comes in about 10 ms. 1,000 messages a second become 1,500 deliveries and 500 phone notifications. The database is under 40% busy, the gateways about 13%, and the delivery consumers under 15%. The oldest delivery job is never more than a few ms old: nothing waits.
[▶ Push through a queue](play:push: a send@t=8)

Why a queue, rather than the gateway pushing directly? Because the message is already stored when the jobs are queued. If a recipient's gateway is slow or restarting, the job fails and the queue hands it out again later; the sender does not wait and nothing is lost. Delivery is a separate step that can be retried.

**2. Keep the order.** Two messages sent a millisecond apart in one group can take different paths: different consumers, different gateways. They may arrive at a phone in the wrong order. So order must not come from arrival time. Give each conversation a **sequence number**: the database assigns 1, 2, 3, ... as it stores each message (one place decides, so there is one order). Phones sort by it. If a phone has 41 and then receives 43, it knows 42 is missing and asks for it. Each phone also remembers the last number it saw per conversation, so after being offline it asks "everything after 41" and catches up.

Some queues keep order for you within a **partition** (Kafka keeps order within each partition, so all of one conversation's jobs can go to one partition by its id). That keeps jobs in order, but phones still need the sequence numbers: retries and reconnections reorder things anyway. The simulator does not model order; this step is described, not simulated.

**3. See what a big group does.** Now 1% of messages go to one group of 2,000 members, all online. Each of those messages makes 2,000 delivery jobs. The average message makes 0.99 × 1.5 + 0.01 × 2,000 = 21.5 jobs instead of 1.5: the big group is 93% of all delivery work.

The senders see nothing wrong: every send is still answered at once. But the 40 delivery consumers are 100% busy, and every delivery waits in one line, the one-to-one chats included. The oldest waiting job is about 2.5 seconds old at 5 s and about 5 seconds old at 10 s, and the backlog is over 80,000 jobs and growing. A one-to-one message now takes seconds to arrive because a big group is busy.
[▶ Broken: a big group stalls everyone's deliveries](play:broken: a 2,000-member group — every@t=10)

The simulator spreads each big-group message's 2,000 jobs evenly over all messages (21 or 22 jobs each). Real traffic is burstier: 2,000 jobs land at once, then nothing. That is worse for the messages queued just behind them.

Doubling the consumers to 80 lets the queue keep up again. But each push still costs the gateways CPU: they go from 13% to about 70% busy, just for this one group, and the delivery consumers are over 90% busy. More consumers buy time; they do not remove the work.
[▶ Broken: 80 consumers keep up, the gateways pay](play:broken: a 2,000-member group — 80@t=8)

**4. Give big groups their own path, fanned out per gateway.** Two changes.

- **Isolation.** A big group's messages go on their own queue with their own consumers. However busy it gets, one-to-one deliveries never wait behind it.
- **Fan out per gateway, not per member.** There are only 4 gateways. A big group's message makes one job per gateway. That gateway knows which of its own connections belong to the group (it can keep that list as members connect) and writes the message to each of them locally. Instead of 2,000 jobs and 2,000 registry lookups, the message costs 4 jobs.

With the same big group, the group queue gets about 40 jobs a second (1% of 1,000 messages × 4 gateways), the regular queue stays at 1,500, the gateways stay under 20% busy (not counting their local socket writes; see below) and no queue's oldest job is more than a few ms old. The whole design costs about $1.40 to $1.60 an hour.
[▶ Big groups on their own queue, one job per gateway](play:per gateway@t=8)

The simulator models each per-gateway job as 20 ms of consumer time and one push. Our 0.5 ms per push is the cost of receiving and handling one delivery request from a consumer (decode it, look up the socket, write). A real gateway still writes the message to its 500 or so local members: a loop over open sockets in one process is far cheaper per member than 500 separate requests, but it is not zero. What per-gateway fan-out removes is 2,000 queue jobs, 2,000 registry lookups and 2,000 consumer-to-gateway requests per message, not the 2,000 socket writes.

## Why it works now

Polling made every online phone cost database work every 2 seconds, whether or not anything had happened.
[▶ Broken: polling](play:broken: polling@t=8)
Push makes the work proportional to the messages, not to the number of people waiting for them: a message is stored once and then delivered to exactly its recipients. Delivery is its own retryable step on a queue, so the sender is answered in about 10 ms whatever the recipients are doing.
[▶ Push](play:push: a send@t=8)
The cost of a message is its fan-out. A few huge groups can be most of the fan-out, so they get their own queue (isolation) and a cheaper fan-out (one job per gateway).
[▶ Per-gateway fan-out](play:per gateway@t=8)

## What it costs

- Gateways hold state: thousands of open connections each. Losing one drops all of those phones at once. They reconnect to another gateway and catch up from their last sequence number, which is a burst of reads, so reconnection needs a random delay (jitter) so phones do not all return in the same second.
- A presence registry to keep correct: which user is connected to which gateway. When it is wrong, a push goes to the wrong gateway and must fall back to "offline".
- The delivery queue's oldest-job age is now how late messages are. Someone must alert on it.
- Order is per conversation only. A global order across conversations would need one place to number every message, which would be a bottleneck, and nobody needs it.
- Push services (APNs, FCM) are outside your control. They can delay or collapse notifications, so the phone must always resync from the database instead of trusting notifications to carry every message.
- Not simulated here: the order of messages (step 2), the gateways' own per-socket writes in step 4, and gateway failures. The simulator's costs are a rough guide only.

## Staff notes

- Write the message once, durably, before acknowledging the sender. Everything after that (delivery, push, read receipts) can be retried, and every one of those must be safe to repeat: a phone that gets message 42 twice keeps one, because it has the sequence number.
- Fan-out on write (a job per recipient) is right for small conversations. For very large groups and channels, fan out per gateway or let members' phones pull ("there are new messages in #general") instead. The threshold is a product decision as much as a technical one.
- Show the sender "sent" when the message is stored, "delivered" when a recipient's phone acknowledges it, and "read" when they open it. Each is another small message flowing back.
- Size gateways by open connections and memory, not by requests a second. Idle connections cost memory and a little CPU for keep-alive pings.
- End-to-end encryption (as in WhatsApp and Signal) means the server stores and forwards ciphertext it cannot read. Group messages then need keys shared among members (with Signal's Sender Keys a message is encrypted once), so each membership change in a big group means redistributing keys to every member.

## Check yourself

- **Q:** With polling, why do sends fail when it is the polls that are wasteful?
  A: Polls and sends share one database. 5,000 polls a second fill it, so sends wait in the same line: about 15% fail. [▶ Show it](play:broken: polling@t=8)
- **Q:** How long does the sender wait in the push design, and why does it not depend on the recipients?
  A: About 10 ms: store once, queue the jobs, answer. Delivery happens afterwards from the queue. [▶ Show it](play:push: a send@t=8)
- **Q:** A big group sends 1% of messages. Why do one-to-one chats get slow?
  A: That 1% makes 93% of all delivery jobs, and everyone's jobs share one queue. The oldest job reaches about 5 s old. [▶ Show it](play:broken: a 2,000-member group — every@t=10)
- **Q:** Doubling the consumers fixes the delay. Why is it not the real fix?
  A: More consumers move the bottleneck to the gateways' per-request work: they go from 13% to about 70% busy for one group. Per-gateway fan-out turns 2,000 requests into 4; the gateways still write 2,000 sockets, but in a local loop that costs much less per member. [▶ Show it](play:broken: a 2,000-member group — 80@t=8)
- **Q:** Why does each phone sort by sequence number instead of arrival time?
  A: Messages take different consumers and gateways, and retries reorder them. One place numbers each conversation's messages, so every phone can sort and spot gaps. (Ordering is described, not simulated.) [▶ Show it](play:push: a send@t=8)
