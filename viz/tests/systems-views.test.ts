// The systems view registry: @viz <kind>: hints become panels, and what a view draws is not drawn twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import { buildSystemsPanels, findVar, sceneVars, toJs } from "../src/model/systems/index.ts";
import type { SystemsCtx } from "../src/model/systems/types.ts";
import { traceSource } from "../src/tracer/trace.ts";

const SRC = `
import { test } from "node:test";
export class Tree {
  // @viz pages:root
  root = { keys: [1, 2], children: [{ keys: [1], children: [] }, { keys: [2], children: [] }] };
  tokens = [{ hash: 5, node: "a" }];
  get(k: number) {
    const found = this.root.keys.includes(k); // @mark get
    return found;
  }
}
test("one: get", () => { new Tree().get(1); });
`;

const step = () => traceSource(SRC, undefined, { scenarios: true }).runs[0].steps.at(-1)!;
const varsOf = sceneVars;

const fakePages = (ctx: SystemsCtx) => {
  const v = ctx.find(ctx.args[0]);
  return v?.t === "r" ? { panel: { kind: "pages" as const, key: "pages:x", name: "root", levels: [] }, uses: [v.id] } : null;
};

test("parseHints reads systems view hints", () => {
  assert.deepEqual(parseHints("// @viz ring:tokens,keys array:a").systems, [{ kind: "ring", args: ["tokens", "keys"] }]);
});

test("findVar and toJs read this-fields and dotted paths", () => {
  const s = step();
  const vars = varsOf(s);
  assert.deepEqual((toJs(s, findVar(s, vars, "root")) as { keys: number[] }).keys, [1, 2]);
  assert.deepEqual(toJs(s, findVar(s, vars, "root.keys")), [1, 2]);
  assert.equal(toJs(s, findVar(s, vars, "found")), true);
  assert.equal(findVar(s, vars, "nope"), undefined);
});

test("registry: a builder's panel is added and its uses are reported", () => {
  const s = step();
  const out = buildSystemsPanels(s, undefined, parseHints("// @viz pages:root"), varsOf(s), { pages: fakePages });
  assert.equal(out.panels.length, 1);
  assert.equal(out.uses.size, 1);
});

test("consumed ids are not drawn twice", () => {
  const scene = buildScene(step(), undefined, parseHints(SRC), { pages: fakePages });
  assert.equal(scene.panels.filter((p) => p.kind === "pages").length, 1);
  assert.equal(scene.panels.filter((p) => p.kind === "trie").length, 0);
});
