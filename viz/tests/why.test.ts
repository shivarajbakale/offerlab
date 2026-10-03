// Every solution carries line-by-line `// @why` notes for the code panel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isWhyLine, parseProblem } from "../src/parseProblem.ts";

const root = join(import.meta.dirname, "../../neetcode-150");
const files = readdirSync(root)
  .filter((d) => !d.includes("."))
  .flatMap((d) =>
    readdirSync(join(root, d))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `neetcode-150/${d}/${f}`),
  );

/** A line worth explaining: real code, not a blank, comment or lone closing bracket. */
const meaningful = (line: string) => {
  const t = line.trim();
  return t !== "" && !t.startsWith("//") && !/^[})\];,\s]+$/.test(t);
};

test("parses @why lines onto the code line below", () => {
  const src = [
    "/**", " * 1. Demo", " */", "", "export function f(a: number[]) {",
    "  // @why Start from zero so an empty array sums to 0.", "  let s = 0;",
    "  // @why Two-line notes", "  // @why are joined.", "  for (const x of a) s += x;",
    "  return s;", "}",
  ].join("\n");
  const p = parseProblem("neetcode-150/01-demo/001-demo.ts", src);
  assert.deepEqual(p.why, { 7: "Start from zero so an empty array sums to 0.", 10: "Two-line notes are joined." });
});

test("every problem explains its code line by line", () => {
  const issues: string[] = [];
  for (const path of files) {
    const p = parseProblem(path, readFileSync(join(root, "..", path), "utf8"));
    const name = path.split("/").pop();
    p.lines.forEach((line, i) => {
      if (!isWhyLine(line) || isWhyLine(p.lines[i + 1] ?? "")) return;
      const target = i + 2;
      if (target < p.codeStart || target > p.codeEnd || !meaningful(p.lines[target - 1] ?? ""))
        issues.push(`${name}:${i + 1} @why does not sit above a code line in the solution`);
    });
    for (const [n, text] of Object.entries(p.why)) {
      if (text.length < 8 || text.length > 220) issues.push(`${name}:${n} @why is ${text.length} chars`);
    }
    let total = 0;
    let covered = 0;
    for (let n = p.codeStart; n <= p.codeEnd; n++) {
      const line = p.lines[n - 1];
      if (!meaningful(line)) continue;
      total++;
      if (p.why[n]) covered++;
    }
    if (total && covered / total < 0.6) issues.push(`${name}: only ${covered}/${total} code lines have @why`);
  }
  assert.deepEqual(issues, []);
});
