// A reusable problem-solving pattern: the intuition that carries across many problems.

export type Pattern = {
  /** kebab-case id referenced by `Pattern:` lines in solution headers. */
  id: string;
  name: string;
  /** The core "aha", 2-3 sentences, plain language. */
  intuition: string;
  /** Wording in a problem statement that should make you think of this pattern. */
  signals: string[];
  /** Minimal TypeScript skeleton of the pattern. */
  template: string;
  /** More practice outside the NeetCode 150 (LeetCode slugs). In-app problems are found automatically. */
  related: { title: string; slug: string; difficulty: "Easy" | "Medium" | "Hard"; premium?: boolean }[];
  /** Where the same idea shows up in real systems. */
  realWorld: { title: string; text: string }[];
};
