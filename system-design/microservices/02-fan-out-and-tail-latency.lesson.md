# Fan-out and tail latency

## What it is

- **What it is:** What happens to response time when one request must wait for answers from many servers, and the ways to keep it fast. A page that needs ten answers is only as fast as the slowest of the ten.
- **The problem it solves:** When a page needs ten answers and each server is slow 1% of the time, about one page in ten is slow, though every server looks healthy. Making fewer calls, and asking a second copy when the first is late, brings the slow end back near normal.
- **Reach for it when:** A request gathers answers from many services or shards, such as a home page or a search over many partitions, and the slowest 1% of requests (the p99) matters more than the average.
- **Not the right tool when:** A request makes only one or two calls, so the tail barely grows. If servers are slow because they are overloaded, a second request makes it worse: shed load or add capacity, and cap extra tries with a [retry budget](#/sd-microservices/04-retry-storms-and-retry-budgets).
- **Where you'll meet it:** Dean and Barroso's paper "The Tail at Scale" (Communications of the ACM, 2013), which describes hedged and tied requests; search engines that send each query to many index shards and merge the answers; "Design a news feed" and "Design search" interviews.

## Words we'll use

- **Fan-out** — one request that needs answers from several other services before it can reply. The **fan-out** of a request is how many calls it makes. **Scatter-gather** is the same idea: send the question to many machines, then collect their answers.
- **Latency** — how long one request takes. **p50** is the middle latency (half were faster); **p99** is the one 99% were faster than. The slow end is the **tail**; **tail latency** means the p99 or p99.9.
- **Slow moment** — a short stretch when one machine answers far more slowly than usual: a garbage-collection pause (the language runtime stopping the program to free memory), a noisy neighbour (another program on the same physical machine using the CPU or disk), CPU throttling, a lost network packet waiting to be resent.
- **Copy (replica)** — one of several machines running the same service. Any copy can answer a call.
- **Hedged (backup) request** — if an answer has not come back after a set delay, send the same request to another copy and use whichever answers first, cancelling the other. A plain **timeout and retry** is weaker: it gives up on the first try.
- **Timeout** — how long a caller waits for one try of a call before giving up on it.
- **Idempotent** — safe to do twice: doing it twice has the same effect as once. Reads are; "charge this card" is not, unless something makes it so.

## The world we're in

- 500 product page views a second. Each page needs answers from backend services: price, stock, reviews, shipping and so on.
- Each backend call takes about 3 ms: 1.5 ms of CPU plus a 1 ms round trip. Each service has four copies, and they are nearly idle (about 3% busy).
- Every backend machine has a slow moment for 20 ms every 2 seconds, at a different time from the others. A call that starts during one runs 50 times slower: about 75 ms. So at any instant about 1 machine in 100 is having one, and a little under 1 call in 100 is slow.
- We call a page **slow** if it takes more than 60 ms.
- **What the simulator does differently.** It makes a server's calls one after another, so a normal ten-call page takes about 31 ms (the sum). Real fan-out sends them all at once and waits for the last answer, so a normal page takes about as long as one call. The tail works the same way in both: the page cannot answer until every call has, so one slow call makes the whole page slow.

## The goal

Keep the page's p99 close to its normal latency, though no backend gets faster and every one of them has slow moments.

## The naive attempt

"Every service is fast and healthy. Call them all."

With one backend call, a page takes about 8 ms, and fewer than 1 page in 100 is slow (0.8%). The p99 is about 43 ms: right on the edge of the slow moments, because the slow share is just under 1%.
[▶ One call: fewer than 1 page in 100 is slow](play:one call@t=6)

With ten calls, normal pages take about 31 ms (ten calls in a row here). But now about 1 page in 10 is slow (9.5%), and the p99 is about 160 ms. Nothing got worse: each service still has the same slow moments, and the backends are 3% busy. The page just has ten chances to land on one.
[▶ Broken: ten calls, about 1 page in 10 slow](play:broken: ten calls@t=6)

## Building it up

**1. Do the arithmetic.** If one call is slow with chance p, it is fast with chance 1 - p. A page that needs N calls is fast only if all N are, which happens with chance (1 - p)^N. So it is slow with chance 1 - (1 - p)^N. With p = 1%: one call, 1%; ten calls, 1 - 0.99^10 = 9.6%; a hundred calls, 1 - 0.99^100 = 63%. The service's p99 has become the page's p90, and at fan-out 100 the page's median is already slower than the service's p99. Our run matches the formula: about 1 in 100 for one call, about 1 in 10 for ten.
[▶ Ten calls: watch the slow pages](play:broken: ten calls@t=8)

**2. Notice what does not help.** The backends are 3% busy, so more copies or bigger machines change nothing: the slow moments are not caused by load. Making the average call faster does not help either. The tail comes from rare events, and fan-out multiplies their reach.

**3. Make fewer calls.** Every call removed is one less chance to be slow. Merge services that are always called together, fetch several items in one batched call, or cache answers the page uses on every view. With three calls, about 3 pages in 100 are slow (2.3%; the formula says 1 - 0.99^3 = 3.0%) and normal pages take 13 ms. That is about four times fewer slow pages, but p99 is still about 93 ms: while more than 1% of pages are slow, the p99 is a slow page.
[▶ Three calls: better, but p99 still slow](play:three calls@t=6)

**4. Stop waiting for the slow one.** A normal call answers in about 3 ms. If an answer has not come back in 20 ms, it is almost certainly stuck in a slow moment, and another copy is almost certainly fine. So after 20 ms, ask another copy. A slow call now costs 20 ms of waiting plus one normal call, instead of 75 ms. With ten calls, p99 drops from about 160 ms to about 55 ms, and fewer than 1 page in 100 is slow (0.3%).
[▶ Retry after 20 ms: ten calls, p99 about 55 ms](play:retry after 20 ms@t=6)

The simulator does this as a timeout and retry to another copy: at 20 ms it gives up on the first try and asks a second copy. "The Tail at Scale" calls the real technique a **hedged request**: send the second copy after the delay, keep the first one going, use whichever answers first and cancel the other. A hedge is at least as fast as the first try alone, so it can never turn a slow call into a failed one.

**5. Count the extra load.** Only calls still waiting at 20 ms are repeated: about 50 a second, out of about 5,000 backend calls a second, so about 1% more calls. Here the first try is abandoned, not cancelled, so its work is wasted.
[▶ Retries are about 1% of calls](play:retry after 20 ms@t=10)

**6. Do not cut it too close.** With a timeout and retry, the delay is also a deadline. Retry after 5 ms, barely past a normal answer, and the retries double (about 100 a second). Worse, a retry that lands in another slow moment also times out, and about 2% of pages fail. A real hedge cannot fail that way: it keeps the first try, so a short delay only costs extra load.
[▶ Broken: retry after 5 ms, about 2% of pages fail](play:broken: retry after 5 ms@t=6)

## Why it works now

The page is slow if any of its answers is. Ten answers gave ten chances, and about 1 page in 10 lost.
[▶ Broken: ten chances to be slow](play:broken: ten calls@t=8)
Slow moments are short and affect one copy at a time, so a second copy asked 20 ms later is almost always fast. The page now waits for the faster of two tries, and both being slow is about 1 in 10,000 (if slow moments are independent).
[▶ The same slow moments, p99 near normal](play:retry after 20 ms@t=8)

## What it costs

- **More load.** About 1% more calls here, because the delay (20 ms) is well past a normal answer. The first try keeps running and its work is wasted.
- **Only for safe calls.** A hedge is a second try. Reads are safe; a write needs to be idempotent (for example, carry a key the service uses to drop the repeat).
- **Useless against overload.** If every copy is slow because the service is overloaded, a hedge is one more request to an overloaded service. Cap hedges to a small share of calls so they cannot make an overload worse.
- **A simplification.** The simulator's version is a timeout plus one retry: it gives up on the first try at 20 ms and asks another copy. A real hedged request keeps waiting for the first try too, so it is at least as fast and never fails a call the first try would have answered.
- **Fewer calls means bigger services.** Merging services trades latency for fewer independent deploys (lesson 01).

## Staff notes

- Ask for each dependency's p99 and p99.9, not its average, and multiply by the fan-out. With 50 calls, 1 - 0.999^50 ≈ 5% of pages include a call slower than the dependencies' p99.9, so their p99.9 is the page's p95.
- Set the hedge delay near the dependency's p95: about 5% of calls get a hedge, and most slow ones are caught. (With a plain timeout and retry, that delay is also a deadline, so it needs more room.) "The Tail at Scale" also describes **tied requests**: send to two copies at once, and the one that starts first tells the other to drop it.
- Parallel fan-out bounds normal latency by the slowest call; it does not shrink the tail. Doing calls in a row adds normal latencies and has the same tail problem.
- Search and other scatter-gather systems often return a partial answer when a few shards are late (a "good enough" result). That is a product decision, made per feature.
- Hedges and retries both add load. Give them a budget (lesson 04) so a real overload is not doubled.

## Check yourself

- **Q:** Each service is slow 1% of the time. A page calls ten of them. How often is the page slow, and why?
  A: About 1 in 10 (1 - 0.99^10 = 9.6%), because the page needs all ten answers, and is slow if any one of them is. [▶ Show it](play:broken: ten calls@t=8)
- **Q:** The backends are 3% busy. Would adding copies of each fix the page's p99?
  A: No. The slow moments are not caused by load, and a page still makes ten calls, each with the same small chance of hitting one. [▶ Show it](play:broken: ten calls@t=6)
- **Q:** Going from ten calls to three cut the slow pages to about 3%. Why is p99 still slow?
  A: p99 is the latency 99% of pages beat. While more than 1% of pages are slow, the p99 page is a slow one. [▶ Show it](play:three calls@t=6)
- **Q:** Why does a retry to another copy after 20 ms cut p99 so much, for only about 1% more calls?
  A: A normal answer takes about 3 ms, so almost only slow calls are still waiting at 20 ms; a second copy is almost always in a normal moment. [▶ Show it](play:retry after 20 ms@t=8)
- **Q:** Retrying after 5 ms fails about 2% of pages. Would a real hedged request with a 5 ms delay fail them too?
  A: No. The simulator gives up on the first try, so a slow second try fails the call. A hedge keeps the first try and uses whichever answers first; a short delay only adds load. [▶ Show it](play:broken: retry after 5 ms@t=6)

## Deep dive

Why does the formula grow so fast? For small p, 1 - (1 - p)^N is about N × p while N × p is small: ten calls at 1% is about 10%. As N × p grows, it levels off toward 1: a hundred calls at 1% is 63%, not 100%, because pages with two or more slow calls are only counted once. The same arithmetic runs the other way for availability: N services each up 99.9% of the time give a request that needs all of them 0.999^N, about 1 - N × 0.1% for small N. Fan-out multiplies every rare bad event its dependencies have, which is why staff engineers ask for the request's dependency count before its average latency.
