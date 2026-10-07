// Optional comment hints inside a solution file.
//
//   // @viz array:s window:l..r pointers:i,j values:lo,hi hide:tmp grid:dp graph:adj heap:minHeap
//   // @viz grid:scores labels:servers,keys   (column names, then row names, for the grid)
//   while (seen.has(s[r])) { // @say '{s[r]}' is already in the window, shrink from the left
//
// @viz lines apply to the whole file; @say applies to the line it is on.

import { SYSTEMS_KINDS, type SystemsKind } from "./systems/types.ts";

export type Hints = {
  array?: string;
  window?: [string, string];
  pointers: string[];
  hide: string[];
  /** Integers to show as plain values, never as array pointers. */
  values: string[];
  grid?: string;
  /** `labels:<cols>,<rows>`: arrays whose items name the grid's columns and rows. */
  gridLabels?: [string, string | undefined];
  graph?: string;
  heap?: string;
  /** The code turns letters into slots with `charCodeAt`, so 26-slot count arrays are labelled a to z. */
  letterIndex?: boolean;
  say: Record<number, string>;
  /** `// @mark name` at the end of a line names it for lesson play links (`@at=name`). */
  marks: Record<string, number>;
  /** Systems views, such as `@viz ring:tokens,keys`, in the order written. */
  systems: { kind: SystemsKind; args: string[] }[];
  /** Mistakes in the hints, such as a duplicate @mark; the lesson and hints tests require none. */
  errors: string[];
};

export function parseHints(source: string): Hints {
  const hints: Hints = { pointers: [], hide: [], values: [], say: {}, marks: {}, systems: [], errors: [] };
  source.split("\n").forEach((line, i) => {
    const n = i + 1;
    const say = line.match(/\/\/\s*@say\s+(.+)$/);
    // A @say runs to the end of the line, so a @mark after it would be read as part of the text.
    if (say && /\/\/\s*@mark\b/.test(say[1])) hints.errors.push(`line ${n}: @say and @mark on one line; put the @mark on its own line`);
    else if (say) hints.say[n] = say[1].trim();
    const mark = line.match(/\/\/\s*@mark\s+([\w-]+)\s*$/);
    if (mark && !say) {
      if (mark[1] in hints.marks) hints.errors.push(`line ${n}: duplicate @mark ${mark[1]} (first on line ${hints.marks[mark[1]]})`);
      else hints.marks[mark[1]] = n;
    }
    const viz = line.match(/\/\/\s*@viz\s+(.+)$/);
    if (!viz) return;
    for (const pair of viz[1].trim().split(/\s+/)) {
      const [key, value = ""] = pair.split(":");
      const list = value.split(",").filter(Boolean);
      switch (key) {
        case "array":
        case "grid":
        case "graph":
        case "heap":
          hints[key] = value;
          break;
        case "window": {
          const [l, r] = value.split("..");
          if (l && r) hints.window = [l, r];
          break;
        }
        case "pointers":
          hints.pointers.push(...list);
          break;
        case "hide":
          hints.hide.push(...list);
          break;
        case "values":
          hints.values.push(...list);
          break;
        case "labels":
          if (list[0]) hints.gridLabels = [list[0], list[1]];
          break;
        default:
          if ((SYSTEMS_KINDS as string[]).includes(key)) hints.systems.push({ kind: key as SystemsKind, args: list });
          else hints.errors.push(`line ${n}: unknown @viz view "${key}"`);
      }
    }
  });
  hints.letterIndex = /charCodeAt\(/.test(source);
  return hints;
}
