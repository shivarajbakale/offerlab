# Offerlab visualizer

Watch the NeetCode 150 solutions in `../neetcode-150` run themselves, one step at a time.
Pointers slide, windows grow and shrink, trees and lists re-link, DP tables fill in, and the
recursion tree grows, all next to the line of code that is running.

```bash
npm install          # once, inside viz/
npm run dev          # http://localhost:5173  (or `npm run viz` from the repo root)
npm test             # tracer + scene unit tests
npm run check        # trace all 150 files and report problems
```

## Using it

- Pick a problem in the sidebar. Its first test case starts playing automatically.
- The **Example** dropdown lists every call in the file's tests (✓ / ✗ = assert result).
- Keys: `space` play/pause · `←` `→` step · `Home` `End` · `[` `]` speed · `i` code/intuition · `e` explain lines.
- The highlighted line is the line that just ran. The visual shows the state *after* it.
- The bar under the code explains the step:
  - **check**: an `if` / `while` / `for` condition and whether it was true
  - **update**: what changed (`l: 0 → 1`, `dp[3] = 2`, `seen.add(c)`)
  - **call** / **return**: function calls and their results
  - **now**: a hand-written hint for this step (see below)
  - **why**: the line's plain-English note (see "Line notes")

## Line notes

Every solution line worth explaining has a short plain-English note on *why* it is there.

- A dot next to a line number means the line has a note. Hover the line to see it, or click the
  line (or focus the dot and press Enter) to pin it open; `Esc` unpins.
- **Explain lines** (`e`) shows every note as a faded line under its code, to read the solution
  top to bottom like an annotated walkthrough.
- While stepping, the narration bar shows the note for the line that just ran.

## Intuition tab

Next to **Code**, the **Intuition** tab answers "why does this work, and where else does it work?":

- **Key insight**: the observation that makes this problem's solution work.
- **Pattern**: the reusable idea behind it (sliding window, topological sort, knapsack, ...):
  the intuition, the wording that should trigger it, and a code template.
- **Same trick solves**: every NeetCode problem in this app with the same pattern (click to
  visualize it) plus more practice problems on LeetCode, 10-20 in total.
- **Real world**: where this problem's idea, and the pattern, show up in real software.

Per-problem notes live in each solution's header comment:

```ts
 * Pattern: sliding-window
 * Key insight: When a repeated character enters the window, ...
 *   (continuation lines are indented two spaces)
 * Real world: A network monitor finding ...
```

The pattern catalog is in `src/patterns/` (one file per topic group). `npm test` checks that
every problem has the three fields and that every `Pattern:` id exists in the catalog.

## How it works

```
problem.ts ──► Babel instrument ──► run in a Web Worker ──► Trace (steps)
                (step/enter/ret        (node:test and         │
                 calls injected)        assert shimmed)        ▼
                                                    buildScene(step) ──► React views
```

- `src/tracer/`: the Babel plugin (`instrument.ts`), the runtime recorder, value serializer and
  shims. Only exported functions / classes and the code they call are traced. Test helpers
  (`buildTree`, `toArray`, …) and internal helper classes (heaps, trie nodes) run silently.
- `src/model/`: turns a step into panels (`scene.ts`), narration (`narrate.ts`) and the recursion
  tree (`callTree.ts`).
- `src/components/`: the React UI. One view per panel kind is in `components/views/`.

Views are chosen from the shape of each value:

| Value | View |
| --- | --- |
| string param, `T[]` | cells with pointer arrows (`i j l r lo hi mid left right slow fast …`) and an auto window for `l..r`-style pairs |
| `T[][]` | grid with an `(r, c)` / `(i, j)` cursor |
| object with `left`/`right` | binary tree |
| object with `next` | linked list (cycles detected) |
| object with `children` | trie |
| object with `neighbors`, or `adj` / `graph` / `pre` adjacency | graph (visited / queued colouring) |
| `Map` / `Set` / plain object | tables and chips |
| array named `*heap*` or a `*Heap` class | heap drawn as a tree |

## Hints (optional comments in a solution file)

```ts
// @viz window:l..r pointers:buy values:lo,hi hide:tmp array:s grid:dp graph:adj heap:minHeap
export function solve(s: string) {
  while (seen.has(s[r])) { // @say '{s[r]}' is already in the window, so shrink from the left
```

- `@why` (its own line, directly above a code line) is that line's note. Consecutive `@why`
  lines are joined. `` `name` `` renders as inline code. `tests/why.test.ts` checks coverage.
- `@viz` (its own line, anywhere) overrides how the file is drawn.
- `@say` (a trailing comment) replaces the auto narration for that line. `{expr}` is evaluated
  against the variables in scope, and the condition result is still shown beside it.
