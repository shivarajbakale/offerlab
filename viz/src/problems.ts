// Loads every NeetCode solution, systems topic and practice drill at build time.

import { categoryRank, parseProblem, type Problem } from "./parseProblem.ts";

export type { Problem };

const sources = {
  ...import.meta.glob("../../neetcode-150/*/*.ts", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/primitives/*/*.ts", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/architectures/*.ts", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/microservices/*.ts", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/low-level-design/*.ts", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/api-design/*.ts", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/drills/*/*.ts", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

const lessons = {
  ...import.meta.glob("../../system-design/primitives/*/*.lesson.md", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/architectures/*.lesson.md", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/microservices/*.lesson.md", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/low-level-design/*.lesson.md", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../system-design/api-design/*.lesson.md", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

export const problems: Problem[] = Object.entries(sources)
  .map(([path, src]) => ({ ...parseProblem(path, src), lesson: lessons[path.replace(/\.ts$/, ".lesson.md")] ?? "" }))
  .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.id.localeCompare(b.id));

export const categories = [...new Set(problems.map((p) => p.category))].map((category) => {
  const first = problems.find((p) => p.category === category)!;
  return {
    category,
    track: first.track,
    label: first.categoryLabel,
    problems: problems.filter((p) => p.category === category),
  };
});
