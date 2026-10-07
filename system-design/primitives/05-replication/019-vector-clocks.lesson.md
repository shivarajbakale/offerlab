# Vector clocks

## What it is

- **What it is:** A small table of counters, one per replica, stored with each value. It records which writes the value's writer had already seen, so the system can tell whether one version replaced another or the two were written without either knowing about the other.
- **The problem it solves:** When copies of the same data accept writes in different places, "keep the latest" silently throws writes away, because arrival order is arbitrary and machine clocks drift. Vector clocks detect when two writes were concurrent, so both are kept and merged instead of one being lost.
- **Reach for it when:** Any replica accepts writes, as in leaderless or multi-region stores, and losing a confirmed update, such as an item added to a cart, is not acceptable. Also when an interviewer asks how two conflicting versions are detected.
- **Not the right tool when:** Losing one of two simultaneous updates is fine, as for a cache entry or a "last seen" time; last-write-wins timestamps are simpler. With a single [leader](#/sd-05-replication/017-leader-follower-replication) ordering all writes, there are no concurrent versions to detect. Data types with a built-in merge (CRDTs) resolve conflicts on their own.
- **Where you'll meet it:** Lamport's 1978 paper defines happened-before. Amazon's Dynamo paper used vector clocks for its shopping cart. Riak returns conflicting values as siblings and later added dotted version vectors; Cassandra chose last-write-wins timestamps instead. Kleppmann's DDIA, chapter 5, walks through the cart example.

## In plain words

Picture a shared shopping list kept on three phones that sync now and then. You add milk on your phone while your partner, offline, adds eggs on theirs. When the phones sync, which list is "right"? Neither: you each changed the list without seeing the other's change, so the honest answer is to keep both and merge them. But if your partner had first looked at the list with milk on it and then added eggs, their list simply replaces yours. The question is always "had this writer seen that change?", and a clock on the wall can't answer it.

A vector clock answers it. Every write gets a name, such as n1:1 (the first write that went through n1), and remembers which other writes its writer had read. If a new write's memory includes an old write's name, it may replace it. If neither includes the other, both are kept side by side as siblings until someone reads both and writes a merge.

In the picture on the right, the three copies n1, n2 and n3 sit on a circle. Under each one is what it holds right now, in words: one value and its clock, or several siblings waiting for a merge. The client box is in the top-left corner. Dots on the lines are messages: Write and Read from the client, and Sync, the regular gossip in which each copy sends what it holds to the others. The box at the top says what just happened, green when both writes were safely kept and red when a write was thrown away. Below the circle is the raw state of every copy, and under that, a log of every event.

## Words we'll use

- **Replica** — one copy of the data, on its own server. Here there are three: n1, n2 and n3.
- **Client** — the program that reads and writes, such as a shopping app.
- **Write** — a client asking a replica to store a new value. The replica answers with an **ack**: "stored".
- **Gossip** — every few ticks (the simulation's unit of time), each replica sends the others what it holds, so a write made on one replica spreads to all of them.
- **Wall clock** — a machine's own idea of the time of day. Every machine has its own, and they drift apart.
- **Happened before** — write A happened before write B if B's writer had already seen A when it wrote. Seeing A through a value that was built on A counts too.
- **Concurrent** — neither write happened before the other: each writer wrote without seeing the other's value. "Concurrent" says nothing about time; the two writes could be minutes apart.
- **Vector clock** — a small table with one counter per replica, such as `{n1:1, n2:1}`.
- **Dot** — the name of one write: the replica that took it, and that replica's count of the writes it has taken so far. `n1:2` is the second write that went through n1. No two writes share a dot.
- **Context** — the vector clock a client got back from its last read. It lists the writes the client had seen: `{n1:2}` means "the first 2 writes through n1". The client sends it with its next write.
- **Includes** — a context includes a dot if its counter for that replica is at least the dot's number. `{n1:2}` includes `n1:1` and `n1:2`, but not `n2:1`.
- **Covers** — clock A covers clock B if A's counter is at least as big as B's for every replica. People also say A **dominates** B.
- **Siblings** — two or more concurrent values a replica keeps side by side, because neither may replace the other.
- **Merge** — the client combining siblings into one value, such as joining two shopping carts.

## The world we're in

- Three replicas each hold a copy of one key: a shopping cart.
- Any replica accepts writes. No replica is in charge of the others. (Some systems pick one replica, called the leader, to put all writes in one order. This one doesn't, so the cart stays writable even when replicas can't reach each other.)
- Messages take time, and replicas only learn about each other's writes through gossip.
- There is no shared clock. Wall clocks drift apart, and clock sync (such as NTP) narrows the gap but never closes it.

## The goal

When two versions of the cart meet, a replica must decide: does one replace the other, or must both be kept? A write may replace another only if its writer saw it. An acknowledged write must never silently disappear.

## The naive attempt

"Keep whichever version arrived last."

Two clients put milk in the cart on n1 and eggs in the cart on n2, a tick apart. Neither saw the other. Both get an ack. Then gossip delivers milk to n2, which keeps the newer arrival and throws eggs away. From there milk spreads everywhere, and the eggs are gone for good. Nobody is told.
[▶ Broken: at t=4 n2 throws away eggs because milk arrived last](play:broken: last write wins by arrival@t=4)

"Then keep the version with the later wall-clock timestamp." That fails in two ways. First, the two writes above were concurrent, so any rule that keeps exactly one of them drops the other. Second, wall clocks drift, so "later" may be wrong even for writes that were in order. In this run n2's wall clock is 10 ticks behind n1's. A client reads milk from n2, then writes "milk, eggs" back to n2: a newer write that had seen milk. n2 stamps it 98, milk carries 101, and at t=8 n2 throws the newer write away.
[▶ Broken: n2's slow clock makes the newer "milk, eggs" lose to milk](play:broken: last write wins by timestamp@t=8)

The real question is not "which came later?" but "had this writer seen the other value?". That is the happened-before relation, and it is what we need to record.

## Building it up

**1. Name every write, and record what its writer had seen.** Each replica counts the writes it takes. When it takes a write, it gives it the next number as its dot, and stores the dot together with the context the client sent. The value's clock is the two together: the context, with the dot's counter added. Here a client with an empty context writes milk to n1. It is n1's first write, so milk gets dot `n1:1` and clock `{n1:1}`.
[▶ n1 gives milk dot n1:1 and clock {n1:1}](play:sequential@t=1)

**2. Replace a value only when the new writer had seen it.** If the new value's context includes the old value's dot, its writer read the old value and chose to change it, so the old one can go. Here a client reads milk from n2 and gets the context `{n1:1}`. It writes "milk, eggs" back to n2 with that context. n2 gives it dot `n2:1`. Its context `{n1:1}` includes milk's dot `n1:1`, so "milk, eggs" replaces milk.
[▶ The client reads milk with context {n1:1}](play:sequential@t=6)
[▶ n2 replaces milk with "milk, eggs"](play:sequential@t=8)
[▶ Gossip carries the replacement to n1 and n3](play:sequential@t=12)

**3. Keep both when neither writer had seen the other.** Milk has dot `n1:1` and an empty context. Eggs has dot `n2:1` and an empty context. Neither context includes the other's dot, so the writes are concurrent. The replica keeps both as siblings. This is the fix for the naive attempt, where one of them was thrown away.
[▶ n2 keeps milk next to eggs as siblings](play:concurrent@t=4)
[▶ Broken: keeping only the last arrival loses eggs](play:broken: last write wins by arrival@t=4)

**4. The client's context, not the replica's, goes into the version.** The context must say what the writer saw, and only the client knows that. In this run a client reads n2 at t=2, before milk has arrived, so it sees an empty cart and gets an empty context. By the time it writes eggs at t=6, n2 has milk. Because n2 stores the client's empty context, eggs does not include milk's dot, so both are kept.
[▶ The client reads an empty cart at t=2](play:stale read@t=2)
[▶ At t=6 eggs becomes a sibling of milk](play:stale read@t=6)
If n2 fills in the context with everything it holds instead, eggs gets the context `{n1:1}`. That context claims the writer saw milk, which it never did, so milk is replaced and lost. The checker trusts what the client actually sent, not the replica's clock, so it catches the loss.
[▶ Broken: n2's own clock wipes out milk](play:broken: server's clock@t=6)

**5. The client merges siblings with a write.** A read returns every sibling, plus one context that covers all of their clocks. The client combines them (here, joining the carts) and writes the result with that context. The new context includes both siblings' dots, so the merged value replaces them everywhere.
[▶ The client reads both siblings and context {n1:1, n2:1}](play:resolve@t=10)
[▶ n3 gives the merged cart dot n3:1 and it replaces both](play:resolve@t=12)

**6. Keep the dot apart from the context.** Why not store just one clock per value, the context with the dot folded in, and let a value replace any value whose clock its own clock covers? That design is called a plain version vector, and it gives the same answers in every run above. It fails when two clients that never read write through the same replica. Milk is n1's first write, so its clock is `{n1:1}`. Eggs is n1's second, so its clock is `{n1:2}`. `{n1:2}` covers `{n1:1}`, so at t=2 n1 lets eggs replace milk, although eggs' writer never saw milk. Both clients got an ack, and milk is gone. One replica taking most of the writes for a key is normal (in the Dynamo design, writes for a key usually go through the same replica), so this is a common path, not a corner case.
[▶ Broken: eggs' clock {n1:2} covers milk's {n1:1}, and milk is lost](play:broken: no dot@t=2)
With the dot kept apart, n1 asks the real question: does eggs' context, which is empty, include milk's dot `n1:1`? It does not, so both are kept. This pairing of a dot with a context is called a dotted version vector.
[▶ At t=2 n1 keeps eggs next to milk](play:blind writes@t=2)

## Why it works now

- A value is replaced only by one whose context includes its dot, and a context only includes writes its client had read. So a value disappears only when someone who saw it decided to change it.
- Every write gets a dot no other write has, so two writes are never mistaken for one, and a later write through the same replica is not mistaken for one that saw the earlier.
- Concurrent values are both kept, so neither client's write is lost. The conflict is handed to someone who can merge it.
- Gossip repeats every few ticks, and the keep-or-replace rule gives the same answer whatever order versions arrive in, so all replicas end up with the same siblings.
- The visualizer checks after every event that no replica has dropped a value unless it still holds a value whose client had really seen it. It holds through concurrent writes [▶ see it hold](play:concurrent@t=6) and blind writes through one replica [▶ see it hold](play:blind writes@t=4), and breaks the moment arrival order decides [▶ see it break](play:broken: last write wins by arrival@t=4).

## What it costs

- **Metadata on every value.** Each value carries a dot and a context with one counter per replica that took a write for this key, and they travel with every read, write and gossip message.
- **Clients must merge.** A read can return several values. Every client that writes this key needs merge logic, and it must be right: a merge that drops an item brings back the lost update.
- **Read before write.** To replace a value, a client must first read it to get the context. A write sent with an empty context says "I saw nothing", so it ends up as one more sibling instead of replacing the value.
- **Siblings pile up** if clients keep writing without reading first.

## Staff notes

- Vector clocks **detect** conflicts; they don't resolve them. **CRDTs** (conflict-free replicated data types, such as counters and sets with a built-in merge) let replicas resolve concurrent updates on their own, with no client merge.
- **Last-write-wins is fine when losing one of two concurrent updates is acceptable,** such as a cache entry or a "last seen at" time. It is the wrong choice for a cart, a balance or a document.
- Keep one counter per replica, not per client, or the clock grows with the number of clients. The plain per-replica version vector is what makes blind writes through one replica look ordered [▶ see it](play:broken: no dot@t=2); the dot is what lets you keep per-replica counters without that loss. The Dynamo paper also trims the oldest entries once the clock passes a size limit, at the price of comparisons that are no longer exact.
- **Lamport clocks** (a single counter) give every event a number that respects happened-before, but they can't tell you that two writes were concurrent. Detecting concurrency needs the full vector.

## Check yourself

- **Q:** Milk has dot `n1:1` and eggs has dot `n2:1`, both written with empty contexts. Can either replace the other?
  A: No. Neither context includes the other's dot, so neither writer saw the other: the writes are concurrent, and both are kept as siblings. [▶ See it](play:concurrent@t=4)
- **Q:** Why not just keep the version with the later wall-clock timestamp?
  A: Wall clocks drift, so "later" may be wrong: here n2's clock is behind, and the newer write, which had seen milk, is the one thrown away. And even with perfect clocks, two concurrent writes mean any keep-one rule drops one acknowledged write. [▶ See it](play:broken: last write wins by timestamp@t=8)
- **Q:** Why does the client send back the context it read, instead of letting the replica fill in its own clock?
  A: Only the client knows what it saw. The replica may hold values the client never read, and claiming those would let the write replace them. [▶ See it](play:broken: server's clock@t=6)
- **Q:** Two clients that never read both write through n1. Why does a plain version vector lose the first write, and how does the dot prevent it?
  A: The plain clocks are `{n1:1}` and `{n1:2}`, and the second covers the first, so it looks as if the second writer saw the first. With the dot kept apart, the second write's context is empty and does not include `n1:1`, so both are kept. [▶ See it](play:broken: no dot@t=2)
- **Q:** A client reads two siblings and writes a merged value. Why does that replace both everywhere?
  A: The read's context covers both siblings' clocks, so it includes both their dots. Every replica that receives the merged value sees that its writer had seen both, and drops them. [▶ See it](play:resolve@t=12)

## When to use which

- **Vector clocks with siblings (this lesson)** — when any copy may accept writes and losing a confirmed change is not acceptable, such as a shopping cart in a multi-region store, or notes edited offline on two devices. The price is extra data on every value and merge code in every client.
- **Last-write-wins timestamps** — when losing one of two simultaneous updates is harmless, such as a cache entry, a "last seen" time or a user's current status. Cassandra works this way. Beware clocks that drift: a newer write can lose, as in the [timestamp story](play:broken: last write wins by timestamp@t=8).
- **A single leader** — when one server can order every write for a key, so there is never a conflict to detect. Most databases do this with [leader-follower replication](#/sd-05-replication/017-leader-follower-replication), or with [Raft](#/sd-05-replication/021-raft-log-replication) when failover must be automatic and safe. The cost: writes stop reaching that data while the leader is unreachable.
- **Quorums with one version counter** — when writes come through one coordinator that can number them, as in [quorum reads and writes](#/sd-05-replication/018-quorum-read-write). A single number orders writes but cannot tell "newer" from "concurrent".
- **CRDTs (data types with a built-in merge)** — when the data is a counter, a set or a text document, and you want conflicts resolved automatically instead of handed to the client. Riak's data types and collaborative-editing libraries such as Automerge and Yjs use them.
- **In an interview:** for "users can write in two regions at once", say "any region accepts writes; versions carry vector clocks, so concurrent edits are kept as siblings and merged, not silently dropped as with last-write-wins".

## Deep dive

- Leslie Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System" (1978), defines happened-before.
- Amazon's "Dynamo: Amazon's Highly Available Key-value Store" (2007) used vector clocks and returned conflicting versions to the application, with the shopping cart as its example. The DynamoDB service is a different system and does not return siblings.
- Nuno Preguiça, Carlos Baquero, Paulo Sérgio Almeida and colleagues described dotted version vectors in "Dotted Version Vectors: Logical Clocks for Optimistic Replication" (2010), as a fix for the false ordering of plain per-replica version vectors. Riak can return siblings to clients, and later added dotted version vectors. Cassandra took the other path: last-write-wins timestamps.
- "Designing Data-Intensive Applications" (Martin Kleppmann, 1st edition), chapter 5, "Detecting Concurrent Writes", walks through a shopping-cart example, first with a version number on one replica and then with version vectors across several.
