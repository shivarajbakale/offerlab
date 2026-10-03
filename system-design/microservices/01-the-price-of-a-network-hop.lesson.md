# The price of a network hop

## What it is

- **What it is:** The cost of splitting one program into separate services that call each other over the network. A call that took nanoseconds inside one program now pays a round trip, encoding and decoding of its data, and a new way to fail.
- **The problem it solves:** Splitting a program into services can double every request's latency and cost, and let the least important service take the whole product down. This lesson counts what each hop adds, and keeps on the request path only the calls the user's answer needs.
- **Reach for it when:** Someone proposes splitting a monolith into services, a request waits on several services one after another, or a design review shows calls the user's answer does not depend on.
- **Not the right tool when:** No team needs to deploy on its own, so one well-structured program has no hops to count. If the user's answer depends on a call, it cannot go on a queue: keep it and bound it with a timeout and a [circuit breaker](#/sd-microservices/03-cascading-failure-and-circuit-breakers).
- **Where you'll meet it:** "Monolith or microservices?" questions in system design interviews; Martin Fowler's essay "Microservice Premium" and his first law of distributed object design ("don't distribute your objects"); service meshes such as Linkerd and Istio, whose sidecar proxies add a hop on both sides of every call.

## Words we'll use

- **Service** — a program that runs on its own machines and does one part of the job. Other programs use it by sending it requests over the network.
- **Monolith** — one program that does the whole job. Its parts call each other as ordinary functions, inside one process.
- **Function call** — one part of a program running another part in the same process. It costs a few nanoseconds (billionths of a second) and cannot get lost on the way.
- **Network hop** — a request from one machine to another, and its answer. Here each one costs 1 ms on the way out and 1 ms on the way back: the wire, plus a proxy on each side.
- **Round trip** — the time from sending a request to getting its answer, not counting the work done in between. Here 2 ms per hop.
- **Serialization** — turning data in memory into bytes to send (encoding), and back again at the other end (decoding). Here 1 ms of CPU for each call a service answers.
- **Latency** — how long one request takes from the user's point of view. **p50** is the middle latency (half were faster); **p99** is the one 99% were faster than.
- **Worker** — a slot for one request in progress inside a server. It stays taken while the request waits for anything, including another service's answer.
- **Request path** — every step a request must finish before the user gets an answer.
- **Queue** — a list of messages waiting to be handled later. A **consumer** takes messages off it and handles them. The **backlog** is how many are waiting.

## The world we're in

- A shop takes 1,000 orders a second. Each order needs: the buyer's profile, a price, a stock check, a note to the recommendations system ("this person bought this"), and a database write.
- All of that business logic costs 8 ms of CPU per order, however it is split up.
- The database takes 3 ms of CPU per write and has plenty of room (about 27% busy).
- We time requests from our own edge, 1 ms from the user, so every millisecond below is spent inside our systems.
- Teams want to split the program into services so each can deploy on its own.

## The goal

Split the work where it helps, without making every order slower, much more expensive, or dependent on the least important part of the system.

## The naive attempt

"Make each part its own service: Profile, Pricing, Inventory and Recommendations. Orders calls each in turn and writes the database."

Before the split, one program does the work. An order costs 8 ms of CPU and one network call, to the database, and comes back in about 15 ms. Four app servers are half busy.
[▶ One service: 1,000 orders a second in about 15 ms](play:one service@t=6)

After the split, the same orders take about 30 ms, twice as long. Each of the five calls adds a 2 ms round trip, and each service spends 1 ms decoding the request and encoding its answer, so an order now burns 13 ms of CPU instead of 8. Every service also needs at least two machines in case one dies, and Profile, Pricing and Inventory are each only about a third busy. The bill goes from $1.05 an hour to $2.41.
[▶ Broken: five services, twice the latency and the cost](play:broken: five services — the same@t=6)

Then, at 5 s, Recommendations has a bad moment and runs 50 times slower. Its two machines can now answer about 80 calls a second, and Orders sends it 1,000. Orders waits for each answer before replying to the user, holding a worker the whole time. Within a second all of Orders' workers are waiting, its CPUs are idle, and from 6 s almost every order fails, though Profile, Pricing, Inventory and the database are perfectly healthy. The least important call, one the user never sees, took the shop down for five seconds.
[▶ Broken: a slow Recommendations service stalls every order](play:broken: five services — one slow@t=7)

## Building it up

**1. Count what one hop costs.** A function call takes nanoseconds. A network call takes a round trip (here 2 ms; typically about 0.1-0.5 ms between machines in one zone and about 0.5-2 ms across zones, varying by cloud and region, more with proxies), plus serialization at both ends, plus the time the other service's request waits for a worker and a CPU. Five calls in a row add five of those. Latency budgets are spent hop by hop.
[▶ Five hops: p50 about 30 ms](play:broken: five services — the same@t=6)

**2. Count what one hop risks.** A call in the request path is a new way for the request to fail. If Orders needs all five answers, an order succeeds only if all five services are up and fast at that moment. Five services that are each up 99.9% of the time give an order 0.999⁵ ≈ 99.5%: about five times the downtime of one. Slowness is the dangerous case: a crashed process on a live machine refuses connections at once, while a slow service, or a machine that is gone and answers nothing at all, holds the caller's workers until a timeout frees them or they run out.
[▶ Orders' workers all waiting, its CPUs idle](play:broken: five services — one slow@t=8)

**3. Keep things that change together in one service.** Pricing and stock read the same product data and change together. Making them function calls inside Orders again removes two hops and their serialization. A boundary belongs where teams, data ownership or very different scaling needs differ, not around every function.

**4. Take side work off the request path.** Does the user's answer depend on Recommendations? No: the order is placed whether or not Recommendations hears about it this second. So Orders drops a message on a queue (under a millisecond) and answers. Consumers deliver the messages in the background. The request path is now two network calls, Profile and the database, and an order takes about 21 ms for $1.81 an hour.
[▶ Fewer hops: about 21 ms](play:fewer hops: two@t=6)

**5. Watch the same failure again.** Recommendations runs 50 times slower at 5 s. Orders never waits for it, so no order fails and p99 stays near 33 ms. The messages pile up instead: by 10 s about 4,500 are waiting, the oldest 4.5 s old. When Recommendations recovers, the consumers catch up and the backlog is gone by 12 s.
[▶ The backlog grows while Recommendations is slow](play:fewer hops: a slow@t=10)
[▶ And drains once it recovers](play:fewer hops: a slow@t=12)

## Why it works now

Latency on the request path is the sum of the hops on it, and availability is the product of their availabilities. Five synchronous hops paid five round trips and could be broken by any one of five services.
[▶ Broken: one slow service, every order failing](play:broken: five services — one slow@t=8)
Two hops pay two, and the work that does not change the user's answer waits on a queue, where a slow consumer makes the backlog older instead of making orders fail.
[▶ The same slowdown, no failed orders](play:fewer hops: a slow@t=8)

## What it costs

- **Bigger services.** Orders now holds pricing and stock code; those teams share a codebase and a deploy.
- **Eventual consistency.** Recommendations hears about an order up to seconds later. Anything that needs the result of a call before answering cannot be made async.
- **A queue to run and watch.** Alert on the age of the oldest message: it says how far behind Recommendations is.
- **Still some hops.** Profile and the database are still on the path; each still costs a round trip and can still fail.

## Staff notes

- Before approving a split, draw the request path and count the synchronous hops. Multiply: each one's latency adds, each one's availability multiplies, each one's p99 can become yours.
- For every call ask: does the user's answer depend on it? If not, it goes on a queue (lesson 026, the transactional outbox, shows how to do that without losing messages).
- Timeouts, circuit breakers (lesson 016) and bulkheads limit how long and how widely a bad dependency can hold your workers. They make failure smaller; removing the dependency from the request path removes it.
- Chatty boundaries (many small calls per request) are a sign the boundary is in the wrong place. Batch the calls, or move the boundary.
- Service meshes add a proxy on both sides of every call. That can add a millisecond or more per hop at p99, depending on the mesh, its version and the load; measure yours and include it in the budget.

## Check yourself

- **Q:** The same 8 ms of work, split into five services. Why does an order take twice as long?
  A: Each of the five calls adds a 2 ms round trip, and each service spends 1 ms on serialization, so latency and CPU both grow with every hop. [▶ Show it](play:broken: five services — the same@t=6)
- **Q:** Recommendations is the least important service. Why did its slowdown fail almost every order?
  A: Orders waited for its answer while holding a worker, so all of Orders' workers ended up waiting on it and new orders found none free. [▶ Show it](play:broken: five services — one slow@t=7)
- **Q:** In the third design, where did the slowdown go?
  A: Into the queue: the backlog and its oldest message grew while Recommendations was slow, and no order failed. [▶ Show it](play:fewer hops: a slow@t=10)
- **Q:** Five services each up 99.9% of the time are all needed for an order. About how often does an order fail?
  A: 0.999⁵ ≈ 0.995, so about 0.5% of the time, five times as often as with one service. A slow service is worse still: it holds workers. [▶ Show it](play:broken: five services — one slow@t=8)

## Deep dive

Why is a slow dependency worse than a crashed one? If the process has crashed but its machine is up, connections are refused at once and the caller fails in about a millisecond, so its worker is free again and it can fail the request quickly (or use a fallback). If the machine itself is gone or unreachable, nothing answers at all, and the caller waits for its connect or request timeout, just as it would for a slow service. Either way, the slow case is the dangerous one, and only a timeout bounds it: a slow call holds the worker for the whole timeout. By Little's law, the workers in use equal the arrival rate times the time each request holds one: at 1,000 orders a second and 30 ms each, Orders needs about 30 workers; if each order waits 1 s on a slow dependency, it needs 1,000. Orders has 4 machines × 50 workers = 200, so it runs out in a fraction of a second. That is why timeouts must be short, and why the strongest fix is not to wait at all.
