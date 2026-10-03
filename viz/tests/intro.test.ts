// Lesson openers ("What it is") and the tab overviews built from them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { introProblems, oneLiner, readIntro } from "../src/sim/intro.ts";
import { parseLesson } from "../src/sim/lesson.ts";
import { GROUP_INTROS } from "../src/overviews.ts";
import { THEMES } from "../src/sidebarTabs.ts";

const ok = `# X

## What it is

- **What it is:** A way to decide which server stores each key on a ring of hashes.
- **The problem it solves:** Mod hashing moves almost every key when a server joins. This moves about 1/N.
- **Reach for it when:** The server set changes while the system runs and moving data costs real time.
- **Not the right tool when:** The server list is fixed, so plain mod hashing is simpler and just as good.
- **Where you'll meet it:** Amazon Dynamo, Apache Cassandra and memcached client libraries; compare with [rendezvous](#/sd-01-partitioning/002-rendezvous-hashing).

## Words we'll use
`;
const ids = new Set(["sd-01-partitioning/002-rendezvous-hashing"]);

test("a complete opener has no problems, and its one-liner is the first sentence of what it solves", () => {
  const lesson = parseLesson(ok);
  assert.deepEqual(introProblems(lesson, "concept", ids), []);
  assert.equal(readIntro(lesson)[0].label, "What it is");
  assert.equal(oneLiner(lesson), "Mod hashing moves almost every key when a server joins.");
});

test("an opener is caught when out of place, out of order, too thin, or linking nowhere", () => {
  assert.match(introProblems(parseLesson(ok.replace("## What it is", "## Intro")), "concept", ids)[0], /first section must be "What it is"/);
  const swapped = ok.replace("**Reach for it when:**", "**Use it when:**");
  assert.ok(introProblems(parseLesson(swapped), "concept", ids).some((p) => p.includes("bullets must be, in order")));
  assert.ok(introProblems(parseLesson(ok.replace(/(\*\*What it is:\*\*).*/, "$1 A ring.")), "concept", ids).some((p) => /too short/.test(p)));
  assert.ok(introProblems(parseLesson(ok), "concept", new Set()).some((p) => p.includes("names no topic")));
  assert.ok(introProblems(parseLesson(ok), "study", ids).length > 0, "a case study asks different questions");
});

test("every case-study theme and every fixed group has an overview blurb", () => {
  for (const t of THEMES) assert.ok(GROUP_INTROS[`sd-architectures#${t.key}`], t.key);
  for (const g of ["sd-microservices", "sd-low-level-design", "sd-api-design", "sd-drills-estimation", "sd-drills-failure", "sd-drills-flashcards"]) assert.ok(GROUP_INTROS[g], g);
});
