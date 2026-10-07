# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Software engineers preparing for coding and system design interviews, mostly studying on their own. They work
through the NeetCode 150 and system design topics and want to understand why a solution works, not memorize it.

## Product Purpose

Offerlab ("Interview prep you can watch run") runs each solution and simulation for real, one step at a time, next
to the line of code that caused each change. Every lesson starts from first principles: what the idea is, the
problem it solves, and the naive approach that fails first. Success is a learner who can rebuild the intuition for
a problem without looking it up.

## Positioning

Solutions are executed and traced, not described: pointers slide, windows grow, trees re-link, queues back up and
servers fall over, driven by the actual TypeScript code. It covers algorithms and system design in one place, free
and open source.

## Operating Context

Runs in the browser as a static site (live demo on GitHub Pages, installable offline PWA). Learners also run the
same files locally with `node --test`, and a Cursor extension (`tools/practice-runner`) runs blank practice copies.
Keyboard: space play/pause, arrow keys step, `[` `]` speed, `i` intuition, `e` explain lines.

## Capabilities and Constraints

- Algorithms: all 150 NeetCode problems in TypeScript with approach, complexity, tests and a step-by-step trace.
- Building blocks: 27 primitives (consistent hashing, Bloom filters, Raft, leases and fencing tokens, 2PC) as
  runnable simulations.
- System design: 31 case studies plus 9 microservice patterns, with live traffic, latency charts and chaos injection.
- Code design: 9 low-level design and 9 API design lessons.
- Practice: 35 drills (estimation, failure scenarios, flashcards).
- Phones get a reading view with no visual or player.
- The landing page is the app's front door, shown on a first visit; it leads into the Algorithms overview.

## Brand Commitments

Name "Offerlab". Logo mark and lockups in `.github/assets/` and `viz/public/favicon.svg`. MIT licensed. Not
affiliated with LeetCode or NeetCode; their names are trademarks of their owners.

## Evidence on Hand

Screenshots in `.github/assets/screens/` (algo.png, blocks.png, design.png); social preview in `.github/assets/`.
Counts above come from the README. No testimonials, user numbers, or press exist; do not invent them.

## Product Principles

- Show it running; never only tell.
- First principles before patterns: the naive approach and why it fails come first.
- Honest and free: real code, real tests, no fabricated claims.
