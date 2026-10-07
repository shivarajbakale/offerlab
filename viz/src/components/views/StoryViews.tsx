import { rangeHistory, searchSpace, windowHistory, type PairState, type RangeStory, type WindowStory } from "../../model/story.ts";

const FILL: Record<PairState, { fill: string; opacity: number; stroke: string }> = {
  checked: { fill: "var(--accent)", opacity: 1, stroke: "none" },
  skipped: { fill: "var(--muted)", opacity: 0.28, stroke: "none" },
  open: { fill: "none", opacity: 1, stroke: "var(--line-2)" },
};

const short = (t: string) => (t.length > 3 ? t.slice(0, 2) + "…" : t);

/** Every (start, end) pair brute force would check, shaded by what the run did with it. */
export function SearchSpaceView({ story, index }: { story: WindowStory; index: number }) {
  const n = story.len;
  const space = searchSpace(story, index);
  const S = n > 14 ? 11 : n > 9 ? 15 : 19;
  const P = S + 2;
  const LX = 24;
  const LY = 30;
  return (
    <div>
      <svg className="story-svg" width={LX + n * P + 4} height={LY + n * P + 4} role="img" aria-label="Search space of start and end pairs">
        <text x={LX + (n * P) / 2} y={10} textAnchor="middle">end →</text>
        {story.cells.map((c, j) => (
          <text key={`c${j}`} x={LX + j * P + S / 2} y={LY - 5} textAnchor="middle">
            {short(c)}
          </text>
        ))}
        {story.cells.map((c, i) => (
          <text key={`r${i}`} x={LX - 5} y={LY + i * P + S / 2 + 3} textAnchor="end">
            {short(c)}
          </text>
        ))}
        {Array.from({ length: n }, (_, i) =>
          Array.from({ length: n - i }, (_, d) => {
            const j = i + d;
            const f = FILL[space.at(i, j)];
            return (
              <rect key={`${i},${j}`} x={LX + j * P} y={LY + i * P} width={S} height={S} rx={2} fill={f.fill} fillOpacity={f.opacity} stroke={f.stroke} />
            );
          }),
        )}
      </svg>
      <div className="story-legend">
        <span><i style={{ background: "var(--accent)" }} />looked at</span>
        <span><i style={{ background: "var(--muted)", opacity: 0.35 }} />ruled out without looking</span>
        <span><i style={{ border: "1px solid var(--line-2)" }} />not decided yet</span>
      </div>
      <p className="story-note">
        Rows are where a window starts, columns where it ends. Brute force checks all {space.total}. This run has looked at{" "}
        <b>{space.checked}</b> and ruled out {space.skipped}.
      </p>
    </div>
  );
}

/** One bar per window the run held, oldest at the top: both edges only ever move one way. */
export function WindowHistoryView({ story, index }: { story: WindowStory; index: number }) {
  const n = story.len;
  const rows = windowHistory(story, index).slice(-24);
  const P = n > 14 ? 11 : n > 9 ? 15 : 19;
  const H = 9;
  const LY = 16;
  const back = rows.some((r) => r.back);
  return (
    <div>
      <svg className="story-svg" width={n * P + 4} height={LY + Math.max(1, rows.length) * (H + 3) + 4} role="img" aria-label="Window over time">
        {story.cells.map((c, j) => (
          <text key={j} x={j * P + P / 2} y={10} textAnchor="middle">
            {short(c)}
          </text>
        ))}
        {rows.map(({ w, back: b }, k) => (
          <rect
            key={k}
            x={w[0] * P + 1}
            y={LY + k * (H + 3)}
            width={(w[1] - w[0] + 1) * P - 2}
            height={H}
            rx={3}
            fill={b ? "var(--bad)" : "var(--accent)"}
            fillOpacity={k === rows.length - 1 ? 0.95 : 0.35}
          />
        ))}
      </svg>
      <p className="story-note">
        {back
          ? "A red bar's left edge moved backward: the window took back cells it had already ruled out."
          : story.mode === "converge"
            ? "The edges only move inward. Together they cross the array once, so the work is n steps, not n²."
            : "Both edges only move right. Each crosses the array once, so the work is about 2n moves, not n²."}
      </p>
    </div>
  );
}

/** The search range on a number line, one row per range the run held: each probe throws half away. */
export function RangeView({ range, index }: { range: RangeStory; index: number }) {
  const rows = rangeHistory(range, index).slice(-14);
  const W = 300;
  const LX = 34;
  const H = 10;
  const LY = 18;
  const span = Math.max(1, range.max - range.min);
  const x = (v: number) => LX + ((v - range.min) / span) * W;
  const first = rows[0];
  const last = rows.at(-1);
  const size = (w: [number, number]) => Math.max(0, w[1] - w[0] + 1);
  const empty = last && last.w[0] > last.w[1];
  return (
    <div>
      <svg className="range-svg" width={LX + W + 40} height={LY + Math.max(1, rows.length) * (H + 8) + 6} role="img" aria-label="Search range over time">
        <text x={x(range.min)} y={10} textAnchor="middle">{range.min}</text>
        <text x={x(range.max)} y={10} textAnchor="middle">{range.max}</text>
        {rows.map(({ w, probe }, k) => {
          const y = LY + k * (H + 8);
          const cur = k === rows.length - 1;
          return (
            <g key={k}>
              <text x={LX - 6} y={y + H - 1} textAnchor="end">{size(w)}</text>
              {w[0] <= w[1] ? (
                <rect x={x(w[0])} y={y} width={Math.max(3, x(w[1]) - x(w[0]))} height={H} rx={3} fill="var(--accent)" fillOpacity={cur ? 0.9 : 0.3} />
              ) : (
                <text x={x(Math.min(range.max, Math.max(range.min, w[0])))} y={y + H - 1} textAnchor="middle" fill="var(--bad)">empty</text>
              )}
              {probe !== null && (
                <g>
                  <line x1={x(probe)} x2={x(probe)} y1={y - 2} y2={y + H + 2} stroke="var(--bad)" strokeWidth={2} />
                  <text x={x(probe) + 4} y={y - 1} textAnchor="start" fill="var(--bad)">{probe}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <p className="story-note">
        {!first || !last
          ? "The range appears once both bounds are set."
          : empty
            ? `The range is empty after ${rows.length - 1} probes: nothing left that could be the answer.`
            : `${range.lo}..${range.hi} holds every value that can still be the answer: ${size(first.w)} at the start, ${size(last.w)} now. Each probe throws about half away, so it takes about log₂ ${size(first.w)} ≈ ${Math.max(1, Math.ceil(Math.log2(Math.max(2, size(first.w)))))} probes.`}
      </p>
    </div>
  );
}
