// Optional comment hints inside a solution file.
//
//   // @viz array:s window:l..r pointers:i,j values:lo,hi hide:tmp grid:dp graph:adj heap:minHeap
//   while (seen.has(s[r])) { // @say '{s[r]}' is already in the window, shrink from the left
//
// @viz lines apply to the whole file; @say applies to the line it is on.

export type Hints = {
  array?: string;
  window?: [string, string];
  pointers: string[];
  hide: string[];
  /** Integers to show as plain values, never as array pointers. */
  values: string[];
  grid?: string;
  graph?: string;
  heap?: string;
  say: Record<number, string>;
};

export function parseHints(source: string): Hints {
  const hints: Hints = { pointers: [], hide: [], values: [], say: {} };
  source.split("\n").forEach((line, i) => {
    const say = line.match(/\/\/\s*@say\s+(.+)$/);
    if (say) hints.say[i + 1] = say[1].trim();
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
      }
    }
  });
  return hints;
}
