import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { INTERCHANGES, LINES, TOUR, allStations } from "../src/landing/stations.ts";

const ROOT = new URL("../../", import.meta.url).pathname;

/** The source file a problem id is read from (see parseProblem). */
function fileOf(id: string): string {
  const [category, file] = id.split("/");
  if (!category.startsWith("sd-")) return `neetcode-150/${category}/${file}.ts`;
  const dir = category.slice(3);
  if (/^\d\d-/.test(dir)) return `system-design/primitives/${dir}/${file}.ts`;
  if (dir.startsWith("drills-")) return `system-design/drills/${dir.slice(7)}/${file}.ts`;
  return `system-design/${dir}/${file}.ts`;
}

test("every landing station opens a real topic", () => {
  for (const s of allStations()) assert.ok(existsSync(ROOT + fileOf(s.id)), `${s.key}: ${s.id}`);
});

test("station keys are unique and the tour only visits stations", () => {
  const keys = allStations().map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of TOUR) assert.ok(keys.includes(k), k);
});

test("every interchange has a station on each of its lines", () => {
  for (const ic of INTERCHANGES)
    for (const key of ic.lines) {
      const line = LINES.find((l) => l.key === key)!;
      assert.ok(line.stations.some((s) => s.x === ic.x), `${key} at x=${ic.x}`);
    }
});
