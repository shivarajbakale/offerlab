# Algorithm Visualizer: Design

Date: 2026-10-02
Status: Draft, awaiting review

## Goal

A local React app that plays the NeetCode 150 solutions in `neetcode-150/` as slow, self-running
animations. Pointers move, windows slide, trees light up and DP tables fill in, next to the
highlighted line of code that is executing. The purpose is building interview intuition by
watching, not debugging by driving a debugger.

## Decisions already made

- A React web app inside this repo, not an editor plugin.
- It auto-plays, with pause, step, scrub and speed control.
- Approach C (hybrid): the trace is recorded automatically from the real `.ts` file. Optional
  comment hints improve how variables are drawn and add a "why" narration line.
- Inputs come from the test cases already in each file, so no extra setup is needed per problem.

## User experience

```
┌─────────────────────────────────────────────────────────────────────┐
│ [problem picker ▾]                               [example ▾]        │
├──────────────────────────────┬──────────────────────────────────────┤
│ CODE (active line ▶)         │ VISUAL (arrays, trees, grids, ...)   │
│                              │ CALL STACK (when recursion)          │
├──────────────────────────────┴──────────────────────────────────────┤
│ 💬 narration for this step                                          │
├─────────────────────────────────────────────────────────────────────┤
│ ⏮ ◀ ⏯ ▶ ⏭   timeline scrubber   step n / N   speed 0.5x 1x 2x 4x     │
└─────────────────────────────────────────────────────────────────────┘
```

- `npm run viz` starts the app at `http://localhost:5173`.
- The sidebar lists all 18 categories and 150 problems.
- Picking a problem selects its first example and starts playing at 1 step per second.
- Keyboard: space plays and pauses, the left and right arrows step, `[` and `]` change speed.
- Values that changed since the previous step are highlighted. Pointers and nodes animate
  between positions rather than jumping.

## Architecture

```
neetcode-150/**/*.ts  (raw source, via import.meta.glob ?raw)
        │
        ▼
┌──────────────── Web Worker ────────────────┐
│ 1. instrument  (Babel: TS strip + inject)  │
│ 2. execute     (shims for node:test/assert)│
│ 3. record      (Trace = Run[] of Step[])   │
└────────────────────────────────────────────┘
        │ postMessage(Trace)
        ▼
┌──────────────── React UI ──────────────────┐
│ player   (index, playing, speed)           │
│ classify (variable → view kind)            │
│ views    (ArrayView, TreeView, GridView…)  │
└────────────────────────────────────────────┘
```

Everything runs in the browser. Running in a Web Worker means a runaway loop can be stopped
by terminating the worker after a timeout, and it leaves room to add live editing later.

### Units

| Unit | Location | Responsibility |
| --- | --- | --- |
| `instrument` | `viz/src/tracer/instrument.ts` | Babel plugin that strips TS types and injects trace calls |
| `runtime` | `viz/src/tracer/runtime.ts` | `__step`, `__enter`, `__exit`; call stack; step cap |
| `serialize` | `viz/src/tracer/serialize.ts` | Turns live values into a heap snapshot with stable object ids |
| `shims` | `viz/src/tracer/shims.ts` | Replacements for `node:test` and `node:assert/strict` |
| `worker` | `viz/src/tracer/worker.ts` | Wires the above together; source in, `Trace` out |
| `hints` | `viz/src/tracer/hints.ts` | Parses `@viz` and `@say` comments |
| `classify` | `viz/src/viz/classify.ts` | Picks a view for each variable (hints first, then heuristics) |
| `views/*` | `viz/src/viz/views/` | One React component per view kind |
| `player` | `viz/src/player/` | Playback state, controls, timeline, keyboard |
| `app` | `viz/src/App.tsx` | Problem picker, layout |

The tracer has no React dependency and can be tested in Node.

## Tracer

### Instrumentation (Babel)

`@babel/standalone` with `preset-typescript`, plus a custom plugin:

- **Statements:** before every statement inside a traced function, insert
  `__step(line, () => ({ ...bindings in scope }))`. The bindings come from Babel's scope API:
  parameters and `let`/`const`/`var` that are declared at that point. Functions and classes are
  excluded.
- **Loop heads:** the `for` and `while` tests are wrapped so that each iteration produces a step
  on the loop line, so `r++` and `lo <= hi` checks are visible.
- **Calls:** each traced function body is wrapped in `__enter(name, args)` / `__exit(returnValue)`
  using try/finally. This drives the call stack view and the recursion tree.
- **Imports:** `node:test` and `node:assert/strict` are rewritten to the shims.

**Traced functions:** only exported functions, methods of exported classes, and functions
nested inside them. File-local helpers such as `buildTree` and `toArray` run untraced. So do
data-only classes such as `TreeNode` and `ListNode` (classes whose only member is a constructor).

### Runs (examples)

The shimmed `test(name, fn)` runs `fn` directly. A **run** begins at each top-level call into a
traced function, meaning a call made when the traced call stack is empty.

- For a function problem, each `assert.equal(fn(...), expected)` becomes one run. The example
  dropdown labels it `minEatingSpeed([3,6,7,11], 8) → 4`.
- For a design problem (an exported class with methods, such as `LRUCache` or `Trie`), all calls
  on one instance are grouped into a single run. The labels list the operation sequence.

The `assert` shim records pass or fail per run and never throws. The UI shows ✓ or ✗ beside each
example.

### Step and snapshot format

```ts
type Trace = { runs: Run[]; error?: string };
type Run   = { label: string; passed: boolean | null; steps: Step[]; truncated: boolean };
type Step  = {
  line: number;
  event: "line" | "call" | "return";
  stack: Frame[];                 // innermost last
  heap: Record<HeapId, HeapObj>;  // only objects reachable from the stack
  note?: string;                  // from @say on this line
};
type Frame   = { fn: string; vars: Record<string, Value>; returned?: Value };
type Value   = { prim: number | string | boolean | null | undefined } | { ref: HeapId };
type HeapObj =
  | { kind: "array"; items: Value[] }
  | { kind: "map"; entries: [Value, Value][] }
  | { kind: "set"; items: Value[] }
  | { kind: "object"; className: string; fields: Record<string, Value> };
```

Object identity is tracked with a `WeakMap<object, HeapId>` for the whole execution. The same
`TreeNode` keeps the same id across steps, which is what lets animations move nodes smoothly.

### Limits

- 5,000 steps per run. Past that, the run is marked `truncated` and the UI shows a notice.
- A 3-second worker timeout. If it fires, the worker is terminated and the error is shown.
- 2,000 heap objects per snapshot. Past that, the rest is elided.
- If the file throws during execution, the steps recorded so far are kept and the error is shown
  on the last step.

## Visualization

### Classification (per variable, per step)

Hints win. Otherwise these heuristics apply, in order:

| Shape of value | View |
| --- | --- |
| object with `left`/`right` fields | `TreeView` |
| object with a `next` field | `ListView` (chain, with pointer vars as labels) |
| object with a `children` map/object (trie) | `TrieView` |
| `number[][]` / `boolean[][]` / `string[][]` | `GridView` |
| array or string | `ArrayView` |
| `Map` / plain-object dictionary | `MapView` (key → value table) |
| `Set` | `SetView` (chips) |
| integer var named `i j k l r lo hi mid left right start end slow fast p q head tail` | pointer into the primary array |
| `Map<number, number[]>` / adjacency list named `adj`/`graph` | `GraphView` (only via hint or name) |
| anything else primitive | `ScalarView` chip |

**Pointer attachment:** pointer-like integers attach to the primary array, which is the largest
array or string in the innermost frame. A pointer whose value is out of bounds is drawn just
past the end, greyed out, so `r = n` is still visible. Nodes referenced by variables
(`slow`, `fast`, `curr`, `prev`) are labelled on the list and tree views.

### Views

- `ArrayView`: cells with indices, pointer arrows underneath, an optional window bracket
  (`window:l..r`), and changed cells flashed.
- `GridView`: a 2D table with the current cell outlined, plus the cells read by the current line
  when the hint `grid:dp` is used.
- `TreeView`: layout from `d3-hierarchy` `tree()`. The current node, visited nodes and labelled
  nodes are marked.
- `ListView`: a horizontal chain drawn with SVG arrows. When `next` changes, the arrow re-routes.
- `TrieView`: a tree of characters, with end-of-word nodes marked.
- `GraphView`: a static layout computed once per run with `d3-force`. Visited and queued nodes
  are coloured, and the queue or stack is drawn beneath.
- `MapView`, `SetView`, `ScalarView`: compact tables and chips.
- `CallStackView`: the frames listed innermost first, each with its args. A recursion tree
  appears when depth exceeds 1.

Motion uses `framer-motion`, keyed by heap id or index.

### Narration (💬 line)

1. If the executing line has an `// @say ...` comment, show that text. `{expr}` placeholders are
   filled in from the current variables.
2. Otherwise, generate a factual line from the diff: `r: 2 → 3`, `seen += 'c'`, `return 3`.

## Hints (the "C" in hybrid)

These are optional comments in the problem file. Every file keeps working without them.

```ts
// @viz array:s window:l..r set:seen
// @viz grid:dp tree:root graph:adj heap:minHeap
...
while (seen.has(s[r])) { // @say '{s[r]}' already in window → shrink from left
```

- `@viz` lines go anywhere in the file and apply to the whole file.
- `@say` is a trailing comment that applies to the line it sits on.
- The hints are added by hand to about 20 pattern-defining problems in milestone 6. The
  remaining problems rely on the heuristics.

## Tech stack

- Vite + React 19 + TypeScript in `viz/`, using the root `package.json` (new scripts:
  `viz`, `viz:build`, `viz:check`).
- `@babel/standalone` for instrumentation, `d3-hierarchy` and `d3-force` for layouts,
  `framer-motion` for animation, and `shiki` for code highlighting.
- No backend and no deploy.

## Testing

- **Tracer unit tests** (`node --test viz/src/tracer/*.test.ts`) check:
  - the step lines for Two Sum
  - that the call stack depth for Invert Tree reaches the tree height
  - that heap ids stay stable across steps
  - that a `while(true)` loop gets truncated
- **Classifier unit tests** check one fixture per view kind.
- **Smoke test** (`npm run viz:check`): runs the tracer on all 150 files in Node and reports, for
  each file, whether it produced at least one run with no error and no timeout. The target is
  150/150 with no errors. Truncated runs are allowed.
- **Manual pass per milestone:** watch the representative problems listed in each milestone.

## Milestones

1. **Tracer engine.** Instrument, execute, serialize and produce runs. Unit tests plus the smoke
   test passing on all 150 files.
2. **Player shell.** Problem picker, code panel with the active line, controls, timeline,
   keyboard, plus a generic variables panel (`ScalarView`/JSON) so every problem plays
   end-to-end.
3. **Linear views.** `ArrayView` (pointers, window), `MapView`, `SetView`, and auto narration.
   Check on: Two Sum, 3Sum, Longest Substring, Min Window, Binary Search, Koko, Daily
   Temperatures.
4. **Linked structures.** `ListView`, `TreeView`, `TrieView`, `CallStackView`. Check on: Reverse
   List, Linked List Cycle, Invert Tree, Validate BST, Implement Trie, Subsets.
5. **Grids, heaps and graphs.** `GridView`, heap-as-tree, `GraphView`. Check on: Climbing
   Stairs, Unique Paths, LCS, Kth Largest, Number of Islands, Course Schedule.
6. **Hints and narration.** `@viz` and `@say` parsing, plus annotating about 20
   pattern-defining problems.

## Out of scope (for now)

- Editing code in the app or pasting new code. The worker design keeps this possible later.
- Custom inputs beyond the file's own tests.
- Mobile layout, deploy, sharing.
- Expression-level stepping, such as stepping inside one long expression.

## Risks

- **Snapshot cost:** the whole reachable heap is serialized on every step. This is fine at the
  sizes of the test examples. If it gets slow, store diffs.
- **Heuristics can draw the wrong view.** Hints fix this per file, and the generic panel is
  always available as a fallback.
- **Destructuring swaps** such as `[a, b] = [b, a]` count as one statement, so they appear as one
  step. That is acceptable.
