// The probabilistic blocks (Bloom filter, count-min sketch, HyperLogLog) explain themselves: at
// each moment a lesson links to, the caption says in plain words what just happened, and the bits
// picture shows the real-world question, the item's cells, the answer and what a wrong answer costs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captionAt } from "../src/model/caption.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import type { BitsPanel } from "../src/model/systems/bits.ts";
import type { Caption } from "../src/model/systems/types.ts";
import { findRun, markStep } from "../src/sim/lesson.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const root = join(import.meta.dirname, "../../system-design/primitives/02-probabilistic");
const BLOOM = "005-bloom-filter";
const CMS = "006-count-min-sketch";
const HLL = "007-hyperloglog";

const traces = new Map<string, { hints: ReturnType<typeof parseHints>; trace: ReturnType<typeof traceSource>; lesson: string }>();
function load(file: string) {
  if (!traces.has(file)) {
    const src = readFileSync(join(root, `${file}.ts`), "utf8");
    const lesson = readFileSync(join(root, `${file}.lesson.md`), "utf8");
    traces.set(file, { hints: parseHints(src), trace: traceSource(src, SYSTEMS_LIMITS, { scenarios: true }), lesson });
  }
  return traces.get(file)!;
}

/** The bits panel and the caption the app shows at a play link's moment. */
function at(file: string, scenario: string, mark: string, nth = 1): { panel: BitsPanel; caption: Caption } {
  const { hints, trace } = load(file);
  const run = trace.runs[findRun(trace.runs, scenario)];
  const k = markStep(run.steps, hints.marks[mark], nth);
  assert.ok(k >= 0, `${scenario}: ${mark}#${nth} not reached`);
  const scene = buildScene(run.steps[k + 1] ?? run.steps[k], run.steps[k], hints);
  const panel = scene.panels.find((p): p is BitsPanel => p.kind === "bits");
  assert.ok(panel, "no bits panel");
  const caption = captionAt(run.steps, k, hints);
  assert.ok(caption, "no caption");
  return { panel, caption };
}

test("probabilistic: every scenario is captioned, with nothing left unfilled", () => {
  for (const file of [BLOOM, CMS, HLL]) {
    const { hints, trace } = load(file);
    for (const run of trace.runs) {
      const texts = run.steps.map((_, k) => captionAt(run.steps, k, hints)?.text);
      const missing = texts.filter((t) => t === undefined).length;
      assert.ok(missing <= 12, `${file} / ${run.label}: ${missing} steps without a caption`);
      for (const t of texts) if (t) assert.doesNotMatch(t, /\{[^}]+\}|undefined|NaN|''/, `${file} / ${run.label}`);
    }
  }
});

test("probabilistic: lessons have the plain-words and when-to-use sections in place", () => {
  for (const file of [BLOOM, CMS, HLL]) {
    const { lesson } = load(file);
    const heads = [...lesson.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(heads[heads.indexOf("What it is") + 1], "In plain words", file);
    assert.equal(heads[heads.indexOf("Deep dive") - 1], "When to use which", file);
    assert.match(lesson, /In the picture on the right/);
  }
});

test("bloom filter: the picture names the filter, the question, the item's bits, the answer and the cost", () => {
  const { panel, caption } = at(BLOOM, "false positive", "maybe");
  assert.equal(panel.title, "Bloom filter");
  assert.equal(panel.unit, "bit");
  assert.equal(panel.ask, 'Has "quail" ever been stored?');
  assert.equal(panel.item, "quail");
  assert.deepEqual(panel.touched.map((t) => [t.c, t.how]), [[6, "had"], [31, "had"], [24, "had"]]);
  assert.match(panel.answer?.text ?? "", /Maybe/);
  assert.match(panel.cost ?? "", /wasted database lookup/);
  assert.equal(panel.costLabel, "If wrong");
  assert.match(caption.text, /All 3 bits of "quail" are 1/);
  assert.match(caption.text, /false positive/);
});

test("bloom filter: a 0 bit is a sure no, captioned and answered as good", () => {
  const { panel, caption } = at(BLOOM, "absent", "absent");
  assert.equal(caption.tone, "good");
  assert.match(caption.text, /Bit 19 is 0/);
  assert.equal(panel.answer?.tone, "good");
  assert.match(panel.answer?.text ?? "", /definitely not/);
});

test("bloom filter: adds say how many bits were new and how full the filter is", () => {
  assert.match(at(BLOOM, "add and check", "added", 2).caption.text, /"banana" is stored: 2 bits switched from 0 to 1, and 1 was already 1/);
  assert.match(at(BLOOM, "sizing", "added").caption.text, /101 of 200 bits are 1/);
});

test("bloom filter: the broken delete is called out as a false negative, in the caption and the answer", () => {
  const removed = at(BLOOM, "broken: delete", "removed");
  assert.equal(removed.caption.tone, "bad");
  assert.match(removed.caption.text, /bits 22, 31, 8 were set back to 0/);
  const { panel, caption } = at(BLOOM, "broken: delete", "absent");
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /false negative/);
  assert.equal(panel.answer?.tone, "bad");
  assert.match(panel.cost ?? "", /lost data/);
});

test("bloom filter: one hash is captioned as the problem", () => {
  const { caption } = at(BLOOM, "broken: one hash", "maybe");
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /With one hash/);
});

test("count-min sketch: an estimate reads the item's counter in every row and keeps the smallest", () => {
  const { panel, caption } = at(CMS, "collision", "estimate", 5);
  assert.equal(panel.title, "Count-min sketch");
  assert.equal(panel.unit, "counter");
  assert.equal(panel.item, "zebra");
  assert.deepEqual(panel.touched.map((t) => [t.r, t.c]), [[0, 2], [1, 3]]);
  assert.match(panel.ask ?? "", /How many times has "zebra" been seen/);
  assert.match(panel.answer?.text ?? "", /About 4/);
  assert.match(panel.cost ?? "", /only be too high/);
  assert.match(caption.text, /hold 4, 26/);
  assert.match(caption.text, /The smallest, 4/);
});

test("count-min sketch: with one row, a light item becomes a false heavy hitter, captioned as bad", () => {
  const { panel, caption } = at(CMS, "broken: one row", "top", 4);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /"eel" was just added once, but its only counter reads 51/);
  assert.match(panel.ask ?? "", /top 3|3 most frequent/);
  assert.match(panel.answer?.text ?? "", /Yes/);
  const four = at(CMS, "broken: one row", "top", 8);
  assert.notEqual(four.caption.tone, "bad");
  assert.match(four.caption.text, /apple 50, banana 30, cherry 20/);
});

test("hyperloglog: an add explains register, rank and how rare that rank is", () => {
  const { panel, caption } = at(HLL, "register", "keep");
  assert.equal(panel.title, "HyperLogLog");
  assert.equal(panel.unit, "register");
  assert.deepEqual(panel.touched.map((t) => t.c), [4]);
  assert.match(caption.text, /register 4/);
  assert.match(caption.text, /rank 3, which happens about once in 8 items/);
  assert.match(at(HLL, "duplicates", "skip").caption.text, /nothing changes/);
});

test("hyperloglog: the estimate answers the question and says how far off it can be", () => {
  const { panel, caption } = at(HLL, "estimate", "harmonic");
  assert.equal(panel.ask, "How many different items so far?");
  assert.match(panel.answer?.text ?? "", /^About \d+\.$/);
  assert.match(panel.cost ?? "", /13% with 64 registers/);
  assert.equal(panel.costLabel, "How far off");
  assert.match(caption.text, /harmonic mean/);
  assert.match(at(HLL, "register", "linear").caption.text, /14 of 16 registers are still 0/);
  const merged = at(HLL, "merge", "merge");
  assert.equal(merged.caption.tone, "good");
  assert.match(merged.caption.text, /still counts once/);
});

test("hyperloglog: the broken estimators are captioned as bad, with the reason", () => {
  const one = at(HLL, "broken: one register", "one");
  assert.equal(one.caption.tone, "bad");
  assert.match(one.caption.text, /One register holding/);
  const mean = at(HLL, "broken: arithmetic", "mean", 2);
  assert.equal(mean.caption.tone, "bad");
  assert.match(mean.caption.text, /97% of the sum: one lucky hash decides the whole answer/);
  assert.match(mean.caption.text, /harmonic mean of these same registers says about 1089/);
});
