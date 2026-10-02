// Parses one NeetCode solution file into display metadata. Pure, so tests can use it.

import { parseHints, type Hints } from "./model/hints.ts";

export type Problem = {
  /** e.g. "07-trees/046-invert-binary-tree" */
  id: string;
  category: string;
  categoryLabel: string;
  number: string;
  title: string;
  leetcode: string;
  difficulty: string;
  approachName: string;
  approach: string;
  complexity: string;
  /** Pattern ids from the catalog, primary first. */
  patterns: string[];
  insight: string;
  realWorld: string;
  source: string;
  lines: string[];
  /** 1-based inclusive range of lines shown in the code panel. */
  codeStart: number;
  codeEnd: number;
  hints: Hints;
};

const titleCase = (slug: string) =>
  slug
    .split("-")
    .map((w) => (w.length <= 2 && w !== "dp" ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/^1d /i, "1-D ")
    .replace(/^2d /i, "2-D ")
    .replace(/\bDp\b|\bdp\b/, "DP")
    .replace(/^Arrays Hashing$/, "Arrays & Hashing")
    .replace(/^Heap Priority Queue$/, "Heap / Priority Queue")
    .replace(/^Math Geometry$/, "Math & Geometry");

export function parseProblem(path: string, source: string): Problem {
  const [, category, file] = path.match(/neetcode-150\/([^/]+)\/([^/]+)\.ts$/)!;
  const lines = source.split("\n");
  const header = lines.slice(0, lines.findIndex((l) => l.trim() === "*/") + 1);
  const headerText = header.map((l) => l.replace(/^\s*\/?\*+\/?\s?/, ""));

  const titleLine = headerText.find((l) => /^\d+\.\s/.test(l)) ?? file;
  const field = (name: string) =>
    headerText.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? "";

  const approachStart = headerText.findIndex((l) => l.startsWith("Approach"));
  const approach: string[] = [];
  let approachName = "";
  if (approachStart >= 0) {
    approachName = headerText[approachStart].replace(/^Approach:?\s*/, "");
    for (let i = approachStart + 1; i < headerText.length; i++) {
      const l = headerText[i];
      if (!l.trim() || l.startsWith("Time")) break;
      approach.push(l.trim());
    }
  }
  const complexity = headerText.find((l) => l.startsWith("Time")) ?? "";
  // Multi-line field: first line after "Name:", then indented continuation lines.
  const block = (name: string) => {
    const at = headerText.findIndex((l) => l.startsWith(`${name}:`));
    if (at < 0) return "";
    const out = [headerText[at].slice(name.length + 1).trim()];
    for (let i = at + 1; i < headerText.length && /^\s{2,}\S/.test(headerText[i]); i++) out.push(headerText[i].trim());
    return out.join(" ");
  };

  // Code panel: from after the imports to before the test helpers / test() block.
  let codeStart = lines.findIndex((l, i) => i >= header.length && l.trim() && !l.startsWith("import"));
  while (codeStart < lines.length && !lines[codeStart].trim()) codeStart++;
  let codeEnd = lines.findIndex(
    (l, i) => i > codeStart && (/^test\(/.test(l) || /^\/\/ ---.*helper/i.test(l)),
  );
  if (codeEnd < 0) codeEnd = lines.length;
  // Test helpers (fromArray, toArray, ...) come after the last export and are not used by it.
  let lastExport = -1;
  lines.forEach((l, i) => {
    if (i < codeEnd && l.startsWith("export ")) lastExport = i;
  });
  for (let i = lastExport + 1; i < codeEnd; i++) {
    const m = lines[i].match(/^function\s+([A-Za-z_$][\w$]*)/);
    if (!m) continue;
    const used = new RegExp(`\\b${m[1]}\\b`).test(lines.slice(codeStart, i).join("\n"));
    if (!used) {
      codeEnd = i;
      break;
    }
  }
  while (codeEnd > codeStart && !lines[codeEnd - 1].trim()) codeEnd--;

  const [number, ...slug] = file.split("-");
  return {
    id: `${category}/${file}`,
    category,
    categoryLabel: titleCase(category.replace(/^\d+-/, "")),
    number,
    title: titleLine.replace(/^\d+\.\s*/, "") || titleCase(slug.join("-")),
    leetcode: field("LeetCode"),
    difficulty: field("Difficulty"),
    approachName,
    approach: approach.join(" "),
    complexity,
    patterns: field("Pattern")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    insight: block("Key insight"),
    realWorld: block("Real world"),
    source,
    lines,
    codeStart: codeStart + 1,
    codeEnd,
    hints: parseHints(source),
  };
}
