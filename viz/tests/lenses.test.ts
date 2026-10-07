// The general lenses: reads and writes of a line, choice questions and key moments, the binary
// search number line, the tree recursion, rewired list links and backtracking verdicts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { traceSource } from "../src/tracer/trace.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import { buildStory, rangeHistory } from "../src/model/story.ts";
import { lineDeps } from "../src/model/deps.ts";
import { buildCallTree } from "../src/model/callTree.ts";

const wrap = (body: string, call: string) => `${body}\nimport { test } from "node:test";\ntest("t", () => { ${call}; });\n`;

function run(src: string, r = 0) {
  const hints = parseHints(src);
  const steps = traceSource(src).runs[r].steps;
  return { hints, steps, lines: src.split("\n"), story: buildStory(steps, hints, src.split("\n")) };
}

test("hints: moment and range are read; ask takes an expression", () => {
  const h = parseHints("// @viz range:lo..hi@mid\nx = 1; // @ask dp[i] // @moment found {x} // @say hi\n");
  assert.deepEqual(h.range, { lo: "lo", hi: "hi", mid: "mid" });
  assert.equal(h.ask[2], "dp[i]");
  assert.equal(h.moment[2], "found {x}");
  assert.equal(h.say[2], "hi");
  assert.deepEqual(h.errors, []);
});

test("reads and writes: a 2-D recurrence reads two cells and writes one", () => {
  const src = wrap(
    `export function f(): number {
  const dp = [[1, 1, 1], [1, 0, 0]];
  for (let j = 1; j < 3; j++) {
    dp[1][j] = dp[0][j] + dp[1][j - 1];
  }
  return dp[1][2];
}`,
    "f()",
  );
  const { steps, lines } = run(src);
  const k = steps.findIndex((s) => s.line === 4);
  const d = lineDeps(lines[3], steps[k]);
  assert.deepEqual(d, { dp: { write: [1, 1], reads: [[0, 1], [1, 0]] } });
  // `+=` reads the cell it writes; comparisons are reads only.
  assert.deepEqual(lineDeps("a[i] += a[i - 1];", { ...steps[k], stack: [{ fn: "x", params: [], vars: [["i", { t: "p", v: 2 }]] }] } as never), {
    a: { write: [2], reads: [[2], [1]] },
  });
  assert.deepEqual(lineDeps("if (a[i] === b[0]) x = 1;", { ...steps[k], stack: [{ fn: "x", params: [], vars: [["i", { t: "p", v: 2 }]] }] } as never), {
    a: { reads: [[2]] },
    b: { reads: [[0]] },
  });
});

test("choice questions and moments fire on any line, with the value after the line", () => {
  const src = wrap(
    `// @rule total is the sum of the numbers seen so far
export function f(nums: number[]): number {
  let total = 0;
  for (const n of nums) {
    total += n; // @ask total // @moment add {n}
  }
  return total;
}`,
    "f([2, 3, 4])",
  );
  const { story } = run(src);
  assert.ok(story);
  const asks = [...story.asks.values()];
  assert.equal(asks.length, 3);
  assert.deepEqual(asks.map((a) => a.kind === "choice" && a.answer), ["2", "5", "9"]);
  for (const a of asks) assert.ok(a.kind === "choice" && a.choices.includes(a.answer) && a.choices.length >= 3);
  assert.deepEqual(story.marks.filter((m) => m.kind === "moment").map((m) => m.label), ["add 2", "add 3", "add 4"]);
  assert.equal(story.win, null);
});

test("range: a binary search over values shrinks lo..hi, each row with its probe", () => {
  const src = wrap(
    `// @viz range:lo..hi@mid
// @rule the answer is always inside lo..hi
export function f(target: number): number {
  let lo = 1;
  let hi = 100;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (mid < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}`,
    "f(37)",
  );
  const { story, steps } = run(src);
  assert.ok(story?.range);
  assert.equal(story.range.min, 1);
  assert.equal(story.range.max, 100);
  const rows = rangeHistory(story.range, steps.length - 1);
  assert.deepEqual(rows[0].w, [1, 100]);
  assert.deepEqual(rows.at(-1)!.w, [37, 37]);
  assert.ok(rows.length <= 9, "about log2(100) probes");
  for (const r of rows) if (r.probe !== null) assert.ok(r.probe >= r.w[0] && r.probe <= r.w[1]);
});

test("tree recursion: calls record their node; backtracking marks found calls and dead ends", () => {
  const tree = wrap(
    `class N { val: number; left: N | null; right: N | null; constructor(v: number, l: N | null = null, r: N | null = null) { this.val = v; this.left = l; this.right = r; } }
export function depth(n: N | null): number {
  if (!n) return 0;
  const d = 1 + Math.max(depth(n.left), depth(n.right));
  return d;
}`,
    "depth(new N(1, new N(2), new N(3)))",
  );
  const t = buildCallTree(run(tree).steps);
  const withNode = t.nodes.filter((n) => n.node !== undefined);
  assert.equal(withNode.length, 3);
  assert.ok(withNode.every((n) => n.ret !== undefined));

  const back = wrap(
    `export function pick(nums: number[], target: number): number[][] {
  const res: number[][] = [];
  const path: number[] = [];
  const go = (i: number, left: number): void => {
    if (left === 0) { res.push([...path]); return; }
    if (i === nums.length || left < 0) return;
    path.push(nums[i]);
    go(i + 1, left - nums[i]);
    path.pop();
    go(i + 1, left);
  };
  go(0, target);
  return res;
}`,
    "pick([1, 2, 3], 3)",
  );
  const b = buildCallTree(run(back).steps);
  assert.ok(b.collects);
  assert.ok(b.nodes.some((n) => n.found) && b.nodes.some((n) => !n.found));
});

test("linked list: a rewired next pointer remembers where it pointed before", () => {
  const src = wrap(
    `class L { val: number; next: L | null; constructor(v: number, n: L | null = null) { this.val = v; this.next = n; } }
export function rev(head: L | null): L | null {
  let prev: L | null = null;
  let cur = head;
  while (cur) {
    const nxt = cur.next;
    cur.next = prev;
    prev = cur;
    cur = nxt;
  }
  return prev;
}`,
    "rev(new L(1, new L(2, new L(3))))",
  );
  const { steps, hints } = run(src);
  const was = steps.flatMap((s, k) =>
    buildScene(steps[k + 1] ?? s, s, hints).panels.flatMap((p) => (p.kind === "list" ? p.nodes.filter((n) => n.was !== undefined).map((n) => `${n.label} was ${n.was}`) : [])),
  );
  assert.ok(was.includes("1 was 2"), was.join("; "));
  assert.ok(was.includes("2 was 3"), was.join("; "));
});

test("reads and writes: a one-line if reads in its condition and writes in its statement", () => {
  const step = { line: 1, event: "line", heap: {}, stack: [{ fn: "x", params: [], vars: [["t", { t: "p", v: 5 }], ["n", { t: "p", v: 2 }]] }] } as never;
  assert.deepEqual(lineDeps("if (dp[t - n]) dp[t] = true;", step), { dp: { write: [5], reads: [[3]] } });
});

test("ask answers read the cell the line wrote, even when the loop index moves on right after", () => {
  const src = wrap(
    `// @rule row[j] counts the paths from column j
export function f(): number {
  const row = [1, 1, 1, 1];
  for (let j = 2; j >= 0; j--) {
    row[j] += row[j + 1]; // @ask row[j]
  }
  return row[0];
}`,
    "f()",
  );
  const { story } = run(src);
  assert.deepEqual([...story!.asks.values()].map((a) => a.kind === "choice" && a.answer), ["2", "3", "4"]);
});

test("asks fire on a line that calls a function, with the value once the call is back", () => {
  const src = wrap(
    `// @rule h is the height below n
const sq = (x: number): number => x * x;
export function f(): number {
  let t = 0;
  for (let i = 1; i <= 3; i++) {
    t += sq(i); // @ask t // @moment add {i}
  }
  return t;
}`,
    "f()",
  );
  const { story } = run(src);
  assert.deepEqual([...story!.asks.values()].map((a) => a.kind === "choice" && a.answer), ["1", "5", "14"]);
  assert.deepEqual(story!.marks.filter((m) => m.kind === "moment").map((m) => m.label), ["add 1", "add 2", "add 3"]);
});
