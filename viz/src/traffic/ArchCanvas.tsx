// The architecture as boxes and links. Each box shows how busy it is; links grow with traffic;
// tracked requests move as dots; callouts explain what is happening where it happens.

import { useMemo } from "react";
import { replicaNames, type Callout, type ComponentView, type Frame, type TrafficRun } from "../../../system-design/traffic/index.ts";
import { backlogLabel, breakerLabel, designDiff, dotsAt, formatNumber, layout, regionLabel } from "./model.ts";
import type { DesignView } from "../../../system-design/traffic/index.ts";

const COL = 220;
const W = 176;
const H = 100;
const PAD = 16;
const ROW = H + 34;

type Props = {
  run: TrafficRun;
  frame: Frame;
  prev?: DesignView;
  notes: Callout[];
  selected: number | null;
  onSelect: (id: number | null) => void;
};

function health(c: ComponentView, frame: Frame): "ok" | "warn" | "bad" | "idle" {
  if (c.type === "clients") {
    const f = frame.clients;
    return f.rejected + f.failed + f.timedOut > 0 ? "bad" : "ok";
  }
  const s = frame.stations[c.id];
  if (!s) return "idle";
  if (s.up.some((u) => !u) || s.rejected + s.failed > 0) return "bad";
  if (s.util >= 0.9 || s.threads >= 0.95) return "warn";
  return "ok";
}

function Bar({ x, y, w, value, label }: { x: number; y: number; w: number; value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <g>
      <rect x={x} y={y} width={w} height={8} rx={3} className="arch-bar-bg" />
      <rect x={x} y={y} width={w * v} height={8} rx={3} className={`arch-bar ${v >= 0.9 ? "hot" : v >= 0.7 ? "warm" : ""}`} />
      <text x={x + w} y={y - 2} className="arch-bar-label" textAnchor="end">
        {label} {Math.round(v * 100)}%
      </text>
    </g>
  );
}

export function ArchCanvas({ run, frame, prev, notes, selected, onSelect }: Props) {
  const pos = useMemo(() => layout(run.design), [run.design]);
  const diff = useMemo(() => designDiff(prev, run.design), [prev, run.design]);
  const comps = run.design.components;
  const cols = Math.max(...Object.values(pos).map((p) => p.col)) + 1;
  const rows = Math.max(...Object.values(pos).map((p) => p.row)) + 1;
  const width = PAD * 2 + (cols - 1) * COL + W + 60;
  const height = PAD * 2 + (rows - 1) * ROW + H;
  const xy = (id: string) => ({ x: PAD + pos[id].col * COL, y: PAD + pos[id].row * ROW });
  // The two most serious callouts per component.
  const noteFor = new Map<string, Callout[]>();
  for (const n of notes) {
    const list = noteFor.get(n.at) ?? [];
    if (list.length < 2) noteFor.set(n.at, [...list, n]);
  }
  const dots = dotsAt(run.journeys, frame.t);
  const byStation = new Map<string, number>();

  // Requests per second arriving over each link: the receiving station's arrivals.
  const linkRate = (to: string) => (frame.stations[to]?.arrivals ?? 0) * 10;
  const into = (to: string) => comps.find((c) => c.targets.includes(to));

  return (
    <svg className="arch-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMin meet">
      {comps.flatMap((c) =>
        c.targets.map((t) => {
          const a = xy(c.id);
          const b = xy(t);
          const rate = linkRate(t);
          const w = 1 + Math.min(7, Math.log10(1 + rate) * 1.8);
          const breaker = breakerLabel(frame, c.id, t);
          return (
            <g key={`${c.id}-${t}`}>
              <line x1={a.x + W} y1={a.y + H / 2} x2={b.x} y2={b.y + H / 2} className={`arch-link ${breaker ? "broken" : ""}`} strokeWidth={w} />
              <text x={b.x - 6} y={b.y + H / 2 - 6} className="arch-link-label" textAnchor="end">
                {rate > 0 ? `${formatNumber(rate)}/s` : ""}
              </text>
              {breaker && (
                <text x={b.x - 6} y={b.y + H / 2 + 14} className="arch-breaker" textAnchor="end">
                  ⛔ {breaker}
                </text>
              )}
            </g>
          );
        }),
      )}

      {comps.map((c) => {
        const { x, y } = xy(c.id);
        const s = frame.stations[c.id];
        const tag = diff[c.id];
        const own = noteFor.get(c.id) ?? [];
        return (
          <g key={c.id}>
            <rect x={x} y={y} width={W} height={H} rx={10} className={`arch-box ${health(c, frame)} ${tag ? "diff" : ""}`} />
            <text x={x + 10} y={y + 18} className="arch-title">
              {c.label}
              {c.replicas > 1 ? ` ×${c.replicas}` : ""}
            </text>
            {c.regions && (
              <text x={x + 10} y={y + 31} className="arch-region">
                {regionLabel(c.regions)}
              </text>
            )}
            {s && s.slow > 1 ? (
              <text x={x + W - 8} y={y + 18} className="arch-slow" textAnchor="end">
                {s.slow}× slower
              </text>
            ) : (
              tag && (
                <text x={x + W - 8} y={y + 18} className="arch-tag" textAnchor="end">
                  {tag}
                </text>
              )
            )}
            {c.type === "clients" && (
              <>
                <text x={x + 10} y={y + 44} className="arch-stat">
                  {formatNumber(frame.clients.sent * 10)} requests/s
                </text>
                <text x={x + 10} y={y + 60} className="arch-stat">
                  {frame.clients.p50 < 0 ? "no request succeeded" : `p50 ${Math.round(frame.clients.p50)} ms · p99 ${Math.round(frame.clients.p99)} ms`}
                </text>
                <text x={x + 10} y={y + 84} className="arch-stat">
                  {frame.clients.retries > 0 ? `retries ${formatNumber(frame.clients.retries * 10)}/s` : `timeout ${c.timeoutMs} ms`}
                </text>
              </>
            )}
            {c.type === "lb" && (
              <text x={x + 10} y={y + 44} className="arch-stat">
                {c.strategy}
                {c.sticky ? ", sticky" : ""}
              </text>
            )}
            {c.type === "lb" && c.rateLimit && (
              <text x={x + 10} y={y + 78} className="arch-stat">
                limit {c.rateLimit.perSecond}/s per user (burst {c.rateLimit.burst}) · 429s {formatNumber(frame.clients.throttled * 10)}/s
              </text>
            )}
            {c.type === "lb" && (
              <text x={x + 10} y={y + 60} className="arch-stat">
                health check every {(c.healthCheckMs ?? 0) / 1000} s
              </text>
            )}
            {c.type === "queue" && s && (
              <>
                <Bar x={x + 10} y={y + 40} w={W - 20} value={s.util} label={`${c.consumers} consumers busy${c.fanout && c.fanout !== 1 ? ` · ×${c.fanout} per message` : ""}`} />
                <text x={x + 10} y={y + 66} className="arch-stat">
                  {backlogLabel(s)}
                </text>
                <text x={x + 10} y={y + 84} className="arch-stat">
                  oldest job {((s.oldestMs ?? 0) / 1000).toFixed(1)} s
                </text>
              </>
            )}
            {c.type === "station" && s && (
              <>
                <Bar x={x + 10} y={y + 40} w={W - 20} value={s.util} label={c.role === "external" ? "in use" : c.machine ? "CPU (shared)" : "CPU"} />
                <Bar x={x + 10} y={y + 64} w={W - 20} value={s.threads} label="workers" />
                <text x={x + 10} y={y + 90} className="arch-stat">
                  {s.nic !== undefined ? `net ${Math.round(s.nic * 100)}% · ` : ""}
                  {s.hits !== undefined
                    ? `hit rate ${s.hits + (s.misses ?? 0) > 0 ? Math.round((100 * s.hits) / (s.hits + (s.misses ?? 0))) : 0}%`
                    : c.shards && c.shards > 1
                      ? `${c.shards} shards · hottest ${Math.round(Math.max(...s.replicaUtil) * 100)}% · coolest ${Math.round(Math.min(...s.replicaUtil) * 100)}%`
                      : s.replicaUtil.length > 1 && c.role === "database"
                      ? `primary ${Math.round(s.replicaUtil[0] * 100)}% · copies ${Math.round((100 * s.replicaUtil.slice(1).reduce((a, b) => a + b, 0)) / (s.replicaUtil.length - 1))}%${c.lagMs ? ` · lag ${c.lagMs} ms` : ""}`
                      : `queue ${formatNumber(s.queue)}`}
                </text>

                {s.up.map((up, k) => (
                  <circle key={k} cx={x + W - 12 - k * 11} cy={y + 86} r={4.5} className={up ? "arch-up" : "arch-down"}>
                    <title>{`${replicaNames(c)[k] ?? c.id}: ${up ? "up" : "down"}`}</title>
                  </circle>
                ))}
              </>
            )}
            {own.length > 0 && (
              <g>
                <circle cx={x + W} cy={y} r={10} className={`arch-badge sev${own[0].severity}`} />
                <text x={x + W} y={y + 4} className="arch-badge-text" textAnchor="middle">
                  {own.length}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {dots.map((d) => {
        if (!pos[d.station]) return null;
        const b = xy(d.station);
        const n = byStation.get(d.station) ?? 0;
        byStation.set(d.station, n + 1);
        let cx: number;
        let cy: number;
        if (d.moving) {
          const from = into(d.station);
          const a = from ? xy(from.id) : { x: b.x - COL, y: b.y };
          cx = a.x + W + (b.x - a.x - W) * 0.6;
          cy = a.y + H / 2 + (b.y - a.y) * 0.6 + ((d.id * 7) % 11) - 5;
        } else {
          cx = b.x + 12 + ((n * 13) % (W - 24));
          cy = b.y + H - 4 - (Math.floor((n * 13) / (W - 24)) % 3) * 6;
        }
        return (
          <circle
            key={d.id}
            cx={cx}
            cy={cy}
            r={selected === d.id ? 7 : 4.5}
            className={`arch-dot ${d.outcome} ${selected === d.id ? "sel" : ""}`}
            onClick={() => onSelect(selected === d.id ? null : d.id)}
          >
            <title>{`Request #${d.id}: click to follow it`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
