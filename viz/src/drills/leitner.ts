// Leitner boxes for flashcards: a card you knew moves up a box, a card you missed goes back to
// box 1, and the lowest boxes come round first. Pure, plus a storage wrapper that never throws.

export const BOXES = 5;
/** Per card id: its box (1..5) and when it was last answered (ms; 0 = never). */
export type Leitner = Record<string, { box: number; seen: number }>;

export const boxOf = (s: Leitner, id: string) => s[id]?.box ?? 1;

export function review(s: Leitner, id: string, knew: boolean, now: number): Leitner {
  const box = knew ? Math.min(BOXES, boxOf(s, id) + 1) : 1;
  return { ...s, [id]: { box, seen: now } };
}

/** Card ids in the order to study them: lowest box first, then the longest since last seen. */
export function dueOrder(ids: string[], s: Leitner): string[] {
  return ids
    .map((id, i) => ({ id, i, box: boxOf(s, id), seen: s[id]?.seen ?? 0 }))
    .sort((a, b) => a.box - b.box || a.seen - b.seen || a.i - b.i)
    .map((x) => x.id);
}

/** How many of `ids` sit in each box, box 1 first. */
export function boxCounts(ids: string[], s: Leitner): number[] {
  const out = Array.from({ length: BOXES }, () => 0);
  for (const id of ids) out[boxOf(s, id) - 1]++;
  return out;
}

const key = (deckId: string) => `viz:leitner:${deckId}`;

/** Saved progress for a deck, or none when storage is missing, blocked or holds junk. */
export function loadLeitner(deckId: string): Leitner {
  try {
    const raw = localStorage.getItem(key(deckId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Leitner = {};
    for (const [id, v] of Object.entries(parsed as Record<string, { box?: unknown; seen?: unknown }>)) {
      const box = Number(v?.box);
      const seen = Number(v?.seen);
      if (Number.isInteger(box) && box >= 1 && box <= BOXES) out[id] = { box, seen: Number.isFinite(seen) ? seen : 0 };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLeitner(deckId: string, s: Leitner): void {
  try {
    localStorage.setItem(key(deckId), JSON.stringify(s));
  } catch {
    // Without storage the deck still works for this visit.
  }
}

export function clearLeitner(deckId: string): void {
  try {
    localStorage.removeItem(key(deckId));
  } catch {
    // Nothing saved, nothing to clear.
  }
}
