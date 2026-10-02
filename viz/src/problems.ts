// Loads every NeetCode solution file at build time.

import { parseProblem, type Problem } from "./parseProblem.ts";

export type { Problem };

const sources = import.meta.glob("../../neetcode-150/*/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const problems: Problem[] = Object.entries(sources)
  .map(([path, src]) => parseProblem(path, src))
  .sort((a, b) => a.id.localeCompare(b.id));

export const categories = [...new Set(problems.map((p) => p.category))].map((category) => ({
  category,
  label: problems.find((p) => p.category === category)!.categoryLabel,
  problems: problems.filter((p) => p.category === category),
}));
