// The sidebar's five tabs and the themed case-study groups.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { categoryRank, parseProblem, type Problem } from "../src/parseProblem.ts";
import { groupKeyOf, groupsFor, TABS, tabOf, THEMES } from "../src/sidebarTabs.ts";

const repo = join(import.meta.dirname, "../..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return f.endsWith(".ts") && !f.endsWith(".test.ts") ? [p] : [];
  });
const problems: Problem[] = [
  ...["neetcode-150", "system-design/primitives", "system-design/architectures", "system-design/microservices", "system-design/low-level-design", "system-design/api-design", "system-design/drills/estimation", "system-design/drills/failure", "system-design/drills/flashcards"].flatMap((d) => walk(join(repo, d))),
]
  .map((p) => parseProblem(relative(repo, p), readFileSync(p, "utf8")))
  .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.id.localeCompare(b.id));

test("every topic lands in exactly one tab, and every tab has topics", () => {
  const counts = Object.fromEntries(TABS.map((t) => [t.id, groupsFor(t.id, problems).reduce((n, g) => n + g.problems.length, 0)]));
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), problems.length);
  for (const t of TABS) assert.ok(counts[t.id] > 0, t.id);
  assert.equal(tabOf(problems.find((p) => p.id === "sd-architectures/02-url-shortener")!), "design");
  assert.equal(tabOf(problems.find((p) => p.id === "sd-microservices/01-the-price-of-a-network-hop")!), "design");
  assert.equal(tabOf(problems.find((p) => p.id === "sd-low-level-design/01-parking-lot")!), "code");
  assert.equal(tabOf(problems.find((p) => p.category === "sd-05-replication")!), "blocks");
  assert.equal(tabOf(problems.find((p) => p.category === "sd-drills-flashcards")!), "practice");
});

test("every case study has a theme, and each theme number is a real file", () => {
  const studies = problems.filter((p) => p.category === "sd-architectures");
  assert.deepEqual(studies.filter((p) => groupKeyOf(p) === "sd-architectures#other").map((p) => p.id), [], "add new case studies to THEMES");
  const numbers = THEMES.flatMap((t) => t.numbers);
  assert.equal(new Set(numbers).size, numbers.length, "a number is in two themes");
  assert.deepEqual(numbers.filter((n) => !studies.some((p) => p.number === n)), []);
});

test("the design tab: themed case studies, then microservices under their own heading", () => {
  const groups = groupsFor("design", problems);
  assert.deepEqual(groups.map((g) => g.label), [...THEMES.map((t) => t.label), "Microservices"]);
  assert.deepEqual(groups.filter((g) => g.section).map((g) => [g.label, g.section]), [["Web basics", "Case studies"], ["Microservices", "Services"]]);
  for (const g of groups) for (const p of g.problems) assert.equal(groupKeyOf(p), g.key);
});
