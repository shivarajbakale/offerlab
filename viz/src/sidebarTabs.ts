// How the sidebar splits the content: five tabs, and inside each tab the groups it lists.
// Problem ids and categories stay as they are (lessons and flashcards link to them); this only
// decides where a topic shows up. Pure, so tests can use it.

import type { Problem } from "./parseProblem.ts";

export type TabId = "algorithms" | "blocks" | "design" | "code" | "practice";

export const TABS: { id: TabId; label: string; title: string; noun: string }[] = [
  { id: "algorithms", label: "Algorithms", title: "Algorithms (NeetCode 150)", noun: "problems" },
  { id: "blocks", label: "Blocks", title: "Building blocks: the primitives systems are made of", noun: "building blocks" },
  { id: "design", label: "Design", title: "System design: case studies and microservices", noun: "designs" },
  { id: "code", label: "Code", title: "Code design: low-level design and APIs", noun: "topics" },
  { id: "practice", label: "Practice", title: "Practice: estimation, failure drills, flashcards", noun: "drills" },
];

/** The tab an overview route ("overview/design") shows, or null for a topic id. */
export function overviewTab(id: string): TabId | null {
  const m = id.match(/^overview\/(\w+)$/);
  return m && TABS.some((t) => t.id === m[1]) ? (m[1] as TabId) : null;
}
export const overviewId = (tab: TabId) => `overview/${tab}`;

export function tabOf(p: Pick<Problem, "track" | "category">): TabId {
  if (p.track === "algorithms") return "algorithms";
  if (p.category.startsWith("sd-drills-")) return "practice";
  if (p.category === "sd-low-level-design" || p.category === "sd-api-design") return "code";
  if (p.category === "sd-architectures" || p.category === "sd-microservices") return "design";
  return "blocks";
}

/** The case studies grouped by what they are about, by file number. */
export const THEMES: { key: string; label: string; numbers: string[] }[] = [
  { key: "web", label: "Web basics", numbers: ["01", "02", "03", "04"] },
  { key: "reads", label: "Feeds & reads", numbers: ["06", "09", "10", "17", "23", "26", "29"] },
  { key: "realtime", label: "Real-time", numbers: ["07", "12", "13", "30"] },
  { key: "money", label: "Money & inventory", numbers: ["05", "11", "18", "20", "27"] },
  { key: "pipelines", label: "Pipelines & jobs", numbers: ["16", "21", "22", "24", "25", "28"] },
  { key: "storage", label: "Storage & global", numbers: ["08", "14", "15", "19", "31"] },
];
const OTHER = { key: "other", label: "More case studies" };

export type Group = {
  /** Unique key for open/closed state, e.g. "sd-architectures#web" or a plain category. */
  key: string;
  label: string;
  /** A heading shown above this group, when it starts a new section of the tab. */
  section?: string;
  problems: Problem[];
};

/** Problems are expected in sidebar order (as `problems.ts` sorts them). */
export function groupsFor(tab: TabId, problems: Problem[]): Group[] {
  const groups: Group[] = [];
  const add = (key: string, label: string, p: Problem, section?: string) => {
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label, problems: [], ...(section ? { section } : {}) }));
    g.problems.push(p);
  };
  const studies = problems.filter((p) => tabOf(p) === tab && p.category === "sd-architectures");
  for (const t of [...THEMES, OTHER]) {
    for (const p of studies) {
      const theme = THEMES.find((x) => x.numbers.includes(p.number)) ?? OTHER;
      if (theme.key === t.key) add(`sd-architectures#${t.key}`, t.label, p, groups.length ? undefined : "Case studies");
    }
  }
  for (const p of problems) {
    if (tabOf(p) !== tab || p.category === "sd-architectures") continue;
    const section = tab === "design" && p.category === "sd-microservices" && !groups.some((g) => g.key === p.category) ? "Services" : undefined;
    add(p.category, p.categoryLabel, p, section);
  }
  return groups;
}

/** The group a problem is listed in. */
export function groupKeyOf(p: Problem): string {
  if (p.category !== "sd-architectures") return p.category;
  return `sd-architectures#${(THEMES.find((x) => x.numbers.includes(p.number)) ?? OTHER).key}`;
}
