import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isKernelSource, parseProblem } from "../src/parseProblem.ts";
import { handlerLines, handlerRange } from "../src/sim/handlers.ts";
import { runSimSource } from "../src/sim/run.ts";

const PRIMS = join(import.meta.dirname, "../../system-design/primitives");
const RAFT = "05-replication/020-raft-leader-election.ts";
const REPL = "05-replication/017-leader-follower-replication.ts";
const primitive = (path: string) => readFileSync(join(PRIMS, path), "utf8");

const TINY = `
import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type Ctx } from "../../kernel/sim.ts";
class Tick extends SimNode {
  n = 0;
  state() { return { n: this.n }; }
  onStart(ctx: Ctx) { ctx.setTimer("Beat", 2); }
  onBeat(ctx: Ctx) { this.n++; ctx.setTimer("Beat", 2); }
}
test("beats", () => {
  const { nodes } = simulate({ nodes: { a: () => new Tick() }, seed: 1, until: 10 });
  assert.equal((nodes.a as Tick).n, 5);
});
test("wrong", () => {
  const { nodes } = simulate({ nodes: { a: () => new Tick() }, seed: 1, until: 10 });
  assert.equal((nodes.a as Tick).n, 6);
});
`;

test("runs every scenario of a primitive as a labelled, passing run", () => {
  const trace = runSimSource(primitive(RAFT));
  assert.equal(trace.error, undefined);
  assert.equal(trace.runs.length, 9);
  for (const r of trace.runs) {
    assert.equal(r.passed, true, r.label);
    assert.equal(r.error, undefined, r.label);
    assert.ok(r.steps.length > 0);
  }
  assert.equal(trace.runs[0].label, "calm start: the first node to time out wins the election");
});

test("a failing assertion marks its run ✗ instead of throwing", () => {
  const trace = runSimSource(TINY);
  assert.deepEqual(trace.runs.map((r) => [r.label, r.passed]), [["beats", true], ["wrong", false]]);
});

test("chaos faults go to one run only", () => {
  const plain = runSimSource(TINY);
  const chaos = runSimSource(TINY, { run: 0, faults: [{ at: 5, kind: "crash", node: "a" }] });
  assert.equal(chaos.runs[0].passed, false);
  assert.equal(chaos.runs[0].steps.at(-1)!.kind, "crash");
  assert.deepEqual(chaos.runs[1], plain.runs[1]);
});

test("a throwing test marks its runs failed and keeps the others", () => {
  const src = TINY.replace('assert.equal((nodes.a as Tick).n, 5);', 'throw new Error("oops");');
  const trace = runSimSource(src);
  assert.equal(trace.error, undefined);
  assert.deepEqual(trace.runs.map((r) => r.passed), [false, false]);
});

test("compile errors are reported, not thrown", () => {
  assert.match(runSimSource("class {").error!, /Compile error/);
});

test("handler map finds each on<Name> method's line range", () => {
  const lines = primitive(RAFT).split("\n");
  const h = handlerLines(lines);
  for (const name of ["onStart", "onElectionTimeout", "onRequestVote", "onVote", "onHeartbeat", "onAppendEntries", "onAppendReply"]) {
    assert.ok(h[name], name);
    assert.match(lines[h[name].start - 1], new RegExp(`${name}\\(`));
    assert.equal(lines[h[name].end - 1], "  }");
  }
  assert.equal(h.resetElectionTimer, undefined);
});

test("parses a systems primitive header", () => {
  const src = primitive(REPL);
  const p = parseProblem(`system-design/primitives/${REPL}`, src);
  assert.equal(p.id, "sd-05-replication/017-leader-follower-replication");
  assert.equal(p.track, "systems");
  assert.equal(p.engine, "kernel");
  assert.equal(p.category, "sd-05-replication");
  assert.equal(p.categoryLabel, "Replication");
  assert.equal(p.number, "017");
  assert.equal(p.title, "Leader-Follower Replication");
  assert.equal(p.level, "Senior");
  assert.equal(p.approachName, "Asynchronous log shipping");
  assert.match(p.complexity, /^Cost: writes O\(1\)/);
  assert.match(p.problemStatement, /single point of failure/);
  assert.match(p.tradeoffs, /^Asynchronous replication/);
  assert.match(p.staffNotes, /semi-synchronous/);
  assert.match(p.signals, /read replicas/);
  const helpers = p.lines.findIndex((l) => l.startsWith("// --- helpers"));
  assert.ok(p.codeEnd <= helpers);
  assert.ok(isKernelSource(src));
  assert.equal(isKernelSource("export function f() {}"), false);
});

test("NeetCode files stay on the algorithms track and the tracer", () => {
  const src = readFileSync(join(import.meta.dirname, "../../neetcode-150/01-arrays-hashing/003-two-sum.ts"), "utf8");
  const p = parseProblem("neetcode-150/01-arrays-hashing/003-two-sum.ts", src);
  assert.equal(p.track, "algorithms");
  assert.equal(p.engine, "tracer");
  assert.equal(p.id, "01-arrays-hashing/003-two-sum");
  assert.equal(p.level, "");
});

test("a scenario whose simulate() throws still gets a run, so chaos indexes stay aligned", () => {
  const src = TINY.replace('test("beats", () => {', `class Bad extends SimNode { state() { return { f: () => 1 }; } }
test("bad", () => { simulate({ nodes: { a: () => new Bad() }, seed: 1, until: 5 }); });
test("beats", () => {`);
  const trace = runSimSource(src);
  assert.deepEqual(trace.runs.map((r) => r.label), ["bad", "beats", "wrong"]);
  assert.equal(trace.runs[0].passed, false);
  assert.ok(trace.runs[0].error);
  const chaos = runSimSource(src, { run: 1, faults: [{ at: 5, kind: "crash", node: "a" }] });
  assert.equal(chaos.runs[1].steps.at(-1)!.kind, "crash");
});

test("async scenarios are reported instead of silently dropped", () => {
  const src = TINY.replace('test("wrong", () => {', 'test("wrong", async () => {');
  const trace = runSimSource(src);
  // The body has no await, so its simulate() still runs; the point is that async is flagged.
  assert.match(trace.error!, /Scenario "wrong" is async; scenarios must be synchronous/);
});

test("tests inside describe() keep their own names and results", () => {
  const src = TINY.replace('test("beats"', 'import { describe } from "node:test";\ndescribe("group", () => { test("beats"').replace(
    'test("wrong"',
    '});\ntest("wrong"',
  );
  const trace = runSimSource(src);
  assert.equal(trace.error, undefined);
  assert.deepEqual(trace.runs.map((r) => [r.label, r.passed]), [["beats", true], ["wrong", false]]);
});

test("handler map keeps the first definition when a subclass overrides a handler", () => {
  const lines = ["class A {", "  onTick(ctx) {", "    x();", "  }", "}", "class B extends A {", "  onTick(ctx) {", "    y();", "  }", "}"];
  assert.deepEqual(handlerLines(lines).onTick, { start: 2, end: 4 });
});

test("handlerRange picks a subclass's own handler, and falls back to the inherited one", () => {
  const lines = ["class A {", "  onTick(ctx) {", "    x();", "  }", "  onTock(ctx) {", "  }", "}", "class B extends A {", "  onTick(ctx) {", "    y();", "  }", "}"];
  assert.deepEqual(handlerRange(lines, "onTick", "B"), { start: 9, end: 11 });
  assert.deepEqual(handlerRange(lines, "onTock", "B"), { start: 5, end: 6 });
  assert.deepEqual(handlerRange(lines, "onTick"), { start: 2, end: 4 });
});
