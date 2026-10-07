// Lessons: a small Markdown subset for teaching a primitive from first principles, with links that
// play a scenario. Pure, so tests can parse and validate every lesson file.

import type { SimRun } from "../../../system-design/kernel/types.ts";

/**
 * `t` anchors a kernel run (simulation time) or a traffic run (seconds), where `req` also picks a
 * tracked request; `at`/`nth` anchor a tracer run (the nth visit of a `@mark` line).
 */
export type PlayLink = { kind: "play"; text: string; scenario: string; t?: number; req?: number; at?: string; nth?: number };
export type Inline = { kind: "text" | "bold" | "italic" | "code"; text: string } | PlayLink | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "para"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "qa"; question: Inline[]; answer: Inline[] }
  | { kind: "code"; text: string };

export type Section = { title: string; blocks: Block[] };
export type Lesson = { title: string; sections: Section[] };

export const REQUIRED_SECTIONS = [
  "Words we'll use",
  "The world we're in",
  "The goal",
  "The naive attempt",
  "Building it up",
  "Why it works now",
  "What it costs",
  "Staff notes",
  "Check yourself",
];
/**
 * "What it is" opens a lesson (see intro.ts) and "In plain words" may follow it; "When to use
 * which" compares the lesson's options with their neighbours; "Deep dive" closes one.
 */
const OPTIONAL_SECTIONS = ["What it is", "In plain words", "When to use which", "Deep dive"];

// A link target may contain one level of parentheses, as in "play:scenario (#2)@t=10".
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((?:[^()]|\([^()]*\))+\))/g;
const LINK = /^\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+)\)$/;
const ANCHOR = /^(.*?)(?:@t=([^&]*)(?:&req=(.*))?|@at=([^#]*)(?:#(.*))?)?$/;
/** A top-level list item: "- text", "* text" or "1. text" with no indent. */
const ITEM = /^(?:[-*]|\d+\.)\s+(.*)$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    const link = part.match(LINK);
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) out.push({ kind: "bold", text: part.slice(2, -2) });
    else if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) out.push({ kind: "code", text: part.slice(1, -1) });
    else if (link && link[2].startsWith("play:")) {
      const [, scenario, t, req, at, nth] = link[2].slice(5).match(ANCHOR)!;
      out.push({
        kind: "play",
        text: link[1],
        scenario: scenario.trim(),
        ...(t !== undefined ? { t: t.trim() === "" ? NaN : Number(t) } : {}),
        ...(req !== undefined ? { req: req.trim() === "" ? NaN : Number(req) } : {}),
        ...(at !== undefined ? { at: at.trim() } : {}),
        ...(nth !== undefined ? { nth: Number(nth) } : {}),
      });
    } else if (link) out.push({ kind: "link", text: link[1], href: link[2] });
    else if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) out.push({ kind: "italic", text: part.slice(1, -1) });
    else out.push({ kind: "text", text: part });
  }
  return out;
}

const startsBlock = (line: string) => /^(#{1,3} |```)/.test(line) || ITEM.test(line);

export function parseLesson(md: string): Lesson {
  const lines = md.replace(/\r/g, "").split("\n");
  const lesson: Lesson = { title: "", sections: [] };
  let section: Section | null = null;
  const push = (block: Block) => {
    if (!section) {
      section = { title: "", blocks: [] };
      lesson.sections.push(section);
    }
    section.blocks.push(block);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      push({ kind: "code", text: body.join("\n") });
    } else if (line.startsWith("# ")) {
      lesson.title = line.slice(2).trim();
      i++;
    } else if (line.startsWith("## ")) {
      section = { title: line.slice(3).trim(), blocks: [] };
      lesson.sections.push(section);
      i++;
    } else if (line.startsWith("### ")) {
      push({ kind: "heading", text: line.slice(4).trim() });
      i++;
    } else if (ITEM.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: { text: string; more: string[] }[] = [];
      for (; i < lines.length && lines[i].trim(); i++) {
        const m = lines[i].match(ITEM);
        if (m) items.push({ text: m[1], more: [] });
        else if (/^\s+\S/.test(lines[i]) && items.length) items.at(-1)!.more.push(lines[i].trim());
        else break;
      }
      let plain: Inline[][] = [];
      const flush = () => {
        if (plain.length) push({ kind: "list", ordered, items: plain });
        plain = [];
      };
      for (const item of items) {
        if (item.text.startsWith("**Q:**")) {
          flush();
          const answer = item.more.join(" ").replace(/^A:\s*/, "");
          push({ kind: "qa", question: parseInline(item.text.slice(6).trim()), answer: parseInline(answer) });
        } else {
          plain.push(parseInline([item.text, ...item.more].join(" ")));
        }
      }
      flush();
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i])); i++) para.push(lines[i].trim());
      push({ kind: "para", inline: parseInline(para.join(" ")) });
    }
  }
  return lesson;
}

/** Index of the one run whose label starts with `scenario` (ignoring case); -1 if none or several. */
export function findRun<R extends { label: string }>(runs: R[], scenario: string): number {
  const prefix = scenario.toLowerCase();
  const hits = runs.flatMap((r, i) => (r.label.toLowerCase().startsWith(prefix) ? [i] : []));
  return hits.length === 1 ? hits[0] : -1;
}

/** First step at or after simulation time `t`, or -1. */
export function stepAt(run: SimRun, t = 0): number {
  return run.steps.findIndex((s) => s.t >= t);
}

/** Where a play link lands in a run: a step index, or a message saying why it cannot. */
export type Locate = (run: { label: string; steps: unknown[] }, link: PlayLink) => number | string;

export const simLocate: Locate = (run, link) => {
  if (link.req !== undefined) return `play link "${link.scenario}": &req= is for architectures`;
  if (link.at !== undefined) return `play link "${link.scenario}": @at= is for tracer primitives; use @t=`;
  if (Number.isNaN(link.t)) return `play link "${link.scenario}": @t= is not a number`;
  const i = stepAt(run as SimRun, link.t);
  return i >= 0 ? i : `play link "${link.scenario}@t=${link.t}": no step at or after t=${link.t}`;
};

/** Traffic runs: the frame that ends at `t` seconds (frames are 100 ms), and a tracked request if `req` is given. */
export const trafficLocate: Locate = (run, link) => {
  if (link.at !== undefined) return `play link "${link.scenario}": @at= is for tracer primitives; use @t=<seconds>`;
  const t = link.t ?? 0;
  if (Number.isNaN(t)) return `play link "${link.scenario}": @t= is not a number`;
  const frames = run.steps as { t: number }[];
  const i = Math.max(0, Math.round(t * 10) - 1);
  if (i >= frames.length) return `play link "${link.scenario}@t=${t}": the run is only ${frames.length / 10} s long`;
  if (link.req !== undefined) {
    const journeys = (run as { journeys?: { id: number }[] }).journeys ?? [];
    if (!journeys.some((j) => j.id === link.req)) return `play link "${link.scenario}": request ${link.req} is not one of the tracked requests`;
  }
  return i;
};

/** Index of the nth time the run enters `line` (consecutive steps on one line count once), or -1. */
export function markStep(steps: { line: number }[], line: number, nth = 1): number {
  let seen = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].line !== line || steps[i - 1]?.line === line) continue;
    if (++seen === nth) return i;
  }
  return -1;
}

export const markLocate =
  (marks: Record<string, number>): Locate =>
  (run, link) => {
    if (link.t !== undefined) return `play link "${link.scenario}": @t= is for kernel primitives; use @at=<mark>`;
    if (link.at === undefined) return 0;
    const line = marks[link.at];
    if (!link.at || line === undefined) return `play link "${link.scenario}": no @mark "${link.at}" in the code`;
    const nth = link.nth ?? 1;
    if (!Number.isInteger(nth) || nth < 1) return `play link "${link.scenario}": #${link.nth} is not a visit number`;
    const steps = run.steps as { line: number }[];
    const i = markStep(steps, line, nth);
    if (i >= 0) return i;
    let visits = 0;
    while (markStep(steps, line, visits + 1) >= 0) visits++;
    return `play link "${link.scenario}@at=${link.at}#${nth}": the run reaches that line only ${visits} times`;
  };

/** One entry in the scenario dropdown. Systems runs are named by their test; algorithm runs are numbered examples. */
export function scenarioOptionLabel(run: { label: string; passed: boolean | null }, i: number, systems: boolean): string {
  const mark = run.passed === false ? "✗" : run.passed ? "✓" : "·";
  return systems ? `${mark} ${run.label}` : `${mark} Example ${i + 1}: ${run.label}`;
}

const inlinesOf = (b: Block): Inline[] =>
  b.kind === "para" ? b.inline : b.kind === "list" ? b.items.flat() : b.kind === "qa" ? [...b.question, ...b.answer] : [];

export const playLinksIn = (blocks: Block[]): PlayLink[] =>
  blocks.flatMap(inlinesOf).filter((x): x is PlayLink => x.kind === "play");

/** Everything wrong with a lesson, as readable messages. Empty means the lesson is complete. */
export function lessonProblems(lesson: Lesson, runs: { label: string; steps: unknown[] }[], locate: Locate = simLocate): string[] {
  const problems: string[] = [];
  const titles = lesson.sections.map((s) => s.title).filter(Boolean);
  const required = titles.filter((t) => REQUIRED_SECTIONS.includes(t));
  if (required.join("|") !== REQUIRED_SECTIONS.join("|")) {
    problems.push(`sections must be, in order: ${REQUIRED_SECTIONS.join(", ")}; found: ${titles.join(", ")}`);
  }
  for (const t of titles) if (!REQUIRED_SECTIONS.includes(t) && !OPTIONAL_SECTIONS.includes(t)) problems.push(`unknown section "${t}"`);
  for (const t of REQUIRED_SECTIONS) if (!titles.includes(t)) problems.push(`missing section "${t}"`);
  if (lesson.sections[0]?.title === "" && lesson.sections[0].blocks.length) problems.push("text before the first ## section");
  if (titles.includes("Deep dive") && titles.at(-1) !== "Deep dive") problems.push('"Deep dive" must be the last section');
  if (titles.includes("What it is") && titles[0] !== "What it is") problems.push('"What it is" must be the first section');
  const blocks = (title: string) => lesson.sections.find((s) => s.title === title)?.blocks ?? [];

  const terms = blocks("Words we'll use").flatMap((b) => (b.kind === "list" ? b.items : []));
  if (terms.length < 3 || terms.some((item) => item[0]?.kind !== "bold")) {
    problems.push("Words we'll use: needs 3 or more list items, each starting with a **term**");
  }
  if (!playLinksIn(blocks("The naive attempt")).some((l) => l.scenario.toLowerCase().startsWith("broken:"))) {
    problems.push("The naive attempt: needs a play link to a broken: scenario");
  }
  const questions = blocks("Check yourself").filter((b) => b.kind === "qa");
  if (questions.length < 3 || questions.length > 5) problems.push(`Check yourself: needs 3 to 5 questions, found ${questions.length}`);
  if (questions.some((q) => q.kind === "qa" && (!q.answer.length || !q.answer.some((x) => x.kind === "play")))) {
    problems.push("Check yourself: every answer needs text and a play link");
  }

  for (const link of lesson.sections.flatMap((s) => playLinksIn(s.blocks))) {
    const r = findRun(runs, link.scenario);
    if (r < 0) {
      problems.push(`play link "${link.scenario}" matches no single scenario`);
      continue;
    }
    const where = locate(runs[r], link);
    if (typeof where === "string") problems.push(where);
  }
  return problems;
}

/** One scenario as a chapter of the lesson's story: where the lesson first plays it, and its role. */
export type Chapter = { run: number; title: string; role: "problem" | "works" };

/**
 * The scenarios in the order the lesson first plays them (unplayed ones last, in file order), each
 * tagged as a problem (a "broken:" run) or the working design.
 */
export function storyChapters(runs: { label: string }[], lesson: Lesson): Chapter[] {
  const order: number[] = [];
  for (const section of lesson.sections) {
    for (const link of playLinksIn(section.blocks)) {
      const r = findRun(runs, link.scenario);
      if (r >= 0 && !order.includes(r)) order.push(r);
    }
  }
  runs.forEach((_, i) => order.includes(i) || order.push(i));
  return order.map((i) => {
    const broken = runs[i].label.startsWith("broken: ");
    const text = broken ? runs[i].label.slice(8) : runs[i].label;
    return { run: i, title: text.charAt(0).toUpperCase() + text.slice(1), role: broken ? "problem" : "works" };
  });
}
