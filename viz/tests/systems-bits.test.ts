// BitArrayView data: `@viz bits:<cells>,<touched>,<verdict>[,<newCells>]` becomes a row or grid of
// cells, with the current item's cells marked and the bits it newly set told apart from old ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import type { BitsPanel } from "../src/model/systems/bits.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";
import type { Step } from "../src/tracer/types.ts";

const ROW_SRC = `
import { test } from "node:test";
export class Filter {
  // @viz bits:bits,touched,verdict,newBits hide:item
  bits = [0, 0, 0, 0, 0, 0, 0, 0];
  touched: number[] = [];
  newBits: number[] = [];
  verdict = "";
  add(item: string, at: number[]) {
    this.touched = at;
    this.newBits = [];
    for (const p of at) {
      if (this.bits[p] === 0) this.newBits.push(p);
      this.bits[p] = 1; // @mark set
    }
    this.verdict = "added " + item; // @mark added
  }
  check(item: string, at: number[]) {
    this.touched = at;
    this.newBits = [];
    this.verdict = "maybe present: " + item; // @mark checked
    return true;
  }
}
test("row: add then check", () => {
  const f = new Filter();
  f.add("a", [1, 3]);
  f.add("b", [3, 5]);
  f.check("c", [1, 6]);
});
`;

const GRID_SRC = `
import { test } from "node:test";
export class Sketch {
  // @viz bits:rows,touched,verdict
  rows = [[0, 0, 0], [0, 0, 0]];
  touched: [number, number][] = [];
  verdict = "";
  add(item: string) {
    this.touched = [[0, 2], [1, 0]];
    for (const [r, c] of this.touched) this.rows[r][c] += 4; // @mark bump
    this.verdict = "counted " + item; // @mark counted
    return this.verdict;
  }
}
test("grid: one add", () => { new Sketch().add("x"); });
`;

const runOf = (src: string) => {
  const trace = traceSource(src, SYSTEMS_LIMITS, { scenarios: true });
  assert.equal(trace.error, undefined);
  return { steps: trace.runs[0].steps, hints: parseHints(src) };
};
/** The steps at a marked line (each visit's first step), with the step before each. */
const at = (src: string, mark: string, nth = 1) => {
  const { steps, hints } = runOf(src);
  const line = hints.marks[mark];
  const hits = steps.flatMap((s, i) => (s.line === line && steps[i - 1]?.line !== line ? [i] : []));
  const i = hits[nth - 1];
  assert.ok(i !== undefined, `mark ${mark}#${nth} not reached`);
  return { step: steps[i], prev: steps[i - 1] as Step | undefined, hints, next: steps[i + 1] };
};
const bitsOf = (step: Step, prev: Step | undefined, hints: ReturnType<typeof parseHints>) => {
  const scene = buildScene(step, prev, hints);
  const panels = scene.panels.filter((p): p is BitsPanel => p.kind === "bits");
  assert.equal(panels.length, 1);
  return { panel: panels[0], scene };
};

test("bits: a single array becomes one row, with touched cells and the current item (even when hidden)", () => {
  const { step, prev, hints } = at(ROW_SRC, "added", 1);
  const { panel } = bitsOf(step, prev, hints);
  assert.equal(panel.name, "bits");
  assert.equal(panel.grid, false);
  assert.deepEqual(panel.rows.length, 1);
  assert.deepEqual(panel.rows[0].map((c) => c.text), ["0", "1", "0", "1", "0", "0", "0", "0"]);
  assert.deepEqual(panel.touched.map((t) => [t.r, t.c]), [[0, 1], [0, 3]]);
  assert.equal(panel.item, "a");
});

test("bits: a cell set in this step is flashed", () => {
  const { step, hints, next } = at(ROW_SRC, "set", 1);
  const { panel } = bitsOf(next, step, hints);
  assert.deepEqual(panel.rows[0].map((c) => c.changed), [false, true, false, false, false, false, false, false]);
});

test("bits: cells this item set are told apart from cells other items had already set", () => {
  const second = at(ROW_SRC, "added", 2);
  const added = bitsOf(second.step, second.prev, second.hints).panel;
  assert.deepEqual(added.touched, [{ r: 0, c: 3, how: "had" }, { r: 0, c: 5, how: "new" }]);
  const check = at(ROW_SRC, "checked", 1);
  const checked = bitsOf(check.next, check.step, check.hints).panel;
  assert.deepEqual(checked.touched, [{ r: 0, c: 1, how: "had" }, { r: 0, c: 6, how: "zero" }]);
  assert.equal(checked.verdict, "maybe present: c");
});

test("bits: the drawn arrays are not drawn again as plain arrays", () => {
  const { step, prev, hints } = at(ROW_SRC, "added", 2);
  const { scene } = bitsOf(step, prev, hints);
  assert.deepEqual(scene.panels.filter((p) => p.kind === "array").map((p) => p.name), []);
});

test("bits: an array of rows becomes a grid with row labels and [row, col] touches", () => {
  const { step, hints, next } = at(GRID_SRC, "counted");
  const { panel, scene } = bitsOf(next, step, hints);
  assert.equal(panel.grid, true);
  assert.deepEqual(panel.rows.map((r) => r.map((c) => c.text)), [["0", "0", "4"], ["4", "0", "0"]]);
  assert.deepEqual(panel.rowLabels, ["row 0", "row 1"]);
  assert.deepEqual(panel.touched, [{ r: 0, c: 2 }, { r: 1, c: 0 }]);
  assert.equal(panel.verdict, "counted x");
  assert.equal(scene.panels.filter((p) => p.kind === "array" || p.kind === "grid").length, 0);
});

test("bits: no panel when the cells variable is missing", () => {
  const { step, prev } = at(GRID_SRC, "counted");
  const scene = buildScene(step, prev, parseHints("// @viz bits:nope,touched"));
  assert.equal(scene.panels.filter((p) => p.kind === "bits").length, 0);
});
