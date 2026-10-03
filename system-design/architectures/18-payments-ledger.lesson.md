# Payments ledger

## What it is

- **What it is:** The record of money inside a payments or wallet company. Every payment writes entries that move money between accounts, each balance is the sum of its account's entries, and merchants are paid out to their banks from it.
- **What makes it hard:** A payment must never be applied twice, half-applied or lost, yet clients retry when an answer is slow and one popular merchant's balance row can take only about 500 updates a second. The outside bank is slow and caps how many transfers we may send at once.
- **Building blocks it uses:** [idempotency keys](#/sd-api-design/02-idempotency-keys) stored in the payment's own transaction, clients that [retry with backoff](#/sd-04-traffic/015-retry-backoff-jitter), a projector that applies each entry once by recording its progress in the same transaction as the balance (an [idempotent consumer](#/sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer), reading an outbox or change log in commit order), and payouts run as [delayed jobs](#/sd-low-level-design/07-delayed-job-scheduler).
- **Where you'll meet it:** "Design a payment system" and "Design a digital wallet" are common interview questions. Double-entry bookkeeping is centuries-old accounting practice, and databases such as TigerBeetle are built around debits and credits between accounts. Hot accounts also show up as marketplace fee accounts and payroll on payday.

## Words we'll use

- **Account** — a named pot of money in our system: a buyer's wallet, a merchant's earnings, our own fees. Its **balance** is how much is in it.
- **Entry** — one line in the ledger: "account X, +$12.00" or "account Y, −$12.00", with the payment it belongs to and the time. Entries are never changed or deleted; a mistake is fixed by new entries that reverse it.
- **Double-entry** — every payment writes at least two entries whose amounts add up to zero: a debit (money out of one account) and a credit (money into another). Money is never created or lost, only moved, so the sum of all entries is always zero. That makes errors detectable.
- **Ledger** — the table of all entries, the record of truth. A balance is just the sum of an account's entries.
- **Transaction** (database) — a group of changes that all happen or none do (**atomic**). A payment's two entries go in one transaction, so you can never see one without the other.
- **Row lock** — while a transaction changes a row, the database locks it until the **commit**, so a second change to the same row waits. Changes to one row go one at a time.
- **Hot row** — a row so many transactions want to change that they queue for its lock.
- **Idempotency key** — a unique id the client sends with a payment, the same on every retry of it. The server stores it with the payment, so a retry finds "already done, here is the result" instead of paying again.
- **Derived data** — data computed from the truth and rebuildable from it: here, balances computed from entries.
- **Projector** — a worker that reads new entries and applies them to derived data (balances), in order.
- **Payout** — sending a merchant's earnings to their bank account. **Settlement** in general is moving the money between institutions that the ledger says is owed.
- **Queue**, **consumer** — a list of jobs waiting, and a worker that takes jobs off it. A **delayed job** becomes visible to consumers only after a set time.

## The world we're in

- 2,000 requests a second: 90% are payments, 10% are balance lookups.
- 10,000 merchants. One is running a big on-sale and gets about 38% of all payments.
- Clients that get no answer within a second try again, after about 100 ms and then 200 ms: three attempts in all.
- The ledger database has 8 cores. A payment's transaction costs 3 ms of its CPU.
- Updating a balance row holds that row's lock for about 2 ms (the update, then the commit's flush to disk). So one row can take at most about 500 updates a second, whatever the machine.
- The bank's transfer API takes about 300 ms a call and accepts at most 50 calls at once from us.
- Correctness comes before speed: a payment may be slow or refused, but never applied twice, half-applied or lost.

## The goal

Record 2,000 payments a second, each exactly once, with balances that always add up, while one merchant takes a third of the traffic. Then pay merchants without letting the bank set our speed.

## The naive attempt

"Each payment is one transaction: insert the two entries, subtract from the payer's balance, add to the merchant's balance, commit."

It is correct. It is also a line. Every payment to the on-sale merchant updates that merchant's one balance row, and each update waits for the previous one's lock. At 600 payments a second that row is already locked 42% of the time, while the ledger's 8 cores are under 25% busy. Nothing fails yet.
[▶ Balances in place at 600 a second](play:in place: 600@t=8)

At 2,000 a second the merchant's 684 payments a second need 684 × 2 ms = 1.4 seconds of lock time every second. The row is locked 100% of the time; every other merchant's row stays under 40%; the ledger is under half busy. The app servers' workers all end up waiting in the row's line, so payments to *every* merchant fail: over 85% of all requests. Clients retry, sending over 3,000 extra attempts a second into the same line.
[▶ Broken: the hot merchant's row at 2,000 a second](play:broken: both balances in place@t=8)

Worse, look at what the retries hide. Over these 7 seconds between 5,000 and 9,000 payments committed after their client had already given up (about 1,000 a second). Most of those clients retried. Without an idempotency key, every one of those retries is a second, real charge.

## Building it up

**1. Make every payment idempotent.** The client creates an idempotency key for the payment once, before the first attempt, and sends the same key on every retry. The server inserts the key into a table with a unique constraint *in the same transaction* as the entries. Then exactly one of two things happens: the first attempt's transaction commits key and entries together, and any retry hits the unique constraint, so the server looks up and returns the stored result; or the first attempt rolled back, the key is not there, and the retry does the payment once. A key stored in a separate step (a cache, a second transaction) has a gap: the payment commits, the server dies before storing the key, the retry pays again.

**2. Stop updating the merchant's balance in the payment.** Look at what each half of a payment needs. The debit needs a check: the payer must have the money, so the payer's balance row is read and updated, locked, in the transaction. That is fine: payers are spread over millions of rows and no one payer is hot. The credit needs no check: money arriving in a merchant's account is always allowed (for ordinary accounts). So the payment does not have to touch the merchant's balance at all. The transaction now writes the two entries, the idempotency key and the payer's balance, and commits.

The merchant's balance becomes **derived data**. A projector reads new entries in batches of about 100, adds them up per merchant ("merchant 7: +$4,210.50 from 61 entries"), and applies each sum in one update, recording in the same transaction which entries it has applied. The hot merchant's row is now updated once per batch, about 18 times a second instead of 684. Other merchants get one update per batch they appear in, spread over thousands of rows. (The simulator models one update per batch.)

At 2,000 a second nothing fails, the median payment takes about 49 ms (mostly the network to the user), the ledger is about 70% busy doing real work, and every balance row is under 1% locked.
[▶ Entries appended, balances derived](play:derived: entries appended@t=8)

**3. Know what the retries were about.** Slow the ledger to a third of its speed for 2 seconds (a disk hiccup, a long-running report). No payment fails: they queue, and the 99th percentile climbs past a second. But clients waiting more than a second give up and retry, and between 400 and 650 payments commit after their client had stopped waiting. With the idempotency key, each of those retries is a lookup that returns the first result. Without it, each would be a double charge, during an incident that otherwise looks harmless.
[▶ Broken: a slow ledger, payments that commit after the client gave up](play:broken: a slow ledger@t=6)
(The simulator runs a retry as a full payment; a real retry that finds its key costs much less.)

**4. Pay merchants out in batches.** Merchants want their money in their bank. The tempting design: on every payment, call the bank and transfer the merchant's share. The bank takes 300 ms a call and accepts 50 at a time: at most 50 / 0.3 s ≈ 166 transfers a second. At 1,800 payments a second every bank slot is full, the app servers' workers all wait on it, and every payment fails, including ones the bank has nothing to do with.
[▶ Broken: a bank transfer per payment](play:broken: a bank transfer per payment@t=8)

Instead, a payment only adds to what the merchant is owed (which the ledger already records). Payouts are **delayed jobs**: one per merchant per payout window, due when the window closes (a day in many real systems; 5 seconds here so you can watch). When a job comes due, the consumer computes the amount from the merchant's entries up to the window's end, writes the payout's own entries (debit the merchant, credit a "payouts in transit" account), and then calls the bank. The simulator models this as one payout per 1,000 payments: 1 to 2 bank calls a second instead of 1,800, with between 4 and 20 payouts waiting for their window at any moment. Nothing fails and the bank is almost idle. (With real daily windows the count is at most one payout per merchant per day: 10,000 a day here.)
[▶ Batched payouts](play:payouts: batched@t=8)

## Why it works now

The limit in the naive design was not CPU; it was one row's lock, taken by over a third of all payments, one after another.
[▶ Broken: the hot row](play:broken: both balances in place@t=6)
The fix was to see that the credit never needed to be inside the payment. The entries are the truth, and they are spread over millions of rows with no contention. The merchant's balance is a sum that can be computed later, in batches, so the hot row is touched about 18 times a second instead of 684.
[▶ The same traffic, balances derived](play:derived: entries appended@t=6)
The same idea moved the bank off the payment path: the ledger records what is owed now; the slow, rate-limited outside system is called later, in bulk.

## What it costs

- The merchant's balance is late by the projector's lag. Anything that *spends* a merchant's money (a refund, a payout) must not trust the derived balance alone: compute from the entries up to a point, or wait until the projector has passed it.
- The projector must apply each entry exactly once. Record what it applied in the same transaction as the balance update. Careful with "every entry id above the last one I applied": ids from a sequence are handed out when each row is inserted, not when its transaction commits, so they can become visible out of order (entry 105 commits, then 104), so a projector reading by id can skip 104 for good. Read entries in commit order instead, for example from the database's change log (change data capture) or an outbox table the projector reads.
- Payouts move money outside the system. Write the payout's entries before calling the bank, give each payout its own id, and send that id to the bank if its API accepts one. If the bank's API does not accept one, then before retrying a payout that timed out, ask the bank whether it already happened.
- More moving parts mean more reconciliation: entries must sum to zero, each balance must equal the sum of its entries, and payouts must match the bank's statements. Run those checks every day and alert on any difference, however small.
- Money: about $1.10 an hour for the derived design and $1.16 with the payout queue, against $1.05 for the naive one. The cost is in engineering, not machines.

## Staff notes

- Never store a balance change without the entry that explains it, in the same transaction. A balance with no entries behind it cannot be audited or rebuilt.
- Amounts are integers in the smallest unit (cents, or the currency's minor unit), never floating point. Store the currency with every amount.
- The idempotency key belongs to the operation, not the attempt: created once by the client, stored with a unique constraint alongside the effect it guards, kept at least as long as a client might retry.
- A hot account is a common, not exotic, problem: a marketplace's fee account, a popular merchant, a payroll account on payday. Debits from a hot account still need a check against the balance; that is when you split the account into sub-accounts or reserve funds ahead in chunks, both of which this design does not cover.
- Correctness before speed means choosing to refuse a payment rather than risk applying it twice. Every timeout, retry and failover path should be walked through against the question: can this ever double-apply?

## Check yourself

- **Q:** At 2,000 a second the ledger's 8 cores are under half busy. What is full, and why does it break payments to every merchant?
  A: The hot merchant's balance row: its lock lets updates through one at a time, about 500 a second. App workers wait in its line, so payments to other merchants find no free worker. [▶ Show it](play:broken: both balances in place@t=8)
- **Q:** Why is it safe to leave the merchant's balance out of the payment, but not the payer's?
  A: A credit needs no check, so its balance can be summed later from the entries. A debit must check the payer has the money, so the payer's balance is updated, locked, in the transaction; payers are spread out, so no row is hot. [▶ Show it](play:derived: entries appended@t=8)
- **Q:** During a 2-second slowdown no payment fails. Why is that still dangerous without idempotency keys?
  A: Hundreds of payments commit after their client stopped waiting, and each client retries. Without a key stored in the same transaction, each retry is a second charge. [▶ Show it](play:broken: a slow ledger@t=6)
- **Q:** The bank can take about 166 transfers a second. Why does calling it on every payment fail every payment, not just the extra ones?
  A: App workers wait on the bank's 50 slots, so they are all held, and new payments find no worker at all. Batching makes it 1 to 2 calls a second. [▶ Show it](play:broken: a bank transfer per payment@t=8)
