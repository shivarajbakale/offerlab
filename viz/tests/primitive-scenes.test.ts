// What a lesson's play links actually show: the scene the app draws at a mark (the state just
// after the marked line ran) must agree with what the lesson says about it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHints } from "../src/model/hints.ts";
import { buildScene, type Scene } from "../src/model/scene.ts";
import type { BitsPanel } from "../src/model/systems/bits.ts";
import { findRun, markStep } from "../src/sim/lesson.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const root = join(import.meta.dirname, "../../system-design/primitives");

/** The scene a play link `scenario@at=mark#nth` lands on, as App.tsx draws it. */
function sceneAt(file: string, scenario: string, mark: string, nth = 1): Scene {
  const src = readFileSync(join(root, file), "utf8");
  const hints = parseHints(src);
  const trace = traceSource(src, SYSTEMS_LIMITS, { scenarios: true });
  const run = trace.runs[findRun(trace.runs, scenario)];
  assert.ok(run, `no run ${scenario}`);
  const k = markStep(run.steps, hints.marks[mark], nth);
  assert.ok(k >= 0, `${mark}#${nth} not reached`);
  return buildScene(run.steps[k + 1] ?? run.steps[k], run.steps[k], hints);
}
const scalar = (scene: Scene, name: string) => scene.scalars.find((s) => s.name === name)?.text;
const bits = (scene: Scene) => scene.panels.find((p): p is BitsPanel => p.kind === "bits");

const RENDEZVOUS = "01-partitioning/002-rendezvous-hashing.ts";

test("002: at lead#11, B leads with its own score", () => {
  const scene = sceneAt(RENDEZVOUS, "pick", "lead", 11);
  assert.equal(scalar(scene, "best"), '"B"');
  assert.equal(scalar(scene, "bestScore"), "5339");
});

test("002: the score table names its columns (servers) and rows (keys)", () => {
  const scene = sceneAt(RENDEZVOUS, "pick", "done");
  const grid = scene.panels.find((p) => p.kind === "grid");
  assert.ok(grid && grid.kind === "grid");
  assert.deepEqual(grid.colLabels, ["A", "B", "C"]);
  assert.deepEqual(grid.rowLabels, ["user:1 → B", "user:2 → A", "user:3 → B", "user:4 → A", "user:5 → C", "user:6 → A"]);
});

test("005-007: the verdict is drawn once, in the bits panel, not again as a scalar", () => {
  for (const [file, scenario, mark] of [
    ["02-probabilistic/005-bloom-filter.ts", "false positive", "maybe"],
    ["02-probabilistic/006-count-min-sketch.ts", "collision", "estimate"],
    ["02-probabilistic/007-hyperloglog.ts", "register", "keep"],
  ]) {
    const scene = sceneAt(file, scenario, mark);
    assert.ok(bits(scene)?.verdict, `${file}: bits verdict`);
    assert.equal(scalar(scene, "verdict"), undefined, `${file}: verdict scalar`);
  }
});

test("006: while zebra is being added, the verdict talks about zebra, not the item before it", () => {
  const verdict = bits(sceneAt("02-probabilistic/006-count-min-sketch.ts", "collision", "bump", 7))?.verdict ?? "";
  assert.match(verdict, /zebra/);
  assert.doesNotMatch(verdict, /cow/);
});
