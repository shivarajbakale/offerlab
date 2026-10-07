// TimelineView builder: a history of { t, ok, row?, label? } becomes lanes of ticks, with an
// optional level line and state bands, and the arrays it draws are not drawn again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import type { TimelinePanel } from "../src/model/systems/timeline.ts";
import { traceSource } from "../src/tracer/trace.ts";
import type { Step } from "../src/tracer/types.ts";

const SRC = `
import { test } from "node:test";
export class Limiter {
  // @viz timeline:history,levels,bands
  history: { t: number; ok: boolean; row?: string; label?: string }[] = [];
  levels: { t: number; v: number }[] = [];
  bands: { from: number; to: number | null; state: string }[] = [{ from: 1, to: null, state: "closed" }];
  hit(t: number, ok: boolean, row: string) {
    this.history.push({ t, ok, row, label: ok ? "ok" : "no" }); // @mark hit
    this.levels.push({ t, v: this.history.length * 2 });
    return ok;
  }
  open(t: number) {
    this.bands[this.bands.length - 1].to = t;
    this.bands.push({ from: t, to: null, state: "open" });
  }
}
test("one: hits", () => {
  const l = new Limiter();
  l.hit(1, true, "c10");
  l.hit(3, false, "c2");
  l.hit(3, true, "c10");
  l.open(4);
  l.hit(6, false, "c2");
});
`;

const NO_ROWS = `
import { test } from "node:test";
export class Bucket {
  // @viz timeline:history
  history: { t: number; ok: boolean }[] = [];
  allow(t: number) {
    this.history.push({ t, ok: true });
    return true;
  }
}
test("one: allow", () => { const b = new Bucket(); b.allow(2); b.allow(2); });
`;

const runOf = (src: string) => traceSource(src, undefined, { scenarios: true }).runs[0];
const timelineAt = (src: string, steps: Step[], i: number) => {
  const scene = buildScene(steps[i], steps[i - 1], parseHints(src));
  return { scene, panel: scene.panels.find((p) => p.kind === "timeline") as TimelinePanel | undefined };
};

test("timeline: events, rows, span, now, line and bands", () => {
  const steps = runOf(SRC).steps;
  const { panel } = timelineAt(SRC, steps, steps.length - 1);
  assert.ok(panel);
  assert.equal(panel.name, "history");
  // rows that differ only in a number sort by that number
  assert.deepEqual(panel.rows, ["c2", "c10"]);
  assert.deepEqual(
    panel.events.map((e) => [e.t, e.row, e.ok, e.label]),
    [[1, "c10", true, "ok"], [3, "c2", false, "no"], [3, "c10", true, "ok"], [6, "c2", false, "no"]],
  );
  assert.deepEqual(panel.span, [1, 6]);
  assert.equal(panel.now, 6);
  assert.equal(panel.line?.label, "levels");
  assert.equal(panel.line?.max, 8);
  assert.deepEqual(panel.line?.points.map((p) => p.v), [2, 4, 6, 8]);
  // a variable simply named `bands` is labelled "state"
  assert.equal(panel.bandsLabel, "state");
  // the open band runs up to the end of the span
  assert.deepEqual(panel.bands, [
    { from: 1, to: 4, state: "closed" },
    { from: 4, to: 6, state: "open" },
  ]);
});

test("timeline: a newly added event is fresh for one step", () => {
  const steps = runOf(SRC).steps;
  const lens = steps.map((_, i) => timelineAt(SRC, steps, i).panel?.events.length ?? 0);
  const grew = lens.findIndex((n, i) => i > 0 && n > lens[i - 1]);
  assert.ok(grew > 0);
  const { panel } = timelineAt(SRC, steps, grew);
  assert.deepEqual(panel!.events.map((e) => Boolean(e.fresh)), [true]);
  const after = timelineAt(SRC, steps, grew + 1).panel!;
  assert.equal(after.events.some((e) => e.fresh), false);
});

test("timeline: the arrays it draws are not drawn again", () => {
  const steps = runOf(SRC).steps;
  const { scene } = timelineAt(SRC, steps, steps.length - 1);
  assert.equal(scene.panels.filter((p) => p.kind === "timeline").length, 1);
  const others = scene.panels.filter((p) => p.kind !== "timeline").map((p) => p.name);
  for (const name of ["history", "levels", "bands"]) assert.ok(!others.includes(name), `${name} drawn twice`);
  assert.equal(scene.panels.filter((p) => p.kind === "object").length, 0);
});

const EARLY_BAND = `
import { test } from "node:test";
export class Windowed {
  // @viz timeline:history,windows
  history: { t: number; ok: boolean }[] = [];
  windows = [{ from: 0, to: 1, state: "w0" }, { from: 1, to: null, state: "w1" }];
  allow(t: number) {
    this.history.push({ t, ok: true });
    return true;
  }
}
test("one: allow", () => { const w = new Windowed(); w.allow(0.9); w.allow(1.1); });
`;

test("timeline: the span follows the events, and bands are clipped to it", () => {
  const steps = runOf(EARLY_BAND).steps;
  const { panel } = timelineAt(EARLY_BAND, steps, steps.length - 1);
  assert.deepEqual(panel!.span, [0.9, 1.1]);
  assert.equal(panel!.bandsLabel, "windows");
  assert.deepEqual(panel!.bands, [
    { from: 0.9, to: 1, state: "w0" },
    { from: 1, to: 1.1, state: "w1" },
  ]);
});

const LANES = `
import { test } from "node:test";
export class Pool {
  // @viz timeline:history,lanes
  history: { t: number; ok: boolean; row: string }[] = [];
  lanes = ["s0", "s1", "s2"];
  send(t: number, row: string) {
    this.history.push({ t, ok: true, row });
    return true;
  }
}
test("one: send", () => { const p = new Pool(); p.send(0, "s1"); p.send(1, "s9"); });
`;

test("timeline: an array of strings names the lanes, even before they have events", () => {
  const steps = runOf(LANES).steps;
  const { scene, panel } = timelineAt(LANES, steps, steps.length - 1);
  assert.deepEqual(panel!.rows, ["s0", "s1", "s2", "s9"]);
  assert.ok(!scene.panels.some((p) => p.name === "lanes"), "the lane names are not drawn again");
});

const LIMIT = `
import { test } from "node:test";
export class Meter {
  // @viz timeline:history,load,capacity
  history: { t: number; ok: boolean }[] = [];
  load: { t: number; v: number }[] = [];
  capacity = 4;
  tick(t: number, n: number) {
    this.load.push({ t, v: n });
    this.history.push({ t, ok: n <= this.capacity });
    return true;
  }
}
test("one: tick", () => { const m = new Meter(); m.tick(0, 2); m.tick(1, 3); });
`;

test("timeline: a number in the hint is drawn as a limit on the line", () => {
  const steps = runOf(LIMIT).steps;
  const { panel } = timelineAt(LIMIT, steps, steps.length - 1);
  assert.deepEqual(panel!.line?.limit, { label: "capacity", v: 4 });
  assert.equal(panel!.line?.max, 4, "the scale includes the limit");
});

test("timeline: events without a row share one unnamed lane; no line or bands", () => {
  const steps = runOf(NO_ROWS).steps;
  const { panel } = timelineAt(NO_ROWS, steps, steps.length - 1);
  assert.deepEqual(panel!.rows, [""]);
  assert.equal(panel!.line, undefined);
  assert.equal(panel!.bands, undefined);
  // a single instant still gets a span with width
  assert.deepEqual(panel!.span, [2, 3]);
});

test("timeline: a band that just started stretches the span to show it", () => {
  const steps = runOf(SRC).steps;
  // right after open(4), before the next event: the open band starts after the last event at t=3
  const i = steps.findIndex((_, k) => timelineAt(SRC, steps, k).panel?.bands?.length === 2);
  const panel = timelineAt(SRC, steps, i).panel!;
  assert.equal(panel.now, 3);
  assert.deepEqual(panel.span, [1, 4]);
  assert.deepEqual(panel.bands?.at(-1), { from: 4, to: 4, state: "open" });
});

test("timeline: an empty array has no shape yet, so it is not taken for a line", () => {
  const steps = runOf(SRC).steps;
  const first = timelineAt(SRC, steps, 1).panel!;
  assert.equal(first.line, undefined, "levels is still empty");
  assert.ok(first.bands, "bands already has its first band");
  const scene = buildScene(steps[1], steps[0], parseHints(SRC));
  assert.ok(!scene.panels.some((p) => p.name === "levels"), "the empty array is still not drawn on its own");
});

test("timeline: an empty history still draws an empty timeline", () => {
  const steps = runOf(NO_ROWS).steps;
  const { panel } = timelineAt(NO_ROWS, steps, 1);
  assert.ok(panel);
  assert.equal(panel.events.length, 0);
  assert.equal(panel.now, undefined);
});

test("timeline: ok= and bad= in the hint name the two outcomes (default accepted and rejected)", () => {
  const src = NO_ROWS.replace("@viz timeline:history", "@viz timeline:history,ok=fast,bad=slow");
  const steps = runOf(src).steps;
  const { panel } = timelineAt(src, steps, steps.length - 1);
  assert.deepEqual(panel?.words, { ok: "fast", bad: "slow" });
  const plain = runOf(NO_ROWS).steps;
  assert.deepEqual(timelineAt(NO_ROWS, plain, plain.length - 1).panel?.words, { ok: "accepted", bad: "rejected" });
});
