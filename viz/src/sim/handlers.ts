// Finds each `onXxx(` handler method in a primitive's source, so the code panel can
// highlight the handler that ran at a simulation step.

export type LineRange = { start: number; end: number };

/** 1-based inclusive line range of every indented `on<Name>(` method, closed by `}` at its indent. */
export function handlerLines(lines: string[]): Record<string, LineRange> {
  const out: Record<string, LineRange> = {};
  lines.forEach((line, i) => {
    const m = line.match(/^(\s+)(on[A-Z]\w*)\s*\(/);
    if (!m) return;
    let end = i;
    if (!line.trimEnd().endsWith("}")) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith(`${m[1]}}`)) {
          end = j;
          break;
        }
      }
    }
    // The first definition wins: later ones are broken-on-purpose subclasses in the scenarios.
    out[m[2]] ??= { start: i + 1, end: end + 1 };
  });
  return out;
}

/** A handler's lines inside `className`'s own body if it defines one, else the first definition anywhere. */
export function handlerRange(lines: string[], handler: string, className?: string): LineRange | undefined {
  if (className) {
    const start = lines.findIndex((l) => new RegExp(`^(export )?(abstract )?class ${className}\\b`).test(l));
    if (start >= 0) {
      const close = lines.findIndex((l, i) => i > start && l === "}");
      const own = handlerLines(lines.slice(start, close < 0 ? undefined : close + 1))[handler];
      if (own) return { start: own.start + start, end: own.end + start };
    }
  }
  return handlerLines(lines)[handler];
}
