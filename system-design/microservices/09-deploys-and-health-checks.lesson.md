# Deploys and health checks

## What it is

- **What it is:** How to replace a running service's machines with a new version while it keeps serving. A rolling deploy swaps machines a few at a time, and the load balancer's health checks decide which machines get traffic.
- **The problem it solves:** A rolling deploy at peak sends requests to machines that have already stopped, and leaves too few machines to carry the load, so every deploy fails some requests. One spare machine, draining each machine before stopping it, and fast health checks as the backstop keep deploys from failing users.
- **Reach for it when:** A team deploys often or at peak hours, a service runs close to full, the load balancer is slow to notice changes, or caches live on the machines being replaced.
- **Not the right tool when:** You can start each new machine before stopping its old one (Kubernetes maxSurge, or blue-green): that gives deploy headroom without paying for a spare all the time, though crashes and zone loss still need one. A service with spare capacity at deploy time may need only draining.
- **Where you'll meet it:** Kubernetes rolling updates, readiness probes and maxSurge; AWS load balancer health checks and deregistration delay; canary releases in Google's SRE books; "How would you deploy this with zero downtime?" interview follow-ups.

## Words we'll use

- **Deploy** — replacing the running version of a service with a new one. Here each machine is stopped and started again with the new version.
- **Rolling deploy** — replacing machines one at a time (or a few at a time), so the rest keep serving.
- **Load balancer** — the component that spreads requests over a service's machines.
- **Health check** — the load balancer asking each machine "are you up?" on a timer, and sending requests only to machines that answered at the last check. The **interval** is the time between checks. Between checks, the load balancer does not know a machine has stopped.
- **Boot time** — how long a new machine takes to start and be ready. Here 4 s; real services often take tens of seconds.
- **Utilization** (busy) — the share of time a machine's CPU cores are working. Above 100% of what is left, requests wait in line and the line grows.
- **Headroom** — spare capacity: how much more load the service could take before it is full.
- **N+1** — enough machines that the service still carries its peak load with any one of them gone. N machines do the work; the +1 is the spare.
- **Cache hit rate** — the share of reads the cache answers without asking the database. A **cold** cache is one that has just started and holds nothing; it **warms up** as reads miss and fill it.
- **Connection draining** — taking a machine out of the load balancer first, letting it finish the requests it already has, and only then stopping it.

## The world we're in

- A product page service at its daily peak: 2,000 page reads a second.
- Four app machines, each 4 cores; a page costs 6.5 ms of CPU. At peak they are about 80% busy.
- Each app machine also runs one shard of the shared cache, so stopping a machine empties its shard. The cache answers about 87% of reads; the misses go to a database that is about 21% busy.
- This costs about $1.65 an hour.
- The team deploys several times a day, and the deploy runs whenever the change is merged, often at peak.
[▶ Peak traffic, no deploy](play:peak, no deploy@t=4)

## The goal

Deploy at any hour without failing requests or slowing pages, and without the deploy itself overloading something else.

## The naive attempt

"Rolling deploy: stop machine 1, start it with the new version, then machine 2, and so on, 6 s apart. The load balancer checks health every 5 s."

At 2.5 s machine 1 stops. The last health check was at 2 s and the next is at 5 s, so for 2.5 s the load balancer keeps sending it a quarter of all requests, and each one fails: the connection is refused.
[▶ Broken: a quarter of requests sent to a stopped machine](play:broken: rolling deploy@t=4)

At 6.5 s machine 1 is back, but the load balancer will not know until its check at 10 s. Until then three machines carry 2,000 reads a second. They need 13 seconds of CPU per second and have 12: requests queue, the median page takes about 210 ms instead of 13, and about 7% are refused because the waiting lines are full. Then machine 2 stops at 8.5 s, while machine 1 is still unseen: until the check at 10 s only two machines serve, the worst moment of the deploy. And so it goes for each machine. Over the whole deploy about 13% of requests fail.
[▶ Broken: the new machine unseen, three machines flat out](play:broken: rolling deploy@t=8)

## Building it up

**1. Notice quickly.** The load balancer can only route around what it knows about. On average a machine that stops is still sent requests for half the check interval, and a machine that starts waits up to a full interval for traffic. With checks every second, a stopped machine gets requests for only about half a second. (Not every load balancer allows that: an AWS Application Load Balancer checks at most every 5 s, and needs at least 2 failed checks to mark a target unhealthy. For a planned deploy, step 6 removes the need.)
[▶ Half a second of failures, then routed around](play:broken: 1 s health@t=3)

**2. But three machines still cannot carry the peak.** With faster checks, the load balancer stops sending to the stopped machine quickly, and all of its traffic lands on the other three for the 4 s it takes to start. That is the same 13 seconds of CPU per second on 12 cores. Pages take about 230 ms and about 8% are refused, every time a machine is replaced. About 4% of requests fail over the deploy.
[▶ Broken: three machines at peak](play:broken: 1 s health@t=5)

**3. Off-peak, the same deploy is fine.** At 1,200 reads a second, three machines are enough: pages stay at about 13 ms while one is away. Only the half second before each check still costs anything, about 2% of requests over the deploy. A deploy at peak removes a quarter of the capacity at the moment you need all of it. This is why many teams deploy outside peak hours, and why the next step matters for teams that cannot.
[▶ The same deploy at 1,200 a second](play:1 s health checks off-peak@t=5)

**4. Keep one machine spare (N+1).** Five machines are about 65% busy at peak; any four are about 81% busy, which they carry. Now replacing a machine costs only the half second before the health check notices: about 20% of requests in that moment, and nothing else. Pages stay at about 14 ms through the whole deploy, and about 1.5% of requests fail, all in those half seconds. The spare costs about $0.32 an hour.
[▶ N+1: four machines carry the peak while the fifth is replaced](play:N+1 at peak: errors@t=5)

**5. Expect every new machine to start cold.** Each new machine's cache shard starts empty. Reads for its keys miss and go to the database until the shard fills, and filling takes far longer than booting: the popular keys come back quickly, the rest only as someone asks for them. By the end of the deploy every shard has been replaced. The cache answers about 62% of reads instead of 87%, and the database is more than twice as busy as before. Here it has room; a database sized for the warm hit rate might not.
[▶ After the deploy: lower hit rate, a busier database](play:N+1 at peak: after@t=32)

**6. Drain instead of killing.** Even with N+1, the remaining failures are requests sent to a machine that had already stopped. A real deploy should first take the machine out of the load balancer, wait for its requests to finish (connection draining), and only then stop it. Then the load balancer never has to discover a planned stop, and health-check speed plays no part in a deploy: health checks are the backstop for machines that die unplanned. This simulator stops machines abruptly, so it shows what happens without draining.

## Why it works now

A deploy is a planned failure of every machine in turn. At peak, without a spare, each step takes away capacity the service needs, and slow health checks add seconds of requests sent to a stopped machine and seconds of a new machine sitting unused.
[▶ Broken: slow checks and no spare](play:broken: rolling deploy@t=9)
With checks every second and one spare machine, losing any one machine leaves enough to carry the peak, and the load balancer stops sending to it within about half a second.
[▶ N+1 with fast checks](play:N+1 at peak: errors@t=9)

## What it costs

- **An idle machine, always.** N+1 means paying for a machine whose job is to be missed. For a service with 4 machines that is 25% more; for one with 40, a few percent. Bigger services get headroom more cheaply. For deploys alone, surging (start the new machine before stopping the old: Kubernetes maxSurge, blue-green) gives the headroom without paying for a spare all the time. You still need N+1 for crashes and zone loss.
- **Faster health checks.** More checking traffic, and a risk of marking a healthy machine dead after one slow answer. Real load balancers wait for several failed checks in a row before removing a machine (and several passing checks before adding one), which adds back some of the delay.
- **Slower deploys.** One machine at a time, waiting for each to be ready, takes longer than replacing everything at once. Replacing several at once needs more spare capacity.
- **A database sized for cold caches.** A cache hides load from the database. After a deploy, a restart, or a failure, that load comes back, so the database must be sized for the cold hit rate, or caches must be warmed before taking traffic.
- **What the simulator leaves out.** Many real proxies retry a refused connection on another machine, so a stopped (not hung) machine costs fewer errors than shown here; requests already in flight on it still fail. Machines stop abruptly (no draining), are ready the moment they start (no separate readiness), and run at full speed at once. Real services often run slower for a while after starting: connection pools open, and languages with just-in-time compilers (the JVM, for example) speed up as they run.

## Staff notes

- Size every service for peak with one machine missing (one zone missing, for services spread over zones). Deploys, crashes and maintenance all remove a machine; the deploy is just the one you schedule.
- Ask how long the load balancer takes to notice, both ways: removing a stopped machine, and adding a ready one. Interval times the number of checks it needs.
- Separate "alive" from "ready to take traffic". Kubernetes readiness probes do this: a pod gets traffic only after its readiness probe passes, and is removed when it fails. When a pod is deleted, Kubernetes removes it from the endpoints whatever its readiness probe says, but that removal reaches load balancers asynchronously, while SIGTERM arrives at the same time. So on shutdown, keep serving for a few seconds after SIGTERM (a preStop sleep is common). Then stop accepting new requests and finish in-flight ones within terminationGracePeriodSeconds.
- Watch the database, not just the service, during deploys. Cold caches move load downstream; replacing machines faster than caches refill stacks it up.
- Canary first: deploy to one machine, compare its errors and latency with the rest, then continue. A bad version caught on one machine of five costs a fifth of the traffic for a short time.

## Check yourself

- **Q:** With health checks every 5 s, why did requests fail even before anything was overloaded?
  A: The load balancer kept sending a quarter of requests to the stopped machine until its next check, up to 5 s later. [▶ Show it](play:broken: rolling deploy@t=4)
- **Q:** With 1 s checks, failures from the stopped machine almost vanish. Why are pages still slow and some refused during the deploy?
  A: The other three machines need 13 CPU-seconds a second and have 12, so requests queue for the 4 s the new machine takes to start. [▶ Show it](play:broken: 1 s health@t=5)
- **Q:** What does the fifth machine buy?
  A: Any four can carry the peak, so replacing one leaves enough capacity; only the half second before each health check fails requests. [▶ Show it](play:N+1 at peak: errors@t=5)
- **Q:** The deploy is over and every machine is healthy. Why is the database more than twice as busy?
  A: Every cache shard was emptied by its restart and is still refilling, so more reads miss and go to the database. [▶ Show it](play:N+1 at peak: after@t=32)
