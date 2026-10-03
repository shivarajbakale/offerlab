# Job scheduler

## What it is

- **What it is:** A service other services ask to run work later: "send this reminder at 9:00", "retry this payout in 10 minutes". It stores each job, waits until it is due, and hands it to a worker.
- **What makes it hard:** Machines die mid-job, and no one can tell whether a cut-off job already did its effect, so a job must be run again and that second run must do no harm. At the top of the hour every hourly job comes due in the same instant.
- **Building blocks it uses:** a pool of workers behind [load balancing](#/sd-04-traffic/014-load-balancing), [idempotency keys](#/sd-api-design/02-idempotency-keys) sent with each job's effect, [leases and fencing tokens](#/sd-05-replication/023-leases-and-fencing-tokens) so a paused worker cannot finish a job someone else took over, and jitter on start times (as in [retry backoff and jitter](#/sd-04-traffic/015-retry-backoff-jitter)).
- **Where you'll meet it:** "Design a distributed job scheduler" is a common interview question. Unix cron, Kubernetes CronJobs, Amazon SQS delay queues (up to 15 minutes) and Celery's scheduled tasks are everyday versions. The single-machine version is this app's [delayed job scheduler](#/sd-low-level-design/07-delayed-job-scheduler).

## Words we'll use

- **Job** — a piece of work to run later: "send this reminder at 9:00", "retry this payout in 10 minutes". Here each job costs a worker 5 ms of CPU, then calls a partner's API (about 400 ms), then marks itself done in the jobs table.
- **Effect** — what a job does to the outside world: the reminder sent, the payout started. Running the job twice repeats its effect unless something stops it.
- **Delayed queue** — a queue where each message becomes visible only after a delay (SQS allows up to 15 minutes per message). A message not yet due is **scheduled**; once due it is in the **backlog** until a **consumer** takes it.
- **Lateness** — how long a due job waits before it starts. The age of the oldest message in the backlog is the worst lateness right now.
- **Worker** — a server that runs jobs. A **pool** is several of them behind a **load balancer**, which checks their health every second and stops sending to a dead one.
- **Acknowledge** (ack) — a consumer telling the queue "done, delete this job". A job that is not acknowledged comes back after a **visibility timeout** (1 s in the simulator) and runs again.
- **At-least-once** — every job runs, possibly more than once. **At-most-once** — no job runs twice, possibly some never. No scheduler can promise **exactly once** on its own, because a worker can die after the effect but before recording it.
- **Idempotent** — running it twice has the same result as running it once. An **idempotency key** is an id sent with the effect so the receiver can recognise and ignore a repeat.
- **Little's law** — the number of things waiting equals their arrival rate times how long each waits. 500 jobs a second, each scheduled 5 s ahead, means about 2,500 scheduled at any moment.
- **Jitter** — a small random offset added to a start time, so things scheduled "at the same time" actually start spread out.

## The world we're in

- Other services send 1,000 requests a second: half schedule a job, half ask about a job's status. A job here runs 5 s after it is scheduled, standing in for minutes or hours.
- The jobs table is the source of truth: a job is stored there before anything else happens.
- Machines die without warning. Partner APIs take about 400 ms.
- Many jobs are hourly reports and reminders, and people pick round times: almost everyone writes "0 * * * *" (minute 0 of every hour).

## The goal

Run every job, on time, even while workers die, and make sure a job that runs twice does no harm. Survive the top of the hour, when a whole hour's worth of hourly jobs comes due in the same second.

## The naive attempt

"Store each job, put a delayed message on a queue, and run the jobs on one worker machine."

On a normal day this works. One worker is about 62% busy, every job starts within a few ms of its time, and about 2,500 jobs are scheduled at any moment (500 a second × 5 s).
[▶ 500 jobs a second, ~2,500 scheduled](play:delayed queue@t=8)

Then the worker machine dies at 6 s and comes back at 8 s. At the moment it dies it is in the middle of about 185 jobs. Nearly all of them had already sent their partner call, and the partner keeps working on those calls after our worker is gone: the reminders go out, but nobody records them as done. Those jobs are never acknowledged, so the queue hands them out again. For 2 seconds no job finishes at all: every due job fails, goes back for 1 s, fails again, and the scheduled pile grows past 3,300. When the worker returns it is 100% busy catching up, and jobs run late: by 10 s the oldest waiting job came due about 3 seconds earlier and the line is still draining. A job that failed and came back is as late as it was before: retries do not reset its age, so every job due during the outage is late by the outage plus its turn in the catch-up line. The callers noticed nothing: scheduling and status requests kept working.
[▶ Broken: the one worker dies, nothing runs](play:broken: the one worker dies@t=7)
[▶ Back up and catching up, jobs late](play:broken: the one worker dies@t=9)

## Building it up

**1. Run jobs on a pool, and let the queue redeliver.** Four workers behind a load balancer. When one dies, it takes the roughly 50 jobs it was running with it; the other three keep going, about 450 jobs a second never stop, and no job is more than a few tens of ms late. The 50 cut-off jobs come back after the visibility timeout and run on another worker.
[▶ One of four workers dies](play:broken: a pool of workers@t=7)
That is at-least-once delivery working as designed, and it is also the problem: those 50 jobs called the partner, and they will call it again. Fifty customers get the reminder twice. The queue cannot tell "died before the effect" from "died after the effect, before the ack"; neither can anyone else.

**2. Make every job safe to run twice.** Since redelivery is the price of never losing a job, the job itself must make a second run harmless. Ways to do that, from best to weakest:
- **Send an idempotency key with the effect.** Use the job id. A receiver that honours keys (many payment APIs do; many email and SMS providers do not) applies the effect once and answers the repeat with the first result.
- **Record the effect in our own database, in the same transaction as "done".** When the effect is ours (a row inserted, a balance changed), one transaction makes "done" and the effect happen together or not at all.
- **Check before acting.** Look up "already sent for job 4411?" before calling the partner, and record it right after. This narrows the window but does not close it: a crash between the call and the record still repeats it.

Separately, **fence slow workers.** A worker that pauses for a long time can wake up and finish a job someone else has already taken over. Claim each job with a lease and a fencing token (primitive 023), and reject writes carrying an old token. That protects our own records (the "done" mark, rows we own). A partner API will not check our token, so the partner call still needs the idempotency key.
The simulator cannot skip a repeated effect, so this step is described, not simulated: in the run above, the 50 repeats still reach the partner.

**3. Spread out the top of the hour.** Hourly jobs are all "due at :00". At the top of the hour the scheduler reads every job due now and queues them all at once. Here the simulator squeezes an hour into about a second: about once a second, at random, 1,000 jobs come due at the same moment. On average that is 1,000 jobs a second. Each job holds a consumer for about 0.43 s (the call to the partner, mostly), so by Little's law about 440 of the 600 consumers are busy on average (1,000 × 0.43 s), which 600 can carry. But they do not arrive on average. Each burst fills every consumer at once; the rest wait their turn. The consumers are fully busy about three quarters of the time, and when two bursts land close together the last jobs start more than a second late.
[▶ Broken: every hourly job at :00](play:broken: top of the hour@t=6)
Give each job a random start within its minute instead (jitter): "hourly at :00" becomes "hourly, at a fixed random second within minute 0". The same 1,000 jobs a second now come due about 10 at a time. Consumers are about 74% busy (those ~440), almost never all busy at once, and no job starts more than about 10 ms late.
[▶ The same jobs with spread-out start times](play:start times spread out@t=6)

## Why it works now

A job's life has three durable records: the row in the jobs table (it exists), the message on the queue (it is due), and the "done" mark (it ran). Losing a worker loses none of them, so the job always runs again.
[▶ A worker dies, the rest carry on](play:broken: a pool of workers@t=7)
Running again is safe because the effect is idempotent. And because start times are spread out, the workers see the same steady load every second instead of a wall once an hour.
[▶ Steady instead of bursty](play:start times spread out@t=8)

## What it costs

- **Lateness after a crash.** A cut-off job comes back only after the visibility timeout. Set it too short and slow jobs are handed out twice while still running; too long and jobs from a dead worker wait. Long jobs should extend their timeout as they go (a heartbeat).
- **Idempotency is work for every job type.** Each effect needs a key, a transaction or a check, and someone has to confirm the receiver really honours keys.
- **Jitter changes the promise.** "At 9:00" becomes "between 9:00 and 9:01". Fine for reports, not for "the auction closes at 9:00:00".
- **The queue's delay limit.** SQS delays at most 15 minutes. Jobs further out stay in the jobs table, and a poller moves them to the queue shortly before they are due; that poller must itself be safe to run on several machines.
- **Simplifications here.** The simulator's queue tells the scheduler at once when a job fails; a real queue only notices when the visibility timeout passes. It also cannot skip a repeated effect, so idempotency is described in words.

## Staff notes

- The jobs table is the source of truth; the queue is a way to dispatch. If the queue loses a message, a sweeper that finds "due, not done, not running" rows recovers it.
- Alert on lateness (now minus due time) per job type, not on queue length. A long queue of jobs due next week is fine; one job an hour late is not.
- Expect retries to come back in bursts after an outage, and cap them (backoff, a retry limit, then a dead-letter queue for a human).
- Ask in an interview: what happens if a job runs twice? If it runs late? If it never runs? The answers pick at-least-once vs at-most-once and how much idempotency each job needs.
- Round times are a known spike: midnight, the top of the hour, the first of the month. Add jitter by default and let callers opt out only with a reason.

## Check yourself

- **Q:** The one worker dies for 2 s. Do the scheduling requests from other services fail?
  A: No. The API and the jobs table are separate from the worker; only job execution stops, and the jobs pile up to run late. [▶ Show it](play:broken: the one worker dies@t=7)
- **Q:** About 185 jobs were cut off when the worker died. Why will most of them call the partner twice?
  A: They had already sent the partner call before the crash. The partner finished them, but the jobs were never marked done or acknowledged, so the queue runs them again. [▶ Show it](play:broken: the one worker dies@t=6.1)
- **Q:** With four workers, one dying cuts off about 50 jobs. Why doesn't the pool remove the duplicates?
  A: A pool makes the system keep running, but redelivery is still at-least-once. Only an idempotent effect makes the second run harmless. [▶ Show it](play:broken: a pool of workers@t=6.1)
- **Q:** On average 1,000 jobs a second keep only about 440 of 600 consumers busy. Why do jobs start over a second late at the top of the hour?
  A: The jobs do not arrive on average: 1,000 come due in the same instant, every consumer is taken at once, and the rest wait. Jitter spreads them out and lateness falls to about 10 ms. [▶ Show it](play:broken: top of the hour@t=6)
