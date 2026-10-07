# Retry with backoff and jitter

## What it is

- **What it is:** A rule for what a client does after a request fails: wait, then try again, waiting longer after each failure (exponential backoff), adding randomness to each wait (jitter), and giving up after a set number of attempts.
- **The problem it solves:** When many clients fail together and all retry at once, the retries alone keep the server overloaded, so nobody is served even after the original problem is gone. Backoff makes each client retry less often over time, and jitter stops clients from coming back in step.
- **Reach for it when:** A call goes over a network to something that can fail briefly: another service, a database, a cloud API. It matters most when many clients share one server and can fail at the same moment, such as during a restart, a deploy or a network blip.
- **Not the right tool when:** The error is permanent, such as a bad request or a permission error, so every retry fails the same way. The operation is not safe to repeat; make it so first, as in the [idempotent consumer](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer). A dependency that keeps failing needs a [circuit breaker](#/sd-04-traffic/016-circuit-breaker).
- **Where you'll meet it:** Marc Brooker's "Exponential Backoff And Jitter" on the AWS Architecture Blog; the AWS SDKs, which retry with exponential backoff and jitter; gRPC retry policies; and HTTP `Retry-After` headers on 429 and 503 responses. Retry storms are a common cause of metastable failures in large outages.

## In plain words

Requests sent over a network sometimes fail for reasons that pass on their own: the server is restarting, or briefly too busy. Trying again a little later usually works, so clients retry. The danger is that a retry is one more request. When many clients fail at the same moment and all retry at once, the retries alone can keep the server overloaded, so nobody gets through even after the original problem is gone.

Think of a shop whose door jams for a minute. If everyone outside keeps shoving the door at the same moment, it stays jammed. If each person steps back, waits a little longer after every failed push, and picks their own moment to try again, people trickle in and the door works. Waiting longer each time is backoff; picking your own random moment is jitter.

In the picture on the right, the clients are on the left, one chip each, showing what happened to their last attempt and when they will try next. The middle box names the retry rule they all follow. The server on the right shows how many requests reached it this tick against the number it can handle, and turns red when it is overloaded or still restarting. Below, the timeline shows every attempt over time, one row per client, with the load per tick. The box at the top says what just happened.

## Words we'll use

- **Request** — a message from a client asking a server to do some work. It either succeeds or fails.
- **Tick** — one unit of simulated time.
- **Transient failure** — a failure that goes away by itself: a server restarting, a short overload, a dropped connection. Trying again a little later works.
- **Retry** — sending the same request again after it failed. Each send is an **attempt**.
- **Capacity** — how many requests the server can handle in one tick. Here, 4.
- **Overload** — more requests in a tick than the capacity. Here the server then splits its time among all of them, none gets enough, and every one of them times out and fails.
- **Backoff** — waiting before a retry. **Exponential** backoff doubles the wait after each failure: 2, 4, 8, 16 ticks.
- **Jitter** — randomness added to the wait. With **full jitter**, the wait is a random number of ticks from 1 up to the backoff value.
- **Retry cap** — the most attempts a client makes before it gives up and reports the failure.

## The world we're in

- Failures happen, and many of them are transient. A client that never retries turns every brief hiccup into an error for its user.
- Many clients share one server. They don't talk to each other, and they all run the same retry code.
- An overloaded server doesn't just serve the first few and turn the rest away: it slows down for everyone, and requests time out. That is what this server does.
- Clients often fail at the same moment, because the same event hit all of them: a server restart, a network blip, a deploy.

## The goal

Get every request through a transient failure, without the retries themselves keeping the server overloaded.

## The naive attempt

"If a request fails, send it again right away." Eight clients send at the same moment, and the server can handle four. Overloaded, all eight fail. One tick later all eight retry, and the server is overloaded again.
[▶ Broken: at t=1 all 8 retry at once, and the server is overloaded again](play:broken: immediate retries@at=overload#2)
It goes on every tick. The load that keeps the server down is now nothing but retries. After six attempts each, all eight give up. Not one was served, though the server could have handled all of them in two ticks.
[▶ Broken: at t=5 the last client gives up; nobody was served](play:broken: immediate retries@at=giveUp#8)
This is a **retry storm**: retries meant to hide a failure keep it going.

## Building it up

**1. Retrying is still right for transient failures.** One client, and a server that is restarting until t=20. Its attempts fail while the server is down.
[▶ The first attempt fails: the server is down](play:backoff@at=down#1)
The attempt at t=30 comes after the restart and succeeds. Without retries, the user would have seen an error.
[▶ At t=30 the retry succeeds](play:backoff@at=served#1)

**2. Exponential backoff: wait longer after each failure.** The client waits 2 ticks after the first failure, then 4, then 8, then 16. The longer the trouble lasts, the less often this client adds to it, so a struggling server gets room to recover.
[▶ After the third failure, at t=6, the wait grows to 8 ticks](play:backoff@at=ceiling#3)

**3. But backoff alone keeps clients in step.** Back to eight clients that failed together. They all run the same backoff, so they all wait 2 ticks, then 4, then 8, together. Every retry tick gets all eight, and every one is overloaded. The server sits idle in between, then gets flooded again.
[▶ Broken: at t=2 all 8 come back together](play:broken: backoff without jitter@at=overload#2)
[▶ Broken: at t=30 they are still in step: 8 at once again](play:broken: backoff without jitter@at=overload#5)
Backoff cut the number of retries per tick on average, but not the peak, and the peak is what overloads the server.

**4. Full jitter: a random wait up to the backoff.** Each client picks its wait at random, from 1 up to its current backoff. Clients that failed together now come back at different ticks.
[▶ c0's backoff is 2, and it picks a wait of 1 tick](play:full jitter@at=jitter#1)
[▶ c1 picks a wait of 2 ticks](play:full jitter@at=jitter#2)
The first retries can still collide: the backoff is only 2, so there are just two ticks to choose from, and 6 clients pick t=1. That tick is overloaded.
[▶ At t=1, 6 clients retry and overload the server](play:full jitter@at=overload#2)
After the second failure there are four ticks to choose from, and the crowd thins out. Ticks now get 3 or fewer requests, and they succeed. By t=5 every client has been served.
[▶ At t=5 the last client is served](play:full jitter@at=served#8)

**5. A retry cap: give up eventually.** Some failures are not transient: the server may be down for good. A client that retries forever adds load forever and never tells its user. Here the server is down for 100 ticks, and the client gives up after 4 attempts.
[▶ After the fourth failure, at t=14, the client gives up](play:retry cap@at=giveUp#1)

**6. Only retry what is safe to repeat.** A request can succeed on the server while the response is lost on the way back. The client sees a failure and retries, and the server does the work twice. That is harmless for "read my profile", but not for "charge my card". Retries need the request to be **idempotent**: doing it twice has the same effect as once, often by sending a unique request id that the server remembers (lesson 026).

## Why it works now

- Backoff makes each client's retries rarer the longer a failure lasts, so the total retry load falls over time instead of staying constant.
- Jitter breaks up clients that failed together. Their retries land on different ticks, so a tick's load falls under the capacity, and requests succeed instead of timing out together. With jitter all 8 clients are served by t=5. Without it, the test runs 64 ticks and none is ever served: all 8 always arrive in the same tick, and in this model an overloaded tick fails every request in it, not just the ones over the capacity.
- The cap bounds the extra load any one request can cause: at most `maxAttempts` sends.

## What it costs

- **Latency.** Waiting is the point, but the user waits too. A request that needs three retries with backoff can take many times longer than one that succeeds at once.
- **Unpredictability.** With jitter, two identical failures recover at different times. That is the goal, but it makes behaviour harder to reason about from a single trace.
- **Retries still add load.** Even with backoff, every retry is a request the server must handle. During a long outage, retries from many clients can be a large share of the traffic.
- **Correctness depends on idempotency.** Retrying an operation that is not safe to repeat turns a lost response into a duplicate action.

## Staff notes

- **Retry at one layer only.** If a web server, the service it calls, and the database client each retry 3 times, one user request can become 3 × 3 × 3 = 27 attempts at the bottom layer, exactly when it is already struggling. Pick one layer, usually the one nearest the user.
- **Retry budgets.** Limit retries as a share of normal traffic, for example "retries may be at most 10% of requests". During a widespread outage, the budget runs out and clients fail fast instead of multiplying the load.
- **Listen to the server.** If the server says when to come back (HTTP 429 or 503 with a `Retry-After` header), wait at least that long.
- **Don't retry permanent errors.** A malformed request or a permission error will fail the same way every time.
- **Combine with a circuit breaker** (lesson 016), which stops calling a dependency that keeps failing, so clients don't even spend their attempts.

## Check yourself

- **Q:** Eight clients fail at the same time and retry immediately, every tick. The server handles 4 per tick. When is anyone served?
  A: Never. Every tick gets all 8, every tick is overloaded, and they all give up after 6 attempts. [▶ See it](play:broken: immediate retries@at=giveUp#8)
- **Q:** With exponential backoff (2, 4, 8, 16), a request first fails at t=0. When are its next attempts?
  A: At t=2, 6, 14 and 30: each wait is double the one before. [▶ See it](play:backoff@at=served#1)
- **Q:** The same eight clients use exponential backoff without jitter. How many arrive at t=2?
  A: All 8. They failed together and wait the same 2 ticks, so they come back together. [▶ See it](play:broken: backoff without jitter@at=overload#2)
- **Q:** With full jitter, can two clients still pick the same retry tick?
  A: Yes, especially early on when the backoff is small. At t=1, 6 clients collide. The range doubles each time, so collisions quickly become rare. [▶ See it](play:full jitter@at=overload#2)
- **Q:** The server is down for 100 ticks. What does a client with a cap of 4 attempts do?
  A: It tries at t=0, 2, 6 and 14, then gives up and reports the failure instead of adding load forever. [▶ See it](play:retry cap@at=giveUp#1)

## When to use which

- **Retry with exponential backoff and jitter** — the default for any call over a network that can fail briefly. Example: a mobile app calling an API, or a service calling a cloud storage API that sometimes answers 503 "try again".
- **Backoff without jitter** — only when one client is retrying alone, such as a single batch job polling a server. With many clients that can fail together, always add jitter.
- **Retry immediately, once** — acceptable for a single dropped connection to a healthy server. Never as a loop.
- **Don't retry** — when the error won't change (400 bad request, 403 permission denied), or when the operation is not safe to repeat, like "charge my card", unless it carries an idempotency key ([idempotent consumer](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer)).
- **[Circuit breaker](#/sd-04-traffic/016-circuit-breaker)** — when the dependency stays down for long. Stop calling it and fail fast instead of spending every caller's attempts on it. Use it together with retries.
- **[Rate limiter](#/sd-04-traffic/012-token-and-leaky-bucket) on the server** — the server's own protection against clients that retry too eagerly. It answers 429 with `Retry-After`, and well-behaved clients wait that long.
- **In an interview:** when you add retries, say "exponential backoff with jitter, a cap on attempts, only for idempotent requests, at one layer", and mention a retry budget or a circuit breaker for long outages.

## Deep dive

- Marc Brooker's post "Exponential Backoff And Jitter" on the AWS Architecture Blog (2015) simulates clients competing for a shared resource and finds that adding jitter greatly reduces both the total work and the completion time. It compares "full jitter", "equal jitter" and "decorrelated jitter".
- A failure where the trigger is gone but the system stays overloaded because of its own retries is sometimes called a **metastable failure**. Retry storms are a common cause.
- gRPC lets services configure retry policies with exponential backoff and a cap on attempts, and supports throttling retries when too many fail.
