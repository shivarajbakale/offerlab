// Two Sum, run twice side by side: every pair checked (the naive way) against one pass with
// a hash map. Both count their work honestly on the same 12 numbers.

import { Button } from "@mantine/core";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./reducedMotion.ts";

const NUMS = [17, 20, 14, 11, 4, 18, 1, 5, 19, 15, 10, 7];
const TARGET = 17;
const N = NUMS.length;

/** Pairs in the order the nested loops try them, up to and including the answer. */
const NAIVE_PAIRS = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      out.push([i, j]);
      if (NUMS[i] + NUMS[j] === TARGET) return out;
    }
  return out;
})();

/** Index where the one-pass map finds the partner already seen. */
const MAP_STEPS = (() => {
  const seen = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (seen.has(TARGET - NUMS[i])) return i + 1;
    seen.add(NUMS[i]);
  }
  return N;
})();

const TICK = 70;

export function Race() {
  const [t, setT] = useState(() => (prefersReducedMotion() ? NAIVE_PAIRS.length : 0));
  const [running, setRunning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setT((x) => {
        if (x + 1 >= NAIVE_PAIRS.length) setRunning(false);
        return Math.min(x + 1, NAIVE_PAIRS.length);
      });
    }, TICK);
    return () => clearInterval(id);
  }, [running]);

  // Start once, the first time the race scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          setRunning(true);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const naiveDone = t >= NAIVE_PAIRS.length;
  const mapT = Math.min(t, MAP_STEPS);
  const mapDone = t >= MAP_STEPS;
  const cur = NAIVE_PAIRS[Math.max(0, Math.min(t, NAIVE_PAIRS.length) - 1)];
  const tried = new Set(NAIVE_PAIRS.slice(0, t).map(([i, j]) => `${i},${j}`));
  const cell = 22;

  const replay = () => {
    setT(0);
    setRunning(true);
  };

  return (
    <div className="race" ref={ref}>
      <div className="race-input">
        <span className="race-label">nums</span>
        <span className="race-nums">
          {NUMS.map((v, i) => (
            <span key={i} className={naiveDone && (i === 10 || i === 11) ? "hit" : ""}>
              {v}
            </span>
          ))}
        </span>
        <span className="race-label">target {TARGET}</span>
      </div>

      <div className="race-lanes">
        <div className="race-lane">
          <div className="race-head">
            <h3>Naive: try every pair</h3>
            <p>Two nested loops. Work grows with the square of the input.</p>
          </div>
          <svg viewBox={`0 0 ${N * cell + 30} ${N * cell + 30}`} className="race-grid" role="img" aria-label={`${t} of ${NAIVE_PAIRS.length} pairs checked`}>
            {Array.from({ length: N }, (_, i) =>
              Array.from({ length: N }, (_, j) =>
                j > i ? (
                  <rect
                    key={`${i},${j}`}
                    x={24 + j * cell}
                    y={24 + i * cell}
                    width={cell - 3}
                    height={cell - 3}
                    rx={4}
                    className={naiveDone && i === 10 && j === 11 ? "rg-hit" : tried.has(`${i},${j}`) ? "rg-tried" : "rg-cell"}
                  />
                ) : null,
              ),
            )}
            {Array.from({ length: N }, (_, k) => (
              <g key={k}>
                <text x={24 + k * cell + 9} y={16} textAnchor="middle" className="rg-axis">
                  {k}
                </text>
                <text x={12} y={24 + k * cell + 14} textAnchor="middle" className="rg-axis">
                  {k}
                </text>
              </g>
            ))}
            {t > 0 && !naiveDone && <motion.rect className="rg-cursor" width={cell + 1} height={cell + 1} rx={5} initial={false} animate={{ x: 24 + cur[1] * cell - 2, y: 24 + cur[0] * cell - 2 }} transition={{ duration: TICK / 1000 }} />}
          </svg>
          <div className="race-count">
            <b>{Math.min(t, NAIVE_PAIRS.length)}</b> pairs checked
            {naiveDone && <span className="race-done">found [10, 11]</span>}
          </div>
        </div>

        <div className="race-lane">
          <div className="race-head">
            <h3>Hash map: one pass</h3>
            <p>Each number asks the map for its partner. Work grows with the input.</p>
          </div>
          <div className="race-row">
            {NUMS.map((v, i) => (
              <motion.span key={i} className="race-cell" initial={false} animate={{ opacity: i < mapT ? 1 : 0.3, scale: i === mapT - 1 && !mapDone ? 1.12 : 1 }}>
                <span className={mapDone && (i === 10 || i === 11) ? "hit" : i < mapT ? "seen" : ""}>{v}</span>
              </motion.span>
            ))}
          </div>
          <div className="race-map">
            {NUMS.slice(0, Math.min(mapT, MAP_STEPS - 1)).map((v, i) => (
              <motion.span key={v} className="race-entry" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <span className="map-key">{v}</span>
                <span className="race-arrow">→</span>
                {i}
              </motion.span>
            ))}
          </div>
          <div className="race-count">
            <b>{mapT}</b> lookups
            {mapDone && <span className="race-done">found [10, 11]</span>}
          </div>
        </div>
      </div>

      <div className="race-foot">
        <p>
          {naiveDone
            ? `Same answer. ${NAIVE_PAIRS.length} checks against ${MAP_STEPS}, and the gap widens with every number you add.`
            : "Both start together on the same numbers."}
        </p>
        <Button className="race-replay" variant="outline" radius="xl" onClick={replay} disabled={running}>
          {running ? "Running…" : "Run it again"}
        </Button>
      </div>
    </div>
  );
}
