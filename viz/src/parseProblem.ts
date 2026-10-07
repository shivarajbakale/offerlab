// Parses one NeetCode solution file into display metadata. Pure, so tests can use it.

import { isNoteLine, parseHints, type Hints } from "./model/hints.ts";

export type Track = "algorithms" | "systems";

const KERNEL_IMPORT = /from\s+["'][^"']*kernel\/sim\.ts["']/;
/** Systems primitives that import the simulation kernel play on it instead of the tracer. */
export const isKernelSource = (source: string) => KERNEL_IMPORT.test(source);
const TRAFFIC_IMPORT = /from\s+["'][^"']*traffic\/index\.ts["']/;
/** Architecture files import the traffic simulator and play on it. */
export const isTrafficSource = (source: string) => TRAFFIC_IMPORT.test(source);

/** Systems folders holding one file per topic (no group subfolders), in sidebar order after the primitives. */
export const FLAT_TRACKS = ["architectures", "microservices", "low-level-design", "api-design"] as const;
/** Practice drills: `system-design/drills/<kind>/NN-slug.ts`, category `sd-drills-<kind>`. */
export const DRILL_KINDS = ["estimation", "failure", "flashcards"] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];
const LABELS: Record<string, string> = {
  "low-level-design": "Low-Level Design",
  "api-design": "API & Data Modeling",
  "drills-estimation": "Estimation Drills",
  "drills-failure": "Failure Drills",
  "drills-flashcards": "Flashcards",
};
const FLAT = new RegExp(`system-design/(${FLAT_TRACKS.join("|")})/([^/]+)\\.ts$`);
const DRILL = new RegExp(`system-design/drills/(${DRILL_KINDS.join("|")})/([^/]+)\\.ts$`);

/**
 * Sidebar order of the systems groups: the primitives (sd-01-... by number), then the flat
 * tracks, then the practice drills. Algorithms and anything unknown sort by id.
 */
const ORDER = [
  "sd-architectures",
  "sd-microservices",
  "sd-low-level-design",
  "sd-api-design",
  "sd-drills-estimation",
  "sd-drills-failure",
  "sd-drills-flashcards",
];
export function categoryRank(category: string): number {
  if (/^sd-\d/.test(category)) return 0;
  const i = ORDER.indexOf(category);
  return i < 0 ? ORDER.length + 1 : i + 1;
}

/** Systems groups listed under the "Practice" heading in the sidebar. */
export const isPracticeCategory = (category: string) => category.startsWith("sd-drills-");

export type Problem = {
  /** e.g. "07-trees/046-invert-binary-tree" */
  id: string;
  category: string;
  categoryLabel: string;
  number: string;
  /** For a failure drill, its neutral title; the file header's (which names the cause) is `answerTitle`. */
  title: string;
  answerTitle?: string;
  leetcode: string;
  difficulty: string;
  approachName: string;
  approach: string;
  complexity: string;
  /** Pattern ids from the catalog, primary first. */
  patterns: string[];
  insight: string;
  realWorld: string;
  /** Plain-English "why this line exists", keyed by the 1-based line it explains. */
  why: Record<number, string>;
  source: string;
  lines: string[];
  /** 1-based inclusive range of lines shown in the code panel. */
  codeStart: number;
  codeEnd: number;
  hints: Hints;
  /** Which sidebar section the file belongs to. */
  track: Track;
  /** How it plays: the Babel tracer, the simulation kernel, the traffic simulator, or a practice drill. */
  engine: "tracer" | "kernel" | "traffic" | "drill";
  /** Drills only: which practice screen shows it. */
  drill?: DrillKind;
  /** Systems only: "Senior" or "Staff". */
  level: string;
  /** Systems only: header blocks for the Intuition panel. */
  problemStatement: string;
  tradeoffs: string;
  staffNotes: string;
  signals: string;
  /** Systems only: the first-principles lesson (Markdown), or "". */
  lesson: string;
};

const WHY = /^\s*\/\/\s*@why\s+(.*)$/;

/** `// @why` comment lines explain the next code line; consecutive ones are joined. */
function parseWhy(lines: string[]): Record<number, string> {
  const why: Record<number, string> = {};
  for (let i = 0; i < lines.length; i++) {
    if (!WHY.test(lines[i])) continue;
    const text: string[] = [];
    let j = i;
    for (; j < lines.length && WHY.test(lines[j]); j++) text.push(lines[j].match(WHY)![1].trim());
    // Decision notes (@yes, @then, ...) may sit between the @why and its code line.
    let at = j;
    while (at < lines.length && isNoteLine(lines[at])) at++;
    if (at < lines.length) why[at + 1] = text.join(" ");
    i = j - 1;
  }
  return why;
}

export const isWhyLine = (line: string) => WHY.test(line);

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
    .replace(/^Math Geometry$/, "Math & Geometry")
    .replace(/^Transactions Messaging$/, "Transactions & Messaging");

/**
 * A failure drill's file header names the cause ("Retry Storm"), which would give the answer away
 * in the sidebar and heading. It shows the neutral `title:` of its failureDrill({...}) call
 * instead, and keeps the header's as `answerTitle` for after the reader answers.
 */
function titles(header: string, failureSource: string): { title: string; answerTitle?: string } {
  const m = failureSource.match(/failureDrill\(\{\s*title:\s*("(?:[^"\\\n]|\\.)*")/);
  if (!m) return { title: header };
  try {
    return { title: JSON.parse(m[1]) as string, answerTitle: header };
  } catch {
    return { title: header };
  }
}

export function parseProblem(path: string, source: string): Problem {
  const flat = path.match(FLAT);
  const drill = path.match(DRILL);
  const [, root, dir, file] = flat
    ? ["", `system-design/${flat[1]}`, flat[1], flat[2]]
    : drill
      ? ["", "system-design/drills", `drills-${drill[1]}`, drill[2]]
      : path.match(/(neetcode-150|system-design\/primitives)\/([^/]+)\/([^/]+)\.ts$/)!;
  const track: Track = root === "neetcode-150" ? "algorithms" : "systems";
  // Systems categories get a prefix so they never collide with NeetCode folder names.
  const category = track === "systems" ? `sd-${dir}` : dir;
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
  const complexity = headerText.find((l) => l.startsWith("Time") || l.startsWith("Cost:")) ?? "";
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
  // Tracer primitives keep their exported broken-on-purpose subclasses just below the helpers
  // marker; lessons link into them, so the panel runs on to the end of the last one.
  if (track === "systems" && !isKernelSource(source) && !isTrafficSource(source) && /^\/\/ ---.*helper/i.test(lines[codeEnd] ?? "")) {
    const firstTest = lines.findIndex((l) => /^test\(/.test(l));
    const before = firstTest < 0 ? lines.length : firstTest;
    let lastClass = -1;
    for (let i = codeEnd; i < before; i++) if (/^export (abstract )?class\b/.test(lines[i])) lastClass = i;
    if (lastClass >= 0) {
      const close = lines.findIndex((l, i) => i > lastClass && l === "}");
      if (close >= 0) codeEnd = close + 1;
    }
  }
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
    categoryLabel: LABELS[dir] ?? titleCase(dir.replace(/^\d+-/, "")),
    number,
    ...titles(titleLine.replace(/^\d+\.\s*/, "") || titleCase(slug.join("-")), drill?.[1] === "failure" ? source : ""),
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
    why: parseWhy(lines),
    source,
    lines,
    codeStart: codeStart + 1,
    codeEnd,
    hints: parseHints(source),
    track,
    engine: drill ? "drill" : track === "systems" && isKernelSource(source) ? "kernel" : isTrafficSource(source) ? "traffic" : "tracer",
    ...(drill ? { drill: drill[1] as DrillKind } : {}),
    level: field("Level"),
    problemStatement: block("Problem"),
    tradeoffs: block("Tradeoffs"),
    staffNotes: block("Staff notes"),
    signals: block("Interview signals"),
    lesson: "",
  };
}
