# Contributing to Offerlab

Thanks for helping. Every fix, new lesson and clearer sentence makes interview prep easier for the next person.

## Setup

```bash
npm install
npm --prefix viz install
npm run viz        # visualizer at http://localhost:5173
```

You need Node.js 26 or newer.

## Before you open a pull request

```bash
npm test                    # solutions and system design
npm run typecheck
npm --prefix viz test       # visualizer
npm --prefix viz run check  # traces every problem and reports any that break
```

CI runs the same commands on every pull request.

## Writing style

- **First principles.** Each lesson opens with what the idea is and the problem it solves, then shows the naive
  approach failing before the real one.
- **Plain words.** Define a term the first time you use it. Prefer short sentences.
- **Self-contained files.** Each problem file holds its statement, approach, solution and tests, with no imports
  from other problem files.

## Good first contributions

- A clearer "why" note on a solution line
- A missing edge-case test
- A new failure drill or flashcard
- Fixing a typo or a broken link

Open an issue first for larger changes, such as a new case study or a new visualizer view, so we can agree on the
shape before you build it.
