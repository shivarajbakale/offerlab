// The building-block pictures explain themselves: at each moment a lesson links to, the picture's
// caption says in plain words what just happened, and the scenarios read as a story.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import type { BalancerPanel } from "../src/model/systems/balancer.ts";
import type { RingPanel } from "../src/model/systems/ring.ts";
import { isKernelSource } from "../src/parseProblem.ts";
import { findRun, markStep, parseLesson, storyChapters, testNames } from "../src/sim/lesson.ts";
import { runSimSource } from "../src/sim/run.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const root = join(import.meta.dirname, "../../system-design/primitives");
const LB = "04-traffic/014-load-balancing";
const RING = "01-partitioning/001-consistent-hashing";

const traces = new Map<string, ReturnType<typeof traceSource>>();
function load(file: string) {
  const src = readFileSync(join(root, `${file}.ts`), "utf8");
  if (!traces.has(file)) traces.set(file, traceSource(src, SYSTEMS_LIMITS, { scenarios: true }));
  return { hints: parseHints(src), trace: traces.get(file)! };
}

function panelAt<P>(file: string, kind: string, scenario: string, mark: string, nth = 1): P {
  const { hints, trace } = load(file);
  const run = trace.runs[findRun(trace.runs, scenario)];
  const k = markStep(run.steps, hints.marks[mark], nth);
  assert.ok(k >= 0, `${mark}#${nth} not reached`);
  const scene = buildScene(run.steps[k + 1] ?? run.steps[k], run.steps[k], hints);
  const p = scene.panels.find((x) => x.kind === kind);
  assert.ok(p, `no ${kind} panel`);
  return p as P;
}

test("load balancing: round robin's slow request is captioned as a problem, with the reason", () => {
  const p = panelAt<BalancerPanel>(LB, "balancer", "broken: round robin with one slow server", "assign", 12);
  assert.equal(p.caption.tone, "bad");
  assert.match(p.caption.text, /s2's turn/);
  assert.match(p.caption.text, /waits 2 ticks/);
  assert.ok(p.servers[2].target);
});

test("load balancing: after 8 ticks of round robin, the slow server is backed up and the others idle", () => {
  const p = panelAt<BalancerPanel>(LB, "balancer", "broken: round robin with one slow server", "work", 24);
  assert.deepEqual(
    p.servers.map((s) => [s.queue, s.backedUp]),
    [
      [0, false],
      [0, false],
      [8, true],
    ],
  );
  assert.match(p.caption.text, /s2 still has 8 waiting while s0 and s1 sit idle/);
});

test("load balancing: stale counts show every balancer's view, and the herd is called out", () => {
  const p = panelAt<BalancerPanel>(LB, "balancer", "broken: least connections on stale counts", "assign", 6);
  assert.equal(p.balancers.length, 3);
  assert.deepEqual(p.balancers[0].view, [0, 0, 0]);
  assert.equal(p.caption.tone, "bad");
  assert.match(p.caption.text, /All 6 requests so far this tick went to s0/);
});

test("load balancing: two choices names both samples, and an emptier server it missed", () => {
  const hit = panelAt<BalancerPanel>(LB, "balancer", "power of two choices", "two", 13);
  assert.deepEqual(hit.servers.filter((s) => s.sampled).map((s) => s.name), ["s1", "s2"]);
  assert.match(hit.caption.text, /less busy one, s1/);
  const miss = panelAt<BalancerPanel>(LB, "balancer", "power of two choices", "two", 22);
  assert.match(miss.caption.text, /s0 has only 0 but was not picked/);
});

test("load balancing: the picture replaces the raw variables", () => {
  const { hints, trace } = load(LB);
  const run = trace.runs[findRun(trace.runs, "least connections")];
  const k = markStep(run.steps, hints.marks.assign, 11);
  const scene = buildScene(run.steps[k + 1], run.steps[k], hints);
  assert.deepEqual(scene.panels.map((p) => p.kind), ["balancer"]);
  assert.deepEqual(scene.scalars, []);
});

test("consistent hashing: lookup, owner and wrap each get their own plain caption", () => {
  const hash = panelAt<RingPanel>(RING, "ring", "lookup", "hash");
  assert.match(hash.caption.text, /needs user:1/);
  assert.match(hash.caption.text, /41% of the way around/);
  const owner = panelAt<RingPanel>(RING, "ring", "lookup", "owner");
  assert.equal(owner.caption.tone, "good");
  assert.match(owner.caption.text, /server C stores user:1/);
  assert.match(panelAt<RingPanel>(RING, "ring", "lookup", "wrap").caption.text, /passes 0/);
});

test("consistent hashing: a moved key names where it came from and where it went", () => {
  const add = panelAt<RingPanel>(RING, "ring", "add a server", "moved", 6);
  assert.match(add.caption.text, /moves to D/);
  assert.ok(add.keys.filter((k) => k.moved).every((k) => k.owner === "D" && k.before));
  const modN = panelAt<RingPanel>(RING, "ring", "broken: hash mod N", "moved", 15);
  assert.match(modN.caption.text, /hash mod 4/);
  assert.match(modN.caption.text, /15 of 24/);
  assert.match(modN.caption.text, /most of them/);
});

test("consistent hashing: one token per server is captioned as uneven", () => {
  const p = panelAt<RingPanel>(RING, "ring", "broken: one token per server", "sorted", 3);
  assert.equal(p.caption.tone, "bad");
  assert.match(p.caption.text, /B owns 80% of the ring/);
});

test("chapters follow the lesson's story: the naive attempt first, problems marked", () => {
  const { trace } = load(RING);
  const lesson = parseLesson(readFileSync(join(root, `${RING}.lesson.md`), "utf8"));
  const chapters = storyChapters(trace.runs, lesson);
  assert.equal(chapters.length, trace.runs.length);
  assert.deepEqual(chapters[0], { run: findRun(trace.runs, "broken: hash mod N"), title: "Hash mod N — adding a server moves most keys", role: "problem" });
  assert.equal(chapters[1].role, "works");
  assert.equal(new Set(chapters.map((c) => c.run)).size, chapters.length);
});

test("simulation blocks: scenarios are the file's tests, in order, so chapters can be named before running", () => {
  for (const group of readdirSync(root)) {
    for (const f of readdirSync(join(root, group)).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(join(root, group, f), "utf8");
      if (!isKernelSource(src)) continue;
      assert.deepEqual(
        runSimSource(src).runs.map((r) => r.label),
        testNames(src),
        f,
      );
    }
  }
});
