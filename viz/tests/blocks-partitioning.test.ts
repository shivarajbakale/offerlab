// Partitioning blocks (002–004): at the moments the lessons link to, the caption says in plain
// words what just happened, the score table shows where each key is stored, and the spatial view
// reads as a map (places or drivers, the person asking, real distances).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captionAt } from "../src/model/caption.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene, type GridPanel, type Panel } from "../src/model/scene.ts";
import type { SpatialPanel } from "../src/model/systems/spatial.ts";
import type { Caption } from "../src/model/systems/types.ts";
import { findRun, markStep } from "../src/sim/lesson.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const root = join(import.meta.dirname, "../../system-design/primitives/01-partitioning");
const RDV = "002-rendezvous-hashing";
const GEO = "003-geohash";
const QUAD = "004-quadtree";

const loaded = new Map<string, { hints: ReturnType<typeof parseHints>; trace: ReturnType<typeof traceSource> }>();
function load(file: string) {
  if (!loaded.has(file)) {
    const src = readFileSync(join(root, `${file}.ts`), "utf8");
    loaded.set(file, { hints: parseHints(src), trace: traceSource(src, SYSTEMS_LIMITS, { scenarios: true }) });
  }
  return loaded.get(file)!;
}

/** The caption and the panels at a play link's moment (`scenario@at=mark#nth`). */
function at(file: string, scenario: string, mark: string, nth = 1): { caption: Caption; panels: Panel[] } {
  const { hints, trace } = load(file);
  const i = findRun(trace.runs, scenario);
  assert.ok(i >= 0, `no scenario ${scenario}`);
  const steps = trace.runs[i].steps;
  const k = markStep(steps, hints.marks[mark], nth);
  assert.ok(k >= 0, `${mark}#${nth} not reached`);
  const caption = captionAt(steps, k, hints);
  assert.ok(caption, `no caption at ${mark}#${nth}`);
  return { caption, panels: buildScene(steps[k + 1] ?? steps[k], steps[k], hints).panels };
}

const grid = (panels: Panel[]) => panels.find((p): p is GridPanel => p.kind === "grid")!;
const spatial = (panels: Panel[]) => panels.find((p): p is SpatialPanel => p.kind === "spatial")!;

test("partitioning lessons: 002–004 have the plain-words and when-to-use sections, in place", () => {
  for (const f of [RDV, GEO, QUAD]) {
    const md = readFileSync(join(root, `${f}.lesson.md`), "utf8");
    const what = md.indexOf("## What it is");
    const plain = md.indexOf("## In plain words");
    const words = md.indexOf("## Words we'll use");
    const when = md.indexOf("## When to use which");
    const deep = md.indexOf("## Deep dive");
    assert.ok(what >= 0 && what < plain && plain < words, `${f}: In plain words right after What it is`);
    assert.ok(when > 0 && when < deep && !md.slice(when, deep).includes("\n## ", 5), `${f}: When to use which right before Deep dive`);
    assert.match(md.slice(plain, words), /In the picture on the right/);
  }
});

test("partitioning: every scenario of 002–004 is captioned, with no unfilled {…}", () => {
  for (const f of [RDV, GEO, QUAD]) {
    const { hints, trace } = load(f);
    for (const run of trace.runs) {
      let none = 0;
      run.steps.forEach((_, k) => {
        const c = captionAt(run.steps, k, hints);
        if (!c) none++;
        else assert.doesNotMatch(c.text, /\{[^}]+\}|undefined|NaN/, `${f} / ${run.label} step ${k}: ${c.text}`);
      });
      assert.ok(none <= 10, `${f} / ${run.label}: ${none} steps without a caption`);
    }
  }
});

test("rendezvous: the first row is decided by its highest score, and its name shows the winner", () => {
  const { caption, panels } = at(RDV, "pick", "row", 1);
  assert.equal(caption.text, "user:1 is stored on B: 7845 is the highest score in its row.");
  assert.deepEqual(grid(panels).rowLabels?.slice(0, 2), ["user:1 → B", "user:2"]);
});

test("rendezvous: a lookup says who leads, then who wins and what it cost", () => {
  assert.match(at(RDV, "pick", "lead", 11).caption.text, /^B now leads for user:3 with a score of 5339/);
  const win = at(RDV, "pick", "winner", 7).caption.text;
  assert.match(win, /user:3 is stored on B: its score 5339 is the highest/);
  assert.match(at(RDV, "cost", "winner").caption.text, /took 5 hashes, one per server/);
});

test("rendezvous: removing B moves only B's keys, and the table marks them", () => {
  const { caption, panels } = at(RDV, "remove a server", "done");
  assert.equal(caption.tone, "good");
  assert.match(caption.text, /3 of 8 keys moved, and every one of them had been on B/);
  const moved = grid(panels).rowLabels!.filter((l) => l.includes("(was"));
  assert.deepEqual(moved, ["user:1 → D (was B)", "user:3 → A (was B)", "user:7 → D (was B)"]);
});

test("rendezvous: adding D moves one tracked key, to D", () => {
  const { caption, panels } = at(RDV, "add a server", "done");
  assert.match(caption.text, /1 of 8 keys moved, all of them to the new server, D/);
  assert.ok(grid(panels).rowLabels!.includes("user:5 → D (was C)"));
});

test("rendezvous: when the score ignores the key, the caption calls out one server holding everything", () => {
  const { caption } = at(RDV, "broken: score ignores the key", "done");
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /Every key is stored on A, while B and C hold nothing/);
});

test("geohash: each character is captioned with the cell's real size", () => {
  const first = at(GEO, "encode", "char", 1);
  assert.match(first.caption.text, /geohash starts g\. Cell g is about 3120 km wide/);
  const six = at(GEO, "encode", "char", 6);
  assert.match(six.caption.text, /gcpuzg is about 762 m wide and 611 m tall/);
  const map = spatial(six.panels);
  assert.equal(map.marker?.label, "observatory");
  assert.equal(map.world?.dot, "place");
  assert.ok(map.world?.geo && map.world.metres, "the map has a scale");
});

test("geohash: 42 metres apart across the meridian, no shared prefix, and the caption says why", () => {
  const { caption } = at(GEO, "edge", "inserted", 2);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /west, only 42 m away, is gcpuzgrb\. They share no characters/);
});

test("geohash: the search reads the cell to the east and finds the cafe, near 'you'", () => {
  const cells = at(GEO, "search", "cells");
  assert.match(cells.caption.text, /Your own cell is gcpuzg\. The search will read it and the 8 cells around it/);
  const { caption, panels } = at(GEO, "search", "found", 3);
  assert.equal(caption.tone, "good");
  assert.match(caption.text, /Found cafe, 123 m from you/);
  const map = spatial(panels);
  assert.equal(map.marker?.label, "you");
  assert.ok(map.search);
  assert.ok(map.world?.city, "a few hundred metres across is drawn as a city map");
});

test("geohash: searching only your own cell is called out, with what it missed", () => {
  const { caption } = at(GEO, "broken: prefix only", "result");
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /cafe \(123 m away\).*never looked at/);
});

test("quadtree: a fifth driver overflows the cell, which splits into 5 km quarters", () => {
  const full = at(QUAD, "split", "stored", 1);
  assert.match(full.caption.text, /Driver e signs in .* holds 5 of at most 4: one too many, so it must split/);
  const split = at(QUAD, "split", "split");
  assert.match(split.caption.text, /four equal quarters, each 5 km across/);
  const map = spatial(split.panels);
  assert.equal(map.world?.dot, "driver");
  assert.deepEqual(map.world?.metres, { x: 100, y: 100 });
});

test("quadtree: the search skips whole cells and ends near the rider with few drivers checked", () => {
  assert.match(at(QUAD, "query", "skip", 1).caption.text, /^Skip this cell \(5 km across\): it doesn't touch the dashed box, so none of the 15 drivers/);
  const { caption, panels } = at(QUAD, "query", "result");
  assert.equal(caption.tone, "good");
  assert.match(caption.text, /3 drivers found .* inside 6 of the 25 cells and checked only 8 of the 40 drivers/);
  const map = spatial(panels);
  assert.equal(map.marker?.label, "rider");
  assert.deepEqual(map.marker && [map.marker.x, map.marker.y], [24, 71.5]);
});

test("quadtree: with no capacity limit, the caption says every driver was checked", () => {
  const { caption } = at(QUAD, "broken: no capacity", "result");
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /only after checking all 40/);
});
