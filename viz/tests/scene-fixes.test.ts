// Scene, hints and tracer edge cases: name clashes between fields and locals, `hide:` on
// `this` fields, long strings in array cells, hint mistakes, and how the tracer groups steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { arrayCellSize } from "../src/components/views/layout.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import type { BitsPanel } from "../src/model/systems/bits.ts";
import type { SystemsCtx } from "../src/model/systems/types.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";
import type { Step } from "../src/tracer/types.ts";

const scenario = (src: string) => {
  const trace = traceSource(src, SYSTEMS_LIMITS, { scenarios: true });
  assert.equal(trace.error, undefined);
  return { steps: trace.runs[0].steps, hints: parseHints(src) };
};
/** The scene the app shows at a mark: the state just after the marked line ran. */
const sceneAt = (src: string, mark: string, nth = 1) => {
  const { steps, hints } = scenario(src);
  const line = hints.marks[mark];
  const hits = steps.flatMap((s, i) => (s.line === line && steps[i - 1]?.line !== line ? [i] : []));
  const i = hits[nth - 1];
  assert.ok(i !== undefined, `mark ${mark}#${nth} not reached`);
  return { scene: buildScene(steps[i + 1] ?? steps[i], steps[i], hints), step: steps[i], next: steps[i + 1], hints };
};

const CLASH_SRC = `
import { test } from "node:test";
export class Greeter {
  name = "world";
  greet(name: string) {
    const out = "hi " + name; // @mark greet
    return out;
  }
}
test("greet", () => { new Greeter().greet("alice"); });
`;

test("a string parameter named like a field gets one char panel, showing the parameter", () => {
  const { scene } = sceneAt(CLASH_SRC, "greet");
  const keys = scene.panels.map((p) => p.key);
  assert.deepEqual(keys, [...new Set(keys)], "panel keys must be unique");
  const chars = scene.panels.filter((p) => p.key === "str:name");
  assert.equal(chars.length, 1);
  assert.equal(chars[0].kind === "array" && chars[0].cells.map((c) => c.text).join(""), "alice");
});

const HIDE_SRC = `
import { test } from "node:test";
export class Filter {
  // @viz bits:bits,touched,verdict hide:item,verdict
  bits = [0, 0, 0, 0];
  touched: number[] = [];
  verdict = "";
  add(item: string, at: number[]) {
    this.touched = at;
    for (const p of at) this.bits[p] = 1;
    this.verdict = "added " + item; // @mark added
    return this.verdict;
  }
}
test("hide", () => {
  const f = new Filter();
  f.add("a", [1]);
  f.add("b", [2]);
});
`;

test("hide: drops a this-field from the scalars, while systems views still see it", () => {
  const { scene } = sceneAt(HIDE_SRC, "added", 2);
  assert.deepEqual(scene.scalars.map((s) => s.name).filter((n) => n === "verdict" || n === "item"), []);
  const bits = scene.panels.find((p): p is BitsPanel => p.kind === "bits");
  assert.equal(bits?.verdict, "added b");
  assert.equal(bits?.item, "b");
});

test("hide: a systems view's find and findPrev agree on hidden variables", () => {
  const { step, next, hints } = sceneAt(HIDE_SRC, "added", 2);
  const seen: Record<string, boolean> = {};
  const probe = (ctx: SystemsCtx) => {
    seen.find = ctx.find("verdict") !== undefined;
    seen.findPrev = ctx.findPrev("verdict") !== undefined;
    seen.findItem = ctx.find("item") !== undefined;
    seen.findPrevItem = ctx.findPrev("item") !== undefined;
    return null;
  };
  buildScene(next, step, hints, { bits: probe });
  assert.deepEqual(seen, { find: true, findPrev: true, findItem: true, findPrevItem: true });
});

const FRAME_SRC = `
import { test } from "node:test";
export class Filter {
  // @viz bits:bits,touched,verdict
  bits = [0, 0, 0, 0];
  touched: number[] = [];
  verdict = "";
  add(word: string, at: number[]) {
    this.touched = at;
    this.verdict = "added " + word; // @mark added
  }
}
export function feed(item: string, f: Filter) {
  f.add("other", [1]);
}
test("frames", () => { feed("outer", new Filter()); });
`;

test("bits: the item label comes from the frame that owns the cells, not any frame with an item", () => {
  const { scene } = sceneAt(FRAME_SRC, "added");
  const bits = scene.panels.find((p): p is BitsPanel => p.kind === "bits");
  assert.ok(bits);
  assert.equal(bits.item, undefined);
});

test("array cells widen to fit their longest text, up to a limit", () => {
  assert.equal(arrayCellSize(3, 1), 44);
  assert.ok(arrayCellSize(6, "user:1".length) >= "user:1".length * 8 + 12, "user:1 fits");
  assert.ok(arrayCellSize(30, 1) <= 30);
  assert.ok(arrayCellSize(3, 200) <= 140);
});

test("parseHints reports duplicate marks, unknown view kinds and @say with @mark on one line", () => {
  const src = [
    "// @viz array:a sparkles:x",
    "let a = 1; // @mark one",
    "let b = 2; // @mark one",
    "let c = 3; // @say c is three // @mark three",
  ].join("\n");
  const errors = parseHints(src).errors;
  assert.equal(errors.length, 3, errors.join("\n"));
  assert.match(errors[0], /line 1.*sparkles/);
  assert.match(errors[1], /line 3.*one/);
  assert.match(errors[2], /line 4.*@say.*@mark/);
  assert.deepEqual(parseHints("// @viz array:a hide:x grid:g labels:c,r bits:a,b\nx; // @mark m").errors, []);
});

test("every solution and primitive has well-formed hints", () => {
  const roots = ["../../neetcode-150", "../../system-design/primitives"].map((r) => join(import.meta.dirname, r));
  const problems: string[] = [];
  for (const root of roots) {
    for (const dir of readdirSync(root).filter((d) => !d.includes("."))) {
      for (const f of readdirSync(join(root, dir)).filter((x) => x.endsWith(".ts"))) {
        for (const e of parseHints(readFileSync(join(root, dir, f), "utf8")).errors) problems.push(`${dir}/${f}: ${e}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("grid labels: a labels: hint names the columns and rows", () => {
  const src = `
import { test } from "node:test";
export class T {
  // @viz grid:scores labels:servers,keys
  servers = ["A", "B"];
  keys = ["k1", "k2", "k3"];
  scores = [[1, 2], [3, 4], [5, 6]];
  touch() {
    this.scores[0][0] = 9; // @mark touch
  }
}
test("t", () => { new T().touch(); });
`;
  const { scene } = sceneAt(src, "touch");
  const grid = scene.panels.find((p) => p.kind === "grid");
  assert.ok(grid && grid.kind === "grid");
  assert.deepEqual(grid.colLabels, ["A", "B"]);
  assert.deepEqual(grid.rowLabels, ["k1", "k2", "k3"]);
});

const LOOP_SRC = `
import { test } from "node:test";
export class Bumper {
  cells = [0, 0, 0];
  bump(at: number[]) {
    for (const p of at) this.cells[p] += 1; // @mark bump
    return this.cells;
  }
}
test("loop", () => { new Bumper().bump([0, 1, 2]); });
`;

test("tracer: a one-line for-of loop gives one step per iteration", () => {
  const { steps, hints } = scenario(LOOP_SRC);
  const onLine = steps.filter((s: Step) => s.line === hints.marks.bump && s.event === "line");
  assert.ok(onLine.length >= 3, `${onLine.length} steps on the loop line`);
});

test("tracer: a subclass whose only member is a constructor is traced", () => {
  const src = `
import { test } from "node:test";
export class Base {
  k: number;
  constructor(k: number) {
    this.k = k;
  }
  get() {
    return this.k;
  }
}
export class One extends Base {
  constructor() {
    super(1);
  }
}
test("one", () => { new One().get(); });
`;
  const { steps } = scenario(src);
  assert.ok(steps.some((s) => s.stack.some((f) => f.fn === "new One")), "the subclass constructor is traced");
});

test("tracer: in algorithm mode, a derived constructor and later calls on the instance form one run", () => {
  const src = `
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
  constructor() {
    super(1);
  }
  bump() {
    return this.k + 1;
  }
}
const o = new One();
assert.equal(o.twice() + o.bump(), 4);
`;
  const trace = traceSource(src);
  assert.equal(trace.error, undefined);
  assert.deepEqual(trace.runs.map((r) => r.label), ["One: new(), twice, bump"]);
});
