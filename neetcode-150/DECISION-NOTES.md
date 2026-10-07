# Writing decision notes

The visualizer shows an explain card above the drawing on every step. A `@why` note says what a line does. Decision notes say why the algorithm does it, with the step's live values filled in. They are what turn a trace into intuition.

Reference files to copy the style from:

- Hashing: `01-arrays-hashing/003-two-sum.ts`, `005-top-k-frequent-elements.ts`
- Trees and recursion: `07-trees/048-diameter-of-binary-tree.ts`
- DP: `13-1d-dynamic-programming/101-house-robber.ts`
- Linked lists: `06-linked-list/035-reverse-linked-list.ts`
- Backtracking: `10-backtracking/071-subsets.ts`

## The tags

Each note sits on its own comment line above the code line it explains, next to that line's `@why`. The code panel hides these lines. Consecutive lines of the same tag join into one note.

| Tag | Put it above | Shown |
|---|---|---|
| `@goal` | a function | On its call step, and on every step of a nested call: the question this call answers. Read with the arguments it was called with. |
| `@phase` | the first line of a part of the code | As a heading on every step from here down, until the next `@phase`. |
| `@say` | any line | On that step: what this step means. |
| `@yes` / `@no` | an `if`, `while` or `for (;;)` line | When the condition came out true / false: why that outcome leads where it does. |
| `@then` | any line | Once the line has finished, past any calls it made: what is known now. |
| `@returns` | a line with a `return` | On the return step: what the value means for the caller. |

Inline `// @say` at the end of a code line still works, but the block form is preferred. Keep `@ask`, `@moment`, `@broken` and `@mark` inline, where they are.

## Templates

`{expr}` is any JavaScript expression over the variables in scope at that step, including closure variables and the function's arguments. Examples are `{nums[i]}`, `{JSON.stringify(path)}` and `{node ? node.val : "an empty spot"}`.

- Notes are filled with the state before the line runs. The exceptions are `@then`, which reads the state after it, and the head of a `for…of` loop, which reads the item it just took.
- The expression cannot contain `{` or `}`. So no template literals, object literals or block arrow bodies. Use `+` and ternaries instead.
- Write strings in quotes as `"{s}"`. An empty string then reads as `""`.
- A bare expression that comes out `""` adds nothing, so `{more ? ", then " + x : ""}` is fine.
- If any expression in a note can't be evaluated at that step, the card falls back to the line's `@why`. An example is a loop variable before its first value. Check the report output for the fallbacks.

## What to write

1. **`@goal` on every exported function and every recursive helper.** Phrase it as the question this call answers, filled with its arguments. Example: "how tall is the subtree under {node ? node.val : "this empty spot"}?" For backtracking, include the choices made so far, such as `{JSON.stringify(path)}`.
2. **Two to four `@phase` headings.** Use them for setup, the main loop or recursion, and the answer. Give each one a short name for what that part achieves.
3. **On the setup line, a `@say` that names the obvious approach and why it loses.** Examples: "Checking every pair is n² work. Instead…", or "Sorting costs n log n, but…". This is the most important note in the file.
4. **`@yes` and `@no` on every branch and loop condition inside the solution.** Say why that outcome matters, not just that it happened. Weak: "j is undefined." Strong: "7 hasn't appeared yet. That does not rule 2 out: its partner may still be ahead…"
5. **A `@say` on lines that make a choice or move a pointer.** Use the live numbers, and show arithmetic where it helps: "Rob it: 3 plus the best that avoids the neighbour, 1, = 4."
6. **`@then` after a step that establishes something:** the invariant now holds over a larger range, a recursive call has come back with a value, and so on.
7. **`@returns` on every return in the solution,** including base cases. A base case explains why that value is correct for the smallest input.

Keep each note to one to three sentences, in plain words. Use "you" or no subject, and no filler. Explain from first principles: the reason a step is valid, not a restatement of the code.

## Checking a file

```sh
cd viz
node scripts/explain-report.ts neetcode-150/<dir>/<file>.ts          # every step of example 1
node scripts/explain-report.ts neetcode-150/<dir>/<file>.ts 1 --key  # example 2, explained steps only
node --test tests/explain-coverage.test.ts                            # every file that has a @goal
node --test ../neetcode-150/<dir>/<file>.ts                           # the solution's own tests
```

The coverage test checks four things:

- there are no hint parse errors;
- every exported or recursive function has a `@goal`;
- every condition inside the solution has a `@yes` or `@no`;
- every example's cards are filled, with no raw `{expr}` and no `''`.

It also requires at least 60% of steps to carry a written reason in the first two examples.

Read the report output for the first example. Each card should read like a tutor talking: correct for the values shown, and saying something the code alone does not.

## Known limits

- **What a template can read.** It sees the traced variables only. It can't see module-level constants or helper functions (`INT_MAX`, `isAlphaNum`), and it can't run methods or getters on traced objects (`heap.size`, `heap.peek()`), because those come back as plain data. Read the fields instead, as in `heap.data.length` and `heap.data[0]`, or write the number into the text.
- **Conditions are read from the trace.** Which way a decision went comes from where the trace went next, so getters and side effects don't change it. A condition that has side effects, like `stack.pop() !== open`, is never re-run, so its card shows no value chips.
- **A `for…of` block loop is recorded at its head only on the first item.** Put per-item text on the first line of the body. One-line `for…of` loops step on every item.
- **`do { } while (c)` records no step for its condition,** so its `@yes`/`@no` never show. Explain the outcome with a `@then` on a line inside the body.
- **Goals are looked up by function name.** Two inner helpers with the same name in one file (two `dfs`) share one `@goal`, so word it to fit both.
- **A `@say` on an `if`, `while` or `for` line is replaced by its `@yes`/`@no`.** Put setup reasoning on the line before.
- **A note must sit directly above its code line.** A blank line in between attaches the note to the blank line instead, and it never shows.
