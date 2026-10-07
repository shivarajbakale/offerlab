// The learner's progress in localStorage, shared by every component that shows it. Never throws:
// a private window just forgets.

import { useSyncExternalStore } from "react";
import { EMPTY, type Progress } from "./progress.ts";

const KEY = "viz:progress";
let current: Progress | null = null;
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<Progress>;
    return { entries: v.entries && typeof v.entries === "object" ? v.entries : {}, showAll: v.showAll === true };
  } catch {
    return EMPTY;
  }
}

export function getProgress(): Progress {
  return (current ??= load());
}

export function updateProgress(f: (p: Progress, now: number) => Progress) {
  current = f(getProgress(), Date.now());
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Progress is a convenience only.
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab of the app changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = load();
    onChange();
  };
  addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    removeEventListener("storage", onStorage);
  };
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, getProgress, () => EMPTY);
}
