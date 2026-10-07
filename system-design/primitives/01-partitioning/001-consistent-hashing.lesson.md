# Consistent hashing

## What it is

- **What it is:** A way to decide which server stores each key, by placing both servers and keys on a circle of hash values and giving each key to the next server clockwise.
- **The problem it solves:** With the simple rule "hash the key, mod the number of servers", adding or removing one server changes the answer for almost every key, so nearly all the data has to move at once. Consistent hashing moves only the keys next to the server that changed, about 1/N of them.
- **Reach for it when:** Keys are spread over a set of servers that grows, shrinks or loses members while running, such as cache nodes or database shards, and moving data is slow or costly.
- **Not the right tool when:** The server list never changes, or a central directory already records where each key lives. Then plain mod hashing or a lookup table is simpler. For a small server list, [rendezvous hashing](#/sd-01-partitioning/002-rendezvous-hashing) is simpler and spreads load evenly without virtual nodes.
- **Where you'll meet it:** Amazon's Dynamo paper and Apache Cassandra place data on a token ring; memcached clients pick a cache node with the ketama scheme; load balancers use variants to keep a user on the same backend.

## In plain words

When there is too much data for one machine, it is split across several servers. A cache with a billion entries, for example, might be spread over ten cache servers. Then every time the app wants `user:7`, it needs to know which of the ten holds it, and it needs to know instantly, without asking anyone.

Think of a coat check with several attendants. You could say "coats whose ticket number ends in 0–3 go to Ann, 4–6 to Bob, 7–9 to Cat". That works until a fourth attendant joins: now the rule changes, and almost every coat has to be carried to a different attendant. Consistent hashing is a rule where a new attendant only takes some coats from their neighbours, and nobody else's coats move.

In the picture on the right, the circle is the ring, like a clock face. Coloured tick marks on it are server markers, and the dots inside are keys (pieces of data). A key belongs to the first marker you meet going clockwise. Below the ring, each server box lists the keys it stores, and a key with "←" has just been moved there from another server. The box at the top says what just happened.

## Words we'll use

- **Key** — the name a piece of data is stored under, such as `user:7`.
- **Server** — one machine that stores some of the keys. Here they are called A, B, C and D.
- **Shard** (verb) — to split the keys between servers, so each server holds only some of them.
- **Hash function** — a fixed recipe that turns any text into a number. The same text always gives the same number, and texts that differ even slightly give numbers that look unrelated. Here the numbers run from 0 up to about 4.3 billion (2^32).
- **Hash** (noun) — the number a hash function gives for one key.
- **Mod** — the remainder after dividing. 17 mod 4 is 1.
- **Ring** — the range of hash numbers drawn as a circle: 0 is at the top, the numbers grow clockwise, and the largest one sits just before 0 again.
- **Token** — a point on the ring that belongs to a server. A server gets its tokens by hashing names such as `A-0`, `A-1`, and so on.
- **Owner** — the server a key belongs to.
- **Arc** — the stretch of ring between one token and the next.
- **Virtual nodes** — giving each server many tokens instead of one. "Tokens per server" means the same thing.
- **Moved key** — a key whose owner changed after a server was added or removed. Its data has to be copied to the new owner.

## The world we're in

- There are too many keys for one server, so they are sharded across several.
- Every client must be able to work out a key's owner on its own, quickly, with no central lookup table to ask.
- Servers are added when load grows, and removed when they fail or are retired.
- Moving a key means copying its data over the network. That is slow and costly, so the fewer keys move, the better.

## The goal

Give every key an owner that any client can compute, so that adding or removing one server moves only about that server's fair share of keys.

## The naive attempt

"Hash the key, take it mod the number of servers, and use that as the server's position in a list." With servers A, B and C, a key whose hash mod 3 is 2 goes to C.

It spreads keys evenly, and lookups are instant. The trouble starts when the number of servers changes. Add a fourth server and every key is now placed by hash mod 4 instead of hash mod 3. For most hashes those two remainders differ, so most keys change server, even though only a quarter of them need to move to fill the new server. Here D joins three servers. One tracked key after another changes owner; a ringed dot is a key that moved.
[▶ Broken: D joins, and keys start changing server](play:broken: hash mod N@at=moved#1)
By the end, 15 of the 24 tracked keys have moved. Over 10,000 keys, the test measures more than 60%. (In theory, 3 in 4: a key stays only when its hash mod 3 and mod 4 agree.)
[▶ Broken: 15 of 24 keys moved](play:broken: hash mod N@at=moved#15)

## Building it up

**1. Put the servers on a ring, and give each key to the first server clockwise.** Hash each server's name to get a token on the ring. To find a key's owner, hash the key and walk clockwise from that spot until you meet a token. The tokens are kept sorted, so "walk clockwise" is a binary search: halve the list until you find the first token at or after the key's hash. This ring has one token each for A, B and C. The pointer shows where `user:1` lands.
[▶ user:1 is hashed onto the ring](play:lookup@at=hash)
The first token clockwise from it is C's, so C owns `user:1`.
[▶ The search lands on C's token](play:lookup@at=owner)
A key that lands after the last token wraps past 0 to the first token. `user:7` is one of them, and its owner is B.
[▶ user:7 is past the last token, so it wraps to the first](play:lookup@at=wrap)

**2. Adding a server only takes keys from its neighbours.** A new server's tokens split some existing arcs. Only the keys on the part of an arc just before a new token change owner, and they all move to the new server. No key moves between two old servers. Here D joins a ring where A, B and C have 32 tokens each. D's tokens go in one at a time.
[▶ D's first token goes onto the ring](play:add a server@at=token#1)
Then every tracked key is looked up again. The first key that changes owner moves to D.
[▶ The first moved key goes to D](play:add a server@at=moved#1)
In the end 6 of the 24 tracked keys move, all of them to D. Over 10,000 keys the test checks that between 15% and 35% move; a quarter is D's fair share of four servers.
[▶ 6 of 24 keys moved, all to D](play:add a server@at=moved#6)

**3. Removing a server only moves its own keys.** When B leaves, its tokens are deleted. The keys on B's arcs now reach the next token clockwise, which belongs to some other server. Every other key still meets the same token as before.
[▶ B's tokens are removed; its keys still show B until they are looked up again](play:remove a server@at=remove)
Six keys move, and each one was B's.
[▶ All 6 moved keys were B's](play:remove a server@at=moved#6)

**4. One token per server gives very uneven arcs.** Three random points cut a circle into three arcs of random length, and a server owns the arc that ends at its token. Here B's single token sits at the end of a long empty stretch, so B owns about 80% of the ring, while A and C own about 10% each. B would get most of the keys and most of the work.
[▶ Broken: B owns 80% of the ring](play:broken: one token per server@at=sorted#3)

**5. Give each server many tokens (virtual nodes).** With 32 tokens each, every server owns 32 small arcs scattered around the ring. Some are long and some are short, but the totals even out. In this run each server's share is between 30% and 35%; that is a lucky draw, as "What it costs" below explains.
[▶ 96 tokens, and each server owns about a third](play:virtual nodes@at=sorted#3)
It also spreads a change around: a new server's 32 tokens take a little from every other server, instead of a lot from one neighbour.

## Why it works now

- A key's owner depends only on where the key sits and on the nearest token clockwise. How many servers there are does not enter into it, so changing the number of servers only matters near the tokens that came or went.
- Adding a server only creates new tokens, so a key either keeps its old token or now meets a new one first. That is why every moved key goes to the new server. The test checks this: [▶ every moved key went to D](play:add a server@at=moved#6).
- Removing a server only deletes tokens, so only keys that used to stop at a deleted token look further. The test checks that every moved key had B as its owner: [▶ see it](play:remove a server@at=moved#6).
- With many tokens per server, each server's share is the sum of many random arcs, and sums of many random pieces stay close to their average. The test checks that the largest share is less than 1.5 times the smallest with 32 tokens, and much more than that with one token.

## What it costs

- **Lookups cost a binary search** over all tokens: with 3 servers and 32 tokens each, about 7 comparisons, instead of one division for mod N.
- **Every client needs the full token list**, and all of them must agree on it. A client with an old list sends keys to the wrong server.
- **More tokens means more memory** and a bigger list to send to every client when servers change.
- **The ring evens out keys, not traffic.** If one key is much more popular than the rest, the server that owns it is overloaded, however many tokens there are.
- **Even with virtual nodes the split is not exact.** A server's share wobbles around its fair share by roughly 1/√v, where v is its number of tokens (√ is the square root). With 32 tokens that is about 18%, so one server holding 1.3 to 1.5 times another's share is normal. You can see it after D joins: C and D own about 20% each while A and B own about 30%. This is why real systems use 100 to 256 tokens per server, or place tokens deliberately instead of by hash.

## Staff notes

- **Moving a key is a migration.** "D now owns these keys" is instant on the ring, but their data still has to be copied from the old owners. Until the copy finishes, D does not have the data, so systems typically stream it in the background and, during the move, either send reads to the old owner or check both.
- **Hot keys need another fix.** A key read millions of times a second overloads its owner no matter how the ring is cut. Common fixes are caching it in front of the store, or splitting it into several keys (for example `counter#1` to `counter#8`) and combining them on read.
- **Choosing the number of tokens.** More tokens give a more even split and spread a change over more servers, at the cost of memory, a longer list to ship around, and more separate ranges to copy when a server joins. Systems pick a number per server rather than per key, often in the tens to hundreds.
- **Uneven servers.** A server with twice the disk can be given twice the tokens.
- **Replication.** Systems that keep several copies of each key often put the copies on the next few distinct servers clockwise from the key.

## Check yourself

- **Q:** A, B and C have 32 tokens each, and D joins. Roughly what fraction of keys move, and to which server?
  A: About a quarter, and all of them go to D. New tokens can only take keys; they never shuffle keys between old servers. [▶ See it](play:add a server@at=moved#6)
- **Q:** Server B is removed. Can a key that was on A end up on C?
  A: No. Only the keys that stopped at one of B's tokens look further; every other key still meets the same token. [▶ See it](play:remove a server@at=moved#6)
- **Q:** A key's hash is bigger than every token's. Which server owns it?
  A: The server whose token comes first after 0. The ring wraps around. [▶ See it](play:lookup@at=wrap)
- **Q:** With hash mod N, going from 3 servers to 4, about how many keys stay put?
  A: Only about a quarter: those whose hash gives the same remainder mod 3 and mod 4. The other three quarters move. [▶ See it](play:broken: hash mod N@at=moved#15)
- **Q:** Why not give each server a single token?
  A: A few random points cut the ring into very unequal arcs, so one server can end up with most of the keys. Here B owns about 80%. [▶ See it](play:broken: one token per server@at=sorted#3)

## When to use which

- **Hash mod N** — when the number of servers is fixed and never changes, or when moving every key at once is acceptable (a nightly rebuild). Simplest and perfectly even.
- **Consistent hashing with virtual nodes** — when servers join and leave while the system is running and moving data is costly: cache clusters, Dynamo-style databases such as Cassandra. The usual answer in interviews.
- **[Rendezvous hashing](#/sd-01-partitioning/002-rendezvous-hashing)** — when the server list is small (tens, not thousands). No ring to build or ship around, perfectly even, and picking the top 3 servers for replicas is easy.
- **A lookup table (directory)** — when you need to place data on purpose, such as moving one huge customer to their own server, and can run a small, reliable service that stores the table. MongoDB's config servers keep such a table.
- **Jump consistent hash** — when servers are numbered 0 to N−1 and only ever added or removed at the end. Tiny and fast, but it can't remove a server from the middle.
- **Not about data at all?** If any server can answer any request, you don't need any of these: use a [load balancer](#/sd-04-traffic/014-load-balancing).

## Deep dive

- Consistent hashing was introduced by Karger et al., "Consistent Hashing and Random Trees" (1997), for spreading web caches.
- "Dynamo: Amazon's Highly Available Key-value Store" (DeCandia et al., 2007) describes a ring with virtual nodes, and placing a key's replicas on the next servers clockwise.
- Apache Cassandra places nodes on a token ring and supports several tokens per node (vnodes).
- Jump consistent hash (Lamping and Veach, 2014) and rendezvous hashing (lesson 002) are alternatives that need no token list.
