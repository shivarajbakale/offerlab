// PagesView builder: a B+ tree drawn level by level, with the search path hot and leaf links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHints } from "../src/model/hints.ts";
import { buildScene, type Panel } from "../src/model/scene.ts";
import type { PagesPanel } from "../src/model/systems/pages.ts";
import { markStep } from "../src/sim/lesson.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const SRC = `
import { test } from "node:test";
type Page = { id: number; keys: number[]; children?: Page[]; values?: string[]; next: Page | null };
export class Tree {
  // @viz pages:root,path
  root: Page;
  path: number[] = [];
  constructor() {
    const b: Page = { id: 3, keys: [5, 7], values: ["e", "g"], next: null };
    const a: Page = { id: 2, keys: [1, 2], values: ["a", "b"], next: b };
    this.root = { id: 1, keys: [5], children: [a, b], next: null };
  }
  get(k: number) {
    this.path = [];
    let page = this.root;
    this.path.push(page.id);
    page = page.children![k < 5 ? 0 : 1];
    this.path.push(page.id); // @mark leaf
    page.keys.push(9); // @mark grow
    const fresh: Page = { id: 4, keys: [8], values: ["h"], next: null };
    const stack = [this.root, page]; // @mark fresh
    return fresh.id + stack.length;
  }
}
test("get: finds", () => { new Tree().get(7); });
`;

function panelAfter(mark: string): { panel: PagesPanel; panels: Panel[] } {
  const run = traceSource(SRC, SYSTEMS_LIMITS, { scenarios: true }).runs[0];
  const hints = parseHints(SRC);
  const i = markStep(run.steps, hints.marks[mark]);
  assert.ok(i >= 0);
  const scene = buildScene(run.steps[i + 1], run.steps[i], hints);
  const panel = scene.panels.find((p): p is PagesPanel => p.kind === "pages");
  assert.ok(panel, "a pages panel");
  return { panel, panels: scene.panels };
}

test("pages: one row per level, leaves at the bottom, with children and leaf links", () => {
  const { panel } = panelAfter("leaf");
  assert.deepEqual(
    panel.levels.map((row) => row.map((p) => [p.id, p.keys, p.leaf])),
    [
      [[1, ["5"], false]],
      [
        [2, ["1", "2"], true],
        [3, ["5", "7"], true],
      ],
    ],
  );
  assert.deepEqual(panel.levels[0][0].children, [2, 3]);
  assert.equal(panel.levels[1][0].next, 3);
  assert.equal(panel.levels[1][1].next, undefined);
});

test("pages: pages on the current path are hot", () => {
  const { panel } = panelAfter("leaf");
  assert.deepEqual(
    panel.levels.flat().filter((p) => p.hot).map((p) => p.id),
    [1, 3],
  );
});

test("pages: only the page that changed is flagged", () => {
  const { panel } = panelAfter("grow");
  assert.deepEqual(
    panel.levels.flat().filter((p) => p.changed).map((p) => p.id),
    [3],
  );
  assert.deepEqual(panel.levels[1][1].keys, ["5", "7", "9"]);
});

test("pages: pages are not also drawn as a trie, a list, an object or arrays", () => {
  const { panels } = panelAfter("leaf");
  assert.deepEqual(
    panels.filter((p) => p.kind !== "pages").map((p) => `${p.kind}:${p.name}`),
    [],
  );
});

test("pages: a page not yet linked into the tree is drawn apart, and arrays of pages are consumed", () => {
  const { panel, panels } = panelAfter("grow");
  assert.equal(panel.detached, undefined);
  const after = panelAfter("fresh");
  assert.deepEqual(
    after.panel.detached?.map((p) => [p.id, p.keys, p.names]),
    [[4, ["8"], ["fresh"]]],
  );
  assert.deepEqual(
    after.panels.filter((p) => p.kind !== "pages").map((p) => `${p.kind}:${p.name}`),
    [],
  );
  assert.ok(panels.length >= 1);
});

test("pages: a page carries the names of the locals that point at it", () => {
  const { panel } = panelAfter("leaf");
  assert.deepEqual(panel.levels[1][1].names, ["page"]);
  assert.deepEqual(panel.levels[0][0].names, []);
});
