import { test } from "node:test";
import assert from "node:assert/strict";
import { SimNode, simulate, type Ctx } from "../../system-design/kernel/sim.ts";
import { chaosVerdict, describeFault } from "../src/sim/chaos.ts";
import { clusterLayout, lerp } from "../src/sim/layout.ts";
import { fmt, json, logLine, narrateSim, stateChanges } from "../src/sim/narrate.ts";

class Beat extends SimNode {
  n = 0;
  state() {
    return { n: this.n };
  }
  onStart(ctx: Ctx) {
    ctx.setTimer("Beat", 2);
    if (ctx.id === "a") ctx.send("b", "Hello", { hi: 1 });
  }
  onBeat() {
    this.n++;
  }
  onHello(ctx: Ctx) {
    ctx.say("b says hi back");
  }
}
const nodes = { a: () => new Beat(), b: () => new Beat() };

test("narration: say text wins, otherwise the event plus what changed", () => {
  const { run } = simulate({ nodes, seed: 1, until: 2, latency: [1, 1] });
  const kinds = run.steps.map((s) => `${s.kind}:${s.node}`);
  assert.deepEqual(kinds, ["start:a", "start:b", "deliver:b", "timer:a", "timer:b"]);
  assert.deepEqual(narrateSim(run.steps, 2), { kind: "say", text: "b says hi back" });
  assert.deepEqual(narrateSim(run.steps, 3), { kind: "change", text: "a's Beat timer fires  ·  n: 0 → 1" });
  assert.equal(logLine(run.steps[2]), 'a → b  Hello {"hi":1}');
  assert.equal(logLine(run.steps[3]), "a ⏱ Beat");
  assert.deepEqual(stateChanges(undefined, run.steps[0], "a"), ["n = 0"]);
});

test("narration explains drops and crashes", () => {
  const { run } = simulate({ nodes, seed: 1, until: 2, latency: [1, 1], faults: [{ at: 0, kind: "crash", node: "b" }] });
  const crash = run.steps.findIndex((s) => s.kind === "crash");
  const drop = run.steps.findIndex((s) => s.kind === "drop");
  assert.equal(narrateSim(run.steps, crash).text, "b crashes: its timers stop and messages to it are lost");
  assert.equal(narrateSim(run.steps, drop).text, "Hello from a to b is lost: the receiver is down");
  assert.equal(logLine(run.steps[drop]), "✗ a → b  Hello (crashed)");
});

test("cluster layout: first node at the top, evenly spaced, client in the corner", () => {
  const pos = clusterLayout(["a", "b", "c", "d"], 560, 340, true);
  assert.ok(pos.a.y < pos.b.y && pos.a.y < pos.c.y);
  assert.ok(Math.abs(pos.a.x - 280) < 1e-9);
  assert.ok(Math.abs(pos.c.x - 280) < 1e-9);
  assert.deepEqual(pos.client, { x: 50, y: 34 });
  assert.equal(clusterLayout(["a"], 560, 340, false).client, undefined);
  assert.deepEqual(lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5), { x: 5, y: 10 });
});

test("fmt renders Map and Set, and stateChanges sees changes inside them", () => {
  assert.equal(fmt(new Map([["a", 1]])), '{"a":1}');
  assert.equal(fmt(new Set([1, 2])), "[1,2]");
  assert.equal(json(new Map([["a", 1]])), '{"a":1}');
  const step = (m: Map<string, number>) => ({ t: 0, kind: "timer" as const, nodes: { a: { up: true, state: { m } } }, inFlight: [], partitions: [] });
  assert.deepEqual(stateChanges(step(new Map([["k", 1]])), step(new Map([["k", 2]])), "a"), ['m: {"k":1} → {"k":2}']);
});
test("describeFault names each injected fault in plain words", () => {
  assert.equal(describeFault({ at: 40, kind: "crash", node: "n2" }), "t=40 crash n2");
  assert.equal(describeFault({ at: 50, kind: "recover", node: "n2" }), "t=50 restart n2");
  assert.equal(describeFault({ at: 9, kind: "partition", groups: [["n1"], ["n2", "n3"]] }), "t=9 cut off n1");
  assert.equal(describeFault({ at: 9, kind: "heal" }), "t=9 heal network");
  assert.equal(describeFault({ at: 3, kind: "drop", count: 1 }), "t=3 lose next message");
  assert.equal(describeFault({ at: 3, kind: "delay", extra: 5, until: 23 }), "t=3 slow network until t=23");
});

test("chaosVerdict judges the safety rule by invariant violations, not by the scenario's story checks", () => {
  const step = (t: number, violation?: string) => ({ t, kind: "timer" as const, nodes: {}, inFlight: [], partitions: [], ...(violation ? { violation } : {}) });
  assert.deepEqual(chaosVerdict([step(0), step(5)]), { broken: false, text: "No safety rule was broken." });
  assert.deepEqual(chaosVerdict([step(0), step(7, "two leaders in term 1"), step(9, "two leaders in term 1")]), {
    broken: true,
    text: "⚠ Your faults broke a safety rule at t=7: two leaders in term 1.",
  });
});

test("scenario dropdown: systems shows the test name, algorithms numbers the examples", async () => {
  const { scenarioOptionLabel } = await import("../src/sim/lesson.ts");
  assert.equal(scenarioOptionLabel({ label: "add a server: few keys move", passed: true }, 0, true), "✓ add a server: few keys move");
  assert.equal(scenarioOptionLabel({ label: "twoSum(…) → [0,1]", passed: false }, 1, false), "✗ Example 2: twoSum(…) → [0,1]");
  assert.equal(scenarioOptionLabel({ label: "x", passed: null }, 0, true), "· x");
});

test("handlerRange finds a handler in an abstract class's own body", async () => {
  const { handlerRange } = await import("../src/sim/handlers.ts");
  const lines = ["class A {", "  onTick(ctx) {", "    x();", "  }", "}", "export abstract class B extends A {", "  onTick(ctx) {", "    y();", "  }", "}"];
  assert.deepEqual(handlerRange(lines, "onTick", "B"), { start: 7, end: 9 });
});

test("chaos trace cache keeps at most 20 entries, evicting the oldest", async () => {
  const { cacheSet } = await import("../src/sim/cache.ts");
  const m = new Map<string, number>();
  for (let i = 0; i < 25; i++) cacheSet(m, String(i), i);
  assert.equal(m.size, 20);
  assert.ok(!m.has("4") && m.has("5") && m.has("24"));
});
