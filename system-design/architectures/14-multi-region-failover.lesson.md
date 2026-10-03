# Multi-region failover

## What it is

- **What it is:** Running a service in two or more cloud regions, groups of data centres in different parts of the world, so it keeps working when a whole region fails, and so users on each continent can be served from nearby.
- **What makes it hard:** Regions are tens of milliseconds apart, so keeping database copies exactly in step costs a cross-ocean round trip on every write. Skipping that means a failover loses the last writes users were told were saved, and writes stop until a copy is safely promoted to take them.
- **Building blocks it uses:** one primary database with copies in each region ([leader-follower replication](#/sd-05-replication/017-leader-follower-replication)), health checks that move traffic between regions ([load balancing](#/sd-04-traffic/014-load-balancing)), and [fencing tokens](#/sd-05-replication/023-leases-and-fencing-tokens) so an old primary that comes back cannot accept writes.
- **Where you'll meet it:** "How would this survive a region outage?" comes up in staff-level interviews. Large AWS us-east-1 outages (S3 in 2017, December 2021) took down many single-region services. Netflix evacuates whole AWS regions on purpose to prove failover works, and Google Spanner commits writes across regions with consensus.

## Words we'll use

- **Region** — a cloud provider's group of data centers in one area (for example "US East", "Frankfurt"). Machines inside a region are a millisecond or two apart; regions are tens of milliseconds apart.
- **Region failure** — a whole region becoming unusable at once: a power or network event, or a bad change pushed to every machine in it. Rare, but it happens to every provider.
- **Latency** — how long one request takes. **p50** is the middle one (half were faster); **p99** is the one 99% were faster than.
- **Round trip** — a message there and the answer back. Here the regions are 40 ms apart each way, so crossing costs 80 ms a round trip.
- **Primary** — the one database copy that accepts writes. A **replica** is a copy that receives the primary's changes and serves reads.
- **Asynchronous replication** — the primary confirms a write first and sends it to the replicas afterwards. The replica **lags**: it is a little behind (300 ms here).
- **Health check** — the load balancer (or health-checked DNS) asking each server "are you alive?" on a timer. Traffic only moves away from a dead server at the next check.
- **Failover** — moving traffic from a failed region to a healthy one. **Promotion** is turning a replica into the new primary so writes work again.
- **Active-passive** — one region serves everyone; the other stands by and takes over only on failure.
- **Active-active** — every region serves traffic all the time.
- **RTO** (recovery time objective) — how long the product may be down after a failure. **RPO** (recovery point objective) — how much recent data you may lose, measured as time ("the last 300 ms of writes").
- **Read your own writes** — a user who just saved something sees it on their next page, even if other users might not yet.
- **Error** — a request that failed: refused because the server is down or has no free worker, or given up on after 1 second.

## The world we're in

- 1,000 requests a second: 90% reads, 10% writes.
- 60% of users are in the US, 40% in Europe, each 10 ms from the nearest region. The regions are 40 ms apart each way, roughly the US east coast to western Europe.
- A page costs 4 ms of app CPU; the database spends 1 ms on a read, 3 ms on a write. Capacity is never the problem here: location is.
- 10% of users who save something reload the page 200 ms later and expect to see their change.
- The load balancer checks every region every 3 seconds. That stands in for the real thing, which is slower: a few failed checks before deciding, plus DNS answers cached by clients for their TTL. Minutes are common.
- The simulator does not promote a replica on its own, and does not lose writes when a region dies. We do both of those in words, with arithmetic.

## The goal

Keep working when a whole region dies, say how long it takes to recover and how much data can be lost, and see what serving both continents from nearby costs.

## The naive attempt

"Run everything in one region, with a standby database machine for when one machine fails."

That covers a machine failure. It does not cover the region. Day to day it works: Americans are answered in about 30 ms. Europeans pay the ocean on every request, two crossings of 40 ms, so the p99 is about 114 ms. It costs about $1.39 an hour.
[▶ One region on a normal day](play:one region: Europeans@t=8)

Then the region fails at 5 s. Every request fails from that moment, for everyone, until the region comes back. The standby database was in the same region, so it went down with it. RTO is "whenever the provider fixes it".
[▶ Broken: the region fails, everything fails](play:broken: one region@t=8)

## Building it up

**1. Add a standby region (active-passive).** Build a second copy of the system in Europe: app servers, and a database replica that receives the US primary's writes asynchronously, about 300 ms behind. The global load balancer sends everyone to the US while it is healthy, and to Europe if it is not.

On a normal day nothing changes for users: Europe's four servers do no work at all and Europeans still cross the ocean. The bill goes from $1.39 to about $2.07 an hour, for machines that wait.

The US dies at 5 s. Until the next health check (at 6 s here), every request still goes to the dead region and fails. Then traffic moves to Europe, and reads work again, served by Europe's copy. Americans now cross the ocean: reads take about 106 ms. But every write fails: the only primary was in the US, and a replica cannot accept writes until someone promotes it.
[▶ Broken: failover, reads back, writes still down](play:broken: active-passive@t=8)

So there are two RTOs. For reads: detection plus moving traffic, up to one check interval here (minutes in real systems). For writes: that, plus the time to decide to promote and do it. Promotion is usually a deliberate step, because a primary that only looked dead and comes back would leave two primaries taking different writes (**split brain**).

After promotion, Europe is a whole system again and writes work, at about 106 ms for most users because most of them are American and now cross the ocean.
[▶ Europe promoted](play:promoted@t=8)

**2. Count the data you lose (RPO).** The replica was 300 ms behind. Every write the US confirmed in its last 300 ms had not reached Europe yet. At 100 writes a second, that is about 30 confirmed writes that are gone: users were told "saved", and after failover their change does not exist. That is the RPO of asynchronous replication: about the lag at the moment of failure. (The simulator does not model this loss; the arithmetic is the point.)

To make RPO zero, the primary must wait for the other region to confirm each write before answering: **synchronous replication**. Every write then pays a round trip across the ocean, 80 ms here, and if the other region is unreachable, writes stop or the system must choose to continue unprotected.

**3. Serve each continent from nearby (active-active reads).** The standby region is paid for anyway. Use it: send each user to their own region, and serve reads from the local copy of the database. Writes still go to the one primary in the US.

Every read is now local: the read p99 drops from about 114 ms to under 40 ms. European writes still cross the ocean: write p99 above 105 ms. Same machines, same $2.07 an hour.
[▶ Active-active reads](play:active-active: every read@t=8)

But reads in Europe come from a copy 300 ms behind. A European saves a change and reloads 200 ms later: the change is not on Europe's copy yet. About 40% of such reloads miss the user's own write, which is nearly all of the European ones.
[▶ Broken: a European's own save is missing](play:broken: active-active — a European@t=8)

The fix is **read your own writes**: for about a second after a user's own write, send that user's reads to the primary. Nobody misses their own change, most reads stay local (p50 under 30 ms), and the few redirected ones cross the ocean (p99 above 100 ms).
[▶ Read your own writes](play:read your writes@t=8)

**4. Fail a region again.** With active-active, when the US dies, Europeans' reads never notice. Until the next check, Americans' requests fail (60% of reads at that moment); then they move to Europe and every read works. Writes still stop: the primary is gone, exactly as before. Active-active reads made failover for reads nearly free; it did nothing for writes.
[▶ Broken: the US dies under active-active](play:broken: active-active — the US dies@t=8)

Keeping writes up through a region failure means a primary in more than one region. Two common ways, neither simulated here:
- **Partition by home region.** Each user's data has its primary in their home region, with a replica in the other. A region failure stops writes for that region's users only (until promotion). Most writes are local.
- **Consensus across regions** (as Google Spanner does): a write commits once a majority of replicas, in different regions, have it. Losing one region of three loses no confirmed writes, and writes resume once a new leader is elected in a surviving region (a pause of seconds if the lost region held the leader), but every write waits for a majority round trip.

## Why it works now

One region is one place to fail.
[▶ Broken: one region](play:broken: one region@t=8)
A second region gives you somewhere to go, but the time to get there (RTO) is set by detection, and writes need a primary, so they wait for promotion. What you lose (RPO) is the replication lag at the moment of failure.
[▶ Broken: active-passive](play:broken: active-passive@t=8)
Serving reads from both regions all the time makes the standby earn its cost and proves daily that it works; writes are still the hard part.
[▶ Active-active reads](play:active-active: every read@t=8)

## What it costs

- About twice the machines. Active-passive pays for idle capacity; active-active must keep enough spare in each region to take the other's users (here each region could take all 1,000 requests a second).
- Data sent between regions is billed (about $0.02 per GB between AWS regions) and replication traffic flows all the time.
- Replication lag means stale reads on the far side, and confirmed writes lost on failover, unless you pay a round trip on every write.
- Everything outside the database must be replicated too: caches, queues, search indexes, secrets, configuration. A standby that lacks one is not a standby.
- Not simulated: real detection times, promotion, split brain, lost writes and the capacity the other region needs at the moment of failover.

## Staff notes

- Get RTO and RPO from the business, in numbers, per kind of data. "Payments: RPO 0, RTO 15 minutes; feed: RPO 1 minute, RTO 1 hour" leads to different designs for different data.
- Rehearse. Fail over on a schedule, in production, during working hours. Untested standbys tend to fail on first use: a missing permission, a quota, an expired certificate, too few machines.
- Many region failures are partial: one service degraded, high error rates, not a clean death. Decide in advance what error rate triggers failover and who has the authority to pull the lever.
- Promotion needs fencing: make sure the old primary cannot accept writes when it returns (revoke its credentials, or require a newer epoch number on every write).
- After failover, the surviving region gets all the traffic at once, cold caches included. Plan the capacity and shed load if you must.

## Check yourself

- **Q:** The database has a standby copy. Why does the one-region design go fully down?
  A: The standby is in the same region, and the whole region failed. [▶ Show it](play:broken: one region@t=8)
- **Q:** After failover to Europe, reads work. Why does every write still fail?
  A: The only primary was in the US. A replica takes no writes until it is promoted. [▶ Show it](play:broken: active-passive@t=8)
- **Q:** The replica was 300 ms behind and there are 100 writes a second. What is lost when the US dies?
  A: About the last 300 ms of confirmed writes, about 30 of them: the RPO is the lag. After promotion the system works, but those changes are gone. [▶ Show it](play:promoted@t=8)
- **Q:** Active-active makes reads local. Why do Europeans sometimes not see their own save?
  A: They read Europe's copy, 300 ms behind, 200 ms after saving. Read-your-writes sends their next reads to the primary. [▶ Show it](play:broken: active-active — a European@t=8)
- **Q:** Does active-active keep writes up when the US dies?
  A: No. Reads move and work; writes need the primary, which is gone. That needs per-region primaries or consensus across regions. [▶ Show it](play:broken: active-active — the US dies@t=8)
