# Circuit breaker

## What it is

- **What it is:** A guard placed in front of calls to another service. It counts failures, and once the service keeps failing it stops calling it and answers "no" at once, then lets a single trial call through now and then to see whether the service is back.
- **The problem it solves:** When a service that a caller depends on goes down, every call waits for its full timeout while holding a thread, so the caller runs out of threads and goes down too. A breaker fails fast instead, freeing the caller and leaving the failing service alone to recover.
- **Reach for it when:** Services call each other, a dependency can hang or fail for minutes, and the caller has something better to do with a fast "no": cached data, a default, or a clear error. Also when one dependency's outage must not take down unrelated features.
- **Not the right tool when:** Failures are brief and scattered; [retry with backoff](#/sd-04-traffic/015-retry-backoff-jitter) handles those. When one server among many copies is bad, the [load balancer's](#/sd-04-traffic/014-load-balancing) health checks should take it out of rotation instead.
- **Where you'll meet it:** Michael Nygard's book "Release It!" describes the pattern. Netflix's Hystrix made it common and is now in maintenance mode; Resilience4j is a widely used Java library in its place. Envoy's outlier detection, used by service meshes such as Istio, ejects failing hosts at the proxy.

## Words we'll use

- **Service** — a program that answers requests from other programs. Here, one caller depends on one service.
- **Dependency** — a service that another service calls to do its own work. If the dependency is down, the caller can't finish.
- **Call** — one request from the caller to the service. Here the caller makes 2 calls every tick (one unit of simulated time).
- **Timeout** — how long a caller waits for an answer before giving up. Here 1000 ms. A healthy call answers in 20 ms.
- **Fail fast** — answer "no" at once, without calling the service at all: 0 ms of waiting.
- **Cascading failure** — one service failing makes the services that call it fail too, because they are stuck waiting on it.
- **Circuit breaker** — a guard in front of a dependency that stops calling it while it is failing. It is in one of three states: **closed** (calls go through), **open** (calls fail fast) or **half-open** (one trial call goes through to test the dependency).
- **Threshold** — how many failures in a row open the breaker. Here, 3.
- **Cooldown** — how long the breaker stays open before trying again. Here, 5 ticks.

## The world we're in

- Services crash, restart and get overloaded. A down service usually doesn't answer "I'm down"; it just doesn't answer, and callers wait for their timeout.
- While a caller waits, it holds resources: a thread, a connection, memory for the request. It has only so many.
- A service that is restarting is fragile: incoming connections take the resources it needs to start. Steps 1 to 4 leave this out, so the restart takes the same time whatever traffic arrives. Step 5 turns it on: any tick in which the service gets more than one call pushes its restart back by 3 ticks.
- The caller can't see inside the service. All it learns is whether each call worked.

## The goal

When a dependency goes down, stop wasting time and resources on it, leave it alone to recover, and start using it again as soon as it is back.

## The naive attempt

"Just call the service, and if it fails, it fails." The service goes down at tick 2. Every call now waits the full second before failing.
[▶ Broken: at t=2 a call waits 1000 ms and times out](play:broken: no breaker@at=direct#5)
Ten ticks of outage, two calls a tick: twenty calls each wait a full second. In a real service each of those waits holds a thread, so with enough traffic the caller runs out of threads and stops answering its own callers. One service down becomes two.
[▶ Broken: the 20th timeout, at t=11: callers have waited over 20 seconds](play:broken: no breaker@at=direct#24)

## Building it up

**1. Closed: count failures in a row.** While things are normal the breaker is closed and every call goes through. It counts failures in a row, and any success resets the count. A blip is not an outage: here the service fails both calls of tick 2, which is 2 failures, under the threshold of 3.
[▶ The second failure in a row: still under the threshold](play:closed@at=fail#2)
The next call succeeds, the count goes back to 0, and the breaker never opens.

**2. Open: fail fast.** When the service stays down, the third failure in a row reaches the threshold and the breaker opens.
[▶ At t=3 the third failure opens the breaker](play:open@at=open#1)
From then on, calls fail at once, in 0 ms, and never reach the service. The caller gets its answer immediately and can do something useful with it: show cached data, a default, or an error, instead of hanging. And the service gets no traffic while it is down.
[▶ The next call fails fast without touching the service](play:open@at=fastFail#1)

**3. Half-open: one trial call after the cooldown.** An open breaker must find out when the service is back. After the 5-tick cooldown it goes half-open.
[▶ At t=8 the cooldown is over, and the breaker goes half-open](play:half-open@at=halfOpen#1)
Exactly one call goes through as a trial.
[▶ The first call at t=8 is the trial](play:half-open@at=trial#1)
Every other call still fails fast while the trial is out, so a service that is still down sees one call, not full traffic.
[▶ The second call at t=8 fails fast: the trial is already out](play:half-open@at=fastFail#1)
The trial times out, so at the next tick the breaker opens again for another cooldown.
[▶ At t=9 the failed trial reopens the breaker](play:half-open@at=open#1)

**4. A successful trial closes it.** In this scenario the restart is not slowed by load, so the service is back at t=12 whatever calls arrive. The trial at t=8 failed. The next trial, at t=14, succeeds, and at t=15 the breaker closes and every call goes through again.
[▶ At t=15 the successful trial closes the breaker](play:recover@at=close#1)

**5. Why half-open, and not just closed after the cooldown?** Without half-open, the breaker closes as soon as the cooldown ends. Full traffic, two calls a tick, hits a service that is still restarting.
[▶ Broken: at t=8 the breaker closes and both calls hit the restarting service](play:broken: no half-open@at=straightClosed#1)
The restart was due to finish at t=12, but the two calls at t=2, before the breaker had opened, already pushed it back 3 ticks, to t=15. After that, each time the breaker closes, both calls of the tick hit the restarting service and push the restart back another 3 ticks. The breaker closes at t=8, 14 and 20, and the service isn't ready until t=24. With half-open, nothing after t=2 pushes it back, because the service sees only one call per cooldown, so it is ready at t=15.
[▶ Broken: at t=20 the breaker closes again, and the service is knocked back again](play:broken: no half-open@at=straightClosed#3)

## Why it works now

- While the service is down, at most one call per cooldown reaches it: the trial. Callers wait for at most `threshold` timeouts to open the breaker, plus one per trial. The no-breaker test checks that callers wait more than three times as long without one.
- The breaker leaves open only through half-open, and half-open closes only after a trial succeeds. So full traffic returns only once the service has answered. The recover test checks the exact order: closed, open, half-open, open, half-open, closed.
- Any success resets the failure count, so scattered failures in a healthy service never open the breaker.

## What it costs

- **Rejecting calls that would have worked.** After the service recovers, calls still fail fast until the next trial succeeds: up to one cooldown of lost calls.
- **Tuning.** A low threshold opens on short blips; a high one pays more timeouts before opening. A short cooldown probes a down service often; a long one keeps a feature off after the service is back.
- **A fallback is needed.** Failing fast only helps if the caller has something better to do with the "no", such as cached data, a default, or a clear error.
- **State per dependency.** Small (a state, a count and two times), but it must be kept for every dependency, and every caller instance has its own breaker, so they open at slightly different times.

## Staff notes

- **One breaker per dependency,** often per endpoint. A shared breaker lets one bad dependency switch off calls to healthy ones.
- **What counts as a failure.** Timeouts, refused connections and server errors (HTTP 5xx) count. Errors that are the caller's fault, such as "not found" (404) or "bad request" (400), mean the service is working and must not open the breaker.
- **Failure rate, not just failures in a row.** Many breakers open when the failure rate over a sliding window passes a limit (say 50% of the last 100 calls), with a minimum number of calls, so a busy service isn't judged on three unlucky calls.
- **With retries and timeouts.** Timeouts are what turn a hung call into a failure the breaker can count. Retries (lesson 015) should stop while the breaker is open; otherwise each fast failure is retried at once.
- **Bulkheads.** Giving each dependency its own limited pool of threads or connections keeps one slow dependency from using up the resources the others need.

## Check yourself

- **Q:** The threshold is 3. A service fails twice in a row, then succeeds. What state is the breaker in?
  A: Closed. Two failures are under the threshold, and the success resets the count to 0. [▶ See it](play:closed@at=fail#2)
- **Q:** The breaker is open. Does a call at t=4 reach the service?
  A: No. It fails fast in 0 ms, and the service sees no traffic. [▶ See it](play:open@at=fastFail#3)
- **Q:** The cooldown ends at t=8 and two calls arrive. What happens to each?
  A: The first goes through as the trial. The second fails fast, because the trial is already out. [▶ See it](play:half-open@at=fastFail#1)
- **Q:** The trial at t=14 succeeds. What happens next?
  A: The breaker closes at t=15 and every call goes through again. [▶ See it](play:recover@at=close#1)
- **Q:** Without a breaker, the service is down for 10 ticks and the caller makes 2 calls a tick. How long do callers wait in total?
  A: 20 calls × 1000 ms = 20 seconds, all of it waiting for a service that isn't there. [▶ See it](play:broken: no breaker@at=direct#24)

## Deep dive

- Michael Nygard's book "Release It!" describes the circuit breaker pattern, along with bulkheads and timeouts, as ways to stop failures from spreading between services.
- Netflix's Hystrix library made circuit breakers common for calls between services. It is now in maintenance mode, and Resilience4j is a widely used Java library with closed, open and half-open states and failure-rate thresholds.
- Envoy's outlier detection takes a related approach at the proxy: it temporarily removes hosts that return too many errors from the load-balancing pool.
