// Playback state: current step, playing, speed. Advances on a timer while playing.

import { useCallback, useEffect, useState } from "react";

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const BASE_MS = 1100;

export type Player = {
  index: number;
  playing: boolean;
  speed: number;
  count: number;
  setIndex: (i: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  step: (delta: number) => void;
  setSpeed: (s: number) => void;
  faster: () => void;
  slower: () => void;
};

/** `dwell(i)` scales how long step i stays on screen (1 = normal). */
export function usePlayer(count: number, resetKey: string, dwell: (i: number) => number): Player {
  const [index, setIndexRaw] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);

  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setIndexRaw(0);
    setPlaying(true);
  }

  const clamp = useCallback((i: number) => Math.max(0, Math.min(count - 1, i)), [count]);

  const atEnd = index >= count - 1;
  const isPlaying = playing && !atEnd && count > 0;

  useEffect(() => {
    if (!isPlaying) return;
    const t = setTimeout(() => setIndexRaw((i) => Math.min(count - 1, i + 1)), (BASE_MS * dwell(index)) / speed);
    return () => clearTimeout(t);
  }, [isPlaying, index, speed, count, dwell]);

  const setIndex = useCallback((i: number) => setIndexRaw(clamp(i)), [clamp]);
  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      setIndexRaw((i) => clamp(i + delta));
    },
    [clamp],
  );
  const toggle = useCallback(() => {
    if (isPlaying) {
      setPlaying(false);
      return;
    }
    if (atEnd) setIndexRaw(0);
    setPlaying(true);
  }, [isPlaying, atEnd]);
  const shift = (dir: number) =>
    setSpeed((s) => SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + dir))]);

  return {
    index: clamp(index),
    playing: isPlaying,
    speed,
    count,
    setIndex,
    toggle,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step,
    setSpeed,
    faster: () => shift(1),
    slower: () => shift(-1),
  };
}
