// Small looping scenes, one per station: each shows the idea running, not a picture of it.
// Every scene is a 360 x 200 SVG driven by a frame counter, so all of them pause, resume
// and hold still for reduced motion the same way.

import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "./reducedMotion.ts";
import type { IllusKind } from "./stations.ts";

const spring = { type: "spring", stiffness: 260, damping: 26 } as const;
const ease = { duration: 0.5, ease: [0.16, 1, 0.3, 1] } as const;

/** Frame counter 0..n-1 that loops while `playing`; holds `still` for reduced motion. */
function useFrame(n: number, ms: number, playing: boolean, still = n - 1): number {
  const [reduced] = useState(prefersReducedMotion);
  const [f, setF] = useState(reduced ? still : 0);
  useEffect(() => {
    if (!playing || reduced) return;
    const t = setInterval(() => setF((x) => (x + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms, playing, reduced]);
  return f;
}

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg className="il" viewBox="0 0 360 200" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

type P = { color: string; playing: boolean };

function Cell({ x, y, w = 36, text, on, dim, color }: { x: number; y: number; w?: number; text: string | number; on?: boolean; dim?: boolean; color: string }) {
  return (
    <g>
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={36}
        rx={7}
        initial={false}
        animate={{ fill: on ? color : "var(--panel)", opacity: dim ? 0.35 : 1 }}
        transition={ease}
        stroke="var(--line-2)"
      />
      <text x={x + w / 2} y={y + 23} textAnchor="middle" className={on ? "il-on" : ""}>
        {text}
      </text>
    </g>
  );
}

function Pointer({ x, y, name, color }: { x: number; y: number; name: string; color: string }) {
  return (
    <motion.g initial={false} animate={{ x, y }} transition={spring}>
      <path d="M 0 0 L 7 10 L -7 10 Z" fill={color} />
      <text x={0} y={24} textAnchor="middle" className="il-ptr" fill={color}>
        {name}
      </text>
    </motion.g>
  );
}

/* ---------------- algorithms ---------------- */

const TS = [3, 8, 5, 2, 7];
function HashMapScene({ color, playing }: P) {
  const f = useFrame(8, 1100, playing, 5);
  const i = Math.min(f, 4);
  const found = f >= 5;
  const seen = TS.slice(0, found ? 4 : i);
  return (
    <Frame label="Two Sum with a hash map">
      {TS.map((v, k) => (
        <Cell key={k} x={88 + k * 38} y={20} text={v} color={color} on={found && (k === 3 || k === 4)} dim={!found && k > i} />
      ))}
      <Pointer x={88 + i * 38 + 18} y={60} name="i" color={color} />
      <text x={32} y={112} className="il-note">target 9</text>
      <text x={32} y={132} className="il-note">
        need {9 - TS[i]}
      </text>
      <text x={32} y={156} className={found ? "il-good" : "il-note"}>
        {found ? "found: [3, 4]" : seen.includes(9 - TS[i]) ? "in map" : "not yet"}
      </text>
      <text x={196} y={104} className="il-head">seen → index</text>
      {seen.map((v, k) => (
        <motion.g key={v} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={ease}>
          <rect x={196} y={112 + k * 21} width={34} height={18} rx={9} className="il-key" />
          <text x={213} y={125 + k * 21} textAnchor="middle" className="il-keyt">
            {v}
          </text>
          <text x={238} y={125 + k * 21} className="il-note">→ {k}</text>
        </motion.g>
      ))}
    </Frame>
  );
}

const SORTED = [1, 3, 4, 6, 8, 11];
const PTR_FRAMES: [number, number][] = [
  [0, 5],
  [0, 4],
  [1, 4],
  [1, 3],
  [2, 3],
  [2, 3],
];
function PointersScene({ color, playing }: P) {
  const f = useFrame(PTR_FRAMES.length, 1100, playing);
  const [l, r] = PTR_FRAMES[f];
  const sum = SORTED[l] + SORTED[r];
  const done = sum === 10;
  return (
    <Frame label="Two pointers walking inward on a sorted array">
      {SORTED.map((v, k) => (
        <Cell key={k} x={66 + k * 38} y={34} text={v} color={color} on={done && (k === l || k === r)} dim={k < l || k > r} />
      ))}
      <Pointer x={66 + l * 38 + 18} y={76} name="l" color={color} />
      <Pointer x={66 + r * 38 + 18} y={76} name="r" color={color} />
      <text x={180} y={150} textAnchor="middle" className="il-big">
        {SORTED[l]} + {SORTED[r]} = {sum}
      </text>
      <text x={180} y={174} textAnchor="middle" className={done ? "il-good" : "il-note"}>
        {done ? "hits the target 10" : sum > 10 ? "too big: move r left" : "too small: move l right"}
      </text>
    </Frame>
  );
}

const WS = "abcabcbb";
const WINDOW_FRAMES = (() => {
  const out: { l: number; r: number; best: number }[] = [];
  let l = 0;
  let best = 0;
  for (let r = 0; r < WS.length; r++) {
    while (WS.slice(l, r).includes(WS[r])) l++;
    best = Math.max(best, r - l + 1);
    out.push({ l, r, best });
  }
  return out;
})();
function WindowScene({ color, playing }: P) {
  const f = useFrame(WINDOW_FRAMES.length + 1, 900, playing, 3);
  const { l, r, best } = WINDOW_FRAMES[Math.min(f, WINDOW_FRAMES.length - 1)];
  const cw = 36;
  const x0 = 36;
  return (
    <Frame label="Sliding window over abcabcbb">
      {[...WS].map((c, k) => (
        <Cell key={k} x={x0 + k * cw} y={34} w={cw} text={c} color="var(--accent-soft)" dim={k > r} />
      ))}
      <motion.rect
        y={28}
        height={48}
        rx={10}
        fill="none"
        stroke={color}
        strokeWidth={3}
        initial={false}
        animate={{ x: x0 + l * cw - 3, width: (r - l + 1) * cw + 6 }}
        transition={spring}
      />
      <Pointer x={x0 + l * cw + 18} y={84} name="l" color={color} />
      <Pointer x={x0 + r * cw + 18} y={84} name="r" color={color} />
      <text x={36} y={160} className="il-head">window</text>
      {[...WS.slice(l, r + 1)].map((c, k) => (
        <g key={c + k}>
          <rect x={92 + k * 26} y={148} width={22} height={18} rx={9} className="il-key" />
          <text x={103 + k * 26} y={161} textAnchor="middle" className="il-keyt">
            {c}
          </text>
        </g>
      ))}
      <text x={324} y={161} textAnchor="end" className="il-big">
        best {best}
      </text>
    </Frame>
  );
}

// Tree 4(2(1,3),7(6,9)); a node's place is its path, with the bits above `depth` mirrored.
const TREE = [
  { v: 4, path: "" },
  { v: 2, path: "0" },
  { v: 7, path: "1" },
  { v: 1, path: "00" },
  { v: 3, path: "01" },
  { v: 6, path: "10" },
  { v: 9, path: "11" },
];
function treePos(path: string, swapped: number) {
  let lo = 20;
  let hi = 340;
  for (let d = 0; d < path.length; d++) {
    const bit = d < swapped ? 1 - Number(path[d]) : Number(path[d]);
    const mid = (lo + hi) / 2;
    if (bit) lo = mid;
    else hi = mid;
  }
  return { x: (lo + hi) / 2, y: 30 + path.length * 62 };
}
function TreeScene({ color, playing }: P) {
  const f = useFrame(6, 1200, playing, 2);
  const swapped = [0, 1, 2, 2, 1, 0][f];
  const pos = Object.fromEntries(TREE.map((n) => [n.path, treePos(n.path, swapped)]));
  return (
    <Frame label="Inverting a binary tree">
      {TREE.filter((n) => n.path).map((n) => {
        const a = pos[n.path.slice(0, -1)];
        const b = pos[n.path];
        return <motion.line key={"e" + n.path} initial={false} animate={{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }} transition={spring} stroke="var(--line-2)" strokeWidth={2} />;
      })}
      {TREE.map((n) => (
        <motion.g key={n.v} initial={false} animate={{ x: pos[n.path].x, y: pos[n.path].y }} transition={spring}>
          <circle r={17} fill={n.path.length < swapped ? color : "var(--panel)"} stroke={color} strokeWidth={2} />
          <text y={5} textAnchor="middle" className={n.path.length < swapped ? "il-on" : ""}>
            {n.v}
          </text>
        </motion.g>
      ))}
      <text x={340} y={188} textAnchor="end" className="il-note">
        {swapped === 0 ? "original" : swapped === 2 ? "inverted" : "root swapped its children"}
      </text>
    </Frame>
  );
}

const ISLAND_MAP = ["11000110", "11000100", "00100000", "00011011"];
const ISLAND_ORDER = (() => {
  const seen = new Set<string>();
  const out: { r: number; c: number; island: number }[] = [];
  let island = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 8; c++) {
      if (ISLAND_MAP[r][c] !== "1" || seen.has(`${r},${c}`)) continue;
      const q = [[r, c]];
      seen.add(`${r},${c}`);
      while (q.length) {
        const [y, x] = q.shift()!;
        out.push({ r: y, c: x, island });
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy;
          const nx = x + dx;
          if (ISLAND_MAP[ny]?.[nx] === "1" && !seen.has(`${ny},${nx}`)) {
            seen.add(`${ny},${nx}`);
            q.push([ny, nx]);
          }
        }
      }
      island++;
    }
  return out;
})();
const ISLAND_COLORS = ["var(--p0)", "var(--p2)", "var(--p1)", "var(--p3)", "var(--p5)"];
function IslandsScene({ playing }: P) {
  const n = ISLAND_ORDER.length;
  const f = useFrame(n + 3, 450, playing, n);
  const shown = ISLAND_ORDER.slice(0, Math.min(f, n));
  const count = shown.length ? shown[shown.length - 1].island + 1 : 0;
  const color = new Map(shown.map((s) => [`${s.r},${s.c}`, ISLAND_COLORS[s.island % 5]]));
  return (
    <Frame label="Counting islands with a flood fill">
      {ISLAND_MAP.flatMap((row, r) =>
        [...row].map((v, c) => (
          <motion.rect
            key={`${r},${c}`}
            x={44 + c * 34}
            y={14 + r * 34}
            width={30}
            height={30}
            rx={6}
            initial={false}
            animate={{ fill: color.get(`${r},${c}`) ?? (v === "1" ? "var(--line-2)" : "var(--panel-2)") }}
            transition={ease}
            stroke="var(--line)"
          />
        )),
      )}
      <text x={44} y={176} className="il-note">
        land waits grey; each fill is one island
      </text>
      <text x={316} y={176} textAnchor="end" className="il-big">
        islands {count}
      </text>
    </Frame>
  );
}

const STAIRS = [1, 1, 2, 3, 5, 8, 13, 21];
function DpScene({ color, playing }: P) {
  const f = useFrame(STAIRS.length + 2, 800, playing, STAIRS.length);
  const k = Math.min(f, STAIRS.length);
  const x = (i: number) => 32 + i * 38;
  return (
    <Frame label="Climbing stairs, filled left to right">
      {STAIRS.map((v, i) => (
        <motion.g key={i} initial={false} animate={{ opacity: i < k ? 1 : 0.25 }} transition={ease}>
          <rect x={x(i)} y={150 - i * 14} width={34} height={14 + i * 14} rx={5} fill={i === k - 1 ? color : "var(--accent-soft)"} stroke="var(--line-2)" />
          <text x={x(i) + 17} y={140 - i * 14} textAnchor="middle">
            {i < k ? v : "?"}
          </text>
          <text x={x(i) + 17} y={182} textAnchor="middle" className="il-note">
            {i}
          </text>
        </motion.g>
      ))}
      {k >= 3 && k <= STAIRS.length && (
        <g key={k} className="il-arcs">
          <path d={`M ${x(k - 2) + 17} ${150 - (k - 2) * 14 - 26} Q ${x(k - 1) + 4} ${100 - k * 14} ${x(k - 1) + 17} ${150 - (k - 1) * 14 - 26}`} stroke={color} />
          <path d={`M ${x(k - 3) + 17} ${150 - (k - 3) * 14 - 26} Q ${x(k - 2) + 4} ${80 - k * 14} ${x(k - 1) + 17} ${150 - (k - 1) * 14 - 26}`} stroke={color} />
        </g>
      )}
      <text x={32} y={24} className="il-note">
        ways(n) = ways(n−1) + ways(n−2)
      </text>
    </Frame>
  );
}

/* ---------------- building blocks ---------------- */

const RING_SERVERS = [
  { name: "A", deg: 30 },
  { name: "B", deg: 150 },
  { name: "C", deg: 270 },
];
const RING_KEYS = [12, 55, 80, 118, 140, 175, 196, 222, 250, 300, 333, 352];
function owner(deg: number, servers: { name: string; deg: number }[]) {
  const sorted = [...servers].sort((a, b) => a.deg - b.deg);
  return (sorted.find((s) => s.deg >= deg) ?? sorted[0]).name;
}
const SERVER_COLORS: Record<string, string> = { A: "var(--p0)", B: "var(--p2)", C: "var(--p3)", D: "var(--p1)" };
function RingScene({ playing }: P) {
  const f = useFrame(5, 1400, playing, 2);
  const withD = f >= 1 && f <= 3;
  const servers = withD ? [...RING_SERVERS, { name: "D", deg: 210 }] : RING_SERVERS;
  const at = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: 150 + r * Math.cos(a), y: 100 + r * Math.sin(a) };
  };
  const moved = RING_KEYS.filter((k) => owner(k, servers) !== owner(k, RING_SERVERS)).length;
  return (
    <Frame label="Consistent hashing ring">
      <circle cx={150} cy={100} r={72} fill="none" stroke="var(--line-2)" strokeWidth={10} />
      {RING_KEYS.map((k) => {
        const p = at(k, 72);
        const o = owner(k, servers);
        return <motion.circle key={k} cx={p.x} cy={p.y} r={5} initial={false} animate={{ fill: SERVER_COLORS[o], scale: o === "D" ? 1.5 : 1 }} transition={ease} />;
      })}
      {servers.map((s) => {
        const p = at(s.deg, 100);
        return (
          <motion.g key={s.name} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={spring} style={{ originX: `${p.x}px`, originY: `${p.y}px` }}>
            <rect x={p.x - 13} y={p.y - 11} width={26} height={22} rx={6} fill={SERVER_COLORS[s.name]} />
            <text x={p.x} y={p.y + 5} textAnchor="middle" className="il-on">
              {s.name}
            </text>
          </motion.g>
        );
      })}
      <text x={268} y={84} className="il-big">
        {withD ? "D joins" : "3 servers"}
      </text>
      <text x={268} y={106} className="il-note">
        {withD ? `${moved} of 12 keys move` : "keys go clockwise"}
      </text>
      <text x={268} y={124} className="il-note">
        {withD ? "the rest stay put" : "to the next server"}
      </text>
    </Frame>
  );
}

const BLOOM_STEPS = [
  { word: "", bits: [] as number[], add: true },
  { word: "cat", bits: [2, 7, 13], add: true },
  { word: "dog", bits: [4, 7, 11], add: true },
  { word: "cow", bits: [2, 9, 13], add: false },
  { word: "cat", bits: [2, 7, 13], add: false },
];
function BloomScene({ color, playing }: P) {
  const f = useFrame(BLOOM_STEPS.length, 1500, playing, 3);
  const step = BLOOM_STEPS[f];
  const on = new Set(BLOOM_STEPS.slice(0, f + 1).filter((s) => s.add).flatMap((s) => s.bits));
  const allOn = step.bits.every((b) => on.has(b));
  const bx = (b: number) => 20 + b * 20;
  return (
    <Frame label="Bloom filter bits">
      {step.word && (
        <g>
          <rect x={150} y={14} width={60} height={26} rx={13} className="il-key" />
          <text x={180} y={32} textAnchor="middle" className="il-keyt">
            {step.word}
          </text>
          {step.bits.map((b) => (
            <motion.line key={step.word + f + b} x1={180} y1={40} x2={bx(b) + 9} y2={104} stroke={step.add ? color : on.has(b) ? "var(--ok)" : "var(--bad)"} strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={ease} />
          ))}
        </g>
      )}
      {Array.from({ length: 16 }, (_, b) => (
        <g key={b}>
          <motion.rect x={bx(b)} y={106} width={18} height={30} rx={4} initial={false} animate={{ fill: on.has(b) ? color : "var(--panel)" }} transition={ease} stroke="var(--line-2)" />
          <text x={bx(b) + 9} y={126} textAnchor="middle" className={on.has(b) ? "il-on il-small" : "il-small"}>
            {on.has(b) ? 1 : 0}
          </text>
        </g>
      ))}
      <text x={180} y={172} textAnchor="middle" className={step.add ? "il-note" : allOn ? "il-good" : "il-bad"}>
        {!step.word ? "16 bits, all off" : step.add ? `add "${step.word}": set 3 bits` : allOn ? `"${step.word}"? all 3 on: maybe in the set` : `"${step.word}"? a bit is off: definitely not`}
      </text>
    </Frame>
  );
}

// Token bucket: capacity 4, one token back every other tick, a burst then a trickle.
const BUCKET = (() => {
  const arrivals = [1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0];
  let tokens = 4;
  return arrivals.map((a, t) => {
    if (t % 2 === 1 && tokens < 4) tokens++;
    let result: "ok" | "429" | "" = "";
    if (a) {
      if (tokens > 0) {
        tokens--;
        result = "ok";
      } else result = "429";
    }
    return { tokens, result };
  });
})();
function BucketScene({ color, playing }: P) {
  const f = useFrame(BUCKET.length, 700, playing, 5);
  const { tokens, result } = BUCKET[f];
  return (
    <Frame label="Token bucket rate limiter">
      <path d="M 140 50 L 146 170 H 214 L 220 50" fill="var(--panel-2)" stroke="var(--ink-2)" strokeWidth={2.5} strokeLinejoin="round" />
      {[0, 1, 2, 3].map((k) => (
        <motion.circle key={k} cx={180} cy={152 - k * 26} r={11} initial={false} animate={{ opacity: k < tokens ? 1 : 0, scale: k < tokens ? 1 : 0.4 }} transition={ease} fill={color} />
      ))}
      <text x={180} y={36} textAnchor="middle" className="il-note">
        refills 1 every 2 ticks
      </text>
      {result && (
        <motion.g key={f} initial={{ x: -90, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={ease}>
          <rect x={40} y={92} width={66} height={26} rx={13} fill="var(--panel)" stroke="var(--line-2)" />
          <text x={73} y={110} textAnchor="middle" className="il-small">
            request
          </text>
        </motion.g>
      )}
      {result && (
        <motion.text key={"r" + f} x={262} y={112} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={ease} className={result === "ok" ? "il-good il-big" : "il-bad il-big"}>
          {result === "ok" ? "200 OK" : "429"}
        </motion.text>
      )}
      <text x={262} y={136} className="il-note">
        {tokens} token{tokens === 1 ? "" : "s"} left
      </text>
    </Frame>
  );
}

const RAFT_NODES = [0, 1, 2, 3, 4].map((k) => {
  const a = ((k * 72 - 90) * Math.PI) / 180;
  return { x: 180 + 72 * Math.cos(a), y: 104 + 72 * Math.sin(a) };
});
function RaftScene({ color, playing }: P) {
  const f = useFrame(10, 900, playing, 8);
  const leader = f < 4 ? 0 : f >= 7 ? 2 : -1;
  const down = f >= 4;
  const term = f >= 6 ? 2 : 1;
  const beat = (f < 4 && f % 2 === 0) || (f >= 7 && f % 2 === 1);
  const voting = f === 6;
  const caption = f < 4 ? "leader 0 sends heartbeats" : f === 4 ? "leader 0 goes down" : f === 5 ? "node 2 times out" : f === 6 ? "node 2 asks for votes, gets 3 of 5" : "node 2 leads term 2";
  return (
    <Frame label="Raft leader election">
      {beat &&
        RAFT_NODES.map((n, k) =>
          k === leader || (down && k === 0) ? null : (
            <motion.line key={`b${f}${k}`} x1={RAFT_NODES[leader].x} y1={RAFT_NODES[leader].y} x2={n.x} y2={n.y} stroke={color} strokeWidth={2} strokeDasharray="4 5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={ease} />
          ),
        )}
      {voting &&
        [1, 3].map((k) => (
          <motion.line key={`v${k}`} x1={RAFT_NODES[k].x} y1={RAFT_NODES[k].y} x2={RAFT_NODES[2].x} y2={RAFT_NODES[2].y} stroke="var(--ok)" strokeWidth={2.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={ease} />
        ))}
      {RAFT_NODES.map((n, k) => {
        const dead = down && k === 0;
        const isLeader = k === leader;
        const candidate = k === 2 && (f === 5 || f === 6);
        return (
          <g key={k}>
            {candidate && <motion.circle cx={n.x} cy={n.y} r={25} fill="none" stroke={color} strokeWidth={3} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />}
            <motion.circle cx={n.x} cy={n.y} r={18} initial={false} animate={{ fill: dead ? "var(--panel-2)" : isLeader ? color : "var(--panel)", opacity: dead ? 0.45 : 1 }} transition={ease} stroke={dead ? "var(--line-2)" : color} strokeWidth={2} />
            <text x={n.x} y={n.y + 5} textAnchor="middle" className={isLeader ? "il-on" : ""}>
              {dead ? "×" : k}
            </text>
          </g>
        );
      })}
      <text x={16} y={22} className="il-head">term {term}</text>
      <text x={180} y={196} textAnchor="middle" className="il-note">
        {caption}
      </text>
    </Frame>
  );
}

/* ---------------- system design ---------------- */

function Box({ x, y, w, h, label, tone, color }: { x: number; y: number; w: number; h: number; label: string; tone?: "down" | "on"; color: string }) {
  return (
    <g>
      <motion.rect x={x} y={y} width={w} height={h} rx={8} initial={false} animate={{ fill: tone === "down" ? "var(--bad-soft)" : tone === "on" ? color : "var(--panel)" }} transition={ease} stroke={tone === "down" ? "var(--bad)" : "var(--line-2)"} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" className={tone === "on" ? "il-on il-small" : tone === "down" ? "il-bad il-small" : "il-small"}>
        {label}
      </text>
    </g>
  );
}

function Packet({ path, dur, delay, color }: { path: string; dur: number; delay: number; color: string }) {
  return (
    <circle r={4} fill={color}>
      <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" path={path} />
    </circle>
  );
}

function TrafficScene({ color, playing }: P) {
  const f = useFrame(8, 1100, playing, 4);
  const downIdx = f >= 3 && f <= 6 ? 1 : -1;
  const servers = [40, 92, 144];
  const reduced = prefersReducedMotion();
  return (
    <Frame label="Load balancer routing around a failed server">
      <Box x={14} y={80} w={58} h={36} label="users" color={color} />
      <Box x={110} y={80} w={50} h={36} label="LB" tone="on" color={color} />
      {servers.map((y, k) => (
        <g key={k}>
          <line x1={160} y1={98} x2={210} y2={y + 16} stroke={k === downIdx ? "var(--bad)" : "var(--line-2)"} strokeDasharray={k === downIdx ? "3 4" : undefined} />
          <Box x={210} y={y} w={62} h={32} label={k === downIdx ? "down" : `app ${k + 1}`} tone={k === downIdx ? "down" : undefined} color={color} />
          <line x1={272} y1={y + 16} x2={300} y2={98} stroke="var(--line-2)" />
        </g>
      ))}
      <line x1={72} y1={98} x2={110} y2={98} stroke="var(--line-2)" />
      <Box x={300} y={80} w={48} h={36} label="DB" color={color} />
      {playing &&
        !reduced &&
        servers.map((y, k) =>
          k === downIdx ? null : [0, 0.45].map((d) => <Packet key={`${k}${d}${downIdx}`} path={`M 72 98 L 160 98 L 210 ${y + 16} L 272 ${y + 16} L 300 98`} dur={1.6} delay={d + k * 0.25} color={color} />),
        )}
      <text x={180} y={190} textAnchor="middle" className={downIdx >= 0 ? "il-bad" : "il-note"}>
        {downIdx >= 0 ? "app 2 fails: traffic shifts to 1 and 3" : "3 app servers behind a load balancer"}
      </text>
    </Frame>
  );
}

const CACHE_REQS = ["a", "b", "a", "a", "c", "b", "a"];
function CacheScene({ color, playing }: P) {
  const f = useFrame(CACHE_REQS.length + 1, 1100, playing, 3);
  const k = Math.min(f, CACHE_REQS.length - 1);
  const key = CACHE_REQS[k];
  const before = new Set(CACHE_REQS.slice(0, k));
  const hit = before.has(key);
  const hits = CACHE_REQS.slice(0, k + 1).filter((x, i) => CACHE_REQS.slice(0, i).includes(x)).length;
  const cached = [...new Set(CACHE_REQS.slice(0, k + 1))];
  return (
    <Frame label="Cache hits and misses">
      <Box x={16} y={70} w={64} h={40} label="app" color={color} />
      <Box x={140} y={62} w={80} h={56} label="" tone={hit ? "on" : undefined} color={color} />
      <text x={180} y={56} textAnchor="middle" className="il-head">cache</text>
      {cached.map((c, i) => (
        <g key={c}>
          <rect x={148 + i * 24} y={80} width={20} height={20} rx={10} className="il-key" />
          <text x={158 + i * 24} y={94} textAnchor="middle" className="il-keyt">
            {c}
          </text>
        </g>
      ))}
      <Box x={284} y={70} w={60} h={40} label="DB" tone={hit ? undefined : "on"} color={color} />
      <line x1={80} y1={90} x2={140} y2={90} stroke={color} strokeWidth={2} />
      <motion.line x1={220} y1={90} x2={284} y2={90} initial={false} animate={{ opacity: hit ? 0.2 : 1 }} stroke={color} strokeWidth={2} strokeDasharray="4 4" />
      <motion.g key={f} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={ease}>
        <text x={48} y={140} textAnchor="middle" className="il-big">
          get {key}
        </text>
        <text x={180} y={150} textAnchor="middle" className={hit ? "il-good il-big" : "il-bad il-big"}>
          {hit ? "hit" : "miss"}
        </text>
        <text x={180} y={170} textAnchor="middle" className="il-note">
          {hit ? "answered from memory" : "read the DB, then fill the cache"}
        </text>
      </motion.g>
      <text x={344} y={150} textAnchor="end" className="il-note">
        {hits}/{k + 1} hits
      </text>
    </Frame>
  );
}

function FanoutScene({ color, playing }: P) {
  const f = useFrame(8, 700, playing, 6);
  const delivered = Math.min(Math.max(f - 1, 0), 5);
  const ys = [22, 56, 90, 124, 158];
  return (
    <Frame label="A post fanning out to follower timelines">
      <circle cx={46} cy={100} r={22} fill={color} />
      <text x={46} y={105} textAnchor="middle" className="il-on">
        you
      </text>
      <motion.rect x={78} y={86} width={52} height={28} rx={6} fill="var(--panel)" stroke={color} strokeWidth={2} initial={false} animate={{ scale: f === 1 ? 1.1 : 1 }} />
      <text x={104} y={104} textAnchor="middle" className="il-small">
        post
      </text>
      {ys.map((y, k) => (
        <g key={k}>
          <line x1={130} y1={100} x2={214} y2={y + 12} stroke="var(--line-2)" />
          <rect x={214} y={y} width={130} height={26} rx={6} fill="var(--panel-2)" stroke="var(--line)" />
          <text x={222} y={y + 17} className="il-small il-dim">
            follower {k + 1}
          </text>
          {k < delivered && (
            <motion.rect key={`${k}${f > 0}`} x={288} y={y + 5} width={50} height={16} rx={4} fill={color} initial={{ x: -150, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={ease} />
          )}
        </g>
      ))}
      <text x={20} y={150} className="il-note">
        written once,
      </text>
      <text x={20} y={166} className="il-note">
        copied {delivered} times
      </text>
    </Frame>
  );
}

/* ---------------- code design ---------------- */

const LRU_OPS: { op: string; list: string[]; evicted?: string }[] = [
  { op: "start", list: ["d", "c", "b", "a"] },
  { op: "get b", list: ["b", "d", "c", "a"] },
  { op: "put e", list: ["e", "b", "d", "c"], evicted: "a" },
  { op: "get c", list: ["c", "e", "b", "d"] },
  { op: "put f", list: ["f", "c", "e", "b"], evicted: "d" },
];
function LruScene({ color, playing }: P) {
  const f = useFrame(LRU_OPS.length, 1400, playing, 2);
  const { op, list, evicted } = LRU_OPS[f];
  return (
    <Frame label="LRU cache moving keys to the front">
      <text x={30} y={40} className="il-big">
        {op}
      </text>
      <text x={40} y={142} className="il-note">
        newest
      </text>
      <text x={300} y={142} textAnchor="middle" className="il-note">
        oldest
      </text>
      {list.map((k, i) => (
        <motion.g key={k} layout initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, x: 40 + i * 68, y: 0 }} transition={spring}>
          <rect y={76} width={52} height={40} rx={8} fill={i === 0 && op !== "start" ? color : "var(--panel)"} stroke="var(--line-2)" />
          <text x={26} y={101} textAnchor="middle" className={i === 0 && op !== "start" ? "il-on" : ""}>
            {k}
          </text>
          {i < list.length - 1 && <path d="M 54 96 h 12" stroke="var(--line-2)" strokeWidth={2} />}
        </motion.g>
      ))}
      {evicted && (
        <motion.text key={evicted} x={300} y={178} textAnchor="middle" className="il-bad" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={ease}>
          evicted {evicted}
        </motion.text>
      )}
    </Frame>
  );
}

function IdempotencyScene({ color, playing }: P) {
  const f = useFrame(6, 1300, playing, 4);
  const caption = ["POST /pay  key k7", "server charges $20, saves k7", "the reply is lost", "client retries with k7", "server finds k7: same reply, no new charge", "one charge"][f];
  return (
    <Frame label="Idempotency key on a retried payment">
      <Box x={16} y={60} w={70} h={40} label="client" color={color} />
      <Box x={150} y={60} w={70} h={40} label="server" tone={f === 1 || f === 4 ? "on" : undefined} color={color} />
      <rect x={262} y={44} width={86} height={84} rx={8} fill="var(--panel-2)" stroke="var(--line-2)" />
      <text x={305} y={62} textAnchor="middle" className="il-head">ledger</text>
      {f >= 1 && (
        <motion.text x={305} y={86} textAnchor="middle" className="il-big" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          $20
        </motion.text>
      )}
      {f >= 1 && (
        <g>
          <rect x={276} y={98} width={58} height={18} rx={9} className="il-key" />
          <text x={305} y={111} textAnchor="middle" className="il-keyt">
            k7 saved
          </text>
        </g>
      )}
      {(f === 0 || f === 3) && <motion.circle key={`req${f}`} r={6} fill={color} initial={{ cx: 86, cy: 74 }} animate={{ cx: 150, cy: 74 }} transition={{ duration: 0.8 }} />}
      {f === 2 && (
        <g>
          <line x1={150} y1={88} x2={86} y2={88} stroke="var(--bad)" strokeDasharray="4 4" strokeWidth={2} />
          <text x={118} y={84} textAnchor="middle" className="il-bad il-big">
            ×
          </text>
        </g>
      )}
      {f >= 4 && <motion.line x1={150} y1={88} x2={86} y2={88} stroke="var(--ok)" strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />}
      <text x={180} y={170} textAnchor="middle" className={f >= 4 ? "il-good" : f === 2 ? "il-bad" : "il-note"}>
        {caption}
      </text>
    </Frame>
  );
}

/* ---------------- practice ---------------- */

const ESTIMATE = [
  { label: "500M users × 0.2", value: "100M photos" },
  { label: "× 2 MB each", value: "200 TB" },
  { label: "× 1.5 resized copies", value: "300 TB" },
  { label: "× 3 replicas", value: "900 TB ≈ 1 PB/day" },
];
function EstimateScene({ color, playing }: P) {
  const f = useFrame(ESTIMATE.length + 2, 1100, playing, ESTIMATE.length);
  return (
    <Frame label="Estimating photo storage per day">
      <text x={20} y={26} className="il-head">photo storage per day</text>
      {ESTIMATE.map((row, i) => (
        <motion.g key={i} initial={false} animate={{ opacity: i < f ? 1 : 0.15, x: i < f ? 0 : -8 }} transition={ease}>
          <text x={20} y={62 + i * 36} className="il-note">
            {row.label}
          </text>
          <text x={340} y={62 + i * 36} textAnchor="end" className={i === ESTIMATE.length - 1 ? "il-big il-strong" : "il-big"} fill={i === ESTIMATE.length - 1 ? color : undefined}>
            {row.value}
          </text>
          <line x1={20} x2={340} y1={72 + i * 36} y2={72 + i * 36} stroke="var(--line)" />
        </motion.g>
      ))}
    </Frame>
  );
}

const STORM = [10, 10, 10, 10, 0, 0, 22, 34, 30, 38, 33, 36];
const CALM = [10, 10, 10, 10, 0, 0, 8, 11, 12, 10, 11, 10];
function RetryScene({ color, playing }: P) {
  const f = useFrame(2, 2600, playing, 0);
  const bars = f === 0 ? STORM : CALM;
  return (
    <Frame label="Retry storm versus backoff with jitter">
      <line x1={20} x2={340} y1={160} y2={160} stroke="var(--line-2)" />
      <line x1={20} x2={340} y1={160 - 14 * 3} y2={160 - 14 * 3} stroke="var(--bad)" strokeDasharray="4 4" />
      <text x={340} y={160 - 14 * 3 - 6} textAnchor="end" className="il-bad il-small">
        capacity
      </text>
      {bars.map((v, i) => (
        <motion.rect key={i} x={28 + i * 26} width={18} rx={3} initial={false} animate={{ y: 160 - v * 3, height: Math.max(v * 3, 1) }} transition={spring} fill={i === 4 || i === 5 ? "var(--line-2)" : v * 3 > 42 ? "var(--bad)" : color} />
      ))}
      <text x={20} y={26} className="il-big">
        {f === 0 ? "retry at once" : "backoff + jitter"}
      </text>
      <text x={20} y={46} className="il-note">
        {f === 0 ? "a blip, then every client retries together" : "retries spread out, load stays under capacity"}
      </text>
      <text x={20 + 4 * 26} y={184} className="il-note il-small">
        outage
      </text>
    </Frame>
  );
}

const CARDS = [
  { q: "Read from the CPU's L1 cache", a: "about 1 ns" },
  { q: "Read from main memory", a: "about 100 ns" },
  { q: "Random 4 KB read, NVMe SSD", a: "~100 µs" },
  { q: "Round trip, California to Europe", a: "about 150 ms" },
];
function FlashcardScene({ color, playing }: P) {
  const f = useFrame(CARDS.length * 2, 1500, playing, 1);
  const card = CARDS[Math.floor(f / 2)];
  const back = f % 2 === 1;
  return (
    <Frame label="A latency flashcard flipping">
      <motion.g key={"c" + f} animate={{ scaleX: [1, 0.02, 1] }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ originX: "180px", originY: "100px" }}>
        <rect x={60} y={30} width={240} height={140} rx={14} fill={back ? color : "var(--panel)"} stroke={color} strokeWidth={2} />
      </motion.g>
      <motion.g key={f} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.3 }}>
        <text x={180} y={88} textAnchor="middle" className={back ? "il-on il-small" : "il-note"}>
          {back ? card.q : "how long?"}
        </text>
        <text x={180} y={118} textAnchor="middle" className={back ? "il-on il-big" : "il-big"}>
          {back ? card.a : card.q}
        </text>
      </motion.g>
      <text x={180} y={194} textAnchor="middle" className="il-note">
        card {Math.floor(f / 2) + 1} of 4 shown here
      </text>
    </Frame>
  );
}

const SCENES: Record<IllusKind, (p: P) => ReactNode> = {
  hashmap: HashMapScene,
  pointers: PointersScene,
  window: WindowScene,
  tree: TreeScene,
  islands: IslandsScene,
  dp: DpScene,
  ring: RingScene,
  bloom: BloomScene,
  bucket: BucketScene,
  raft: RaftScene,
  traffic: TrafficScene,
  cache: CacheScene,
  fanout: FanoutScene,
  lru: LruScene,
  idempotency: IdempotencyScene,
  estimate: EstimateScene,
  retry: RetryScene,
  flashcard: FlashcardScene,
};

export function Illustration({ kind, color, playing }: { kind: IllusKind; color: string; playing: boolean }) {
  const Scene = SCENES[kind];
  return <Scene color={color} playing={playing} />;
}
