# Elevator scheduler

## What it is

- **What it is:** The controller for one elevator car: a state machine that, one step at a time, closes the doors, opens them at a stop, or moves one floor, and asks a swappable scheduler which floor to head for next.
- **The problem it solves:** Serving calls in the order buttons were pressed sends the car back and forth across the building, passing people who are waiting: five calls cost 30 floors of travel instead of 8. The LOOK rule serves calls in floor order, one direction at a time, so travel stays short and no call waits more than about two sweeps of the building.
- **Reach for it when:** An interview asks for an elevator system, a state machine with forbidden moves (never move with the doors open), a rule for choosing the next request by position, or how to avoid starving a request.
- **Not the right tool when:** The building has several cars: first a dispatcher must assign each hall call to one car, usually by estimated arrival time, and only then does each car run LOOK on its own stops. If the lowest average travel matters more than fairness, nearest-first travels less but can starve a far floor.
- **Where you'll meet it:** "Design an elevator system" is a classic low-level design question. SCAN and LOOK are the textbook disk-arm scheduling algorithms, and SCAN is often called the elevator algorithm; the Linux kernel's block layer still calls its I/O schedulers elevators.

## Words we'll use

- **Car** — the elevator box that moves up and down the shaft. Here there is one car in a building with floors 0 to 9.
- **Request** (or **call**) — a button press asking the car to stop at a floor. It stays **pending** until the car stops there with its doors open; then it is **served**.
- **Tick** — one step of simulated time. In one tick the car moves one floor, or opens its doors, or closes them.
- **State machine** — an object that is always in exactly one of a few named states, with fixed rules for moving between them. The car is `idle`, `moving` or `doorsOpen`.
- **Scheduler** — the rule that picks which floor the car should head for next. It sits behind an interface, `next(car)`, so rules can be swapped and tested apart from the car.
- **FCFS (first come, first served)** — serve requests in the order they were made.
- **Sweep** — one trip in a single direction, from where the car turned last to where it turns next.
- **LOOK** — keep going in the current direction while any stop lies ahead, stop at each on the way, and turn as soon as nothing is left in that direction.
- **SCAN** — the same, but always continue to the end of the shaft before turning.
- **Starvation** — a request that waits forever because the rule keeps preferring others.
- **Travel** — floors moved in total. It drives energy use, wear and how long people wait.

## The world we're in

- One car, floors 0 to 9. Buttons can be pressed at any time, including while the car is moving.
- Each request is just a floor to stop at. Real hall buttons also say "up" or "down"; that is in "What it costs".
- Time moves in ticks, so every run is repeatable and a test can stop the car at an exact moment.
- The car must never move with its doors open and never go below 0 or above 9.

## The goal

Serve every request, never starve one, never leave the shaft, never move with doors open, and keep travel low. The car's mechanics (doors, moving, the state) must stay separate from the rule that picks the next floor.

## The naive attempt

"Serve people in the order they pressed." It sounds fair. Five calls come in while the car waits at floor 0: 8, 1, 7, 2, 6. FCFS heads for 8 first, the oldest call, and on its first tick passes floor 1, where someone is waiting, without stopping.
[▶ Broken: the car passes floor 1 on its way to 8](play:broken: first come, first served@at=move#1)
After 8 it comes all the way back down for 1, then up to 7, down to 2, up to 6.
[▶ Broken: back down to serve floor 1](play:broken: first come, first served@at=open#2)
[▶ Broken: the last stop, 30 floors in](play:broken: first come, first served@at=move#30)
Thirty floors of travel. The same five stops lie on one line from 0 to 8: eight floors of work. Arrival order has nothing to do with where people are, so the car crosses the building again and again, and everyone after the first caller waits longer.

## Building it up

**1. Separate the car from the rule.** The `Elevator` owns its state and its pending stops, and does one tick at a time in `step()`. It asks a `Scheduler` only one question: which floor next? FCFS, LOOK and SCAN are each one small class, and the car does not change between them.

**2. The car is a state machine.** Each tick does exactly one thing, and the order of the checks enforces the rules:
- doors open → close them (the car never moves in the same tick);
- nothing pending → stay idle;
- at the target floor → open the doors and mark it served;
- otherwise → move one floor toward the target.
A call at the car's own floor opens the doors without moving; the next tick closes them.
[▶ A call at floor 4 while the car is at 4: doors open](play:state machine@at=open#1)
[▶ The next tick closes them before anything else](play:state machine@at=close#1)
A floor the building does not have is refused at the button, never queued, so the car can never be sent outside the shaft.
[▶ A call to floor 12 is refused](play:state machine@at=refuse#1)

**3. LOOK: the nearest stop ahead.** Going up (or starting from idle), the scheduler picks the nearest pending floor at or above the car. Since it is the nearest, there is never a waiting floor between the car and its target. The same five calls, 8, 1, 7, 2, 6, are served as 1, 2, 6, 7, 8: one sweep, eight floors.
[▶ LOOK heads for the nearest stop above](play:look: one sweep@at=ahead#1)
[▶ The last stop, floor 8, after 8 floors of travel](play:look: one sweep@at=open#5)

**4. Calls on the way join the sweep.** The car is heading from 0 to 8. At floor 3 someone presses 5. Because LOOK asks again every tick, the new nearest stop ahead is 5, and the car stops there on the way, with no detour: still 8 floors in total.
[▶ The call to 5 arrives while the car is at 3](play:look: a call that arrives@at=call#2)
[▶ The car stops at 5 on the way up](play:look: a call that arrives@at=open#1)

**5. Turn at the last call.** The car is at 5 with calls at 7 and 2. It goes up to 7 first (it was not going down). Then nothing is left above, so LOOK turns at once and heads for 2. Travel: 2 up plus 5 down, 7 floors, and the car never rises above 7.
[▶ Nothing left above 7: LOOK turns](play:look: with nothing left ahead@at=reverse#1)

**6. SCAN for comparison.** SCAN finishes the sweep to the end of the shaft before turning. Same calls, 7 and 2 from floor 5: after 7 it keeps going to 9, turns there, then comes down to 2. Travel: 11 floors.
[▶ SCAN heads for the top floor with nobody there](play:scan@at=toEnd#1)
[▶ It turns at floor 9](play:scan@at=turn#1)
SCAN is the textbook original (from disk-arm scheduling); LOOK is the refinement that skips the empty end of the shaft. Both bound waiting the same way: a call is reached within one sweep out and one back.

## Why it works now

- LOOK always takes the nearest stop in the current direction, so it never passes a waiting floor on the way. FCFS did, on its very first tick.
  [▶ See it break](play:broken: first come, first served@at=move#1)
- Within a sweep the stops are served in floor order, so travel is about the span of the requests (8 floors for five calls between 0 and 8), not the sum of the jumps between them in arrival order (30).
- No starvation. A pending floor is either ahead of the car, and reached in this sweep, or behind it, and reached in the next. New calls cannot push it back further than that.
- The car's rules (doors before motion, no floors outside the building) live in `Elevator` and hold whatever the scheduler is. The tests run the same car with three schedulers.

## What it costs

- **A call just behind the car waits a whole sweep.** The car has just passed floor 4 going up; a call at 4 waits until the car comes back down.
- **Hall calls have a direction, and this model ignores it.** Someone on floor 4 pressing "up" does not want a car that is going down. A real controller keeps up-calls and down-calls apart and serves a hall call only when the car is going its way; car buttons (inside) work as here.
- **One car.** A building with several cars needs a dispatcher that assigns each hall call to one car, usually by estimated time of arrival, while each car still runs LOOK on its own stops.
- **`next()` scans every pending stop.** Fine for a building's dozens of floors. Two sorted sets (stops above, stops below) make it O(log n).
- **Travel is not the only goal.** Waiting time, ride time and energy pull in different directions; morning up-peaks and lunch traffic are often handled with special modes.

## Staff notes

- **Start with the states and transitions.** Draw idle → moving → doorsOpen → idle, and say which are forbidden (moving with doors open, moving without a target). Interviewers want an explicit state machine, not flags scattered across methods.
- **Extensibility.** Scheduler as a strategy; a `Dispatcher` above several `Elevator`s; requests as objects (floor, direction, time made) so new kinds (a VIP floor, a fire-service mode that ignores all calls) fit without rewriting the car.
- **Idle direction.** Here an idle car always looks up first, so a car at 5 with calls at 9 and 4 travels 4 + 5 = 9 floors instead of 1 + 5 = 6. A real scheduler starts an idle car toward the nearest call.
- **Concurrency.** Buttons are pressed from other threads (or arrive as hardware events) while the control loop runs. Simplest safe design: buttons only put events on a queue, and one control loop owns all car state and drains the queue each tick. No locks inside the car logic at all.
- **Testing.** Ticks make it deterministic. Assert service order and total travel for fixed call sets, and the invariants on every tick (doors open means the floor did not change; floor within 0..top).
- **Name the alternatives.** Nearest-first (shortest seek time) travels less on average but can starve a far floor while near calls keep arriving; that is the follow-up question if you suggest it.

## Check yourself

- **Q:** Calls at 8, 1, 7, 2, 6 with the car at 0. How far does FCFS travel, and why so much?
  A: 30 floors. It serves arrival order (8, 1, 7, 2, 6), so it crosses the building five times, passing waiting floors on the way. [▶ Show it](play:broken: first come, first served@at=move#30)
- **Q:** The same calls under LOOK: in what order are they served, and how far does the car go?
  A: 1, 2, 6, 7, 8: one sweep up, 8 floors. [▶ Show it](play:look: one sweep@at=open#5)
- **Q:** The car is on its way from 0 to 8. At floor 3, someone calls from 5. What does LOOK do?
  A: It stops at 5 on the way, because 5 is now the nearest stop ahead; total travel stays 8. [▶ Show it](play:look: a call that arrives@at=open#1)
- **Q:** Car at 5, calls at 7 and 2. Why does SCAN travel 11 floors when LOOK travels 7?
  A: SCAN continues to floor 9 before turning; LOOK turns at 7, the last call above. [▶ Show it](play:scan@at=turn#1)
- **Q:** What stops the car from moving in the same tick its doors are open?
  A: The state machine: a tick with the doors open only closes them; moving is considered only on a later tick. [▶ Show it](play:state machine@at=close#1)
