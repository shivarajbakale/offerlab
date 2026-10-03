# Saga with compensation

## What it is

- **What it is:** A way to run one business action, such as placing an order, across several services as a series of steps that each commit on their own. Every step has a matching cancel action, called a compensation, that runs if a later step fails.
- **The problem it solves:** Calling services one after another leaves earlier steps done when a later one fails, such as a book set aside for an order whose payment then failed, while locking all of them with two-phase commit stalls everyone if the coordinator dies. A saga cancels the finished steps with compensations instead.
- **Reach for it when:** An order, booking or payment flow spans microservices or outside providers that can't hold locks for you, the flow may run for a long time, and others briefly seeing a halfway state is acceptable.
- **Not the right tool when:** The data lives in one database; a plain transaction is simpler. If others must never see a halfway state and every participant can hold locks, consider [two-phase commit](#/sd-06-transactions-messaging/024-two-phase-commit).
- **Where you'll meet it:** Garcia-Molina and Salem's "Sagas" paper (1987) and Chris Richardson's "Microservices Patterns". Workflow engines such as Temporal and AWS Step Functions are often used as the orchestrator. Interview: "Design a hotel booking system" or "Design an e-commerce checkout".

## Words we'll use

- **Service** — a separate program with its own database, usually owned by its own team. Here there are three: **inventory** (books on the shelf), **payments** (the customer's balance) and **shipping** (parcels sent).
- **Transaction** — a group of changes inside one database that happens all together or not at all. A database can only promise this for its own data.
- **Local transaction** — a transaction inside one service's database. It **commits** (becomes permanent) on its own, without asking any other service.
- **Lock** — a database's way of stopping anyone else from changing a piece of data until the lock is released.
- **Two-phase commit (2PC)** — a way to make one transaction span several databases: each one locks its data and votes "ready", and only then does a coordinator tell all of them to commit. Lesson 024 covers it.
- **Saga** — a long action, such as "place an order", split into **steps**, where each step is a local transaction in one service.
- **Compensation** — a new action that cancels a step's effect in business terms: "release the book" cancels "set a book aside", and "refund" cancels "charge".
- **Orchestrator** (`orch` in the runs) — the one program that runs the saga: it tells each service what to do next.
- **Saga log** — the orchestrator's record of every step's outcome, kept on disk.
- **Saga id** — the order's name (`o1`, `o2`), carried in every request so a service knows which order it is about.
- **Idempotent** — safe to repeat: doing it twice has the same effect as doing it once.
- **Retry** — sending the same request again because no answer came back.
- **Isolation** — the promise that nobody else sees a transaction's halfway state.
- **Crash** — a program stops. When it restarts, its memory is gone; only what it wrote to disk survives.
- **Tick** — one unit of simulated time. `t=7` means tick 7. Here every message takes 2 ticks to arrive.

## The world we're in

- An order needs three services to act: inventory sets one book aside, payments charges the customer, shipping sends the parcel.
- Each service has its own database. No single transaction can cover all three.
- Messages take time, and some are lost. A sender can't tell a lost request from a lost reply: either way, it hears nothing.
- Any program can crash and restart. Memory is wiped; the disk survives.
- In every run here, a message takes exactly 2 ticks. The shop owns 2 books (1 in the "no isolation" run), and the customer's balance is 100.

## The goal

Every order ends in one of two clean states: **completed** (book taken, money taken, parcel sent) or **cancelled** (book back on the shelf, no money kept, nothing sent). Nothing is lost or done twice, even when messages are lost and the orchestrator crashes.

## The naive attempt

The textbook answer is 2PC: lock the book, the money and the shipment in all three databases, then commit all of them together. But every service keeps its locks until the coordinator decides, and if the coordinator dies at the wrong moment they all wait, locked, until it comes back. Across services run by different teams, or an outside payment provider that offers no "lock and wait" step at all, that is rarely acceptable.

So instead: "call the services one after another, and if one says no, tell the customer the order failed."

Each call commits on its own, so a "no" from payments arrives after inventory has already set the book aside. Nobody gives it back. The customer is told "cancelled", and the book stays off the shelf for good.
[▶ Broken: payments declines, the order is "cancelled", and inventory still holds the book](play:broken: no compensation@t=9)

## Building it up

**1. Run the steps in order, each as a local transaction.** The orchestrator asks inventory to reserve, waits for "done", then asks payments to charge, then shipping to ship. Each service commits its own change at once and holds no locks while it waits for the others.
[▶ Every step commits in turn and the order completes](play:success@t=1)

**2. Give every step a compensation, and run them newest first when a step fails.** "Reserve" is cancelled by "Release", "Charge" by "Refund". The last step, "Ship", needs none: once it succeeds, nothing is left that can fail. When payments declines, the orchestrator releases the book, and only then reports "cancelled". Undoing newest first, like unwinding a stack, means each compensation runs while everything it relied on is still in place.
[▶ Payments declines at t=7; the orchestrator sends Release, and the book is back by t=11](play:payment fails@t=7)
Without this step you are back to the naive attempt: a cancelled order still holding the book.
[▶ Broken: no compensation](play:broken: no compensation@t=9)

**3. Make compensations semantic, not "undo".** A compensation is a new forward action described in business terms: "give back the 1 book this order took", "refund the 30 this order paid". It is not "put the data back the way it was". Between a step and its compensation, other orders have kept working. Restoring an old value wipes out their changes too. Here o1 and o2 each take a book (2 → 1 → 0). o1's payment fails, and an "undo" that restores the count o1 saw before it (2) erases o2's reservation. The shop now shows 2 books on the shelf while also shipping one to o2.
[▶ Broken: at t=11 the "undo" restores 2, and the shop has sold a book it still lists](play:broken: undo by@t=11)
The same goes for money. A charge has already happened: it may be on the customer's statement. The honest fix is a refund, which is a second, visible entry, not a deleted first one.

**4. Write every outcome to the saga log, on disk, before acting on it.** The orchestrator logs "o1 started" before sending the first request, and "o1 reserve done" before sending the next. After a crash it reads the log, sees exactly which step it was waiting on, and sends that request again.
[▶ The orchestrator crashes at t=8, misses payments' reply, and at t=12 reads its log and resends Charge](play:orchestrator crash@t=8)
With the log only in memory, the restarted orchestrator has forgotten o1 entirely. The book stays set aside and the money stays taken, but the parcel is never sent and the customer never hears back.
[▶ Broken: at t=12 the orchestrator restarts with no record of o1](play:broken: log in memory@t=12)

**5. Retry when no answer comes.** A lost reply looks exactly like a lost request: silence. So the orchestrator resends any request that has gone 10 ticks without an answer. Retrying forever is what guarantees every saga reaches an end.
[▶ Payments' reply is lost at t=9; at t=15 the orchestrator resends Charge](play:retry@t=9)
Without retries, a single lost message leaves the order stuck halfway forever: book held, money taken, no parcel, no answer.
[▶ Broken: no retry, and o1 never finishes](play:broken: no retry@t=9)

**6. Make every service idempotent, using the saga id and the request (Charge, Refund…) as the key.** A retry resends a request the service may already have applied: in step 5, payments did charge at t=7, and only its reply was lost. So each service records `o1/Charge` in the same local transaction as the charge itself. When the same request comes again, it repeats its first answer and changes nothing. This pair of saga id and request is an **idempotency key**. It names the request, not the step, because a step and its compensation belong to the same step: keyed on "o1/charge", a later Refund would look like a repeat of the Charge and be skipped.
[▶ The resent Charge arrives at t=17, and payments answers without charging again](play:retry@t=17)
A service that applies every request it receives charges the customer twice.
[▶ Broken: at t=17 the retried Charge takes another 30, for 60 on a 30 order](play:broken: non-idempotent@t=17)

## Why it works now

- Every step is a local transaction, so each service is always internally consistent, and nobody holds a lock while waiting for anyone else.
- The saga log is on disk and written before each action, so a restarted orchestrator always knows the one request it is waiting on.
- Requests are retried until answered, and services are idempotent, so retrying never does anything twice. Together these mean every saga eventually reaches the end of its steps, or the end of its compensations.
- Compensations give back exactly what their own step took, so they never disturb other orders.
- The visualizer checks after every event that no book goes missing, no order is charged more than its price, no service holds anything for an order the log doesn't know, and a cancelled order has nothing left held or charged. Halfway states while a saga runs are allowed; those are the price below.

## What it costs

- **No isolation.** Each step commits at once, so other requests see the halfway states. Here o1 holds the shop's only book while its payment is being declined. o2 asks at that moment, is told "out of stock" and is cancelled. Then o1 gives the book back, and nobody buys it.
[▶ o2 is turned away at t=6; o1 releases the book at t=11](play:no isolation@t=6)
- **More code.** Every step except the last needs a compensation, written and tested like any other feature. Compensations must themselves be retried until they succeed, so they must be idempotent too.
- **Some things can't be taken back.** An email that was sent or a parcel handed to a courier can only be followed up ("sorry, ignore that"), not cancelled. Put such steps last, after everything that is likely to fail.
- **Slower than one transaction.** One request and reply per step, one more per compensation on failure, and the customer waits for all of it, or gets a "processing" answer first and the result later.

## Staff notes

- **Orchestration versus choreography.** Here one orchestrator holds the log and tells each service what to do. In choreography there is no central program: each service listens for the previous service's event ("book reserved") and publishes its own. Choreography has no central component to run, but the saga's flow is spread across services, which makes it harder to follow, change and debug. Orchestration keeps the whole story in one log you can read and monitor.
- **Workflow engines.** Products such as Temporal and AWS Step Functions are often used as the orchestrator: they record each workflow's progress durably and resume it after a crash, which is the saga log and the retry loop from steps 4 and 5.
- **Halfway states that hurt.** Where other requests must not act on a halfway state, add a "pending" marker that they respect (sometimes called a semantic lock), or re-check before the final step.
- **A compensation can overtake its request.** In this design it can't, at any timing: the orchestrator sends Release only after it has logged Reserve's reply as done, so the Reserve has already been applied. The risk is in designs that compensate a step that merely timed out. That request may still be in flight, so its compensation can arrive first. Then inventory must remember "o1 was cancelled" and refuse the late Reserve.
- **Getting the events out reliably.** A service that commits and then publishes an event can crash in between. The transactional outbox (lesson 026) closes that gap.

## Check yourself

- **Q:** Why not use two-phase commit across the three services?
  A: In 2PC every service keeps its data locked until the coordinator decides, and if the coordinator dies they all wait, locked. Services owned by other teams or companies can't be made to hold locks for you. A saga commits each step at once and cancels it later if needed: here inventory commits its reservation at t=3 without waiting for payments, and when payments declines, Release cancels it. (Lesson 024's "blocked" run shows the 2PC alternative: services holding their locks while the coordinator is down.) [▶ See it](play:payment fails@t=3)
- **Q:** Payments declines the charge after inventory has set a book aside. What happens?
  A: The orchestrator logs the failure and sends inventory the compensation, Release. Only after inventory confirms does it tell the client "cancelled". [▶ See it](play:payment fails@t=9)
- **Q:** Why must "Release" give back the order's own book, rather than restore the old stock count?
  A: Other orders reserved books in between. Restoring the old count erases their reservations too, and the shop sells books it still lists as in stock. [▶ See it](play:broken: undo by@t=11)
- **Q:** The reply to "charge 30" is lost and the orchestrator sends it again. Why isn't the customer charged twice?
  A: The request carries the key `o1/Charge`. Payments recorded that key when it charged, so it repeats its first answer and changes nothing. Without the key, the customer pays 60. [▶ See it](play:broken: non-idempotent@t=17)
- **Q:** A saga gives up isolation. What can another customer see?
  A: Halfway states. A book held by an order that is about to be cancelled looks sold, so a second order is turned away, and then the book comes back. [▶ See it](play:no isolation@t=6)

## Deep dive

- Hector Garcia-Molina and Kenneth Salem, "Sagas" (SIGMOD 1987), introduced the idea: a long transaction split into steps, each paired with a compensating transaction.
- Chris Richardson's "Microservices Patterns" covers sagas across microservices, including orchestration and choreography.
- Stripe's API accepts an `Idempotency-Key` header, so a client can safely retry a request that creates a charge.
