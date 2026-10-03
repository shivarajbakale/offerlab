// LevelsView builder: stacked rows of blocks for a write-ahead log and an LSM tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHints } from "../src/model/hints.ts";
import { buildScene, type Panel } from "../src/model/scene.ts";
import type { LevelsPanel } from "../src/model/systems/levels.ts";
import { markStep } from "../src/sim/lesson.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const LSM = `
import { test } from "node:test";
export class Lsm {
  // @viz levels:memtable,levels,hot=checked
  memtable: [string, number | null][] = [["a", 1], ["c", null]];
  levels = [
    [{ id: "T2", entries: [["b", 2]] }, { id: "T1", entries: [["a", 0], ["d", 4]] }],
    [{ id: "T0", entries: [["a", -1], ["z", 9]] }],
  ];
  checked: string[] = [];
  get(k: string) {
    this.checked = [];
    this.checked.push("memtable");
    this.checked.push("T2"); // @mark checked
    this.levels[0][0].entries.push(["e", 5]); // @mark grow
    return k;
  }
}
test("get: reads", () => { new Lsm().get("b"); });
`;

const WAL = `
import { test } from "node:test";
export class Wal {
  // @viz levels:memory,log@durable,snapshot,hot=rec
  memory = new Map<string, number>([["x", 1]]);
  log = [{ seq: 1, k: "x", v: 1, checksum: 7 }, { seq: 2, k: "y", v: 2, checksum: 8 }];
  durable = 1;
  snapshot: Map<string, number> | null = null;
  replay() {
    // An indexed loop: a for-of loop with a one-line body merges its iterations into one step.
    for (let i = 0; i < this.log.length; i++) {
      const rec = this.log[i];
      this.memory.set(rec.k, rec.v); // @mark apply
    }
  }
}
test("replay: applies", () => { new Wal().replay(); });
`;

/** The scene `after` steps past the nth visit of a mark (0: just before that line runs). */
function sceneAt(src: string, mark: string, nth = 1, after = 1) {
  const run = traceSource(src, SYSTEMS_LIMITS, { scenarios: true }).runs[0];
  const hints = parseHints(src);
  const i = markStep(run.steps, hints.marks[mark], nth);
  assert.ok(i >= 0, `mark ${mark} reached`);
  return buildScene(run.steps[i + after], run.steps[i + after - 1], hints);
}
const levelsOf = (panels: Panel[]) => panels.filter((p): p is LevelsPanel => p.kind === "levels");

test("levels: memtable, L0 and L1 rows with tables, key ranges and items", () => {
  const scene = sceneAt(LSM, "checked");
  const [panel] = levelsOf(scene.panels);
  assert.ok(panel);
  assert.deepEqual(
    panel.rows.map((r) => r.name),
    ["memtable", "L0", "L1"],
  );
  const mem = panel.rows[0].blocks[0];
  assert.deepEqual(mem.items, ["a=1", "c=†"]);
  assert.equal(mem.range, "a–c");
  assert.deepEqual(
    panel.rows[1].blocks.map((b) => b.label),
    ["T2", "T1"],
  );
  assert.equal(panel.rows[1].blocks[1].range, "a–d");
  assert.deepEqual(panel.rows[2].blocks[0].items, ["a=-1", "z=9"]);
});

test("levels: hot blocks are the ones the read has checked", () => {
  const [panel] = levelsOf(sceneAt(LSM, "checked").panels);
  const hot = panel.rows.flatMap((r) => r.blocks.filter((b) => b.hot).map((b) => `${r.name}/${b.label}`));
  assert.deepEqual(hot, [`memtable/${panel.rows[0].blocks[0].label}`, "L0/T2"]);
});

test("levels: a block whose items changed is flagged, the others are not", () => {
  const [panel] = levelsOf(sceneAt(LSM, "grow").panels);
  const changed = panel.rows.flatMap((r) => r.blocks.filter((b) => b.changed).map((b) => b.label));
  assert.deepEqual(changed, ["T2"]);
});

test("levels: drawn variables are not drawn again as arrays or maps", () => {
  const scene = sceneAt(LSM, "checked");
  assert.deepEqual(
    scene.panels.filter((p) => p.kind !== "levels").map((p) => p.name),
    [],
  );
});

test("levels: a WAL row is one block per record, with a mark after the durable ones", () => {
  const scene = sceneAt(WAL, "apply", 2, 0);
  const [panel] = levelsOf(scene.panels);
  assert.deepEqual(
    panel.rows.map((r) => r.name),
    ["memory", "log", "snapshot"],
  );
  const log = panel.rows[1];
  assert.deepEqual(
    log.blocks.map((b) => [b.label, b.items]),
    [
      ["#1", ["x=1"]],
      ["#2", ["y=2"]],
    ],
  );
  assert.equal(log.mark, 1);
  assert.equal(log.markLabel, "durable");
  // The record being replayed (a local named in hot=) is hot.
  assert.deepEqual(
    log.blocks.map((b) => b.hot),
    [false, true],
  );
  assert.equal(panel.rows[2].blocks.length, 0);
});

test("levels: replaying a record into memory flashes the memory block", () => {
  const [panel] = levelsOf(sceneAt(WAL, "apply", 2).panels);
  assert.deepEqual(panel.rows[0].blocks[0].items, ["x=1", "y=2"]);
  assert.equal(panel.rows[0].blocks[0].changed, true);
  assert.equal(panel.rows[1].blocks.some((b) => b.changed), false);
});
