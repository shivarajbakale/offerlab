// A consistent-hashing ring: server tokens as ticks with the arc each one owns, tracked keys as
// dots in their owner's colour, the key being looked up as a pointer, and a legend of shares.

import { motion } from "framer-motion";
import type { RingPanel } from "../../model/systems/ring.ts";
import { colorOf } from "../colors.ts";
import { Callout } from "./Callout.tsx";
import "./RingView.css";

const SIZE = 360;
const C = SIZE / 2;
const R = 138;
const KEY_R = R - 24;

const angle = (pos: number) => pos * 2 * Math.PI - Math.PI / 2;
const at = (pos: number, r: number) => ({
  x: C + r * Math.cos(angle(pos)),
  y: C + r * Math.sin(angle(pos)),
});
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
      <path
        d={`M ${tip.x} ${tip.y} L ${base.x + side.x} ${base.y + side.y} L ${base.x - side.x} ${base.y - side.y} Z`}
        className="ring-pointer"
      />
    </g>
  );
}

export function RingView({ panel }: { panel: RingPanel }) {
  const { tokens, keys, pointer } = panel;
  const servers = [
    ...new Set([...tokens.map((t) => t.node), ...keys.map((k) => k.owner)]),
  ].sort();
  const share = (node: string) =>
    panel.shares.find((s) => s.node === node)?.share;
  const tokenCount = (node: string) =>
    tokens.filter((t) => t.node === node).length;
  const even = servers.length ? 1 / servers.length : 0;
  const tick = tokens.length > 64 ? 7 : 11;

  return (
    <div className="ring-view">
      <Callout caption={panel.caption} />
      {tokens.length > 0 && (
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="ring-svg"
          role="img"
          aria-label="Hash ring"
        >
          <circle cx={C} cy={C} r={R} className="ring-base" />
          <text x={C} y={C - R - 18} className="ring-zero">
            0
          </text>
          {tokens.map((t, i) => {
            const from =
              i === 0 ? tokens[tokens.length - 1].pos : tokens[i - 1].pos;
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
          {tokens.length <= 12 &&
            tokens.map((t) => {
              const p = at(t.pos, R + 24);
              return (
                <text
                  key={`tl:${t.node}:${t.pos}`}
                  x={p.x}
                  y={p.y + 4}
                  className="ring-token-label"
                  style={{ fill: colorOf(t.node) }}
                >
                  {t.node}
                </text>
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
                  // A CSS variable can't be tweened, so the colour is set directly; only the size animates.
                  style={{ fill: colorOf(k.owner), transition: "fill 0.4s" }}
                  animate={{ r: k.changed ? 7 : 5 }}
                  transition={{ duration: 0.4 }}
                >
                  <title>{`${k.label} → ${k.owner}${k.moved ? " (moved)" : ""}`}</title>
                </motion.circle>
                {(keys.length <= 12 || k.changed) &&
                  k.label !== pointer?.label && (
                    <text
                      x={(C - p.x) * 0.16}
                      y={(C - p.y) * 0.16 + 3}
                      className="ring-key-label"
                    >
                      {k.label}
                    </text>
                  )}
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
          <g
            className="ring-key-legend"
            transform={`translate(8, ${SIZE - 10})`}
          >
            {tokens.length > 0 && (
              <line
                x1={0}
                y1={-9}
                x2={0}
                y2={1}
                className="ring-token"
                style={{ stroke: "var(--ink-2)" }}
              />
            )}
            {tokens.length > 0 && (
              <text x={7} y={0}>
                server marker
              </text>
            )}
            {keys.length > 0 && (
              <circle
                cx={tokens.length ? 104 : 4}
                cy={-4}
                r={4.5}
                style={{ fill: "var(--ink-2)" }}
              />
            )}
            {keys.length > 0 && (
              <text x={tokens.length ? 112 : 12} y={0}>
                key (data)
              </text>
            )}
          </g>
        </svg>
      )}
      <div className="ring-side">
        {panel.total > 0 && (
          <div className={`ring-moved-count ${panel.moved ? "some" : ""}`}>
            <b>{panel.moved}</b> of {panel.total} keys changed server
          </div>
        )}
        <div className="ring-servers">
          {servers.map((s) => {
            const sh = share(s);
            const mine = keys.filter((k) => k.owner === s);
            return (
              <div
                key={s}
                className="ring-server"
                style={{ borderLeftColor: colorOf(s) }}
              >
                <div className="ring-server-head">
                  <b>Server {s}</b>
                  {tokens.length > 0 && (
                    <span className="ring-server-meta">
                      {tokenCount(s)} marker{tokenCount(s) === 1 ? "" : "s"} ·{" "}
                      <span
                        className={
                          sh !== undefined && sh > even * 1.5
                            ? "ring-heavy"
                            : ""
                        }
                      >
                        owns {sh === undefined ? "–" : pct(sh)} of ring
                      </span>
                    </span>
                  )}
                  {tokens.length > 0 && (
                    <span className="ring-bar">
                      <span
                        style={{ width: pct(sh ?? 0), background: colorOf(s) }}
                      />
                    </span>
                  )}
                </div>
                {keys.length > 0 && (
                  <div className="ring-chips">
                    {mine.length === 0 && (
                      <span className="ring-chip-none">no keys</span>
                    )}
                    {mine.map((k) => (
                      <span
                        key={k.label}
                        className={`ring-chip ${k.moved ? "moved" : ""} ${k.changed ? "changed" : ""}`}
                        title={
                          k.moved ? `moved here from ${k.before}` : undefined
                        }
                      >
                        {k.label}
                        {k.moved && <i> ← {k.before}</i>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="ring-note">
          {tokens.length > 0
            ? "Read it like a clock: positions run clockwise from 0 at the top. A key is stored on the server whose marker comes next, clockwise."
            : "Each box is one server and the keys it stores."}
          {keys.some((k) => k.moved) &&
            " A ringed dot, or a chip with ←, is a key that had to move to a new server."}
        </div>
      </div>
    </div>
  );
}
