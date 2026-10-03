import { test } from "node:test";
import assert from "node:assert/strict";
import type { SimRun } from "../../system-design/kernel/types.ts";
import { REQUIRED_SECTIONS, findRun, lessonProblems, markLocate, markStep, parseInline, parseLesson, simLocate, stepAt } from "../src/sim/lesson.ts";
import { parseHints } from "../src/model/hints.ts";

const run = (label: string, times: number[]): SimRun => ({
  label,
  passed: true,
  truncated: false,
  steps: times.map((t) => ({ t, kind: "timer", nodes: {}, inFlight: [], partitions: [] })),
});
const RUNS = [
  run("calm start: one leader", [0, 5, 9]),
  run("split vote: no leader in term 1", [0, 5, 7]),
  run("broken: no votes — two leaders", [0, 5]),
];

const GOOD = `# Demo

## Words we'll use

- **Node** — a server.
- **Leader** — the one in charge.
- **Term** — a numbered period.

## The world we're in

Machines crash.

## The goal

One leader.

## The naive attempt

Just take over. [▶ watch it break](play:broken: no votes@t=5)

## Building it up

**1. Votes.** Ask first.
[▶ calm](play:calm start@t=5)

### A sub-heading

1. first
2. second

## Why it works now

Majorities overlap.

## What it costs

- Needs a majority.

## Staff notes

Use pre-vote.

## Check yourself

- **Q:** Two candidates tie. What happens?
  A: Nobody wins; timeouts retry. [▶ See it](play:split vote@t=7)
- **Q:** Why votes?
  A: Overlap. [▶ See it](play:calm start)
- **Q:** What if nobody votes?
  A: Two leaders. [▶ See it](play:broken: no votes)

## Deep dive

\`\`\`
raw code
\`\`\`
`;

test("parses inline bold, italic, code, play links and normal links", () => {
  assert.deepEqual(parseInline("a **b** *c* `d` [▶ e](play:split vote@t=7) [f](https://x.y)"), [
    { kind: "text", text: "a " },
    { kind: "bold", text: "b" },
    { kind: "text", text: " " },
    { kind: "italic", text: "c" },
    { kind: "text", text: " " },
    { kind: "code", text: "d" },
    { kind: "text", text: " " },
    { kind: "play", text: "▶ e", scenario: "split vote", t: 7 },
    { kind: "text", text: " " },
    { kind: "link", text: "f", href: "https://x.y" },
  ]);
  assert.deepEqual(parseInline("[x](play:calm start)"), [{ kind: "play", text: "x", scenario: "calm start" }]);
});

test("parses sections, lists, sub-headings, Q/A and code blocks", () => {
  const lesson = parseLesson(GOOD);
  assert.equal(lesson.title, "Demo");
  assert.deepEqual(lesson.sections.map((s) => s.title), [...REQUIRED_SECTIONS, "Deep dive"]);
  const build = lesson.sections.find((s) => s.title === "Building it up")!;
  assert.deepEqual(build.blocks.map((b) => b.kind), ["para", "heading", "list"]);
  const list = build.blocks[2];
  assert.ok(list.kind === "list" && list.ordered && list.items.length === 2);
  const check = lesson.sections.find((s) => s.title === "Check yourself")!;
  assert.deepEqual(check.blocks.map((b) => b.kind), ["qa", "qa", "qa"]);
  const qa = check.blocks[0];
  assert.ok(qa.kind === "qa");
  assert.equal(qa.question[0].kind === "text" && qa.question[0].text, "Two candidates tie. What happens?");
  assert.ok(qa.answer.some((x) => x.kind === "play" && x.scenario === "split vote" && x.t === 7));
  const deep = lesson.sections.at(-1)!;
  assert.deepEqual(deep.blocks, [{ kind: "code", text: "raw code" }]);
});

test("findRun matches one label prefix ignoring case; stepAt finds the first step at or after t", () => {
  assert.equal(findRun(RUNS, "Split Vote"), 1);
  assert.equal(findRun(RUNS, "broken: no votes"), 2);
  assert.equal(findRun(RUNS, "nothing"), -1);
  assert.equal(findRun([...RUNS, run("calm start: again", [0])], "calm start"), -1);
  assert.equal(stepAt(RUNS[0], 6), 2);
  assert.equal(stepAt(RUNS[0]), 0);
  assert.equal(stepAt(RUNS[0], 99), -1);
});

test("a complete lesson has no problems", () => {
  assert.deepEqual(lessonProblems(parseLesson(GOOD), RUNS), []);
});

test("reports missing, misordered and unknown sections", () => {
  const swapped = GOOD.replace("## The goal", "## TMP").replace("## The world we're in", "## The goal").replace("## TMP", "## The world we're in");
  assert.ok(lessonProblems(parseLesson(swapped), RUNS).some((p) => p.startsWith("sections must be, in order")));
  const extra = GOOD.replace("## Staff notes", "## Extras\n\nx\n\n## Staff notes");
  assert.ok(lessonProblems(parseLesson(extra), RUNS).includes('unknown section "Extras"'));
  const missing = GOOD.replace("## What it costs\n\n- Needs a majority.\n", "");
  assert.ok(lessonProblems(parseLesson(missing), RUNS).some((p) => p.startsWith("sections must be, in order")));
});

test("flags play links that match no scenario, several, or a missing time", () => {
  const bad = GOOD.replace("play:calm start@t=5", "play:nothing@t=5").replace("play:split vote@t=7", "play:split vote@t=99");
  const problems = lessonProblems(parseLesson(bad), RUNS);
  assert.ok(problems.includes('play link "nothing" matches no single scenario'));
  assert.ok(problems.includes('play link "split vote@t=99": no step at or after t=99'));
});

test("requires a glossary of **terms**, a broken naive attempt, and 3–5 answered questions with play links", () => {
  const noGlossary = GOOD.replace("- **Node** — a server.", "- Node — a server.");
  assert.ok(lessonProblems(parseLesson(noGlossary), RUNS).some((p) => p.startsWith("Words we'll use")));
  const notBroken = GOOD.replace("play:broken: no votes@t=5", "play:calm start@t=5");
  assert.ok(lessonProblems(parseLesson(notBroken), RUNS).some((p) => p.startsWith("The naive attempt")));
  const twoQs = GOOD.replace(/- \*\*Q:\*\* What if nobody votes\?\n {2}A: .*\n/, "");
  assert.ok(lessonProblems(parseLesson(twoQs), RUNS).some((p) => p.startsWith("Check yourself: needs 3 to 5")));
  const noLink = GOOD.replace("A: Overlap. [▶ See it](play:calm start)", "A: Overlap.");
  assert.ok(lessonProblems(parseLesson(noLink), RUNS).some((p) => p.startsWith("Check yourself: every answer")));
});

test("names missing sections; rejects empty @t=, text before the first section, and Deep dive not last", () => {
  const missing = GOOD.replace("## The goal\n\nOne leader.\n", "");
  assert.ok(lessonProblems(parseLesson(missing), RUNS).includes('missing section "The goal"'));
  const emptyT = GOOD.replace("play:calm start@t=5", "play:calm start@t=");
  assert.ok(lessonProblems(parseLesson(emptyT), RUNS).some((p) => /calm start.*@t= is not a number/.test(p)));
  const preamble = GOOD.replace("# Demo\n", "# Demo\n\nStray text.\n");
  assert.ok(lessonProblems(parseLesson(preamble), RUNS).includes("text before the first ## section"));
  const deepFirst = GOOD.replace("## Deep dive\n", "").replace("## Words we'll use", "## Deep dive\n\nx\n\n## Words we'll use");
  assert.ok(lessonProblems(parseLesson(deepFirst), RUNS).includes('"Deep dive" must be the last section'));
});

test("parseInline reads @at= marks with an optional #n", () => {
  assert.deepEqual(parseInline("[x](play:add a server@at=moved#3)"), [
    { kind: "play", text: "x", scenario: "add a server", at: "moved", nth: 3 },
  ]);
  assert.deepEqual(parseInline("[x](play:add@at=moved)"), [{ kind: "play", text: "x", scenario: "add", at: "moved" }]);
  assert.deepEqual(parseInline("[x](play:add@at=)"), [{ kind: "play", text: "x", scenario: "add", at: "" }]);
});

test("parseHints collects // @mark names", () => {
  const hints = parseHints("let a = 1;\nlet b = 2; // @mark second-line\n");
  assert.deepEqual(hints.marks, { "second-line": 2 });
});

test("mark locator: nth visit of a line, counting entries not repeats", () => {
  const steps = [5, 6, 6, 7, 6, 5, 6].map((line) => ({ line }));
  assert.equal(markStep(steps, 6), 1);
  assert.equal(markStep(steps, 6, 2), 4);
  assert.equal(markStep(steps, 6, 3), 6);
  assert.equal(markStep(steps, 6, 4), -1);
  const locate = markLocate({ hit: 6 });
  const run = { label: "r", steps };
  assert.equal(locate(run, { kind: "play", text: "", scenario: "r", at: "hit", nth: 2 }), 4);
  assert.match(String(locate(run, { kind: "play", text: "", scenario: "r", at: "nope" })), /no @mark "nope"/);
  assert.match(String(locate(run, { kind: "play", text: "", scenario: "r", at: "hit", nth: 9 })), /reaches .* 3 times/);
  assert.match(String(locate(run, { kind: "play", text: "", scenario: "r", t: 3 })), /@t= is for kernel/);
  assert.match(String(simLocate(RUNS[0], { kind: "play", text: "", scenario: "x", at: "hit" })), /@at= is for tracer/);
  assert.match(String(simLocate(RUNS[0], { kind: "play", text: "", scenario: "x", t: Number("abc") })), /not a number/);
});
