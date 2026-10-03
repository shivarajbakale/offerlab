# Load balancing

## What it is

- **What it is:** A program that sits in front of several copies of the same server and picks which one gets each incoming request. Strategies range from simply taking turns to sending each request to whichever server has the least unfinished work.
- **The problem it solves:** Handing requests to servers in strict turn keeps feeding a slow server its full share, so its queue grows without limit while faster servers sit idle. Balancers that use feedback about each server's load send work around the slow one, and sampling two servers at random keeps many balancers from piling onto the same one.
- **Reach for it when:** A service runs more than one copy behind one address: a web tier, an API fleet, a pool of stateless workers. Especially when servers differ in speed, requests differ in cost, or several balancers share load information that is a little out of date.
- **Not the right tool when:** Each request must reach one particular server because that server holds its data, such as a cache shard; route by key with [consistent hashing](#/sd-01-partitioning/001-consistent-hashing) instead. With equal servers and equal requests, plain round robin is enough.
- **Where you'll meet it:** NGINX, HAProxy, Envoy and cloud load balancers such as AWS Elastic Load Balancing. NGINX offers `random two least_conn`, and Envoy's least-request balancer picks the better of two random hosts by default. Mitzenmacher's "power of two choices" work explains why. Nearly every "Design X" interview has a load-balanced tier.

## Words we'll use

- **Server** — a machine that does the work for requests. Here there are three: s0, s1 and s2.
- **Request** — one piece of work a client asks for.
- **Tick** — one unit of simulated time. Each tick, 6 requests arrive, and then each server finishes as many as it can.
- **Speed** — how many requests a server finishes per tick. Here s0 and s1 finish 3 per tick and s2 only 1, unless a scenario says otherwise.
- **In flight** — requests a server has been sent but has not finished, whether waiting or being worked on. The `inflight` array holds one count per server.
- **Queue** — the line of requests waiting at a server. A request that will wait 2 ticks or more counts as slow, and is drawn as a red cross.
- **Load balancer** — the program in front of the servers that decides which server gets each request. Big systems run several balancers side by side.
- **Stale** — out of date. A stale count describes how busy a server was a while ago, not now.
- **Herd** — many balancers making the same choice at the same moment, so one server gets everything.

## The world we're in

- Servers are not all alike. One may be an older machine, or busy with heavy work, so it finishes requests more slowly.
- A balancer can count what it has sent to each server, but finding out how busy a server is right now takes a message, and the answer is old by the time it arrives.
- With several balancers, none of them sees what the others are sending.
- "Random" choices come from a seeded generator, so every run makes the same choices.

## The goal

Send each request to a server that can start on it soon, so no queue grows while other servers sit idle.

## The naive attempt

"Send each request to the next server in turn: s0, s1, s2, s0, s1, s2..." That is round robin. It needs no information at all. But it gives s2 two requests per tick, and s2 finishes only one. One tick in, a request sent to s2 already has to wait 2 ticks.
[▶ Broken: at tick 1 the sixth request goes to s2 and waits 2 ticks](play:broken: round robin with one slow server@at=assign#12)
s2's queue grows by one every tick, while s0 and s1 finish their work and sit idle. After 8 ticks s2 has 8 requests waiting, and the fast servers have none.
[▶ Broken: after tick 7, s2 still has 8 waiting while s0 and s1 are empty](play:broken: round robin with one slow server@at=work#24)

## Building it up

**1. Round robin is right when servers are equal.** With three servers that each finish 2 per tick, taking turns gives each one exactly its share, and nothing waits.
[▶ The fourth request goes back to s0](play:round robin@at=turn#4)
Round robin assumes two things: every server is equally fast, and every request is equally heavy. When either is false, it keeps feeding a server that is already behind.

**2. Least connections: send work where there is least in flight.** A balancer can count, for each server, the requests it has sent and not yet seen finish. A slow server finishes fewer, so its count stays higher, and new requests go elsewhere. That count is feedback: it measures how servers are actually doing, instead of assuming they are equal. In the same setup as the naive attempt, s2 ends up with one request per tick, exactly what it can finish.
[▶ At tick 1, s2 gets its one request of the tick and it waits 1 tick](play:least connections@at=assign#11)
No queue builds up, and every request is drawn green.

**3. The catch: counts must be fresh.** Least connections works when one balancer sends everything and so knows every count. With several balancers, none of them sees all the requests. To see the whole picture, they need shared counts, and sharing takes time, so the counts are stale. Here three balancers each route 2 of the 6 requests per tick, using shared counts refreshed every 3 ticks. Between refreshes, a balancer does not even add its own sends to its copy. (Counting them would help only a little: with many balancers, each one sends a small share of the requests, and all the others' sends stay invisible until the next refresh.) Between refreshes, every balancer sees the same "least loaded" server, and all six requests of the tick go there.
[▶ Broken: in tick 0, all six requests go to s0](play:broken: least connections on stale counts@at=assign#6)
After tick 2 the counts are refreshed and show s0 with 9 in flight. Now every balancer agrees that s1 is the least loaded.
[▶ Broken: the refresh shows s0 at 9 and the others at 0](play:broken: least connections on stale counts@at=refresh#3)
So the whole herd moves to s1, while s2 still gets nothing.
[▶ Broken: in tick 3, all six requests go to s1](play:broken: least connections on stale counts@at=assign#24)

**4. Power of two choices: pick two at random, take the better one.** Instead of comparing every server, pick two different servers at random and send the request to the one with fewer in flight. Here the balancer samples s2, with 1 in flight, and s1, with none, and picks s1.
[▶ Samples s2 (1 in flight) and s1 (0), and picks s1](play:power of two choices@at=two#13)
It never picks the busiest of the two, so a slow server's queue can't run away. It is not perfect: sometimes the emptiest server is not one of the two sampled. Here s0 is empty, but the samples are s2 and s1, both with 2 in flight. s2 is chosen, and the request will wait 2 ticks.
[▶ s0 is empty but not sampled; s2 is chosen](play:power of two choices@at=two#22)
The big win is with many balancers. Different balancers sample different pairs, so even with the same stale counts they don't all land on the same server. The stale-counts test also runs two choices on those counts for 30 ticks, and its longest queue stays under half of least connections'.

## Why it works now

- Least connections uses each server's real progress. A slow server's count stays high, so it gets new work only as fast as it finishes it. The test checks that no queue grows past 1 and no request waits 2 ticks.
- Two choices never sends a request to the busier of its two samples, so a long queue is only sampled, never fed. Its longest queue stays at 2 here, against 8 for round robin.
- Random sampling breaks the herd: balancers that agree on the stale counts still choose different pairs.

## What it costs

- **Round robin:** nothing to store or share, but no protection against slow servers or heavy requests.
- **Least connections:** a count per server, kept up to date. One balancer can count its own requests. Many balancers either share counts, which costs messages and is always a little stale, or each counts only its own, which sees only part of the load.
- **Power of two choices:** a count per server and two random numbers per request. Slightly less even than perfect least connections, but cheap and safe with stale counts.
- **None of them fixes a server that is too small.** If all servers together are slower than the arrivals, queues grow whatever the strategy.

## Staff notes

- **L4 versus L7.** A layer 4 (L4) balancer works with network connections and never reads the requests inside them, so it balances connections. A layer 7 (L7) balancer reads each HTTP request, so it can balance per request and route by path or header. With long-lived connections (gRPC, WebSockets), an L4 balancer can leave load very uneven.
- **Health checks.** A balancer regularly checks each server and stops sending to one that fails. Without that, least connections can even favour a dead server, since a server that fails instantly always looks idle.
- **Slow start.** A newly started server has empty caches and is slow at first. Least connections sees its count of zero and floods it. Slow start ramps a new server's share up over a period of time.
- **Weights.** When servers differ in size, weighted round robin or weighted least connections gives a bigger server a bigger share.

## Check yourself

- **Q:** Round robin, two servers that finish 3 per tick and one that finishes 1, 6 requests per tick. After 8 ticks, how many requests are waiting at the slow server?
  A: 8. It gets 2 per tick and finishes 1, so its queue grows by one every tick. [▶ See it](play:broken: round robin with one slow server@at=work#24)
- **Q:** Same servers, least connections. How many requests per tick does the slow server get?
  A: One, the number it can finish. Its count stays higher than the others', so the rest go to the fast servers. [▶ See it](play:least connections@at=assign#11)
- **Q:** Three balancers use least connections on counts refreshed every 3 ticks. Where do the 6 requests of tick 0 go?
  A: All to s0. Every balancer sees the same counts, all zero, and picks the same server. [▶ See it](play:broken: least connections on stale counts@at=assign#6)
- **Q:** Two choices samples s2 with 1 in flight and s1 with none. Which gets the request?
  A: s1, the less loaded of the two. [▶ See it](play:power of two choices@at=two#13)
- **Q:** Can two choices send a request to a server with a queue while another server is empty?
  A: Yes, when the empty server isn't one of the two sampled. Here s0 is empty, the samples are s1 and s2 with 2 each, and s2 gets a request that will wait 2 ticks. [▶ See it](play:power of two choices@at=two#22)

## Deep dive

- "The Power of Two Choices in Randomized Load Balancing" (Michael Mitzenmacher, 2001) shows that sampling two servers instead of one cuts the longest queue dramatically. Sampling more than two helps much less.
- Mitzenmacher also studied balancing on old information and found that picking the least loaded server from stale counts herds, while choosing among a few random samples holds up much better.
- NGINX offers `least_conn` and a `random two least_conn` method. Envoy's least-request balancer, by default, picks the less loaded of two randomly chosen hosts.
