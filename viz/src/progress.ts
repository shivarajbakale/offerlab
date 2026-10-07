// What the learner has done with each algorithm problem: how many hints they opened, whether
// they revealed the solution, and whether they marked it attempted or solved. Pure, so tests can
// use it; useProgress.ts keeps it in localStorage.

export const HINTS = 3;
export type Status = "attempted" | "solved";
export type Entry = {
  /** Hints opened, 0..HINTS. */
  hints: number;
  /** The code, notes and animation are showing. */
  revealed: boolean;
  status?: Status;
  /** When marked solved: hints opened by then, and whether the solution had been revealed. */
  solvedWith?: { hints: number; revealed: boolean };
  at: number;
};
export type Progress = { entries: Record<string, Entry>; showAll: boolean };

export const EMPTY: Progress = { entries: {}, showAll: false };
const blank: Entry = { hints: 0, revealed: false, at: 0 };

export const entryOf = (p: Progress, id: string): Entry => p.entries[id] ?? blank;
export const isRevealed = (p: Progress, id: string) => p.showAll || entryOf(p, id).revealed;

const put = (p: Progress, id: string, e: Entry): Progress => ({ ...p, entries: { ...p.entries, [id]: e } });
/** Opening a hint or the solution counts as an attempt, unless it is already marked. */
const touched = (e: Entry): Entry => ({ ...e, status: e.status ?? "attempted" });

export function openHint(p: Progress, id: string, now: number): Progress {
  const e = entryOf(p, id);
  return put(p, id, touched({ ...e, hints: Math.min(HINTS, e.hints + 1), at: now }));
}

export function reveal(p: Progress, id: string, now: number): Progress {
  const e = entryOf(p, id);
  return put(p, id, touched({ ...e, revealed: true, at: now }));
}

export function mark(p: Progress, id: string, status: Status | undefined, now: number): Progress {
  const { hints, revealed } = entryOf(p, id);
  const next: Entry = { hints, revealed, at: now };
  if (status) next.status = status;
  if (status === "solved") next.solvedWith = { hints, revealed: isRevealed(p, id) };
  return put(p, id, next);
}

/** Hide the hints and the solution again to retry, keeping the status. */
export function hideAgain(p: Progress, id: string, now: number): Progress {
  return put(p, id, { ...entryOf(p, id), hints: 0, revealed: false, at: now });
}

export const setShowAll = (p: Progress, showAll: boolean): Progress => ({ ...p, showAll });

/** Solved and attempted counts among `ids`. */
export function tally(p: Progress, ids: string[]): { solved: number; attempted: number } {
  let solved = 0;
  let attempted = 0;
  for (const id of ids) {
    const s = p.entries[id]?.status;
    if (s === "solved") solved++;
    else if (s === "attempted") attempted++;
  }
  return { solved, attempted };
}
