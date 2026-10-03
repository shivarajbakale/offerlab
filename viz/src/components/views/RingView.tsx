// A consistent-hashing ring: server tokens as ticks with the arc each one owns, tracked keys as
// dots in their owner's colour, the key being looked up as a pointer, and a legend of shares.

import { motion } from "framer-motion";
import type { RingPanel } from "../../model/systems/ring.ts";
import { colorOf } from "../colors.ts";
import "./RingView.css";

const SIZE = 360;
const C = SIZE / 2;
const R = 138;
const KEY_R = R - 24;

const angle = (pos: number) => pos * 2 * Math.PI - Math.PI / 2;
const at = (pos: number, r: number) => ({ x: C + r * Math.cos(angle(pos)), y: C + r * Math.sin(angle(pos)) });
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The clockwise arc from `from` to `to` (fractions of the ring) at radius r. */
function arcPath(from: number, to: number, r: number): string {
  let span = to - from;
  if (span <= 0) span += 1;
  if (span >= 0.9999) {
    const a = at(from, r);
    const b = at(from + 0.5, r);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 1 1 ${b.x} ${b.y} A ${r} ${r} 0 1 1 ${a.x} ${a.y}`;
  }
  const a = at(from, r);
  const b = at(from + span, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

function RingPointer({ pos }: { pos: number }) {
  const tip = at(pos, R + 4);
  const end = at(pos, R + 6);
  const a = angle(pos);
  // A small triangle just outside the ring, pointing at it.
  const base = at(pos, R + 16);
  const side = { x: -Math.sin(a) * 6, y: Math.cos(a) * 6 };
  return (
    <g>
      <line x1={C} y1={C} x2={end.x} y2={end.y} className="ring-pointer-line" />
      <path d={`M ${tip.x} ${tip.y} L ${base.x + side.x} ${base.y + side.y} L ${base.x - side.x} ${base.y - side.y} Z`} className="ring-pointer" />
    </g>
  );
}

export function RingView({ panel }: { panel: RingPanel }) {
  const { tokens, keys, pointer } = panel;
  const servers = [...new Set([...tokens.map((t) => t.node), ...keys.map((k) => k.owner)])].sort();
  const keysOf = (node: string) => keys.filter((k) => k.owner === node).length;
  const share = (node: string) => panel.shares.find((s) => s.node === node)?.share;
  const tokenCount = (node: string) => tokens.filter((t) => t.node === node).length;
  const even = servers.length ? 1 / servers.length : 0;
  const tick = tokens.length > 64 ? 7 : 11;

  return (
    <div className="ring-view">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ring-svg" role="img" aria-label="Hash ring">
        <circle cx={C} cy={C} r={R} className="ring-base" />
        <text x={C} y={C - R - 18} className="ring-zero">
          0
        </text>
        {tokens.map((t, i) => {
          const from = i === 0 ? tokens[tokens.length - 1].pos : tokens[i - 1].pos;
          return (
            <path
              key={`arc:${t.node}:${t.pos}`}
              d={arcPath(from, t.pos, R)}
              className="ring-arc"
              style={{ stroke: colorOf(t.node) }}
            />
          );
        })}
        {tokens.map((t) => {
          const a = at(t.pos, R - tick);
          const b = at(t.pos, R + tick);
          return (
            <motion.line
              key={`tok:${t.node}:${t.pos}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="ring-token"
              style={{ stroke: colorOf(t.node) }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <title>{`token of ${t.node} at ${pct(t.pos)}`}</title>
            </motion.line>
          );
        })}
        {keys.map((k) => {
          const p = at(k.pos, KEY_R);
          return (
            <g key={`key:${k.label}`} transform={`translate(${p.x},${p.y})`}>
              {k.moved && <circle r={8} className="ring-moved" />}
              <motion.circle
                r={k.changed ? 7 : 5}
                className="ring-key"
                initial={false}
                animate={{ fill: colorOf(k.owner), r: k.changed ? 7 : 5 }}
                transition={{ duration: 0.4 }}
              >
                <title>{`${k.label} → ${k.owner}${k.moved ? " (moved)" : ""}`}</title>
              </motion.circle>
            </g>
          );
        })}
        {pointer && <RingPointer pos={pointer.pos} />}
        {pointer && (
          <text x={C} y={C + 4} className="ring-pointer-label">
            {pointer.label}
          </text>
        )}
        {pointer && (
          <text x={C} y={C + 20} className="ring-pointer-sub">
            at {pct(pointer.pos)}
          </text>
        )}
      </svg>
      <div className="ring-side">
        {panel.total > 0 && (
          <div className={`ring-moved-count ${panel.moved ? "some" : ""}`}>
            <b>{panel.moved}</b> of {panel.total} keys moved
          </div>
        )}
        <table className="ring-legend">
          <thead>
            <tr>
              <th>server</th>
              {tokens.length > 0 && <th>tokens</th>}
              {tokens.length > 0 && <th>ring</th>}
              {keys.length > 0 && <th>keys</th>}
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => {
              const sh = share(s);
              return (
                <tr key={s}>
                  <td>
                    <span className="ring-swatch" style={{ background: colorOf(s) }} />
                    {s}
                  </td>
                  {tokens.length > 0 && <td>{tokenCount(s)}</td>}
                  {tokens.length > 0 && (
                    <td className={sh !== undefined && sh > even * 1.5 ? "ring-heavy" : ""}>
                      <span className="ring-bar">
                        <span style={{ width: pct(sh ?? 0), background: colorOf(s) }} />
                      </span>
                      {sh === undefined ? "–" : pct(sh)}
                    </td>
                  )}
                  {keys.length > 0 && <td>{keysOf(s)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="ring-note">
          Positions run clockwise from 0 at the top. Each arc belongs to the token at its clockwise end.
          {keys.some((k) => k.moved) && " A ringed dot is a key that changed server."}
        </div>
      </div>
    </div>
  );
}
