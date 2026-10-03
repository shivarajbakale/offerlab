# Order matching exchange

## What it is

- **What it is:** The core of a stock exchange: a matching engine keeps every waiting buy and sell order for each symbol, sorted by price and arrival time, and trades them the moment a buy price meets a sell price.
- **What makes it hard:** Matching one symbol is strictly one order at a time, because each order depends on the book the last one left, so one symbol can never go faster than one thread. When a single symbol suddenly takes almost half of all orders, no number of extra machines helps it.
- **Building blocks it uses:** symbols split over engines by hash, a per-account [token bucket](#/sd-04-traffic/012-token-and-leaky-bucket) at the gateways, an append-only journal the engine writes its updates to and moves on, with incoming orders journaled first so a standby can rebuild the book by replay (the idea behind a [write-ahead log](#/sd-03-storage/008-write-ahead-log)), and market data sent in order per symbol ([Kafka partitions](#/sd-06-transactions-messaging/027-kafka-partitions-consumer-groups)).
- **Where you'll meet it:** "Design a stock exchange" is a well-known staff-level interview question. Martin Fowler's article on the LMAX architecture describes a single-threaded matching core fed by a journaled input and recovered by replay, and Nasdaq publishes its ITCH market data feed over UDP multicast.

## Words we'll use

- **Order** — an instruction from a trader: "buy 100 shares of ACME at up to $50", or "sell". Each order here is one request.
- **Symbol** — the name of one thing traded, like ACME. This exchange lists 500.
- **Order book** — for one symbol, every buy and sell order still waiting, sorted by price and then by arrival time.
- **Matching** — when a buy price meets a sell price, the two trade and leave the book. The **matching engine** is the program that does this for its symbols.
- **Price-time priority** — at the same price, whoever arrived first trades first. So the order of arrival must be exact and the same for everyone.
- **Sequenced** — handled in one agreed order, one at a time. Here each engine is a single thread with a single worker: it finishes one order before it looks at the next.
- **Thread** — one line of work a program runs. One thread uses at most one CPU core.
- **Shard** — one slice of the symbols, with its own engine. Symbols are assigned by a hash of the symbol, so a symbol always goes to the same engine.
- **Hot symbol** — one symbol that suddenly gets a large share of all orders (news, a squeeze).
- **Gateway** — the server traders connect to. It checks each order (format, the account's risk limits) and passes it to the right engine.
- **Rate limit** — a cap on how many orders one account may send a second. Over it, the order is refused at once with "slow down".
- **Market data** — the stream of changes to every order book (new order, trade, cancel) that every trader watches.
- **Journal** — an append-only list of events in order. The engine writes each update once; other programs read it and send it on.
- **Zipf skew** — the popularity pattern: the k-th most popular symbol gets traffic in proportion to 1/k^s. A bigger s means the top symbol takes more.

## The world we're in

- 2,000 orders a second on a normal day, from 2,000 trading accounts, over 500 symbols.
- Popularity is Zipf-shaped. On a normal day (skew 1) the busiest symbol gets about 15% of orders.
- On a hot day traffic rises to 2,500 orders a second, one symbol gets about 45% of them (skew 1.6), and 20 high-frequency firms send half of all orders.
- An engine spends 1 ms per order, so one engine matches at most 1,000 orders a second. Real engines are far faster (microseconds per order), but the shape of the problem is the same; only the scale changes.
- Gateways are cheap and can be added: four of them with 4 cores each, 0.5 ms per order.
- Traders measure us in milliseconds. A slow order is a bad order: the price it was sent for may be gone.

## The goal

Match every order in exact arrival order for its symbol, keep latency low on the hottest day, and publish every change to everyone watching, without letting any of that slow the engine down.

## The naive attempt

"One matching engine for the whole exchange."

At 800 orders a second, one engine is 82% busy and every order is matched within 25 ms.
[▶ One engine at 800 orders a second](play:one engine: 800@t=8)

At 2,000 orders a second it needs 2 seconds of work every second, and it has one thread. It cannot use a second core: matching is sequenced. The engine sits at 100%, orders queue up in front of it, and nearly every order fails or times out. The gateways have 16 cores and use under 5% of them; their workers are all waiting on the engine. Adding gateways changes nothing.
[▶ Broken: one engine at 2,000 orders a second](play:broken: one engine at 2,000@t=8)

## Building it up

**1. Split the symbols over engines.** An order for ACME only touches ACME's book. Two symbols never need the same engine. So run 8 engines and give each a slice of the symbols, by a hash of the symbol. All of ACME's orders still go through one engine, in order, so price-time priority holds. On a normal day the engines are 17% to 46% busy. They are not even: each engine's load depends on which popular symbols hash to it. Every order is matched within 12 ms, for about $3.43 an hour.
[▶ Eight engines on a normal day](play:eight engines@t=8)

**2. See what splitting cannot fix.** On the hot day one symbol takes about 45% of 2,500 orders a second: about 1,100 a second, more than one engine can do. Its engine is at 100% while the other seven are under 40%. And it hurts everyone: the gateways' workers pile up waiting on the hot engine, so orders for quiet symbols wait behind them. About 14% of orders fail, and half of the ones that succeed take over 180 ms.
[▶ Broken: a hot symbol fills its engine](play:broken: a hot symbol — its engine@t=8)

More engines only move the *other* symbols away. With 32 engines, half of them are under 5% busy, the bill is $11.59 an hour, and the hot symbol's engine is still full. One symbol's book is one line of orders, so its capacity is one thread's.
[▶ Broken: 32 engines, the hot one still full](play:broken: a hot symbol — 32@t=8)

**3. Protect the engine at the gateway.** Much of the hot day's extra traffic is a few firms' algorithms sending and cancelling orders in a loop. Exchanges limit how many messages each connection may send. Here each account gets 20 orders a second, with bursts up to 40; past that, the load balancer in front of the gateways answers "slow down" at once, and the order never reaches an engine. The 20 heavy firms have about 68% of their orders refused. Everyone else has none refused, and their orders are matched within 20 ms. The hot engine falls to about 80% busy.
[▶ Rate limits on the hot day](play:rate limits@t=8)

A limit is a policy, not only a technique: it decides who gets the engine's scarce time. The exchange must publish it, apply it the same way to everyone, and set it per account, not per gateway, or a firm just opens more connections.

**4. Keep market data off the engine's thread.** Every match changes the book, and everyone must hear about it. The obvious way: after each order, the engine sends the update to the market data servers and waits for them to say they got it. That adds about 3 ms to every order on the engine's single thread, while its core sits mostly idle. Each engine can now handle far fewer orders, and about 24% of ordinary traders' orders fail on a normal day.
[▶ Broken: the engine sends market data itself](play:broken: the engine sends market data@t=8)

Instead the engine appends each update to an in-memory journal (0.1 ms) and moves on. Separate readers take updates from the journal and hand them to the market data servers, which send them to every subscriber. The engine's worker is busy less than 22% of the time, ordinary traders see no errors, and orders are matched within 11 ms. The market data servers are 35% busy; when there are more subscribers, add servers, not engine time.
[▶ Market data from a journal](play:journal: the engine only appends@t=8)

Order matters here too. In this simulator the journal's readers are interchangeable. In a real feed each symbol's updates must stay in order: they go through one ordered stream per symbol (like a Kafka partition, primitive 027) and carry sequence numbers, so a receiver that sees number 41 after 39 knows it missed one and asks again.

## Why it works now

Matching one symbol is inherently serial: each order depends on the book the last one left. So the design never tries to parallelise it. It partitions by symbol so different symbols run in parallel, refuses floods at the gateways where machines can be added, and removes everything that is not matching (network waits, fan-out) from the engine's thread.
[▶ Broken: market data on the engine's thread](play:broken: the engine sends market data@t=6)
[▶ The engine only appends](play:journal: the engine only appends@t=6)

## What it costs

- A symbol can never go faster than one thread. The hottest symbol's peak, not the total traffic, sizes the engine; you buy speed by making the engine faster (in memory, no locks, no waiting), not by buying machines.
- Rate limits refuse real orders. Busy firms will complain, so limits must be published, fair and per account.
- The journal adds a small delay between a match and its market data, and a real feed needs an ordered stream per symbol with gap detection and replay.
- Each engine is a single point of failure for its symbols. The usual answer is to journal every incoming order in sequence and run a standby that replays the same input: the same orders in the same order give the same book. This is not simulated here.
- Sharding by hash spreads load unevenly. Real exchanges assign symbols to engine partitions with published, deliberately balanced tables, and change them between trading sessions, not by a blind hash.

## Staff notes

- Ask the interviewer for the hottest symbol's orders per second. It decides whether one thread is enough; total traffic only decides how many engines.
- Durability without slowing the engine: write each incoming order to the journal (often to memory on several machines) before matching, and recover by replaying it. This is the "deterministic state machine" design: same input, same output.
- Fairness is a product requirement. Gateways must not let one firm jump the line, so every connection gets the same path and limits, and an order's place in line is fixed where it enters the engine, not by the trader's clock.
- Risk checks (does this account have the money or shares?) belong in the gateways, which scale out, and must be cheap.
- Market data volume is larger than order volume: one order can produce several updates, and every update goes to every subscriber. Inside the data centre this is usually UDP multicast, so the network copies each packet instead of a server sending it N times.

## Check yourself

- **Q:** The single engine is full at 2,000 orders a second, and the gateways are 5% busy. Why don't more gateways help?
  A: Matching is sequenced on one thread, and the engine is the only place that work can happen. The gateways are just waiting on it. [▶ Show it](play:broken: one engine at 2,000@t=8)
- **Q:** With 8 engines, why do orders for quiet symbols slow down on the hot day?
  A: The gateways' workers all end up waiting on the hot symbol's engine, so new orders for any symbol wait for a worker. [▶ Show it](play:broken: a hot symbol — its engine@t=8)
- **Q:** Will 32 engines fix the hot symbol?
  A: No. One symbol's orders must go through one engine in order. More engines only empty the others, at more than three times the cost. [▶ Show it](play:broken: a hot symbol — 32@t=8)
- **Q:** How do rate limits help the hot engine without hurting ordinary traders?
  A: They refuse the heaviest firms' extra orders at the gateway, so the hot engine drops to about 80% busy and everyone else is matched within 20 ms. [▶ Show it](play:rate limits@t=8)
- **Q:** Why should the engine not send market data itself?
  A: Every millisecond it waits is a millisecond its one thread cannot match orders. Appending to a journal and letting other servers send keeps the engine free. [▶ Show it](play:broken: the engine sends market data@t=8)
