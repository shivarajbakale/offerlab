# Window rate limiters

## What it is

- **What it is:** A rate limiter that counts a client's requests over a stretch of time, such as one second or one minute, and turns requests away once the count reaches the limit. The variants differ in how they count: one counter per clock period, a list of every request time, or two counters blended by a weighted guess.
- **The problem it solves:** A counter that resets at each clock boundary lets a client send twice the limit in a moment that straddles the boundary, though limits are promised as "N per period". Sliding windows count the last period measured back from now, which closes most or all of that gap.
- **Reach for it when:** Limits are sold or documented as "N requests per period", such as API quotas or 5 login attempts per minute. The sliding log suits small limits that must be exact; the sliding counter suits millions of clients, where each one can only cost a couple of numbers.
- **Not the right tool when:** You want separate settings for the average rate and the size of a burst; a [token bucket](#/sd-04-traffic/012-token-and-leaky-bucket) gives exactly that. A plain fixed window is enough when the limit is a loose guard against abuse rather than a promise.
- **Where you'll meet it:** Cloudflare has written about using the sliding counter estimate for rate limiting at scale. Sliding logs are often built on Redis sorted sets keyed by timestamp. "Design a rate limiter" is a common interview question, and choosing between these variants is the core of it.

## In plain words

A server is a computer that does work for others: it answers requests. One misbehaving client can send so many requests that everyone else's slow down, so servers set a limit per client, like "at most 5 requests per second". A request over the limit is turned away. This lesson is about how to count, because "per second" can mean two different things.

Think of a gym that allows 5 guests an hour. A lazy doorman wipes his tally at the top of every hour, so 5 people at 9:59 and 5 more at 10:00 all get in: 10 in two minutes. A careful doorman writes down when each guest arrived and counts the ones from the last 60 minutes, whatever the clock says. A clever doorman keeps only two numbers, last hour's tally and this hour's, and makes a good guess. Those are the fixed window, the sliding log and the sliding counter.

In the picture on the right, the client is on the left, the limiter is in the middle and the server is on the right. The limiter's meter shows what it is counting against the limit: this window's count, the times stored in the log, or the sliding counter's estimate. The fixed window and the sliding counter also show which clock window they are in. The arrows and the line under them show what happened to the latest request: let through to the server, or turned away. Below that, the timeline shows every request over time. The box at the top says what just happened and why.

## Words we'll use

- **Request** — one message from a client asking the server to do some work.
- **Rate limit** — a rule like "at most 5 requests per second from each client". A request over the limit is **rejected**: turned away without doing the work. One that is let through is **accepted**.
- **Window** — a stretch of time the limit is counted over. "5 per second" has 1-second windows.
- **Fixed window** — windows lined up with the clock: from 0 to 1 second, from 1 to 2, and so on. The point where one window ends and the next begins is a **boundary**.
- **Sliding window** — "the last second", measured back from right now. It moves with every request instead of jumping at boundaries.
- **Timestamp** — the time at which a request arrived, stored as a number.
- **Estimate** — a number worked out from partial information, close to the true count but not always equal to it.

## The world we're in

- Many clients share one server, and the server must be protected from any one client sending too much.
- Limits are written as "N requests per period", such as 100 per minute. That is how quotas are sold and documented.
- There may be millions of clients, so the memory kept per client matters.
- Time is just a number here. Every call says what time it is (`allow(t)`, in seconds), so the runs are repeatable.

## The goal

Accept at most `limit` requests in any `size`-second stretch, using as little memory per client as possible.

## The naive attempt

"Keep a counter for the current second. Accept requests until it reaches the limit, and reset it to zero when the next second starts." That is a fixed window. It works for traffic spread through the second. Here the limit is 3 per second: three requests pass, the fourth is rejected, and a request at t=1.2 passes because a new window started.
[▶ At t=1.2 a new window starts and the count resets to 0](play:fixed window@at=reset#2)

But "per second" was meant as "in any one second", and the counter only counts per calendar second. Here the limit is 5. Five requests arrive between t=0.90 and t=0.98, all accepted, and the window is full.
[▶ Broken: the fifth request at t=0.98 fills the window](play:broken: fixed window@at=count#5)
At t=1.00 a new window starts, the count drops to zero, and five more requests arrive by t=1.08.
[▶ Broken: at t=1.00 the count resets, though 5 requests came in the last 0.1 s](play:broken: fixed window@at=reset#2)
All ten are accepted, within 0.18 seconds. That is twice the limit, and a client can do it every second.
[▶ Broken: the tenth request in 0.18 s is accepted](play:broken: fixed window@at=count#10)

## Building it up

**1. Remember every timestamp: the sliding log.** To count the requests in the last second exactly, keep the time of each accepted request in a list. On every request, first drop the timestamps more than a second old. What is left is exactly the requests of the last second. Same traffic, limit 5: the first five are accepted. At t=1.00 the log still holds all five, so the request is rejected, and so is the rest of the second burst.
[▶ At t=1.00 the log already holds 5 requests from the last second](play:sliding log@at=logReject#1)
At t=1.91, the request from t=0.90 is now more than one second old and drops out of the log. There is room again, and the new request is accepted.
[▶ At t=1.91, t=0.90 drops out of the log](play:sliding log@at=evict#1)
[▶ The request at t=1.91 is accepted](play:sliding log@at=record#6)
The cost: one timestamp per accepted request. With a limit of 10,000 per hour, that is up to 10,000 numbers per client.

**2. Two counters and a weighted guess: the sliding counter.** Keep the fixed window's counter, plus the count of the window before it. To estimate the last second at time t, assume the previous window's requests were spread evenly through it. Then the part of the previous window that still lies inside the last second holds about `previous × weight` of them, where `weight` is that part's share of the window: 1 right at a boundary, 0.5 halfway through. The estimate is `previous × weight + current`.

At t=1.00 a new window begins. Its counter starts at 0, but the previous window's 5 are kept.
[▶ At t=1.00 the previous window's count of 5 is kept](play:sliding counter@at=roll#2)
The weight is 1, so the estimate is 5 × 1 + 0 = 5, which is not below the limit, and the request is blocked. The fixed window would have accepted it.
[▶ At t=1.00 the estimate is 5, so the request is blocked](play:sliding counter@at=block#1)

**3. The estimate's error.** The guess assumes even spreading, but here the previous window's requests were bunched at its very end. At t=1.02 the weight is 0.98, the estimate is 4.9, and the request is accepted. That makes 6 requests within 0.12 seconds, one over the limit.
[▶ At t=1.02 the estimate is 4.9, so one extra request gets through](play:sliding counter@at=admit#6)
The next request's estimate is 4.8 + 1 = 5.8, and the rest of the burst is blocked. Here the error is one request. It comes only from how uneven the previous window was, and it is not always this small: see the deep dive. Later in the window the weight fades: at t=1.5 it is 0.5, the estimate is 5 × 0.5 + 1 = 3.5, and requests pass again. That request makes 7 in the last second, the same bunching error once more.
[▶ At t=1.5 the estimate is 3.5](play:sliding counter@at=estimate#11)

## Why it works now

- The sliding log counts exactly the requests in the last `size` seconds, so no stretch of `size` seconds can hold more than `limit` accepted requests. The test checks every one-second stretch.
- The sliding counter can only be wrong about the previous window, and only by how far its requests were from even. Against this boundary burst, it lets 6 through where the fixed window lets 10 [▶ see the fixed window let 10 through](play:broken: fixed window@at=count#10).

## What it costs

- **Fixed window:** one counter and a window start per client. Cheapest, but up to twice the limit across a boundary.
- **Sliding log:** up to `limit` timestamps per client, and the work of dropping old ones. Exact. Fine for small limits, such as 5 login attempts per minute; heavy for 10,000 per hour.
- **Sliding counter:** two counters and a window start per client. Close to exact for smooth traffic, but bunched traffic can get up to nearly twice the limit through.

## Staff notes

- **Which to choose.** The sliding counter is a good default for API limits: tiny memory and close to the true count. Use the sliding log where exactness matters and limits are small. A fixed window is fine when the limit is a loose guard rather than a promise.
- **Storage per key.** A limit per user, per API key or per IP address means one limiter per key. In a shared store, give each key an expiry of about two windows so idle clients cost nothing, and do the read-check-increment as one atomic operation, or two servers can both accept the last slot.
- **Windows versus token buckets.** Windows express "N per period" quotas directly. A token bucket (lesson 012) has separate knobs for the average rate and the burst size. Both are common.
- **Tell the client when to retry.** The window's end, or the time until the oldest timestamp leaves the log, is a natural value for a `Retry-After` header.

## Check yourself

- **Q:** A fixed window allows 5 per second. Five requests come at t=0.90 to 0.98 and five more at t=1.00 to 1.08. How many are accepted?
  A: All ten. The count resets at t=1.00, so each window sees only five. [▶ See it](play:broken: fixed window@at=count#10)
- **Q:** A sliding log with limit 5 gets the same traffic. What happens to the request at t=1.00?
  A: It is rejected. The log holds five timestamps from the last second. [▶ See it](play:sliding log@at=logReject#1)
- **Q:** When does the sliding log accept the next request?
  A: Once its oldest entry, t=0.90, is more than a second old: the request at t=1.91 is accepted. [▶ See it](play:sliding log@at=record#6)
- **Q:** A sliding counter had 5 requests in the previous window and 0 so far in this one. At t=1.00 exactly, what is the estimate, and is the request accepted?
  A: 5 × 1 + 0 = 5. That is not below the limit of 5, so it is blocked. [▶ See it](play:sliding counter@at=block#1)
- **Q:** Why does the sliding counter let one request through at t=1.02, giving 6 in under a second?
  A: Its estimate assumes the previous window's requests were spread evenly, so it counts only 98% of them. They were really all at the end, so the true count was 5, not 4.9. [▶ See it](play:sliding counter@at=admit#6)

## When to use which

- **Fixed window** — when the limit is a loose guard against abuse, not a promise, and memory must be tiny. Example: 1,000 requests per hour per IP address to slow down scrapers; letting 2,000 through across an hour boundary does no harm.
- **Sliding log** — when the limit is small and must be exact. Example: 5 login attempts per 15 minutes per account, where every extra guess at a password matters. It stores up to 5 times per account, which is cheap at that size.
- **Sliding counter** — the default for API quotas with many clients. Example: 100 requests per minute per API key across millions of keys: two counters per key, and close to exact on real traffic.
- **[Token bucket](#/sd-04-traffic/012-token-and-leaky-bucket)** — when you want two separate settings, an average rate and a burst size. Example: "10 per second, with bursts of 50" for a mobile app that fires many requests when a screen opens.
- **[Leaky bucket](#/sd-04-traffic/012-token-and-leaky-bucket)** — when the server behind the limiter needs requests evenly spaced, such as a database that can't take bursts.
- **Not a rate limiter at all** — when the trouble is a failing server rather than a greedy client. Clients should [retry with backoff](#/sd-04-traffic/015-retry-backoff-jitter), and callers should put a [circuit breaker](#/sd-04-traffic/016-circuit-breaker) in front of it.
- **In an interview:** name the fixed window's boundary problem (twice the limit across a boundary), then pick the sliding counter for scale, or the sliding log when the limit is small and must be exact. Keep the counters in a shared store such as Redis, updated atomically.

## Deep dive

- The sliding counter's estimate is exact when the previous window's requests were spread evenly. Its worst case is worse than this run. Put the previous window's 5 requests at its very end (t=0.99), then send requests late in the current window, when that window's weight has faded: at t=1.6 the weight is 0.4, at t=1.85 it is 0.15. With a limit of 5, 10 requests get through within 0.91 s, twice the limit, the same as the fixed window. The test checks this case. On real traffic, which is rarely bunched like that, the error is small: Cloudflare reported that only a tiny share of requests were wrongly allowed or blocked.
- A sliding log is often built on a sorted set keyed by timestamp: remove entries older than the window, count what is left, and add the new one, all in one atomic step.
- A middle ground splits each window into smaller buckets (for example 60 one-second buckets for a one-minute limit). Memory grows with the number of buckets and the error shrinks with their size.
