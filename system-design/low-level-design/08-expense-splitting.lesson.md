# Expense splitting

## What it is

- **What it is:** The core of a bill-splitting app like Splitwise: a ledger that records who paid for what, splits each expense equally, by exact amounts or by percentages, keeps one net balance per person, and suggests a short list of payments that settles everyone up.
- **The problem it solves:** Rounding each person's share on its own makes cents appear or vanish: $10.00 split three ways becomes three $3.33 shares, $9.99 in all, and the books no longer balance. Storing whole cents, computing the shares together so they add up to the total, and checking that all balances sum to zero keep every cent accounted for.
- **Reach for it when:** An interview asks to "design Splitwise" or to minimize the number of payments, or any design divides money into parts: invoices, refunds, proportional fees, shared costs.
- **Not the right tool when:** People need to see who owes whom pair by pair: net balances forget that, so keep pairwise debts instead. The true fewest payments for a large group is NP-hard to find, so expect a good answer, not the best one. Moving real money also needs retries that never pay twice, see [idempotency keys](#/sd-api-design/02-idempotency-keys).
- **Where you'll meet it:** Stripe's API takes amounts as integers in the currency's smallest unit, and payment systems generally avoid floating-point money. Splitwise offers an option to simplify debts within a group. The largest-remainder (Hamilton) method used here for percent splits is also a classic method for allocating parliament seats.

## Words we'll use

- **Expense** — one bill: what it was, who **paid**, the total, and the people who share it.
- **Share** — the part of an expense one person is responsible for. The shares of an expense add up to its total.
- **Split** — the rule that turns a total into shares: **equal** (everyone the same), **exact** (the user types each amount) or **percent** (each person a percentage).
- **Cent** — the smallest unit of money here. Every amount is stored as a whole number of cents: $10.00 is `1000`.
- **Balance** — one person's net position across all expenses: positive means others owe them, negative means they owe. Here, balances are **net**: they do not record who owes whom, only how much each person is up or down.
- **Invariant** — something that must be true after every operation. The ledger's: all balances added up are exactly zero, because every cent someone is owed, someone else owes.
- **Settle up** — a list of **transfers** (one person pays another an amount) that brings every balance to zero.
- **Largest remainder** — a rounding rule: round every share down, then give the cents left over, one each, to the shares that lost the most by rounding down.
- **Greedy** — an algorithm that makes the choice that looks best right now, and never goes back on it.

## The world we're in

- Asha, Ben and Cara share a weekend: a hotel, dinners, taxis. Later, a bigger group with Dev and Eli.
- People enter totals to the cent. Most totals do not divide evenly: $10.00 three ways is $3.333... each, and there is no such coin.
- At the end everyone wants as few payments as possible: each one is an app transfer someone has to make.
- One process, one ledger. Concurrency comes up in the staff notes.

## The goal

Every expense's shares add up to exactly its total, so no cent is ever created or lost, and the balances always sum to zero. Bad input (exact shares that do not add up, percentages that are not 100) is refused and changes nothing. Settle-up returns transfers that bring everyone to zero, and few of them.

## The naive attempt

"Divide the total by the number of people, round each share to the cent."

Asha pays $10.00 for a pizza for three. 1000 / 3 is 333.33..., and each share rounds to 333.
[▶ Broken: each share is rounded on its own, to 333](play:broken: round each share@at=round-each#1)
Three shares of 333 are 999. Asha is credited 1000 and the three shares debit 999, so the balances add up to +1: the ledger says Asha is owed a cent that nobody owes. Settle-up pays her 333 from Ben and 333 from Cara, and then stops with Asha still at +1, because there is no debtor left to pay it.
[▶ Broken: nobody owes, but Asha is still owed a cent](play:broken: round each share@at=settled#3)
One cent looks harmless. Across a million expenses it is a books-do-not-balance bug, and with three people sharing $20.00 (666.67 rounds up to 667 each) it goes the other way and invents a cent. Storing dollars as floating-point numbers makes it worse still: in binary floating point, 0.1 + 0.2 is not exactly 0.3, so even adding amounts drifts.

## Building it up

**1. Whole cents, everywhere.** Every amount is an integer number of cents. Integer adding and subtracting is exact, so balances can only be wrong if shares are wrong. That moves the whole problem to one place: computing shares.

**2. One net balance per person.** An expense adds the total to the payer's balance and subtracts each share from that person's. The payer is usually in the split too, so Asha, who paid 1000 and owes 334 of it, ends at +666.

**3. Equal split: floor, then hand out the leftover cents.** Everyone gets `floor(1000 / 3) = 333`. That leaves `1000 - 999 = 1` cent.
[▶ 1 cent left over](play:equal split@at=leftover#1)
The leftover cents go one each to the first people listed, so they always add up: Asha 334, Ben 333, Cara 333.
[▶ Asha gets the extra cent](play:equal split@at=extra-cent#1)
[▶ Ben gets the plain 333](play:equal split@at=extra-cent#2)
The leftover is always fewer cents than there are people, so nobody pays more than one cent above anyone else.

**4. Percent split: largest remainder.** Cara pays a $9.99 taxi, split 30/30/40. The exact shares are 299.7, 299.7 and 399.6 cents. Rounding each to the nearest cent gives 300 + 300 + 400 = 1000, a cent too many. Instead, round every share down (299, 299, 399, 997 in all) and give the 2 missing cents to the shares that lost the most: the two .7s. Asha 300, Ben 300, Cara 399.
[▶ The 2 leftover cents go to the largest remainders](play:percent split@at=largest-remainder#1)
Percentages become whole basis points first (30% = 3000), so the division and remainder are integer arithmetic, exact to the cent.

**5. Exact split: check, never guess.** Ben enters snacks as $10.00 with shares of $4.00 and $5.00. They add up to $9.00. The app cannot know whose share is wrong, so it refuses the expense and changes nothing.
[▶ 900 is not 1000: refused](play:exact split@at=exact-mismatch#2)
[▶ Nothing is applied](play:exact split@at=rejected#2)
After every split, `addExpense` checks the invariant once more: the shares add up to the total, or nothing is applied.

**6. Settle up, greedily.** Pair the person owed the most with the person who owes the most, and have the debtor pay the smaller of the two amounts. That brings at least one of them to zero, so n people with balances need at most n - 1 payments. After a weekend of hotel, dinner and taxi, Asha is owed 153.16 dollars; Cara pays her 106.33 and Ben 46.83. Two payments.
[▶ Cara pays Asha the most she owes](play:settle up@at=transfer#1)
[▶ Ben pays the rest](play:settle up@at=transfer#2)
[▶ Everyone at zero](play:settle up@at=settled#3)

**7. Greedy is not always the fewest.** Cara bought Ben a $7.00 ticket; Eli paid an $8.00 lunch for Asha ($3.00) and Dev ($5.00). The obvious plan is three payments: Ben pays Cara, and Asha and Dev pay Eli. Greedy sees Eli owed the most (8.00) and Ben owing the most (7.00), so it has Ben pay Eli.
[▶ Greedy pairs Ben with Eli, though Ben's debt is to Cara](play:greedy is not always fewest@at=transfer#1)
That breaks both natural groups, and greedy needs four payments, with Asha paying two people.
[▶ The fourth payment](play:greedy is not always fewest@at=transfer#4)
The fewest payments come from splitting people into as many groups as possible whose balances sum to zero, each settled within itself (a group of k people needs k - 1 payments). Finding that best grouping is NP-hard in general: it includes deciding whether some subset of numbers sums to exactly zero. So real apps settle for a good answer, not a proven best one.

## Why it works now

- Shares are computed together, floor plus leftover cents, so they always add up to the total. Rounding each one alone lost a cent and left Asha owed money nobody owes:
  [▶ See it break](play:broken: round each share@at=settled#3)
- Every amount is integer cents, so adding balances is exact; the only rounding happens in one place, and that place hands out every cent.
- Every expense is checked against the invariant before it touches a balance, so a bad expense changes nothing.
- Each greedy payment zeroes at least one person, so settle-up ends, after at most n - 1 payments.

## What it costs

- **The leftover cent is unfair to someone.** Giving it to the first person listed means the same person pays it every time. Rotate it, give it to the payer, or randomize it; all keep the total right.
- **Net balances forget who owes whom.** Settle-up may tell Asha to pay Cara though they never shared a bill. Some groups want only pairwise debts settled; that keeps the history readable but takes more payments.
- **Greedy is not optimal.** It can use more payments than needed, as in the five-person example. An exact search is fine for a handful of people (try every grouping) and hopeless for large groups.
- **Settle-up is O(n^2).** Each payment scans every balance. Two heaps (creditors by amount, debtors by amount) make it O(n log n); for a group of friends it does not matter.

## Staff notes

- **The classes.** `Ledger` (balances, expenses, addExpense, settleUp), `Expense` (payer, total, participants, split), a `Split` strategy per kind (equal, exact, percent, and later shares like "2 parts to 1"), and a `Money` value type that is integer minor units plus a currency. A new split kind is a new strategy, and the invariant check in `addExpense` covers it for free.
- **Edits and deletes.** Keep the expense list as the source of truth and treat balances as derived: deleting an expense applies its reverse, or balances are rebuilt from the list. Both keep the invariant.
- **Currencies.** One balance per person per currency. Converting at entry time bakes in that day's rate; a common design keeps balances per currency and converts only when settling.
- **Concurrency.** Two people adding expenses at once must not lose an update to a balance. Append expenses to a log (an insert never conflicts) and derive balances, or update balances in one transaction with the insert.
- **Testing.** Property tests fit perfectly: for random totals, people and splits, assert the shares add up to the total and the balances sum to zero; for random balances, assert settle-up ends at zero in at most n - 1 payments.

## Check yourself

- **Q:** $10.00 split three ways, each share rounded on its own. What goes wrong?
  A: Each rounds to 333, so the shares add to 999: Asha is owed a cent nobody owes, and settle-up ends with her still at +1. [▶ Show it](play:broken: round each share@at=settled#3)
- **Q:** How does the equal split share 1000 cents among three people?
  A: Everyone gets the floor, 333, and the 1 leftover cent goes to the first person listed: 334, 333, 333. [▶ Show it](play:equal split@at=leftover#1)
- **Q:** $9.99 split 30/30/40. Who gets the two leftover cents, and why?
  A: Asha and Ben: their exact shares were 299.7, the largest fractional parts lost to rounding down (Cara's was 399.6). [▶ Show it](play:percent split@at=largest-remainder#1)
- **Q:** Is greedy settle-up always the fewest payments?
  A: No. With Cara +7, Ben -7, Eli +8, Asha -3 and Dev -5 (dollars), greedy pairs Eli with Ben and needs four; three suffice. Finding the minimum in general is NP-hard. [▶ Show it](play:greedy is not always fewest@at=transfer#4)
