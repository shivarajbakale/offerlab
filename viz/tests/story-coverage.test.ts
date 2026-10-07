// Every algorithm solution tells a story: a rule that must stay true, and at least one
// "what happens next?" question that actually fires in one of its runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { traceSource } from "../src/tracer/trace.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildStory } from "../src/model/story.ts";

const root = join(import.meta.dirname, "../../neetcode-150");
const files = readdirSync(root)
  .filter((d) => !d.includes("."))
  .flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith(".ts")).map((f) => join(d, f)));

test("every solution has a rule and a question that fires", () => {
  const issues: string[] = [];
  for (const path of files) {
    const src = readFileSync(join(root, path), "utf8");
    const hints = parseHints(src);
    const name = path.split("/").pop();
    if (hints.errors.length) issues.push(`${name}: ${hints.errors.join("; ")}`);
    if (!hints.rule) issues.push(`${name}: no @rule`);
    if (Object.keys(hints.ask).length === 0) {
      issues.push(`${name}: no @ask`);
      continue;
    }
    const lines = src.split("\n");
    const fires = traceSource(src).runs.some((r) => (buildStory(r.steps, hints, lines)?.asks.size ?? 0) > 0);
    if (!fires) issues.push(`${name}: no @ask fires in any run`);
  }
  assert.deepEqual(issues, []);
});
