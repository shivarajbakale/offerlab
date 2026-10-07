# Leases and fencing tokens

## What it is

- **What it is:** A lease is a lock that expires unless its holder keeps renewing it. A fencing token is a number, bigger with every grant of the lock, that the holder sends with each write so the protected storage can refuse writes from an older holder.
- **The problem it solves:** A worker holding a plain lock can crash and never release it, so everyone else waits forever, and a worker that pauses can wake up still believing it holds an expired lock and overwrite the new holder's data. Leases free the lock on their own; fencing tokens make a stale holder's late writes harmless.
- **Reach for it when:** Exactly one process may do a job at a time, such as acting as leader, running a scheduled job or writing a shared file or row, and two processes doing it at once would corrupt data.
- **Not the right tool when:** Doing the work twice is only wasteful, not harmful; a lease alone, even a simple Redis lock, is enough. If the protected resource can't check tokens, fencing can't protect it, so make the operation safe to repeat. To choose a leader among your own servers, use [Raft leader election](#/sd-05-replication/020-raft-leader-election).
- **Where you'll meet it:** Google's Chubby paper describes leases, sequencers and lock-delay. With ZooKeeper, a zxid or znode version can serve as the token. Kleppmann's 2016 critique of Redlock and Sanfilippo's reply are the classic debate, and a Raft term acts as a fencing token. Interview: "Design a distributed lock".

## In plain words

Some jobs must be done by exactly one worker at a time, like writing to one shared file. The usual answer is a lock: whoever holds it does the job. But a worker can crash while holding the lock, and then nobody can ever get it back. Worse, a worker can freeze for a while without knowing, wake up, and keep writing as if it still had the lock, after someone else has taken over. Two writers at once means corrupted or lost data for the user.

Think of a hotel key card that stops working at checkout time. If a guest vanishes, the room frees itself when the card expires; that is a lease. And each new guest's card has a higher number. The door lock remembers the highest number it has seen and refuses any lower one, so an old guest who wanders back with an expired card can't get in, even if they honestly believe it is still their room. That number is the fencing token, and the door, not the guest, does the checking.

In the picture on the right, the four parts sit on a circle: the lock service, the storage, and two workers, w1 and w2, each with its id inside. Under each one, in words, is its role and what it holds right now: who has the lock and with which token, when the lease ends, what the storage has saved, or that a worker is frozen. Dots on the lines are messages on their way (Acquire, Granted, Renew, Write, Rejected). The client box in the top-left corner stands for whatever freezes w1 in the pause scenarios. The box at the top says what just happened, in red when something goes wrong. The table below shows each part's raw state, and the log at the bottom lists every event.

## Words we'll use

- **Worker** — a process that wants to do a job that only one process may do at a time, here writing to shared storage. There are two: w1 and w2.
- **Storage** — the shared thing being protected, such as a file or a database row. Here it holds one value.
- **Lock** — permission to do the job. Whoever has it is the **holder**. A **lock service** is a separate server that hands the lock out, so only one worker gets it at a time.
- **Tick** — one unit of simulated time. Messages here take exactly 1 tick to arrive.
- **Crash** — a process stops. Its memory is lost, and it sends nothing more.
- **Pause** — a process stops running for a while without crashing, then carries on from exactly where it was. A long **garbage collection** (the language runtime stopping the program to free memory) or a stalled virtual machine does this. Nothing warns the process when it resumes: the line it was about to run just runs. Only a later line that reads the clock can notice how much time went by.
- **Lease** — a lock that is only valid until an **expiry** time. The holder **renews** it (asks for more time) before then, or loses it.
- **Stale** — out of date. A stale holder is one that still believes it holds the lock after someone else has been given it.
- **Fencing token** — a number handed out with every grant of the lock. Each grant gets a bigger number than the one before, so the numbers only go up (they are **monotonically increasing**).

## The world we're in

- Workers crash, and workers pause. From the outside, a paused worker looks exactly like a crashed one, until it wakes up.
- Messages take time to arrive.
- Each process has its own clock and can measure how much time passes. But a process can be paused at any line of its code, so "I checked my lease a moment ago" may be much older than it seems.
- Processes are honest. A stale holder is not malicious; it just doesn't know.

## The goal

At most one worker's writes take effect at a time. If the holder crashes, another worker takes over on its own. If a stale holder wakes up and writes, that write does no harm.

## The naive attempt

"A worker asks the lock service for the lock, keeps it while it works, and gives it back when done."

That works until the holder crashes. A crashed worker never gives the lock back, and the lock service can't tell a crashed holder from a busy one. Everyone else waits forever.
[▶ Broken: w1 crashes at t=20 holding the lock, and w2 is told "busy" for the rest of time](play:broken: lock without a lease@t=20)

## Building it up

**1. Grant a lease, not a lock.** The lock service gives the lock for a fixed time, here 10 ticks, and writes down when it expires. When that time passes without a renewal, the lock is free again, whatever happened to the holder. A crashed worker stops renewing, so its lease runs out on its own.
[▶ w1 crashes at t=20. Its last renewal was already on the wire, so the lock service extends the lease to t=30](play:expiry@t=20)
[▶ At t=30 the lease runs out and w2 asks again; at t=31 the lock service grants it token 2](play:expiry@t=31)
The price is waiting: nobody can take over until the lease ends, even though w1 died at t=20.

**2. Renew well before the lease ends.** A healthy holder must not lose its lease just because it has been working for a while. w1 renews every 4 ticks, well inside the 10-tick lease, so one slow renewal doesn't cost it the lock. Meanwhile w2 keeps asking and keeps being told "busy".
[▶ w1 renews at t=7 and the lock service moves its expiry to t=18](play:renewal@t=7)
The worker also keeps its own estimate of when its lease ends. It counts from when it *asked*, not from when the answer arrived. The lock service started its clock somewhere in between, so the worker's estimate (t=11) can only be earlier than the real expiry (t=12), never later.
[▶ The lock service grants until t=12; w1 treats it as good until t=11](play:renewal@t=2)

**3. The problem a lease can't solve: a holder that pauses.** A careful worker checks "is my lease still valid?" before each write. But checking and writing are two separate moments, and a pause can fall between them. Here w1 checks at t=9 (by its own estimate the lease is good until t=11), starts preparing its write, and freezes at t=10.
[▶ w1 checks its lease at t=9, then freezes at t=10 with its write unsent](play:fencing@t=9)
While w1 is frozen it sends no renewals, so its lease ends at t=18 and w2 gets the lock with token 2. That is correct: from the outside, w1 looks dead.
[▶ The lease runs out at t=18 and w2 is granted token 2](play:fencing@t=18)
At t=40 w1 wakes up and carries on from the line where it froze: sending the write it had prepared. That line doesn't read the clock; the lease check was earlier. So the write goes out first. Only afterwards does w1's next round of work read its clock, see that its lease ended at t=17, and stop, too late for the write already sent. If the storage takes that write, w1's old data replaces w2's newer data.
[▶ Broken: storage takes w1's stale write at t=41 and overwrites w2's data](play:broken: lease without a fencing token@t=41)
Checking the lease again just before sending only shrinks the gap. The pause can land right after the second check, or the write can sit in a slow network. The holder can never be sure its lease is still valid at the moment its write lands.

**4. Fencing tokens, checked by the storage.** Every grant carries a fencing token, one bigger than the last. Workers send their token with every write. The storage remembers the biggest token it has accepted, and rejects any write with a smaller one. w2 wrote with token 2, so when w1's write arrives with token 1, the storage knows it comes from a replaced holder and turns it away.
[▶ Storage rejects w1's write with token 1 at t=41](play:fencing@t=41)
A rejection is also how a stale holder can learn it was replaced. In this run w1 already found out on waking, when it next checked its own clock, and the lock service refused its renewal too. Either way, it stops and goes back to asking for the lock.
[▶ w1 gets "lost" and "rejected", and asks for the lock again](play:fencing@t=42)

## Why it works now

- **Nobody holds the lock forever.** A holder that crashes, pauses or is cut off stops renewing, and its lease ends on its own.
- **A stale holder can't do damage.** The lock service hands out tokens in increasing order, so the newest holder always has the biggest token. Once storage has accepted the new holder's token, every older token is refused, however late its write arrives.
- **Safety doesn't depend on the worker knowing the truth.** w1 did notice it had lost the lease, but only at its next check, after its prepared write was already on the wire. The storage made the decision, using only numbers it had seen.
- The visualizer checks after every event that the storage never holds a write with an older token than one it has already accepted. It holds when the storage checks tokens [▶ see it hold](play:fencing@t=41), and breaks the moment it doesn't [▶ see it break](play:broken: lease without a fencing token@t=41).

## What it costs

- **Waiting on failover.** After a holder dies, nobody can work until its lease runs out. A shorter lease fails over faster, but a holder whose renewals are a little slow loses the lock it was using correctly.
- **Renewal traffic.** Every holder sends a renewal every few ticks for as long as it holds the lock.
- **The resource must cooperate.** Fencing works only if the storage stores the biggest token and checks it on every write. A resource that can't do this, such as a third-party API that knows nothing about your tokens, is not protected by them. (Chubby's lock-delay, in the Staff notes, is a partial answer.)
- **Two holders can still both believe they hold the lock.** Between t=20 and t=40 in the fencing run, w1 and w2 both think so. Leases make that window end; tokens make it harmless. Nothing makes it impossible.

## Staff notes

- **Clocks.** The worker should measure its lease as a duration on its own clock, starting when it sent the request. Then the two clocks only need to tick at about the same rate, not to agree on the time. A lease based on comparing timestamps from two machines also needs their clocks to agree, and they drift.
- **Leases give availability; tokens give safety.** A lease makes sure no lock is held forever. It cannot, by itself, stop a stale holder from acting. Don't let a design rely on "the holder will notice its lease ended".
- **Real lock services.** Google's Chubby can give a lock holder a *sequencer* to pass to servers, which check it, much like a fencing token. With ZooKeeper, a number that only grows, such as the transaction ID (zxid) of the lock's creation or a znode version, can serve as the token.
- **The Redis lock debate.** In 2016 Martin Kleppmann argued that Redlock, a lock algorithm built on several Redis servers, is unsafe for correctness: it hands out no fencing token, and it relies on timing assumptions such as bounded pauses and clock drift. Redis's author, Salvatore Sanfilippo, published a reply disagreeing. A fair summary: a lock without a fencing token is fine to avoid doing the same work twice, and not enough when a stale holder could corrupt data.
- **When the resource can't check tokens.** Chubby adds a **lock-delay** for this case: when a holder fails or stops responding without releasing the lock, the lock service refuses to grant that lock to anyone for a set time (up to a minute). That gives a stale holder's late requests time to drain before the next holder starts. It relies on timing, so it makes damage less likely rather than impossible.
- **Back to failover.** In lesson 017, failover needs the old leader *fenced*: it may wake up still thinking it leads. In lesson 020, a leader cut off by a partition keeps believing it leads until it hears a bigger term. A Raft term is a fencing token. Nodes reject messages from older terms, just as the storage here rejects older tokens.

## Check yourself

- **Q:** A worker holds a plain lock (no expiry) and crashes. What happens to everyone else?
  A: They wait forever. The lock service can't tell a crashed holder from a slow one, and a crashed holder never gives the lock back. [▶ See it](play:broken: lock without a lease@t=20)
- **Q:** w1 crashes at t=20. When can w2 take over, and why not straight away?
  A: Not until w1's lease ends at t=30. The lock service can't know w1 is dead, so it honours the lease it granted, including a renewal that arrived at t=20, as w1 crashed. The lock service grants it to w2 at t=31. [▶ See it](play:expiry@t=20)
- **Q:** w1 checked its lease and it was valid. Why isn't that enough to make its write safe?
  A: Because w1 paused between the check and the write. When it woke at t=40, the next line it ran sent the write, 22 ticks after its lease had ended. Its next clock check came after the write was already sent. [▶ See it](play:fencing@t=40)
- **Q:** Who has to check the fencing token, and what goes wrong if nobody does?
  A: The storage, because it is the only place that sees every write, including late ones. If it ignores tokens, the stale holder's write replaces newer data. [▶ See it](play:broken: lease without a fencing token@t=41)

## When to use which

- **Lease with fencing tokens** — when two holders at once would corrupt data and the protected resource can check a number on every write. Example: a nightly billing job that writes invoices, where the database row stores the highest token it has accepted, or a storage system that rejects writes from an old primary.
- **Lease alone (a plain timeout lock, no token)** — when doing the work twice is only wasteful, not harmful. Example: a cache-warming job or sending a "your report is ready" email that is fine to send twice in rare cases. A simple Redis lock with an expiry is enough. Don't use it to protect data: a paused holder can still write after its lease ends.
- **A lock with no expiry** — almost never across machines. A crashed holder keeps it forever, as the broken run shows. Only safe inside one process, where a crash takes the lock with it.
- **Consensus ([Raft leader election](#/sd-05-replication/020-raft-leader-election), or ZooKeeper and etcd, which run consensus inside)** — when your own servers must agree on one leader, or when the lock service itself must survive crashes. A Raft term is a fencing token: followers refuse messages from an older term. In practice you take leases from etcd or ZooKeeper rather than building the lock service yourself.
- **Make the operation safe to repeat** — when the resource can't check tokens at all, such as an outside payment API. Send an idempotency key, so a second identical request does nothing.
- **In an interview:** for "design a distributed lock", say: a lease from a consensus-backed service (etcd or ZooKeeper), renewed by the holder, plus a fencing token that the storage checks on every write. Mention that the holder's own clock check is not enough, because it can pause between the check and the write.

## Deep dive

- "Designing Data-Intensive Applications" (Martin Kleppmann, 1st edition), chapter 8, walks through this exact failure: a client pauses while holding a lease, and fencing tokens make the storage reject it.
- "The Chubby lock service for loosely-coupled distributed systems" (Mike Burrows, 2006) describes leases, sequencers and lock-delay in a production lock service.
- Martin Kleppmann, "How to do distributed locking" (2016), and Salvatore Sanfilippo's reply, "Is Redlock safe?", lay out both sides of the Redis lock debate.
