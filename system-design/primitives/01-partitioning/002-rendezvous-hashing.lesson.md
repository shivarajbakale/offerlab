# Rendezvous hashing

## What it is

- **What it is:** A way to decide which server stores each key. For every key, each server gets a score by hashing the server's name and the key together, and the server with the highest score owns the key. It is also called highest random weight (HRW) hashing.
- **The problem it solves:** Spreading keys over a changing set of servers without mass moves usually means a hash ring, which needs many virtual nodes per server to split keys evenly and a sorted table every client must build. Rendezvous hashing gets the same small moves (only the keys the changed server wins or had won) and an even spread from one rule, with no ring and no shared table.
- **Reach for it when:** A modest set of servers, caches or backends changes while running, every client must agree on a key's owner without asking anyone, and you want an even spread, or the top 2 or 3 servers for copies, with no ring to build or store.
- **Not the right tool when:** There are thousands of servers on a hot lookup path, because each lookup hashes every server; [consistent hashing](#/sd-01-partitioning/001-consistent-hashing) finds the owner with a binary search instead. If the server list never changes, plain mod hashing is simpler.
- **Where you'll meet it:** Thaler and Ravishankar's highest random weight paper from the 1990s; Microsoft's Cache Array Routing Protocol (CARP), which picks a proxy cache per URL; Apache Ignite's rendezvous affinity function for placing data partitions; and interview questions such as "Design a distributed cache".

## In plain words

When data is spread over several servers, every app server has to answer "which server stores `user:3`?" on its own, instantly, and they must all give the same answer. Rendezvous hashing answers it with a fair, repeatable contest: for each key, every server gets a score, and the highest score wins.

Think of a raffle where each person's ticket number for each prize is fixed in advance by a formula of their name and the prize. Anyone can work out who wins any prize without asking. If one person leaves, only the prizes they would have won go to the next best ticket; nobody else's wins change. If a new person joins, they only win the prizes where their ticket beats the current winner.

In the picture on the right, the table has one column per server (A, B, C, …) and one row per key. Each cell is that server's score for that key, and the highest number in a row decides where the key is stored. Once a row is decided, its name shows the winner: `user:1 → B` means `user:1` is stored on B, and `(was C)` marks a key that just moved. The box at the top says what just happened.

## Words we'll use

- **Key** — the name a piece of data is stored under, such as `user:3`.
- **Server** — one machine that stores some of the keys. Here they are called A, B, C, D and E.
- **Owner** — the server a key belongs to.
- **Hash function** — a fixed recipe that turns any text into a number. The same text always gives the same number, and texts that differ even slightly give numbers that look unrelated.
- **Score** — the number a server gets for one key: the hash of the server's name and the key joined together, such as `B|user:3`. Here scores run from 0 to 9999.
- **Election** — for one key, every server is scored and the highest score wins. That server is the key's owner.
- **Tie** — two servers with the same score for a key. Here the earlier name in the alphabet wins, so every client still agrees.
- **Moved key** — a key whose owner changed after a server was added or removed.
- **n** — the number of servers.
- **log n** — the logarithm of n, base 2: how many times n can be halved before reaching 1. log 1,024 = 10, so a binary search over 1,024 sorted items takes about 10 steps. It grows very slowly as n grows.
- **Consistent hashing ring** — the other common answer to this problem (lesson 001): servers are placed at points on a circle, and a key goes to the first one clockwise.

## The world we're in

- Keys are spread over a handful of servers, and every client must work out a key's owner on its own, with no shared table to look up.
- Servers come and go. Moving a key means copying its data, so the fewer keys move, the better.
- Every client knows the current list of servers, and they all use the same hash function.

## The goal

Give every key an owner that any client can compute from the server list alone, so that adding or removing a server moves only the keys that have to move.

## The naive attempt

"Hash each server's name, and let the highest hash win." Every client agrees, and adding or removing a server is simple. But the key is not part of the score, so every key sees exactly the same scores and elects the same server. Here every row of the table is identical: A scores 9476 for every key, and A owns all eight keys while B and C sit idle.
[▶ Broken: every row is the same, and A owns every key](play:broken: score ignores the key@at=done)

## Building it up

**1. Score each server for each key, and pick the highest.** Put the key into the hashed text: server B's score for `user:3` is the hash of `B|user:3`. Now each key ranks the servers in its own random-looking order, so different keys elect different winners. The table has one row per key and one column per server (A, B, C). In row 0, for `user:1`, B's 7845 beats A's 829 and C's 2012, so B owns `user:1`.
[▶ The first row is scored: A 829, B 7845, C 2012](play:pick@at=row#1)
Once the whole table is filled, each server has won some of the rows.
[▶ The full table: A wins 3 keys, B 2 and C 1](play:pick@at=done)
A real lookup does the same for one key. For `user:3`, A scores 1806 and takes the lead, then B scores 5339 and takes it over.
[▶ B's 5339 takes the lead from A's 1806](play:pick@at=lead#11)
C's 84 is lower, so B stays the owner.
[▶ C's 84 is lower, and B is returned as the owner](play:pick@at=winner#7)

**2. Removing a server only moves the keys it had won.** Scores never depend on which other servers exist. When B leaves, every other server keeps exactly the scores it had, so a key that B did not win still has the same winner. A key that B won simply goes to its runner-up. Here four servers own `user:1` to `user:8`, and B owns `user:1`, `user:3` and `user:7`. Removing B only takes B out of the server list; there is nothing else to rebuild.
[▶ B is removed from the list; nothing else changes](play:remove a server@at=remove)
After the table is recomputed, `user:1` and `user:7` have gone to D and `user:3` to A, their second-highest scores. The other five keys kept their owners.
[▶ Only B's three keys moved](play:remove a server@at=done)

**3. Adding a server only takes keys where it wins.** A new server D gets a score for every key. It takes a key only when its score beats that key's current winner; otherwise nothing changes. With 4 servers, D wins about a quarter of all keys: 1/(n+1) when going from n servers to n+1. Here D wins one of the eight tracked keys, `user:5`, where its 9069 beats C's 7316. Over 10,000 keys, the test measures between 20% and 30% moving, all of them to D.
[▶ D takes user:5 and nothing else changes](play:add a server@at=done)

**4. The price: a lookup scores every server.** There is no shortcut. To know the winner you must compute every score, so one lookup costs n hashes. With five servers, the lookup of `user:5` computes five scores.
[▶ One lookup, five servers, five hashes](play:cost@at=winner)

## Why it works now

- Every client computes the same scores from the same server names and key, so every client elects the same owner.
- A server's score for a key depends only on that server and that key. Adding or removing another server can't change it, so the order among the remaining servers is untouched. That is why removing B only moves B's keys, and adding D only moves keys to D. The tests check both: [▶ remove](play:remove a server@at=done), [▶ add](play:add a server@at=done).
- The hash makes every server equally likely to have the top score for a key, so keys spread evenly with no extra work. A ring needs many tokens per server to get the same evenness.

## What it costs

- **A lookup costs n hashes.** For 5 or 50 servers that is cheap. For thousands of servers on every request, it starts to matter, and a ring's binary search (about log n steps) is faster.
- **Clients must agree on the server list.** A client with an old list may elect a server that has left, or miss one that joined.
- **It spreads keys, not load.** A key that gets most of the traffic still lands on one server.
- **No memory or setup cost.** There is no ring of tokens to store, sort or send around; the server list is everything.

## Staff notes

- **Replicas for free.** Taking the top 2 or 3 scores instead of only the top one picks the servers for 2 or 3 copies of a key. When the top server fails, every client already knows the next one.
- **Weighted servers.** A server with twice the capacity should win twice as often. The usual approach scales each server's score by its weight with a formula chosen so that wins come out proportional to weight; simply multiplying the raw score by the weight does not give the right proportions.
- **Where it fits.** It suits a small, changing set of targets chosen per request: a load balancer choosing a backend for a session, or a client choosing which cache server to ask. With thousands of servers, systems often group servers and run rendezvous at each level, so each lookup scores only a few candidates.
- **Ties.** With full 32-bit or 64-bit scores, ties almost never happen, but a fixed tie-break rule (such as the server name) still keeps every client in agreement.

## Check yourself

- **Q:** Server B is removed. Can a key that was owned by A end up on C?
  A: No. A's score and C's score for that key don't change, so A still beats C. Only the keys B had won find a new owner. [▶ See it](play:remove a server@at=done)
- **Q:** D joins three servers. Which keys move, and where to?
  A: Only keys where D's score is higher than the current winner's. They all move to D: about a quarter of them. [▶ See it](play:add a server@at=done)
- **Q:** With 5 servers, how many hashes does one lookup compute?
  A: Five, one per server. You can't know the highest score without computing all of them. [▶ See it](play:cost@at=winner)
- **Q:** What goes wrong if the score hashes only the server's name?
  A: Every key sees the same scores, so every key elects the same server, and it ends up with all the data. [▶ See it](play:broken: score ignores the key@at=done)

## When to use which

- **Rendezvous hashing** — a small or medium list of servers (up to a few dozen) that changes while running, where every client must agree on a key's server with no shared table. Example: an app picking which of 8 cache servers holds a user's session. Picking the top 2 or 3 scores also gives you replica servers for free.
- **[Consistent hashing](#/sd-01-partitioning/001-consistent-hashing)** — hundreds or thousands of servers, or a very hot lookup path, where scoring every server per lookup costs too much. A ring lookup is a binary search instead of n hashes. Example: Cassandra or DynamoDB-style storage clusters.
- **Hash mod N** — the server list never changes, or moving almost every key at once is fine (a nightly rebuild). Simplest and even, but adding one server moves most keys.
- **A lookup table (directory)** — you need to place particular keys on purpose, such as giving one huge customer its own server. Costs a small, reliable service to hold the table.
- **[Geohash](#/sd-01-partitioning/003-geohash) or a [quadtree](#/sd-01-partitioning/004-quadtree)** — when "which keys belong together" depends on location on a map, not on an even random spread.
- **In an interview:** say "rendezvous (highest random weight) hashing" for a small cache tier or for choosing replicas, and "consistent hashing with virtual nodes" for a large storage cluster. Mention that both move only about 1/n of the keys when one server joins or leaves.

## Deep dive

- David Thaler and Chinya Ravishankar, "Using Name-Based Mappings to Increase Hit Rates" (1998, from a 1996 technical report), introduced highest random weight (HRW) hashing, another name for rendezvous hashing.
- Microsoft's Cache Array Routing Protocol (CARP) used this idea to choose among proxy caches.
- Compare lesson 001, consistent hashing: it needs a sorted ring of tokens, but a lookup is a binary search instead of n hashes.
