// The explain card: decision notes parsed from a solution and filled with live values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHints, declaredFunction } from "../src/model/hints.ts";
import { parseProblem } from "../src/parseProblem.ts";
import { explain, readOperands } from "../src/model/explain.ts";
import { narrate } from "../src/model/narrate.ts";
import { traceSource } from "../src/tracer/trace.ts";

test("block notes attach to the next code line, past @why and other notes", () => {
  const src = [
    "// @goal sum of {JSON.stringify(a)}",
    "export function f(a: number[]) {",
    "  // @why Loop over a.",
    "  // @yes keep going at {i}",
    "  // @no done",
    "  // @no for real",
    "  for (let i = 0; i < a.length; i++) {}",
    "}",
  ].join("\n");
  const h = parseHints(src);
  assert.equal(h.goal.f, "sum of {JSON.stringify(a)}");
  assert.deepEqual(h.notes.yes, { 7: "keep going at {i}" });
  assert.deepEqual(h.notes.no, { 7: "done for real" });
  const p = parseProblem("neetcode-150/01-demo/001-demo.ts", "/**\n * 1. Demo\n */\n" + src);
  assert.equal(p.why[10], "Loop over a.");
});

test("finds the function a line declares", () => {
  assert.equal(declaredFunction("export function twoSum(nums: number[]) {"), "twoSum");
  assert.equal(declaredFunction("  const height = (node: TreeNode | null): number => {"), "height");
  assert.equal(declaredFunction("  get(key: number): number {"), "get");
  assert.equal(declaredFunction("  if (x) {"), undefined);
});

test("reads a condition's operands", () => {
  assert.deepEqual(readOperands("height[l] < height[r] && !seen.has(x)", { height: [1, 7], l: 0, r: 1, seen: new Set(), x: 3 }), [
    { expr: "height[l]", value: "1" },
    { expr: "height[r]", value: "7" },
    { expr: "seen.has(x)", value: "false" },
  ]);
  assert.deepEqual(readOperands("j !== undefined", { j: undefined }), [{ expr: "j", value: "undefined" }]);
});

test("Two Sum explains each decision with live values", () => {
  const path = "neetcode-150/01-arrays-hashing/003-two-sum.ts";
  const src = readFileSync(join(import.meta.dirname, "../..", path), "utf8");
  const p = parseProblem(path, src);
  const steps = traceSource(src).runs[0].steps;
  const all = steps.map((_, k) => explain(steps, k, p.lines, p.hints, p.why, narrate(steps, k, p.lines, { ...p.hints, say: {} })));
  const misses = all.filter((e) => e.decision && !e.decision.outcome && /hasn't appeared/.test(e.why ?? ""));
  assert.ok(misses.length > 0, "the miss on 2 is explained");
  const hit = all.find((e) => e.decision?.outcome && /Found it/.test(e.why ?? ""));
  assert.match(hit!.why!, /nums\[0\] \+ nums\[1\] = 2 \+ 7 = 9/);
  // The loop counter has not moved on yet when the store's "so now" is read.
  assert.ok(all.some((e) => e.then === "The map now covers indices 0..0, and every pair ending at index 0 has been checked."));
  assert.ok(all.filter((e) => e.key).length / all.length > 0.6);
});
