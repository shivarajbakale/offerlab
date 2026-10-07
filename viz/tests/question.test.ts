// The question shown before the solution, and the progress kept per problem.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProblem } from "../src/parseProblem.ts";
import { EMPTY, entryOf, hideAgain, isRevealed, mark, openHint, reveal, setShowAll, tally } from "../src/progress.ts";

const root = join(import.meta.dirname, "../../neetcode-150");
const problems = readdirSync(root)
  .filter((d) => /^\d+-/.test(d))
  .flatMap((d) => readdirSync(join(root, d)).map((f) => parseProblem(`neetcode-150/${d}/${f}`, readFileSync(join(root, d, f), "utf8"))));
const byId = (id: string) => problems.find((p) => p.id === id)!;

test("every NeetCode problem has a statement, examples and constraints", () => {
  assert.equal(problems.length, 150);
  for (const p of problems) {
    assert.ok(p.statement.length, `${p.id} statement`);
    assert.ok(p.examples.length, `${p.id} examples`);
    assert.ok(p.examples.every((e) => /Input/.test(e.body)), `${p.id} example input`);
    assert.ok(p.constraints.length, `${p.id} constraints`);
    // The question never leaks the approach.
    assert.ok(!p.statement.join(" ").includes("Approach"), `${p.id} approach`);
  }
});

test("wrapped lines join; indented lines keep their own line", () => {
  const two = byId("01-arrays-hashing/003-two-sum");
  assert.equal(two.statement.length, 1);
  assert.ok(!two.statement[0].includes("\n"));
  assert.deepEqual(two.examples[0], { title: "Example 1", body: "Input: nums = [2, 7, 11, 15], target = 9\nOutput: [0, 1]" });
  assert.deepEqual(two.constraints, ["2 <= nums.length <= 10^4", "-10^9 <= nums[i], target <= 10^9", "Exactly one valid answer exists."]);

  const regex = byId("14-2d-dynamic-programming/121-regular-expression-matching");
  assert.deepEqual(regex.statement[0].split("\n").slice(1), [
    "'.' matches any single character",
    "'*' matches zero or more of the element right before it",
    "The match must cover the entire string, not just part of it.",
  ]);
  // A wrapped list item stays one line.
  const lru = byId("06-linked-list/043-lru-cache");
  assert.ok(lru.statement[0].split("\n").some((l) => l.startsWith("- get(key)") && l.includes("otherwise -1.")));
});

test("progress: hints and reveal count as an attempt; solved remembers how", () => {
  const id = "x";
  let p = openHint(EMPTY, id, 1);
  assert.equal(entryOf(p, id).status, "attempted");
  assert.equal(isRevealed(p, id), false);
  p = openHint(openHint(openHint(p, id, 2), id, 3), id, 4);
  assert.equal(entryOf(p, id).hints, 3);
  p = mark(p, id, "solved", 5);
  assert.deepEqual(entryOf(p, id).solvedWith, { hints: 3, revealed: false });
  p = reveal(p, id, 6);
  assert.equal(entryOf(p, id).status, "solved");
  assert.equal(isRevealed(p, id), true);
  p = hideAgain(p, id, 7);
  assert.equal(isRevealed(p, id), false);
  assert.equal(entryOf(p, id).hints, 0);
  assert.equal(entryOf(p, id).status, "solved");
  p = mark(p, id, undefined, 8);
  assert.equal(entryOf(p, id).status, undefined);
  assert.equal(isRevealed(setShowAll(p, true), id), true);
  assert.deepEqual(tally(mark(openHint(p, "y", 9), id, "solved", 10), [id, "y", "z"]), { solved: 1, attempted: 1 });
});
