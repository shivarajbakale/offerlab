// Requests over time: one lane per row (client, server, ...), accepted ticks in green and
// rejected ones as red crosses, with an optional level line, state bands and a "now" cursor.

import { motion } from "framer-motion";
import type { TimelineEvent, TimelinePanel } from "../../model/systems/timeline.ts";
import "./TimelineView.css";

const W = 640;
const LEFT = 76;
const RIGHT = 14;
const BAND_H = 18;
const LINE_H = 74;
const AXIS_H = 22;
const DOT = 7;
const MAX_STACK = 8;
const GAP = 8;

const fmt = (t: number) => (Number.isInteger(t) ? String(t) : String(Math.round(t * 100) / 100));

/** About six round-numbered axis ticks (1, 2 or 5 times a power of ten apart); whole numbers only when time counts in whole ticks. */
function ticks(lo: number, hi: number, whole: boolean): number[] {
  const raw = whole ? Math.max(1, (hi - lo) / 6) : (hi - lo) / 6;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

const BAND_CLASS: Record<string, string> = { closed: "closed", open: "open", "half-open": "half" };

export function TimelineView({ panel }: { panel: TimelinePanel }) {
  const [lo, hi] = panel.span;
  const whole = panel.events.every((e) => Number.isInteger(e.t)) && Number.isInteger(lo);
  const pad = (hi - lo) * 0.03;
  const x = (t: number) => LEFT + ((t - lo + pad) / (hi - lo + 2 * pad)) * (W - LEFT - RIGHT);

  // Events at the same time on the same row stack upwards.
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of panel.events) {
    const k = `${e.row}@${e.t}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const stackOf = (row: string) =>
    Math.min(MAX_STACK, Math.max(1, ...[...groups.values()].filter((g) => g[0].row === row).map((g) => g.length)));
  const laneH = (row: string) => Math.max(26, stackOf(row) * DOT + 12);

  let y = 6;
  const bandY = panel.bands ? y : -1;
  if (panel.bands) y += BAND_H + GAP;
  const lineY = panel.line ? y : -1;
  if (panel.line) y += LINE_H + GAP;
  const laneY: Record<string, number> = {};
  for (const r of panel.rows) {
    laneY[r] = y;
    y += laneH(r);
  }
  const axisY = y + 2;
  const H = axisY + AXIS_H;

  const line = panel.line;
  const ly = (v: number) => lineY + LINE_H - 4 - (v / (line?.max || 1)) * (LINE_H - 18);
  const linePts = line?.points.map((p) => `${x(p.t)},${ly(p.v)}`).join(" ") ?? "";
  const lastPoint = line?.points.at(-1);

  const accepted = panel.events.filter((e) => e.ok).length;
  const rejected = panel.events.length - accepted;
  const latest = [...panel.events].reverse().find((e) => e.fresh) ?? panel.events.at(-1);

  return (
    <div className="timeline">
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" role="img" aria-label={`${panel.name} over time`}>
        {panel.bands && (
          <g>
            <text x={LEFT - 8} y={bandY + BAND_H / 2 + 4} className="tl-row-label">
              {panel.bandsLabel ?? "state"}
            </text>
            {panel.bands.map((b, i) => {
              const x0 = x(b.from);
              const w = Math.max(1, x(b.to) - x0);
              return (
                <g key={`${b.from}:${i}`}>
                  <rect x={x0} y={bandY} width={w} height={BAND_H} rx={3} className={`tl-band ${BAND_CLASS[b.state] ?? "other"}`} />
                  {w > b.state.length * 6 + 6 && (
                    <text x={x0 + 5} y={bandY + BAND_H / 2 + 4} className="tl-band-label">
                      {b.state}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {line && (
          <g>
            <text x={LEFT - 8} y={lineY + 12} className="tl-row-label">
              {line.label}
            </text>
            <text x={LEFT - 8} y={lineY + 24} className="tl-row-sub">
              max {fmt(line.max)}
            </text>
            <line x1={LEFT} x2={W - RIGHT} y1={ly(line.max)} y2={ly(line.max)} className="tl-grid" />
            <line x1={LEFT} x2={W - RIGHT} y1={ly(0)} y2={ly(0)} className="tl-grid" />
            {line.limit && (
              <g>
                <line x1={LEFT} x2={W - RIGHT} y1={ly(line.limit.v)} y2={ly(line.limit.v)} className="tl-limit" />
                <text x={LEFT + 4} y={ly(line.limit.v) - 4} className="tl-limit-label">
                  {line.limit.label} {fmt(line.limit.v)}
                </text>
              </g>
            )}
            {line.points.length > 1 && <polyline points={linePts} className="tl-line" />}
            {lastPoint && (
              <g>
                <motion.circle initial={false} animate={{ cx: x(lastPoint.t), cy: ly(lastPoint.v) }} r={3.5} className="tl-line-dot" />
                <text
                  x={x(lastPoint.t) > W - 90 ? x(lastPoint.t) - 7 : x(lastPoint.t) + 7}
                  y={ly(lastPoint.v) - 6}
                  textAnchor={x(lastPoint.t) > W - 90 ? "end" : "start"}
                  className="tl-line-value"
                >
                  {fmt(lastPoint.v)}
                </text>
              </g>
            )}
          </g>
        )}

        {panel.rows.map((r, i) => (
          <g key={r || "_"}>
            <rect x={LEFT} y={laneY[r]} width={W - LEFT - RIGHT} height={laneH(r)} className={`tl-lane ${i % 2 ? "odd" : ""}`} />
            <text x={LEFT - 8} y={laneY[r] + laneH(r) / 2 + 4} className="tl-row-label">
              {r}
            </text>
          </g>
        ))}

        {[...groups.values()].flatMap((g) => {
          const base = laneY[g[0].row] + laneH(g[0].row) - 8;
          const cx = x(g[0].t);
          const shown = g.slice(0, MAX_STACK);
          const out = shown.map((e, k) => {
            const cy = base - k * DOT;
            const title = `t=${fmt(e.t)}${e.row ? ` ${e.row}` : ""}: ${e.ok ? panel.words.ok : panel.words.bad}${e.label ? ` (${e.label})` : ""}`;
            return (
              <motion.g
                key={`${e.row}@${e.t}#${k}`}
                initial={e.fresh ? { scale: 0, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25 }}
                style={{ originX: `${cx}px`, originY: `${cy}px` }}
                className={`tl-ev ${e.ok ? "ok" : "bad"} ${e.fresh ? "fresh" : ""}`}
              >
                <title>{title}</title>
                {e.fresh && <circle cx={cx} cy={cy} r={6} className="tl-ev-halo" />}
                {e.ok ? (
                  <circle cx={cx} cy={cy} r={3} />
                ) : (
                  <path d={`M${cx - 2.6},${cy - 2.6}L${cx + 2.6},${cy + 2.6}M${cx + 2.6},${cy - 2.6}L${cx - 2.6},${cy + 2.6}`} />
                )}
              </motion.g>
            );
          });
          if (g.length > MAX_STACK) {
            out.push(
              <text key={`${g[0].row}@${g[0].t}+`} x={cx} y={base - MAX_STACK * DOT - 1} className="tl-more">
                +{g.length - MAX_STACK}
              </text>,
            );
          }
          return out;
        })}

        <line x1={LEFT} x2={W - RIGHT} y1={axisY} y2={axisY} className="tl-axis" />
        {ticks(lo, hi, whole).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 4} className="tl-axis" />
            <text x={x(t)} y={axisY + 16} className="tl-tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        <text x={LEFT - 8} y={axisY + 16} className="tl-row-label">
          t
        </text>

        {panel.now !== undefined && (
          <motion.g initial={false} animate={{ x: x(panel.now) }} transition={{ type: "spring", stiffness: 300, damping: 32 }}>
            <line x1={0} x2={0} y1={2} y2={axisY} className="tl-now" />
          </motion.g>
        )}
      </svg>
      <div className="tl-summary">
        <span className="tl-key ok">
          ● {accepted} {panel.words.ok}
        </span>
        <span className="tl-key bad">
          ✕ {rejected} {panel.words.bad}
        </span>
        {latest && (
          <span className="tl-latest">
            latest: t={fmt(latest.t)}
            {latest.row ? ` ${latest.row}` : ""} {latest.ok ? panel.words.ok : panel.words.bad}
            {latest.label ? ` (${latest.label})` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
