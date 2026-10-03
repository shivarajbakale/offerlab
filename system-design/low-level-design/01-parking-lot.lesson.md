# Parking lot

## What it is

- **What it is:** A program that runs a parking lot: it gives each arriving vehicle a free spot it fits, prints a ticket, and charges by the hour on the way out, while several entry gates work at the same time.
- **The problem it solves:** Without a rule for picking spots, motorcycles and cars fill the large spots that only vans can use, and vans are turned away from a lot that is not full. And if two gates first check "is this spot free?" and then take it in a separate step, both can be handed the same spot. One free list per size, smallest fit first, and a claim done in one step fix both.
- **Reach for it when:** You must model a pool of things of different sizes or kinds (spots, rooms, seats), give each request the best one that fits, and keep two callers from taking the same one at once.
- **Not the right tool when:** Every spot is the same size and one process hands them out: a single counter or one list of free spots is enough. When the lot lives in a database, the one-step claim becomes a conditional write, as in [optimistic concurrency](#/sd-api-design/03-optimistic-concurrency).
- **Where you'll meet it:** "Design a parking lot" is one of the most common low-level design interview questions. The same claim-in-one-step rule guards seat and hotel room booking, and PostgreSQL's SELECT ... FOR UPDATE SKIP LOCKED is a documented way for many workers to each take a different free row.

## Words we'll use

- **Spot** — one painted space in the lot. Each has a **size**: small, compact or large.
- **Vehicle** — a motorcycle, a car or a van. A vehicle **fits** a spot of its own size or bigger: a motorcycle fits any spot, a van only a large one.
- **Ticket** — the record made when a vehicle enters: which vehicle, which spot, and when. The driver hands it back on the way out.
- **Fee** — what the driver pays on leaving: every hour started, at the vehicle's hourly rate.
- **Free list** — a list of the ids of the spots of one size that are empty right now. Parking takes an id off it; leaving puts the id back.
- **Gate** — an entry barrier with its own ticket machine. Several gates run at the same time.
- **Claim** — marking a spot as taken by one vehicle, so nobody else is given it.
- **Check-then-act** — a pattern where a program first checks something ("is this spot free?") and then acts on the answer ("give it to this car") in a separate step. If something else can run between the two steps, the answer may no longer be true when the act happens. This bug is called a **race condition**.
- **Atomic** — done as one indivisible step: nothing else can run in the middle of it.

## The world we're in

- The lot has spots of three sizes, painted in a fixed order. Here, nearest the entrance: one large (L1), one compact (C2), two small (S3, S4).
- Vehicles arrive one after another at any of several gates, and leave in any order.
- Rates are per vehicle, not per spot: a motorcycle pays $1 an hour, a car $3, a van $5. Every started hour counts, and the minimum is one hour.
- Time is a number of minutes passed to each call (`park(v, now)`), so the runs are repeatable.

## The goal

Park every vehicle that can fit somewhere, never give a vehicle a bigger spot while one of its own size is free, so small vehicles take big spots only when their own row is full, never give one spot to two vehicles, and charge the right fee. Each park and leave should take constant time, however big the lot.

## The naive attempt

"Walk the spots from the entrance and give each vehicle the first free one it fits."

It is simple and every vehicle that arrives gets the nearest spot. Two motorcycles arrive first. The first free spot from the entrance is L1, the large one, and a motorcycle fits it.
[▶ Broken: the first motorcycle takes the large spot](play:broken: first free spot@at=first-free#1)
The second takes C2. Then a van arrives. Both small spots are free, but the only spot a van fits is taken by a motorcycle, so the van is turned away.
[▶ Broken: the van finds no spot it fits](play:broken: first free spot@at=first-free-full#3)
Nothing was full. The lot just put small vehicles in the only spots big ones can use. It also walks every spot for every vehicle: fine for four spots, slow for four thousand.

## Building it up

**1. One free list per size.** Keep, for each size, the ids of its empty spots. To park, look at the list for the vehicle's own size. This costs the same for 4 spots or 4,000: no walking.
[▶ The motorcycle checks the small list first](play:smallest fit@at=fits#1)

**2. Smallest fit first, then bigger.** Try the vehicle's own size, then each bigger size in turn, and take the first spot found. The motorcycle gets S4, the car C2, the van L1: all three park, where the naive lot turned the van away.
[▶ The van gets L1, the one spot only it needs](play:smallest fit@at=claim#3)
In the naive run's order (two motorcycles, then a van), this lot parks all three: S4, S3 and L1.
[▶ The same arrivals, all parked](play:broken: first free spot@at=claim#3)

**3. Bigger spots are a fallback, not a reservation.** With C2 taken, a second car spills into L1, which is the right call: the car would otherwise be turned away. Then a van arrives and nothing it fits is free. It is turned away even though two small spots are empty: they cannot help a van.
[▶ The car spills into the large spot](play:spill over@at=claim#2)
[▶ The van is turned away; the small spots cannot help](play:spill over@at=full#1)

**4. Claim in one step.** Taking the id off the free list *is* the claim: once `pop()` returns it, no other call can be handed that spot. The ticket records the spot and the minute the vehicle entered.
[▶ The claim: pop the id off the free list](play:two gates@at=claim#1)

**5. Leave and pay.** Leaving puts the spot's id back on its size's list and charges every started hour at the vehicle's rate. A car that stayed 61 minutes pays two hours at the car rate, $6, though it was parked in a large spot.
[▶ The spot goes back on its list](play:fees@at=release#2)
[▶ 61 minutes is two hours: $6](play:fees@at=fee#2)

## Why it works now

- Smallest fit keeps large spots for the vehicles that need them; a smaller vehicle takes a bigger spot only when its own size is full. The naive lot gave L1 to a motorcycle while small spots were free.
  [▶ See it break](play:broken: first free spot@at=first-free-full#3)
- Free lists make parking cost at most three list lookups, whatever the lot's size.
- Finding and claiming are one step, so two gates can never be handed the same spot. Split them, and they can:
  [▶ Gate B overwrites gate A's car](play:broken: find, then claim@at=overwrite#2)

## What it costs

- **Memory per spot.** The free lists hold every empty spot's id once more. Cheap: a few bytes a spot.
- **Not the nearest spot.** Smallest fit picks by size, not by distance to the entrance or the lift. Ordering each free list by distance (a priority queue per size) gets both, at O(log n) per park.
- **Large spots still go to cars.** Spilling over means a busy day can fill the large row with cars and turn vans away later. Lots that serve vans hold some large spots back.
- **One lot, one process.** Everything here lives in one program's memory. Several gates on several machines need the claim done in shared storage (see the staff notes).

## Staff notes

- **Name the entities first.** Lot, Level, Spot (size, state), Vehicle (kind), Ticket (vehicle, spot, entry time), and a pricing rule. Keep pricing a separate strategy (per hour, flat evening rate, monthly pass) so it changes without touching parking.
- **Ask about concurrency before you are asked.** Several gates means several threads or machines. In a database the claim is a conditional write: `UPDATE spots SET plate = ? WHERE id = ? AND plate IS NULL`, then check exactly one row changed; or `SELECT ... FOR UPDATE SKIP LOCKED` to pick and lock a free row in one step. A lock around find-and-claim works in one process.
- **Counts for the signs.** "Level 2: 14 free" is the length of each free list; keep the lists per level to show it.
- **Failure cases interviewers probe:** a lost ticket (look up by plate), a vehicle that leaves without a ticket record (the gate camera), paying at a kiosk before the exit (a paid-at time and a grace period).

## Check yourself

- **Q:** The lot is L1, C2, S3, S4. Two motorcycles then a van arrive. Why does the first-free-spot lot turn the van away?
  A: The first motorcycle took L1, the only spot a van fits, because it was the first free one from the entrance. [▶ Show it](play:broken: first free spot@at=first-free-full#3)
- **Q:** With C2 taken, where does a second car go, and why?
  A: To L1. Its own size is full, so it takes the next bigger size rather than being turned away. [▶ Show it](play:spill over@at=claim#2)
- **Q:** A car parks in the large spot for 61 minutes. What does it pay?
  A: $6: two started hours at the car's $3 rate. The rate follows the vehicle, not the spot. [▶ Show it](play:fees@at=fee#2)
- **Q:** Gate A and gate B both look for a spot, then both claim what they saw. What goes wrong?
  A: Both saw the same free spot, so both claim it: two tickets for one spot, and the second car's plate overwrites the first. [▶ Show it](play:broken: find, then claim@at=overwrite#2)

## Deep dive

Why is check-then-act safe inside `park()` here but not across gates in production? JavaScript runs one call at a time, so nothing can run between `list.length` and `list.pop()`. The broken lot splits them into two calls, `find()` and `claim()`, and the scenario runs gate B's `find()` between them, exactly what a second thread, process or machine does on its own. The fix is the same at every scale: make the claim a single step that fails if someone else got there first. In memory that is a lock or a compare-and-set; in a database a conditional `UPDATE` (and checking the affected row count), a partial unique index on spot for active tickets only (PostgreSQL `CREATE UNIQUE INDEX ... ON tickets (spot) WHERE active`; or a nullable `active_spot` column with a unique index, where the engine allows many NULLs) that rejects the second insert, or row locking with `FOR UPDATE SKIP LOCKED`, which also lets many gates pick different free spots without waiting on each other.
