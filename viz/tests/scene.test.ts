import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { traceSource } from "../src/tracer/trace.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene, type Panel, type Scene } from "../src/model/scene.ts";
import { conditionOf, narrate } from "../src/model/narrate.ts";

const load = (path: string) => readFileSync(join(import.meta.dirname, "../../neetcode-150", path), "utf8");

/** Every scene of the first run, with the step it came from. */
function scenes(path: string): Scene[] {
  const src = load(path);
  const hints = parseHints(src);
  const steps = traceSource(src).runs[0].steps;
  return steps.map((s, k) => buildScene(steps[k + 1] ?? s, s, hints));
}
const kinds = (sc: Scene[]) => new Set(sc.flatMap((s) => s.panels.map((p) => p.kind)));
const find = <K extends Panel["kind"]>(sc: Scene[], kind: K) =>
  sc.flatMap((s) => s.panels).filter((p): p is Extract<Panel, { kind: K }> => p.kind === kind);

test("two sum: array with pointer, map of seen values", () => {
  const sc = scenes("01-arrays-hashing/003-two-sum.ts");
  assert.ok(kinds(sc).has("array"));
  assert.ok(kinds(sc).has("map"));
  assert.ok(find(sc, "array").some((a) => a.pointers.some((p) => p.name === "i")));
});

test("sliding window: string becomes a char array with an l..r window", () => {
  const sc = scenes("03-sliding-window/016-longest-substring-without-repeating-characters.ts");
  const arrs = find(sc, "array").filter((a) => a.chars);
  assert.ok(arrs.length > 0);
  assert.ok(arrs.some((a) => a.window && a.window[1] > a.window[0]));
});

test("invert tree: one tree panel, current node tagged", () => {
  const sc = scenes("07-trees/046-invert-binary-tree.ts");
  const trees = find(sc, "tree");
  assert.ok(trees.length > 0);
  assert.equal(trees[0].root.label, "4");
  assert.ok(trees.some((t) => JSON.stringify(t.root).includes('"inner":true')));
});

test("reverse list: list panels with prev/curr tags", () => {
  const sc = scenes("06-linked-list/035-reverse-linked-list.ts");
  const lists = find(sc, "list");
  assert.ok(lists.some((l) => l.nodes.some((n) => n.names.some((x) => x.name === "prev"))));
});

test("linked list cycle: cycle detected", () => {
  const sc = scenes("06-linked-list/041-linked-list-cycle.ts");
  assert.ok(find(sc, "list").some((l) => l.cycleTo !== undefined));
});

test("number of islands: grid with (r, c) cursor", () => {
  const sc = scenes("11-graphs/080-number-of-islands.ts");
  assert.ok(find(sc, "grid").some((g) => g.cursor));
});

test("trie: trie panel with end-of-word nodes", () => {
  const sc = scenes("08-tries/061-implement-trie-prefix-tree.ts");
  const tries = find(sc, "trie");
  assert.ok(tries.length > 0);
  assert.ok(tries.some((t) => JSON.stringify(t.root).includes('"end":true')));
});

test("course schedule: adjacency drawn as a directed graph", () => {
  const sc = scenes("11-graphs/087-course-schedule.ts");
  const graphs = find(sc, "graph");
  assert.ok(graphs.length > 0);
  assert.ok(graphs.some((g) => g.edges.length > 0));
});

test("kth largest: heap class drawn as heap array", () => {
  const sc = scenes("09-heap-priority-queue/064-kth-largest-element-in-a-stream.ts");
  assert.ok(find(sc, "array").some((a) => a.heap));
});

test("conditions are extracted from if / while / for lines", () => {
  assert.deepEqual(conditionOf("while (lo <= hi) {"), { kind: "while", cond: "lo <= hi" });
  assert.deepEqual(conditionOf("for (let r = 0; r < s.length; r++) {"), { kind: "for", cond: "r < s.length" });
  assert.deepEqual(conditionOf("} else if (f(a) && (b || c)) x = 1;"), { kind: "if", cond: "f(a) && (b || c)" });
  assert.equal(conditionOf("const x = 1;"), null);
});

test("narration evaluates conditions using closure variables", () => {
  const src = load("11-graphs/080-number-of-islands.ts");
  const steps = traceSource(src).runs[0].steps;
  const lines = src.split("\n");
  const hints = parseHints(src);
  const checks = steps.map((_, k) => narrate(steps, k, lines, hints)).filter((n) => n.kind === "check" || n.check);
  assert.ok(checks.some((n) => /rows/.test(n.text) || /rows/.test(n.check?.cond ?? "")));
});
