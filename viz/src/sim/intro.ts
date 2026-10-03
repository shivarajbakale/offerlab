// Every lesson opens with "What it is": what the thing is, which problem it exists to solve, and
// when to reach for it, before any vocabulary or build-up. Pure, so tests can validate every lesson.

import type { Inline, Lesson } from "./lesson.ts";

export const INTRO_TITLE = "What it is";

/** Concept topics (building blocks, microservices, low-level design, APIs) and case studies ask different things. */
export type IntroKind = "concept" | "study";

export const INTRO_FIELDS: Record<IntroKind, string[]> = {
  concept: ["What it is", "The problem it solves", "Reach for it when", "Not the right tool when", "Where you'll meet it"],
  study: ["What it is", "What makes it hard", "Building blocks it uses", "Where you'll meet it"],
};

export type IntroField = { label: string; inline: Inline[] };

/** The intro's labelled bullets ("- **Label:** text"), in order. Empty if the lesson has no intro. */
export function readIntro(lesson: Lesson): IntroField[] {
  const section = lesson.sections.find((s) => s.title === INTRO_TITLE);
  if (!section) return [];
  return section.blocks.flatMap((b) =>
    b.kind !== "list"
      ? []
      : b.items.flatMap((item) => {
          const [head, ...rest] = item;
          if (head?.kind !== "bold" || !head.text.endsWith(":")) return [];
          const inline = rest.length && rest[0].kind === "text" ? [{ ...rest[0], text: rest[0].text.replace(/^\s+/, "") }, ...rest.slice(1)] : rest;
          return [{ label: head.text.slice(0, -1), inline }];
        }),
  );
}

export const plainText = (inline: Inline[]) => inline.map((x) => x.text).join("").replace(/\s+/g, " ").trim();

/** In-app links ("#/sd-01-partitioning/001-consistent-hashing") inside the intro. */
export const internalLinks = (inline: Inline[]) =>
  inline.flatMap((x) => (x.kind === "link" && x.href.startsWith("#/") ? [x.href.slice(2)] : []));

/** Everything wrong with a lesson's intro, as readable messages. */
export function introProblems(lesson: Lesson, kind: IntroKind, knownIds: Set<string>): string[] {
  const problems: string[] = [];
  const titles = lesson.sections.map((s) => s.title).filter(Boolean);
  if (titles[0] !== INTRO_TITLE) return [`the first section must be "${INTRO_TITLE}"; found "${titles[0] ?? ""}"`];
  const fields = readIntro(lesson);
  const want = INTRO_FIELDS[kind];
  if (fields.map((f) => f.label).join("|") !== want.join("|")) {
    problems.push(`${INTRO_TITLE}: bullets must be, in order: ${want.map((w) => `**${w}:**`).join(", ")}; found: ${fields.map((f) => f.label).join(", ")}`);
  }
  for (const f of fields) {
    const words = plainText(f.inline).split(" ").filter(Boolean).length;
    if (words < 8) problems.push(`${INTRO_TITLE}: "${f.label}" is too short (${words} words)`);
    if (words > 90) problems.push(`${INTRO_TITLE}: "${f.label}" is too long (${words} words); keep the opener short`);
    if (f.inline.some((x) => x.kind === "play")) problems.push(`${INTRO_TITLE}: "${f.label}" has a play link; the opener explains, the sections below play`);
    for (const id of internalLinks(f.inline)) if (!knownIds.has(id)) problems.push(`${INTRO_TITLE}: link #/${id} names no topic`);
  }
  if (kind === "study") {
    const blocks = fields.find((f) => f.label === "Building blocks it uses");
    if (blocks && internalLinks(blocks.inline).length < 2) problems.push(`${INTRO_TITLE}: "Building blocks it uses" needs 2 or more #/ links to topics`);
  }
  return problems;
}

/** One line for overview pages: the first sentence of what the topic solves (or what makes the case study hard). */
export function oneLiner(lesson: Lesson): string {
  const f = readIntro(lesson).find((x) => x.label === "The problem it solves" || x.label === "What makes it hard");
  if (!f) return "";
  const text = plainText(f.inline);
  const m = text.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : text;
}
