# Vending machine

## What it is

- **What it is:** The controller of a vending machine, written as a state machine: it is always in exactly one state (idle, has money, dispensing or sold out), and each state is a small class that decides what a coin, a button or cancel means right then.
- **The problem it solves:** Tracking the machine with a few true-or-false flags lets impossible combinations slip through: pressing select twice while the first item is dropping vends two items for one payment. With one state object, those combinations cannot even be written down, and change is worked out before any money is taken.
- **Reach for it when:** An interview asks for a vending machine, an ATM or the state pattern, or a design has a fixed set of modes where the same input means different things in each: order status, a traffic light, an approval flow.
- **Not the right tool when:** There are only two or three modes and a few events: a plain switch is clearer than a class per state. With many states and events that must be checked exhaustively, a transition table (state and event to next state) is more compact and easier to test.
- **Where you'll meet it:** "Design a vending machine" is one of the classic low-level design interview questions. The state pattern is one of the 23 patterns in the Gang of Four book, Design Patterns (1994). Bill validators commonly hold the inserted note in escrow and return that same note on cancel.

## Words we'll use

- **Event** — something that happens to the machine from outside: a coin is **inserted**, a slot is **selected**, **cancel** is pressed, or the motor reports the item has dropped (**finish**).
- **State** — what the machine is doing right now, which decides what an event means. Here there are four: **idle** (waiting for a customer), **has-money** (coins in, nothing chosen yet), **dispensing** (the motor is dropping an item) and **sold-out** (nothing left to sell).
- **Transition** — a move from one state to another, caused by an event. "Idle, a coin arrives: has-money."
- **State machine** — a design where the program is always in exactly one of a fixed set of states, and every event either causes a transition or is refused.
- **State pattern** — writing a state machine with one class per state. Each class has a method for every event; the machine passes each event to the object for its current state.
- **Credit** — cents inserted toward the current sale.
- **Escrow** — the coins of the current sale, held apart from the machine's own coins until the sale goes through or is cancelled.
- **Coin box** — the coins the machine owns and can give as **change**: the credit minus the price, paid back in coins.

## The world we're in

- Coins are 5, 10, 25 and 100 cents. The machine has a limited number of each in its box, sometimes none.
- Items have prices that rarely match the coins: chips cost 65 cents, gum 70.
- People press buttons whenever they like: select before paying, select twice, cancel halfway.
- Dropping an item takes time: the motor turns, and only then reports that the item fell. Buttons pressed meanwhile still reach the controller.

## The goal

No item without payment, and no payment kept without an item. Change is exact, or the sale is refused before any money is taken. Cancel returns the coins inserted. While an item is dropping, every other button does nothing.

## The naive attempt

"Keep a few booleans: `hasMoney`, `dispensing`. Check them in each method."

Each check looks fine on its own: select needs `hasMoney` and enough credit. And the money is only taken when the item actually drops, so a jammed motor costs the customer nothing. A customer puts in $1 and presses cola. The motor starts.
[▶ Broken: the first press starts a vend](play:broken: boolean flags@at=flag-vend#1)
They press it again before the can drops. `hasMoney` is still true, and the credit is still $1, because it is only charged at the drop. Nothing in select looks at `dispensing`. A second vend starts.
[▶ Broken: the second press passes every check](play:broken: boolean flags@at=flag-vend#2)
Two colas drop. The second charge takes the credit to -100: the machine thinks the customer owes a dollar it can never collect.
[▶ Broken: the second charge, credit -100](play:broken: boolean flags@at=charge-late#2)
The deeper problem: two booleans make four combinations, three make eight, and every method has to check the right ones. Some combinations should never exist. "Dispensing and has-money at once" did, and one missing check let it through.

## Building it up

**1. One state at a time.** The machine has a single `state` field holding one of four objects. Every event goes to it: `insert(coin)` calls `state.insert(this, coin)`. In idle, a coin moves the machine to has-money.
[▶ Idle, a quarter: has-money](play:buy@at=transition#1)
Select in idle has nothing to check: there is no credit, so the answer is "insert coins first" and nothing else can happen.
[▶ Idle, select: insert coins first](play:no money@at=idle-select#1)

**2. Has-money decides the sale.** Select checks the slot, then the price. 50 cents for 65-cent chips is too little, so it says so and stays in has-money; another quarter, and select goes through.
[▶ 50 cents is not 65](play:not enough@at=short#1)
When the credit is enough and change can be made, the sale is **committed**: the escrow coins join the box, the change leaves it, the item is reserved, and the machine moves to dispensing.
[▶ Committed: dispensing](play:buy@at=start-vend#1)

**3. Dispensing ignores everything.** While the motor runs, select, cancel and insert each get "busy" (an inserted coin is handed straight back). The sale was paid and committed before this state began, so there is nothing to check and nothing to get wrong.
[▶ A second press: busy](play:busy@at=busy#1)
When the item drops, the machine goes back to idle, or to sold-out if that was the last item.
[▶ The cola drops](play:buy@at=dropped#1)
[▶ Back to idle](play:buy@at=transition#3)

**4. Escrow makes cancel exact.** The coins of the current sale are not in the box yet. Cancel in has-money returns those very coins, and the machine never owned them. (Bill validators, and some coin mechanisms, really escrow like this; others pay back equivalent coins from the change tubes.)
[▶ Cancel returns the dollar coin](play:exact change only@at=refund#1)

**5. Change: largest coins first, back off when stuck.** A dollar for 65-cent chips: 35 cents back, a quarter and a dime. With a limited box, largest-first can get stuck. Gum costs 70; the customer pays four quarters; the box has three dimes and no nickels. Largest-first takes a quarter for the 30 cents of change and then needs a nickel that is not there.
[▶ Stuck: the quarter is taken back](play:change: no nickels@at=back-off#3)
So it takes the quarter back and tries with none: three dimes. This always finds change if any mix of the box's coins makes it.
[▶ Change found: three dimes](play:change: no nickels@at=change#1)

**6. Refuse before taking money.** The box is empty and the customer pays a dollar for 65-cent chips. No mix of coins makes 35 cents, so select says "exact change only" and stays in has-money. Nothing has been taken: the customer can add exact coins or cancel.
[▶ No change possible: refused](play:exact change only@at=no-change#1)

**7. Sold-out.** The last gum drops and the machine moves to sold-out. A coin inserted now comes straight back. Restocking moves it to idle.
[▶ The last item: sold-out](play:sold out@at=transition#3)
[▶ A coin in sold-out comes straight back](play:sold out@at=sold-out-coin#1)

## Why it works now

- Payment is committed before dispensing starts, and dispensing answers select with "busy". The flag machine let a second select through while the first was dropping:
  [▶ See it break](play:broken: boolean flags@at=flag-vend#2)
- The machine is in exactly one state, so "dispensing and has-money at once" cannot be written down, let alone reached. Each state's methods list what that state allows.
- Change is found before the sale is committed. If it cannot be found, nothing is taken, and the escrow coins can still go back as they came.

## What it costs

- **More classes.** Four small classes and one interface instead of one class with flags. Adding an event (say, "card tapped") means a method in every state, even where the answer is "not now". That is also the benefit: the compiler makes you decide.
- **Paying before the drop.** Here the sale is committed before the motor runs, so a jam must be handled by a refund: the motor reports failure, and the machine gives the money back. Charging only after the drop avoids that refund, but then the "busy" state has to protect the uncharged credit, which is exactly what the flag machine got wrong.
- **Change-making is a search.** Backing off tries many combinations in the worst case; with four coin values it is a handful of steps. It finds a way to make change, not always the fewest coins.
- **State lives in memory.** A power cut while dispensing loses what was happening. A real controller writes the state and escrow to non-volatile memory before each transition.

## Staff notes

- **Draw the diagram first.** Four boxes and their arrows: idle to has-money on a coin, has-money to dispensing on a successful select, has-money to idle on cancel, dispensing to idle or sold-out on finish, sold-out to idle on restock. Then every other (state, event) pair is "refuse", and each needs a message. Interviewers check that you covered all of them.
- **State pattern or table.** The pattern puts each state's rules in one class. A transition table (`[state][event] -> next state, action`) is compact, easy to print and test exhaustively, and common in embedded code. Both are fine; pick one and say why.
- **Concurrency.** The coin mechanism, the buttons and the motor are separate pieces of hardware. Put their events on one queue and handle them one at a time on one thread, so two events can never interleave inside a transition.
- **Extensibility.** Card payment is another way into has-money (with an authorize, then capture after the drop). Multiple items per sale, discounts and a maintenance mode are new states or new actions, not new flags.
- **Testing.** One test per arrow in the diagram, and one per refused event in each state. Drive events, then assert the state name and the outputs (tray, returned coins, messages). The machine has no clock and no I/O, so this is fast and exact.

## Check yourself

- **Q:** With booleans, the customer presses select twice while the can is dropping. What happens and why?
  A: Two cans drop for one dollar. Select checks `hasMoney` and credit, both still fine because payment is taken at the drop, and never checks `dispensing`. [▶ Show it](play:broken: boolean flags@at=flag-vend#2)
- **Q:** The same double press on the state-pattern machine?
  A: The first press moved it to dispensing, and dispensing answers select with "busy". Nothing else happens. [▶ Show it](play:busy@at=busy#1)
- **Q:** 30 cents of change, a box of three dimes and no nickels. How is the change found?
  A: Largest-first tries a quarter, is left needing 5 cents with no nickel, takes the quarter back, and uses three dimes. [▶ Show it](play:change: no nickels@at=back-off#3)
- **Q:** The box is empty and the customer pays $1 for 65-cent chips. What does the machine do?
  A: Refuses with "exact change only" and stays in has-money with the credit untouched; cancel returns the dollar. [▶ Show it](play:exact change only@at=no-change#1)
