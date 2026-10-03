# Delayed job scheduler

## What it is

- **What it is:** An in-process scheduler for work that should run later, such as "in 5 minutes" or "every hour". Callers can cancel jobs, and a loop wakes up and runs whatever is due, keeping jobs in a min-heap ordered by run time and asking an injected clock for the time.
- **The problem it solves:** Scanning every job on every wake-up costs work for each job even when nothing is due, and rescheduling a recurring job at "now plus its period" lets every late wake-up push the whole schedule later, until "every hour" runs at a quarter past. A min-heap makes an idle wake-up one comparison, and computing each next run from the last due time keeps the schedule fixed.
- **Reach for it when:** An interview asks for a job scheduler, "run this later", cron-like recurring jobs, cancelling a scheduled job, or how to test code that depends on time; or a design needs delayed retries, expiring carts or session timeouts.
- **Not the right tool when:** Jobs must survive a restart or be shared by many machines: keep them in a database or a queue with delay support, and claim each run with a conditional update. For huge numbers of short timeouts, a timing wheel makes schedule and cancel cheaper at a fixed time resolution.
- **Where you'll meet it:** Java's ScheduledThreadPoolExecutor keeps tasks in a heap-based delay queue, Go's runtime keeps timers in a 4-ary heap, and Kafka uses hierarchical timing wheels for its many request timeouts. Quartz calls a missed run a misfire and makes its handling a setting. "Design a job scheduler" is a common interview question.

## Words we'll use

- **Job** — a piece of work to run later: "send the reminder email", "expire this cart". Each has a **run time** (`runAt`, in milliseconds), the moment it becomes **due**.
- **One-shot job** — runs once. A **recurring job** runs every **period** (`everyMs`), such as every 100 ms or every hour.
- **Tick** — one wake-up of the scheduler's loop: ask the clock the time, run what is due, go back to sleep.
- **Clock** — the object the scheduler asks for the current time. Here it is **injected**: passed in from outside, so a test can hand it a **fake clock** whose time it sets by hand.
- **Min-heap** — an array arranged as a binary tree in which every item is no later than its two children (the children of index `i` are at `2i+1` and `2i+2`). The smallest item is always at index 0. Adding or removing one item costs O(log n) swaps.
- **Grid** — the times a recurring job is meant to run, fixed in advance: 100, 200, 300 and so on.
- **Drift** — a recurring job sliding off its grid, a little later each run, until "every hour" runs at a quarter past.
- **Lazy deletion** — removing an item by marking it dead and leaving it where it is; it is thrown away later, when it is next touched.

## The world we're in

- Thousands of jobs may wait at once, most of them hours away. Few are due at any moment.
- The loop never wakes exactly on time. The operating system wakes a sleeping thread a little late, and a process can be paused for longer (a long garbage collection, a laptop going to sleep). Here the loop wakes 5 ms late every time.
- Callers cancel jobs often: the customer paid, so "expire the cart" must not run.
- Time is a number of milliseconds from a fake clock the tests move, so every run is repeatable and no test waits.

## The goal

Run every live job once it is due, soonest first, with equal times in the order they were scheduled. Never run a cancelled job. Keep recurring jobs on their grid however late the loop wakes. Make a tick with nothing due cost the same for 30 jobs or 30,000.

## The naive attempt

"Keep the jobs in a list. Every tick, walk the list and run the ones that are due."

Thirty reports are scheduled an hour from now, and the loop ticks once a second. Every tick looks at all thirty, finds nothing due, and goes back to sleep.
[▶ Broken: the second tick starts over, looking at all 30 again](play:broken: scan the list@at=scan#31)
After 20 seconds the loop has looked at a job 600 times and run nothing. That is O(jobs) per tick: with 100,000 jobs and a tick every 10 ms, the loop does nothing but scan.
[▶ Broken: the 600th look, and nothing has run](play:broken: scan the list@at=scan#600)

A second naive idea is about recurring jobs: "when the job runs, schedule it again for now plus its period." The loop wakes 5 ms late, at 105, so the next run is set for 205 instead of 200.
[▶ Broken: next run = 105 + 100 = 205](play:broken: next run = now@at=drift#1)
The next wake-up is late too, so the run after is set for 310, then 415. The lateness is never given back. The tenth run, meant for 1000, is due at 1045 and runs at 1050: 50 ms late after ten runs, and later every run after that.
[▶ Broken: the tenth run is scheduled for 1045](play:broken: next run = now@at=drift#9)

## Building it up

**1. A min-heap by run time.** The loop only needs to know one thing: is the soonest job due? A min-heap keeps the soonest job at index 0. Schedule pushes the job and sifts it up past every parent that is later than it. A tick looks at the top; if it is not due, nothing is, and the tick is done. The same 30 jobs and 20 ticks cost 20 looks, not 600.
[▶ The top is an hour away, so nothing is due: one look](play:idle ticks@at=not-due#1)

**2. Pop while due.** When the top is due, pop it, run it, and look at the new top. Jobs come out soonest first. Equal times are broken by id, so `a` and `a2`, both due at 100, run in the order they were scheduled.
[▶ a runs first](play:order@at=run#1)
[▶ a2, due at the same time, next](play:order@at=run#2)

**3. Inject the clock.** The scheduler never reads the system time. It calls `clock.now()` on the clock it was given. In production that is the real clock; in tests it is a fake whose time the test sets, so "two hours later" takes no time at all, and the same test gives the same answer every run.

**4. Recurring jobs: next = last due time + period.** After a recurring job runs, it goes back in the heap with `runAt` moved one period along its grid, measured from when it was *due*, not from when it ran. The loop wakes at 105, runs the job due at 100, and sets the next run to 200.
[▶ Next run 200, back on the grid](play:recurring@at=on-grid#1)
[▶ Pushed back into the heap](play:recurring@at=reschedule#1)
Every run is 5 ms late, and none is more than 5 ms late: ten runs, due at exactly 100, 200 through 1000.

**5. Missed slots are skipped, not replayed.** The process is paused from 90 ms to 350 ms. When it wakes, the job is due at 100, and the slots at 200 and 300 have passed too. It runs once, and the next run moves along the grid past every slot already gone.
[▶ 200 and 300 have passed: keep moving along the grid](play:missed slots@at=skip-missed#1)
[▶ Next run 400](play:missed slots@at=on-grid#1)
Replaying them would run the job three times back to back at 350, which for "refresh the cache" is pure waste. For some jobs replaying is right (see the costs). Java's `scheduleAtFixedRate` makes the opposite choice and catches up.

**6. Cancel lazily.** A cancelled job may be anywhere in the heap, and finding it costs O(n). So cancel only marks it and removes it from the `jobs` map.
[▶ Cancel marks expire-cart; it stays in the heap](play:cancel: a cancelled job@at=cancel#1)
When the marked job reaches the top, the tick drops it without running it.
[▶ expire-cart reaches the top and is dropped](play:cancel: a cancelled job@at=drop-cancelled#1)

**7. Compact when the dead outnumber the living.** Lazy deletion has a debt: a cancelled job far in the future sits in memory until its time comes. So the scheduler counts the dead, and when they are more than half the heap it filters them out and rebuilds the heap in O(n). Eight jobs, five cancelled: the fifth cancel triggers a rebuild that leaves three.
[▶ Rebuild without the cancelled jobs](play:compact@at=compact#1)

## Why it works now

- The top of a min-heap is the soonest job, so "nothing is due" is one comparison. The list scheduler looked at every job on every tick:
  [▶ See it break](play:broken: scan the list@at=scan#600)
- A recurring job's next time is computed from its last due time, so it depends only on the grid, never on how late the loop woke. Computing it from "now" let every delay add to the next:
  [▶ See it break](play:broken: next run = now@at=drift#9)
- A cancelled job is marked before the tick can reach it, and the tick checks the mark before running anything, so a cancelled job never runs. Compaction keeps the marked ones from piling up.

## What it costs

- **O(log n) per schedule and per run.** Each push and pop sifts through up to log2(n) levels: about 17 for 100,000 jobs. A timing wheel (an array of buckets, one per time slot, like the face of a clock) makes schedule and cancel O(1), but only to a fixed resolution and with extra levels for long delays.
- **Dead jobs in memory.** Until compaction, cancelled jobs still take space, and the rebuild is an O(n) pause. An indexed heap (each job stores its position, updated on every swap) removes a cancelled job in O(log n) and never needs a rebuild, at the cost of more bookkeeping on every swap.
- **Skipping is a policy.** "Refresh the cache every minute" wants missed runs skipped. "Pay out every day" may want each missed day run, or flagged. Many schedulers make this a setting (Quartz calls the situation a misfire).
- **One process.** Everything is in memory: a restart loses every job. Durable jobs live in a database or a queue with delay support, and the in-memory heap becomes a cache of what is due soon.

## Staff notes

- **The classes.** `Scheduler` (schedule, cancel, tick, nextWakeup), `Job` (id, name, runAt, period, cancelled), a `Clock` interface with a real and a fake implementation. The handle callers get back is the job id; a richer API returns a `ScheduledJob` object with `cancel()` on it.
- **How long to sleep.** The loop sleeps until `nextWakeup()`, the top's run time. If a caller schedules a job sooner than that while the loop sleeps, the loop must be woken early (a condition variable or a timer reset), or the new job waits for the old wake-up.
- **Slow jobs.** Running jobs on the timer loop means one slow job delays every job behind it. Production schedulers hand due jobs to a worker pool and keep the loop for timing only. Decide what a recurring job does if its previous run is still going: skip, queue, or run both.
- **Cancel during a run.** If a recurring job is cancelled while it runs, the reschedule step must see the mark and not push it back. Here the mark is on the job object itself, which the reschedule reuses, so it would be skipped on its next turn at the top; check the mark before re-pushing to free it at once.
- **Many machines.** Two scheduler processes reading the same job table will both run a due job unless each run is claimed: `UPDATE jobs SET claimed_by = ? WHERE id = ? AND claimed_by IS NULL`, then check one row changed (or `SELECT ... FOR UPDATE SKIP LOCKED`). Even then a process can die mid-job, so jobs should be safe to run twice.
- **Testing.** Inject the clock and never sleep in a test. Test the edge cases by name: equal run times, cancel before due, cancel a recurring job, a late wake-up, a very late wake-up that skips slots.

## Check yourself

- **Q:** 30 jobs wait, none due for an hour. How many jobs does one tick look at, with a list and with a heap?
  A: The list looks at all 30 every tick (600 looks in 20 ticks). The heap looks only at the top, which is not due: 1 per tick, 20 in total. [▶ Show it](play:idle ticks@at=not-due#1)
- **Q:** A job runs every 100 ms and the loop always wakes 5 ms late. When is the tenth run due if the next run is "now + 100"? And with "last due + 100"?
  A: 1045 with "now + 100", because each 5 ms is carried into the next run. 1000 with "last due + 100", because the grid never moves. [▶ Show it](play:broken: next run = now@at=drift#9)
- **Q:** The process sleeps from 90 ms to 350 ms. A job due every 100 ms from 100. What happens at 350?
  A: It runs once (due 100, ran 350), and its next run is 400: the slots at 200 and 300 are skipped, not run back to back. [▶ Show it](play:missed slots@at=on-grid#1)
- **Q:** Why does cancel not remove the job from the heap?
  A: Finding it in the heap costs O(n). Marking it is O(1); the tick drops it when it reaches the top, and compaction clears the marks if they pile up. [▶ Show it](play:cancel: a cancelled job@at=drop-cancelled#1)
