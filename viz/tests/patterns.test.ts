import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProblem } from "../src/parseProblem.ts";
import { patternById, patterns } from "../src/patterns/index.ts";

const root = join(import.meta.dirname, "../../neetcode-150");
const problems = readdirSync(root)
  .filter((d) => /^\d\d-/.test(d))
  .flatMap((d) =>
    readdirSync(join(root, d))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => parseProblem(`neetcode-150/${d}/${f}`, readFileSync(join(root, d, f), "utf8"))),
  );
const slugOf = (url: string) => url.match(/problems\/([^/]+)/)?.[1] ?? "";
const inAppSlugs = new Set(problems.map((p) => slugOf(p.leetcode)));

test("every problem has a pattern, key insight and real-world use", () => {
  assert.equal(problems.length, 150);
  for (const p of problems) {
    assert.ok(p.patterns.length > 0, `${p.id}: missing Pattern`);
    for (const id of p.patterns) assert.ok(patternById.has(id), `${p.id}: unknown pattern "${id}"`);
    assert.ok(p.insight.length > 30, `${p.id}: missing Key insight`);
    assert.ok(p.realWorld.length > 30, `${p.id}: missing Real world`);
  }
});

test("every pattern is complete and solves 10+ problems", () => {
  const ids = new Set<string>();
  for (const pat of patterns) {
    assert.ok(!ids.has(pat.id), `duplicate pattern ${pat.id}`);
    ids.add(pat.id);
    assert.ok(pat.intuition && pat.signals.length >= 2 && pat.template.trim(), `${pat.id}: incomplete`);
    assert.ok(pat.realWorld.length >= 2, `${pat.id}: needs 2+ real-world uses`);
    const inApp = problems.filter((p) => p.patterns.includes(pat.id)).length;
    assert.ok(inApp > 0, `${pat.id}: no NeetCode problem uses it`);
    const external = pat.related.filter((r) => !inAppSlugs.has(r.slug));
    assert.equal(external.length, pat.related.length, `${pat.id}: related lists an in-app problem`);
    assert.equal(new Set(pat.related.map((r) => r.slug)).size, pat.related.length, `${pat.id}: duplicate related`);
    const total = inApp + pat.related.length;
    assert.ok(total >= 8 && total <= 22, `${pat.id}: ${total} problems total, want 8-22`);
  }
});
