const FIXED: Record<string, number> = {
  l: 0, left: 0, lo: 0, low: 0, i: 0, slow: 0, start: 0, p1: 0, a: 0, read: 0,
  r: 1, right: 1, hi: 1, high: 1, j: 1, fast: 1, end: 1, p2: 1, b: 1, write: 1,
  m: 2, mid: 2, k: 3, idx: 4, p: 4, q: 5,
};

/** Stable color for a variable name used as a pointer / node tag. */
export function colorOf(name: string): string {
  const base = name.split(".").pop()!;
  let n = FIXED[base];
  if (n === undefined) {
    n = 0;
    for (const ch of base) n = (n * 31 + ch.charCodeAt(0)) % 6;
  }
  return `var(--p${n})`;
}
