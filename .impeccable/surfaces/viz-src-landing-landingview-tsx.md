---
version: 1
slug: "viz-src-landing-landingview-tsx"
primary_target: "viz/src/landing/LandingView.tsx"
related_targets: []
---

# Landing (app front door)

Scope: first-visit front door of the viz app, route `#/welcome`. Mode: persuade.
Audience: engineers prepping coding and system design interviews, self-study. Action: start with Algorithms (overview/algorithms), secondary GitHub.
Proof: real counts from README, real screenshots in .github/assets/screens, real problem ids for every station.

## Direction contract

THESIS: The curriculum is a transit network you can ride; every station shows its idea moving. Refuses the hero-plus-feature-card-grid default.
OWN-WORLD: App world kept: indigo ink, p0-p5 line colours, Inter body, JetBrains Mono for code only. Adds Overpass (signage face) for display. Lines are 10px rounded strokes with white station rings and interchange capsules.
STORY: Visitor sees five lines, rides one station, watches an idea run, sees naive vs fix race, sees real screens, presses Start.
FIRST VIEWPORT: Left: headline, sub, Start + GitHub. Right two-thirds: the route map SVG with trains moving; below the map a station display panel with the selected station's animated illustration and Open link. Auto-tour cycles stations until the visitor picks one.
FORM: Route map, position 4 of 7 on the ordered list, seed key 75403def.
FINISH: unreviewed and unpolished until the finish reviewer runs.
