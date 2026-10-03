# Bulkheads

## What it is

- **What it is:** A bulkhead is a cap on how many of a server's workers may wait on one dependency at once. It splits one shared pool into compartments, like the walls in a ship's hull that stop one leak from flooding the whole ship.
- **The problem it solves:** When one slow dependency holds every shared worker, requests that never call it fail too. A bulkhead lets that dependency fill only its own compartment, so everything else keeps working at normal speed.
- **Reach for it when:** A server calls several dependencies of different importance or reliability, especially third parties, and one endpoint's slowness must not touch the others. You need the dependency's call rate and latency to size its share.
- **Not the right tool when:** A server calls one dependency on every request, so there is nothing to keep apart. To stop sending calls to a failing service at all, use a [circuit breaker](#/sd-microservices/03-cascading-failure-and-circuit-breakers); to isolate CPU, memory and deploys too, run the endpoint as its own service.
- **Where you'll meet it:** Michael Nygard's book "Release It!", which describes the pattern; Netflix's Hystrix, with thread-pool and semaphore isolation; Resilience4j's Bulkhead and ThreadPoolBulkhead modules; per-cluster connection and request limits in proxies such as Envoy.

## Words we'll use

- **Worker** — a slot for one request in progress inside a server. It stays taken while the request waits for anything, including another service's answer. Here each server has 50, and 4 servers have 200.
- **Shared pool** — every request on a server, whatever it is for, takes its worker from the same 50.
- **Dependency** — another service a server calls. Here checkouts depend on a **fraud check**: an outside service that scores whether a payment looks fraudulent. Product pages do not call it.
- **Bulkhead** — a cap on how many of a server's workers may wait on one dependency at once. Named after the walls that split a ship's hull into compartments, so one leak floods one compartment, not the ship.
- **Compartment** — the workers a bulkhead allows one dependency: here 20 per server for the fraud check.
- **Pool full** — a call the bulkhead refused because its compartment was already full. It fails at once, without being sent and without holding a worker.
- **Fail fast** — answer "no" right away instead of making the caller wait for an answer that will not come in time.
- **Little's law** — requests in progress = arrival rate × time each one stays. 25 checkouts a second per server × 0.3 s = about 8 workers waiting on the fraud check, on a normal day.

## The world we're in

- 1,000 requests a second: 900 product pages and 100 checkouts.
- A product page does 4 ms of work and a quick database read: about 11 ms in all.
- A checkout writes the order and then waits for the fraud check, which normally answers in about 300 ms (sometimes a few times that).
- Users wait up to 1 s for a page and 5 s for a checkout. The server is not told when they give up, and keeps waiting.
- From 5 s to 13 s the fraud check answers about 30 times slower: about 9 s. Calls that start in that window stay slow after it ends.
- We do not run the fraud check and cannot make it faster. We can only decide how much it can hurt us.

## The goal

When the fraud check is slow, product pages must stay exactly as healthy as on a normal day. Checkouts should fail quickly and recover as soon as the fraud check does.

## The naive attempt

"One pool of servers for everything. Checkouts call the fraud check and wait."

On a normal day, checkouts hold about 30 of the 200 workers (100 a second × 0.3 s), and the slowest pages take about 18 ms. From 5 s, each checkout holds its worker for about 9 s. 100 checkouts a second × 9 s would need 900 workers. By 7 s all 200 are waiting on the fraud check, and the CPUs are about 4% busy. From 7 s to 13 s about 95% of product pages fail, though not one of them calls the fraud check: they cannot get a worker.
[▶ Broken: a slow fraud check fails product pages too](play:broken: one shared pool@t=9)

## Building it up

**1. Find the shared thing.** The fraud check did not touch product pages. What they share is the pool of workers, and one kind of request filled it. Whoever holds workers longest wins the pool, and the slowest dependency always holds them longest.

**2. Split the pool.** Allow at most 20 of each server's 50 workers to wait on the fraud check: 80 of 200 in all. The 21st checkout on a server is refused at once (pool full), without a call, without holding a worker. Pick the size from Little's law: on average about 8 per server wait on it (the floor), so 20 leaves room for bursts and the slow tail, the p99 that the size should really be measured against.
[▶ Bulkhead: the same outage](play:bulkhead: product pages stay healthy@t=9)

**3. Watch the healthy endpoint.** From 7 s to 13 s, no product page fails, the median page still takes about 11 ms and the slowest about 18 ms, as on a normal day. Workers are about 44% used: the 80 in the fraud compartment, stuck, and the rest serving pages.
[▶ Product pages untouched](play:bulkhead: product pages stay healthy@t=11)

**4. Accept what the compartment costs.** Nearly every checkout fails during the outage: about 95 a second are refused because the compartment is full. That is the trade: checkouts fail fast instead of everything failing slowly. But there is a second cost. The fraud check is normal again at 13 s, and the calls that started just before still take 9 s. They hold the compartment, so from 14 s to 16 s about 60% of checkouts are still refused.
[▶ Checkouts still refused after the fraud check recovered](play:bulkhead: product pages stay healthy@t=15)

**5. Add a timeout.** Give up on a fraud check after 2 s. A stuck call now holds its worker for at most 2 s, so the compartment empties within 2 s of the fraud check recovering. Pages are just as healthy during the outage. From 15.5 s on nothing fails, and the median checkout is back to about 300 ms.
[▶ Bulkhead and timeout: checkouts back by 15 s](play:bulkhead and timeout@t=16)

## Why it works now

The failure spread because one dependency could take every worker.
[▶ Broken: every worker waiting on the fraud check](play:broken: one shared pool@t=9)
A bulkhead turns "every worker" into "20 per server". The fraud check can still fill its own compartment, and checkouts fail while it is full, but the other 30 workers per server belong to pages it never touches. The timeout bounds how long the compartment stays full after the dependency recovers.
[▶ The same outage, pages unaffected](play:bulkhead and timeout@t=10)

## What it costs

- **Refused work on a busy normal day.** A compartment too small turns a burst of checkouts, or a slow-but-working fraud check, into refusals the shared pool would have absorbed. Size it from measured rate × p99 latency, with headroom.
- **A compartment protects the others, not itself.** Checkouts still fail during the outage. To give them something better, add a fallback (for example, accept the order and run the fraud check later, if the business allows it) or a circuit breaker (lesson 03).
- **Timeouts on side-effecting calls.** A timed-out call may still have happened at the other end. A fraud check is nearly side-effect free for us, so that is harmless here; for a payment you must find out what happened before retrying.
- **Orphan orders.** Here the order is written before the fraud check, so a checkout refused by the bulkhead or timed out leaves an order row behind, though the user was told it failed. In a real system write it as "pending" and cancel it on failure, or check fraud first.
- **Tuning per dependency.** Each bulkhead is one more number to choose and revisit as traffic grows.

## Staff notes

- Put a bulkhead on every dependency whose latency you do not control, especially third parties. Size: normal rate × p99 latency × a safety factor, per server.
- Alert on pool-full refusals. They start the moment a dependency slows, often before any error-rate alert fires.
- In-process bulkheads (a counter or a thread pool per dependency, as here) cost nothing in hardware. The stronger version is separate servers per endpoint (lesson "Checkout and payments" moves checkout into its own service), which also isolates CPU, memory and deploys.
- Bulkheads, timeouts and breakers do different jobs: the bulkhead caps how many workers wait, the timeout caps how long, the breaker stops sending calls. Production systems usually need all three.
- Apply the same idea upstream: a gateway in front of several services needs a compartment per service, or the slowest one fills the gateway.

## Check yourself

- **Q:** Product pages never call the fraud check. Why did 95% of them fail?
  A: Checkouts waiting 9 s each took all 200 shared workers (100 a second × 9 s far exceeds 200), so pages could not get one. [▶ Show it](play:broken: one shared pool@t=9)
- **Q:** With the bulkhead, why do pages keep their normal latency?
  A: At most 20 workers per server can wait on the fraud check, so 30 per server are always left for pages, which need only a few. [▶ Show it](play:bulkhead: product pages stay healthy@t=11)
- **Q:** The fraud check recovered at 13 s. Why were checkouts still refused at 15 s with the bulkhead alone?
  A: Calls started just before 13 s still took about 9 s and held the compartment full. A 2 s timeout frees it within 2 s. [▶ Show it](play:bulkhead: product pages stay healthy@t=15)
- **Q:** How would you size the fraud-check compartment?
  A: Little's law: normal rate per server × latency (25 × 0.3 s ≈ 8 workers), plus headroom for bursts and the slow tail; here 20. [▶ Show it](play:bulkhead and timeout@t=18)

## Deep dive

Thread pool or counter? Hystrix offered both. A **thread-pool bulkhead** runs each dependency's calls on its own threads, so the caller's thread can give up on a timeout even if the call itself cannot be interrupted, at the cost of a thread hand-off per call. A **semaphore bulkhead** is just a counter checked before the call, as in this simulator: cheaper, but the waiting is done on the caller's own worker, so it relies on the call honouring its timeout. In an asynchronous server (event loop, coroutines) waiting does not hold a thread, but it still holds memory, connections and a place in the dependency's queue, so a concurrency limit per dependency is still the bulkhead.
