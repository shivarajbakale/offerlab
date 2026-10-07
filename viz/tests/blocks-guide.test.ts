// The Blocks map and "which one when" lists point at real blocks, and every block appears on the map.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BEHIND, BLOCK_IDS, CHOOSERS, STOPS } from "../src/blocksGuide.ts";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../../system-design/primitives");
const blocks = readdirSync(root).flatMap((g) =>
  readdirSync(join(root, g))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `sd-${g}/${f.slice(0, -3)}`),
);

test("blocks guide: every id is a real block, and every block is on the map and in a chooser", () => {
  for (const id of Object.values(BLOCK_IDS)) assert.ok(blocks.includes(id), id);
  const onMap = new Set([...STOPS, ...BEHIND].flatMap((s) => s.blocks));
  const chosen = new Set(Object.values(CHOOSERS).flat().map((c) => c.pick));
  for (const id of blocks) {
    assert.ok(onMap.has(id), `${id} is not on the map`);
    assert.ok(chosen.has(id), `${id} is not in a chooser`);
  }
  for (const [group, list] of Object.entries(CHOOSERS)) for (const c of list) assert.ok(c.pick.startsWith(group), `${c.pick} under ${group}`);
});
