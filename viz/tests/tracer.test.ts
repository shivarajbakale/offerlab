import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { traceSource } from "../src/tracer/trace.ts";
import type { Step } from "../src/tracer/types.ts";

const problem = (path: string) =>
  readFileSync(join(import.meta.dirname, "../../neetcode-150", path), "utf8");

const varsOf = (step: Step) => Object.fromEntries(step.stack.at(-1)!.vars);

test("two sum: one run per assert, labelled with args and result", () => {
  const trace = traceSource(problem("01-arrays-hashing/003-two-sum.ts"));
  assert.equal(trace.error, undefined);
  assert.ok(trace.runs.length >= 2);
  assert.match(trace.runs[0].label, /^twoSum\(\[2,7,11,15\], 9\) → \[0,1\]$/);
  assert.equal(trace.runs[0].passed, true);
  const first = trace.runs[0].steps[0];
  assert.equal(first.event, "call");
  assert.deepEqual(Object.keys(varsOf(first)), ["nums", "target"]);
  assert.equal(trace.runs[0].steps.at(-1)!.event, "return");
});

test("invert tree: call stack depth reaches the tree height", () => {
  const trace = traceSource(problem("07-trees/046-invert-binary-tree.ts"));
  const depth = Math.max(...trace.runs[0].steps.map((s) => s.stack.length));
  assert.equal(depth, 4); // 3 levels of nodes + the null-child call
  // buildTree / toArray helpers are not traced
  for (const s of trace.runs[0].steps) for (const f of s.stack) assert.equal(f.fn, "invertTree");
});

test("heap ids stay stable across steps", () => {
  const trace = traceSource(problem("07-trees/046-invert-binary-tree.ts"));
  const steps = trace.runs[0].steps;
  const rootId = (s: Step) => {
    const v = s.stack[0].vars.find(([k]) => k === "root")![1];
    return v.t === "r" ? v.id : null;
  };
  assert.ok(rootId(steps[0]) !== null);
  assert.equal(rootId(steps[0]), rootId(steps.at(-1)!));
});

test("design class calls on one instance form a single run", () => {
  const trace = traceSource(problem("06-linked-list/043-lru-cache.ts"));
  assert.match(trace.runs[0].label, /^LRUCache: new\(2\), put, put, get/);
  const vars = varsOf(trace.runs[0].steps.at(-1)!);
  assert.ok("this" in vars);
});

test("long loops are truncated at the per-run step cap", () => {
  const src = `import { test } from "node:test";
    export function spin(): number { let i = 0; for (let k = 0; k < 100000; k++) i++; return i; }
    test("x", () => { spin(); });`;
  const limits = { maxStepsPerRun: 50, maxTotalSteps: 100, maxHeapObjects: 10, maxItems: 10 };
  const trace = traceSource(src, limits);
  assert.equal(trace.runs[0].truncated, true);
  assert.equal(trace.runs[0].steps.length, 50);
  assert.match(trace.runs[0].label, /→ 100000$/);
});

test("runtime errors inside the solution are reported on the run", () => {
  const src = `import { test } from "node:test";
    export function boom(a: number[]): number { const x = a.length; return (null as any).y + x; }
    test("x", () => { boom([1]); });`;
  const trace = traceSource(src);
  assert.match(trace.runs[0].error ?? "", /TypeError/);
  assert.ok(trace.runs[0].steps.length > 0);
});

test("call tree: sibling calls with no step between them are siblings", async () => {
  const { buildCallTree } = await import("../src/model/callTree.ts");
  const src = `import { test } from "node:test";
    export function f(n: number): number { if (n < 2) return n; return f(n - 1) + f(n - 2); }
    test("x", () => { f(3); });`;
  const tree = buildCallTree(traceSource(src).runs[0].steps);
  const labels = tree.nodes.map((n) => `${n.label}<${n.parent === null ? "-" : tree.nodes[n.parent].label}`);
  assert.deepEqual(labels, ["f(3)<-", "f(2)<f(3)", "f(1)<f(2)", "f(0)<f(2)", "f(1)<f(3)"]);
  assert.equal(tree.recursive, true);
});

test("call tree: separate top-level design-class calls are roots", async () => {
  const { buildCallTree } = await import("../src/model/callTree.ts");
  const tree = buildCallTree(traceSource(problem("08-tries/061-implement-trie-prefix-tree.ts")).runs[0].steps);
  assert.ok(tree.nodes.filter((n) => n.parent === null).length > 3);
  assert.equal(tree.recursive, false);
});

const SCENARIO_SRC = `
import { test } from "node:test";
import assert from "node:assert/strict";
export class Counter {
  n = 0;
  add(k: number) {
    this.n += k; // @mark add
    return this.n;
  }
}
// --- helpers for the scenarios ---
function addMany(c: Counter, times: number) {
  for (let i = 0; i < times; i++) c.add(1);
}
test("first: two adds", () => {
  const c = new Counter();
  c.add(1);
  c.add(2);
  assert.equal(c.n, 3);
});
test("second: asserts before any call", () => {
  assert.equal(1, 2);
  const c = new Counter();
  c.add(5);
});
test("quiet: bulk adds are not traced", () => {
  const c = new Counter();
  addMany(c, 1000);
  c.add(1);
  assert.equal(c.n, 1001);
});
test("empty: no traced calls", () => {
  assert.ok(true);
});
`;

test("scenario mode: one run per test, labelled by the test name", () => {
  const trace = traceSource(SCENARIO_SRC, undefined, { scenarios: true });
  assert.equal(trace.error, undefined);
  assert.deepEqual(trace.runs.map((r) => r.label), [
    "first: two adds",
    "second: asserts before any call",
    "quiet: bulk adds are not traced",
  ]);
  const adds = trace.runs[0].steps.filter((s) => s.event === "call" && s.stack.at(-1)!.fn === "Counter.add");
  assert.equal(adds.length, 2);
});

test("scenario mode: asserts belong to their own scenario", () => {
  const trace = traceSource(SCENARIO_SRC, undefined, { scenarios: true });
  assert.equal(trace.runs[0].passed, true);
  assert.equal(trace.runs[1].passed, false);
});

test("scenario mode: quiet helpers and everything they call run silently", () => {
  const trace = traceSource(SCENARIO_SRC, undefined, { scenarios: true });
  const calls = trace.runs[2].steps.filter((s) => s.event === "call" && s.stack.at(-1)!.fn === "Counter.add");
  assert.equal(calls.length, 1);
  assert.equal(trace.runs[2].truncated, false);
});

test("scenario mode is off by default: runs are per instance, labelled by class", () => {
  const trace = traceSource(SCENARIO_SRC);
  assert.match(trace.runs[0].label, /^Counter: add, add$/);
  assert.ok(trace.runs.every((r) => !r.label.includes(":") || r.label.startsWith("Counter: ")));
});

test("an exported subclass with its own constructor traces without touching this before super()", () => {
  const src = `
import { test } from "node:test";
import assert from "node:assert/strict";
export class Base {
  k: number;
  constructor(k: number) {
    this.k = k;
  }
  twice() {
    return this.k * 2;
  }
}
export class One extends Base {
  extra = 5;
  constructor() {
    super(1);
    this.extra = 7;
  }
  bump() {
    return this.extra + 1;
  }
}
test("one", () => {
  const o = new One();
  assert.equal(o.twice() + o.bump(), 10);
});
`;
  const trace = traceSource(src, undefined, { scenarios: true });
  assert.equal(trace.error, undefined);
  assert.equal(trace.runs.length, 1);
  assert.equal(trace.runs[0].error, undefined);
  assert.equal(trace.runs[0].passed, true);
  assert.ok(trace.runs[0].steps.some((s) => s.stack.some((f) => f.fn === "new One")), "constructor is traced");
});
