import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { traceSource } from "../src/tracer/trace.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import { buildStory, searchSpace, windowHistory } from "../src/model/story.ts";

const load = (path: string) => readFileSync(join(import.meta.dirname, "../../neetcode-150", path), "utf8");

function story(path: string, run = 0) {
  const src = load(path);
  const hints = parseHints(src);
  const steps = traceSource(src).runs[run].steps;
  return { hints, steps, story: buildStory(steps, hints, src.split("\n")) };
}

const LONGEST = "03-sliding-window/016-longest-substring-without-repeating-characters.ts";

test("hints: arc, best, unique, rule, ask and broken are read", () => {
  const h = parseHints("// @viz arc:r->prev best:best unique\n// @rule no repeats\nif (x) l = 1; // @ask l // @say hi\nwhile (y) { // @broken\n");
  assert.deepEqual(h.arcs, [["r", "prev"]]);
  assert.equal(h.best, "best");
  assert.equal(h.unique, true);
  assert.equal(h.rule, "no repeats");
  assert.deepEqual(h.ask, { 3: "l" });
  assert.equal(h.say[3], "hi");
  assert.deepEqual(h.broken, [4]);
  assert.deepEqual(h.errors, []);
});

test("longest substring: the repeat breaks the rule, the arc points back, l is asked", () => {
  const { story: s, steps, hints } = story(LONGEST);
  assert.ok(s);
  assert.equal(s.win?.mode, "slide");
  assert.equal(s.win?.array, "s");
  // "abcabcbb": the second 'a' joins the window and breaks the rule.
  assert.ok(s.broken.some(Boolean));
  assert.ok(s.marks.some((m) => m.kind === "broken"));
  assert.ok(s.marks.some((m) => m.kind === "best"));
  // l only moves right, and each jump is a question whose answer is just past the old copy.
  assert.ok(s.asks.size >= 4);
  for (const [k, a] of s.asks) {
    assert.equal(a.name, "l");
    assert.equal(a.kind, "cell");
    const prev = steps[k].stack.at(-1)!.vars.find(([n]) => n === "prev")![1];
    assert.equal(a.answer, (prev as { v: number }).v + 1);
  }
  assert.ok(!windowHistory(s.win!, steps.length - 1).some((h) => h.back));
  // The best window ends as "abc".
  assert.deepEqual(s.win!.best.at(-1), { l: 0, r: 2, text: "3" });
  // Some scene draws a red arc to a copy inside the window, and a grey one to a copy outside.
  const arcs = steps.flatMap((st, k) =>
    buildScene(steps[k + 1] ?? st, st, hints).panels.flatMap((p) => (p.kind === "array" && p.arcs ? p.arcs : [])),
  );
  assert.ok(arcs.some((a) => a.inside));
});

test("longest substring 'abba': the old 'a' is outside the window, so l is not moved", () => {
  const src = load(LONGEST);
  const runs = traceSource(src).runs;
  const r = runs.findIndex((x) => x.label.includes('"abba"'));
  assert.ok(r >= 0);
  const { story: s, hints, steps } = story(LONGEST, r);
  assert.ok(s);
  const arcs = steps.flatMap((st, k) =>
    buildScene(steps[k + 1] ?? st, st, hints).panels.flatMap((p) => (p.kind === "array" && p.arcs ? p.arcs : [])),
  );
  assert.ok(arcs.some((a) => !a.inside), "an arc to the old 'a' outside the window");
});

test("search space: at the end every pair is looked at or ruled out, far fewer looked at than n²", () => {
  const { story: s, steps } = story(LONGEST);
  const sp = searchSpace(s!.win!, steps.length - 1);
  assert.equal(sp.checked + sp.skipped, sp.total);
  assert.ok(sp.checked < sp.total / 2);
});

test("two pointers: container and two sum II converge from both ends and ask which side moves", () => {
  for (const path of ["02-two-pointers/013-container-with-most-water.ts", "02-two-pointers/011-two-sum-ii-input-array-is-sorted.ts"]) {
    const { story: s, steps } = story(path);
    assert.ok(s, path);
    assert.equal(s.win?.mode, "converge", path);
    assert.equal(s.win?.restarts, false, path);
    assert.ok(s.asks.size > 0, path);
    const sp = searchSpace(s.win!, steps.length - 1);
    assert.equal(sp.checked + sp.skipped, sp.total, path);
  }
});

test("3sum: each fixed number restarts l..r, so the search-space views stay off", () => {
  const { story: s } = story("02-two-pointers/012-3sum.ts");
  assert.ok(s);
  assert.equal(s.win?.restarts, true);
});

test("character replacement: the @broken while condition breaks the rule", () => {
  // "AABABBA" with k = 1: the window outgrows one change and has to shrink.
  const { story: s } = story("03-sliding-window/017-longest-repeating-character-replacement.ts", 1);
  assert.ok(s);
  assert.ok(s.broken.some(Boolean));
  assert.ok(s.marks.some((m) => m.kind === "shrink"));
});
