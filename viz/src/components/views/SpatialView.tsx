// A 2D plane: cells or quadtree nodes as outlined rects (filled when the query visited them),
// points as dots (highlighted when the query returned them), the query box dashed, and the
// location being encoded or searched from as a crosshair. With the hint's map options it reads
// as a map: streets behind a city-sized view, the equator and Greenwich meridian, a scale bar in
// metres, and real names for the points ("driver") and the pin ("you").

import { motion } from "framer-motion";
import type { SpatialPanel } from "../../model/systems/spatial.ts";
import "./SpatialView.css";

const SIZE = 360;
const PAD = 6;

// Fixed street pattern (fractions of the frame): it says "city map" without claiming real streets.
const STREETS_V = [0.11, 0.29, 0.47, 0.63, 0.82];
const STREETS_H = [0.14, 0.33, 0.55, 0.74, 0.9];

/** A round length (1, 2 or 5 times a power of ten) in metres that fits in `max` metres. */
function niceMetres(max: number): number {
  const p = 10 ** Math.floor(Math.log10(max));
  return [5, 2, 1].map((m) => m * p).find((m) => m <= max) ?? p;
}

function fmtMetres(m: number): string {
  if (m >= 1000) return `${(m / 1000).toLocaleString("en-US")} km`;
  return `${m} m`;
}

export function SpatialView({ panel }: { panel: SpatialPanel }) {
  const { bounds: b, rects, points, query, marker, world } = panel;
  const dot = world?.dot ?? "point";
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1;
  const k = (SIZE - 2 * PAD) / span;
  const X = (x: number) => PAD + (x - b.x0) * k;
  // Up is north / larger y.
  const Y = (y: number) => SIZE - PAD - (y - b.y0) * k;
  const box = (r: { x0: number; y0: number; x1: number; y1: number }) => ({
    x: X(r.x0),
    y: Y(r.y1),
    width: Math.max(0.5, (r.x1 - r.x0) * k),
    height: Math.max(0.5, (r.y1 - r.y0) * k),
  });
  const visited = rects.filter((r) => r.hot).length;
  const found = points.filter((p) => p.hot).length;
  const labelPoints = points.length <= 24;
  // Scale bar: a round distance about a quarter of the frame wide.
  const perPx = world?.metres ? world.metres.x / k : undefined;
  const barM = perPx ? niceMetres(perPx * SIZE * 0.3) : undefined;
  const barPx = perPx && barM ? barM / perPx : 0;
  const lines = world?.geo
    ? [
        ...(b.x0 < 0 && b.x1 > 0 ? [{ x1: X(0), y1: 0, x2: X(0), y2: SIZE, label: "longitude 0 (Greenwich)", v: true }] : []),
        ...(b.y0 < 0 && b.y1 > 0 ? [{ x1: 0, y1: Y(0), x2: SIZE, y2: Y(0), label: "equator", v: false }] : []),
      ]
    : [];
  // A label is left out when another point is so close that the two labels would overlap.
  const crowded = (i: number) =>
    points.some((q, j) => j !== i && Math.abs(X(q.x) - X(points[i].x)) < 40 && Math.abs(Y(q.y) - Y(points[i].y)) < 11);

  return (
    <div className="spatial-view">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="spatial-svg" role="img" aria-label="2D plane">
        <defs>
          <clipPath id={`clip-${panel.key}`}>
            <rect x={0} y={0} width={SIZE} height={SIZE} />
          </clipPath>
        </defs>
        <rect x={0} y={0} width={SIZE} height={SIZE} className={`spatial-plane ${world?.city ? "city" : ""}`} />
        <g clipPath={`url(#clip-${panel.key})`}>
          {world?.city && (
            <g className="spatial-streets" aria-hidden>
              {STREETS_V.map((f, i) => (
                <line key={`v${i}`} x1={f * SIZE} y1={0} x2={f * SIZE + (i % 2 ? 10 : -6)} y2={SIZE} className={i === 2 ? "main" : ""} />
              ))}
              {STREETS_H.map((f, i) => (
                <line key={`h${i}`} x1={0} y1={f * SIZE} x2={SIZE} y2={f * SIZE + (i % 2 ? -8 : 5)} className={i === 1 ? "main" : ""} />
              ))}
              <line x1={0} y1={SIZE * 0.98} x2={SIZE} y2={SIZE * 0.2} className="main" />
            </g>
          )}
          {lines.map((l) => (
            <g key={l.label} className="spatial-geo-line">
              <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
              <text
                x={l.v ? l.x1 + 4 : SIZE - 6}
                y={l.v ? SIZE - 24 : l.y1 - 4}
                textAnchor={l.v ? "start" : "end"}
              >
                {l.label}
              </text>
            </g>
          ))}
          {rects.map((r, i) => {
            const bx = box(r);
            return (
              <motion.rect
                key={`r:${r.id ?? r.label ?? i}`}
                className={`spatial-rect ${r.hot ? (r.leaf === false ? "hot inner" : "hot") : ""} ${r.focus ? "focus" : ""}`}
                initial={false}
                animate={bx}
                transition={{ duration: 0.35 }}
              />
            );
          })}
          {rects.map((r, i) => {
            const bx = box(r);
            if (!r.label || bx.width < 30 || bx.height < 16) return null;
            const big = bx.width > 90 && bx.height > 40;
            return (
              <text
                key={`l:${r.id ?? r.label ?? i}`}
                x={bx.x + 4}
                y={bx.y + (big ? 14 : 11)}
                className={`spatial-label ${big ? "big" : ""} ${r.hot ? "hot" : ""}`}
              >
                {r.label}
              </text>
            );
          })}
          {query && <rect {...box(query)} className="spatial-query" />}
          {points.map((p, i) => (
            <g key={`p:${p.id ?? i}`} transform={`translate(${X(p.x)},${Y(p.y)})`}>
              <motion.circle
                className={`spatial-point ${p.hot ? "hot" : ""}`}
                initial={{ r: 0 }}
                animate={{ r: p.hot ? 5.5 : 4 }}
                transition={{ duration: 0.25 }}
              />
              {labelPoints && p.label && (p.hot || !crowded(i)) && (
                <text
                  x={X(p.x) > SIZE * 0.6 ? -7 : 7}
                  y={4}
                  textAnchor={X(p.x) > SIZE * 0.6 ? "end" : "start"}
                  className={`spatial-point-label ${p.hot ? "hot" : ""}`}
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
          {marker && (
            <g transform={`translate(${X(marker.x)},${Y(marker.y)})`} className="spatial-marker">
              <line x1={-9} y1={0} x2={9} y2={0} />
              <line x1={0} y1={-9} x2={0} y2={9} />
              <circle r={4} />
              {marker.label && (
                <text x={X(marker.x) > SIZE * 0.6 ? -10 : 10} y={-8} textAnchor={X(marker.x) > SIZE * 0.6 ? "end" : "start"}>
                  {marker.label}
                </text>
              )}
            </g>
          )}
        </g>
        {barM && barPx > 0 && (
          <g className="spatial-scale" transform={`translate(${PAD + 6},${SIZE - PAD - 8})`}>
            <rect x={-4} y={-14} width={barPx + 8} height={20} rx={3} />
            <line x1={0} y1={0} x2={barPx} y2={0} />
            <line x1={0} y1={-3} x2={0} y2={3} />
            <line x1={barPx} y1={-3} x2={barPx} y2={3} />
            <text x={barPx / 2} y={-4} textAnchor="middle">
              {fmtMetres(barM)}
            </text>
          </g>
        )}
      </svg>
      <div className="spatial-side">
        <div>
          <b>{rects.length}</b> {world ? (rects.length === 1 ? "map square (cell)" : "map squares (cells)") : rects.length === 1 ? "cell" : "cells"}
          {visited > 0 && (
            <>
              , <b className="hot">{visited}</b> {world ? "searched" : "visited by the query"}
            </>
          )}
        </div>
        <div>
          <b>{points.length}</b> {points.length === 1 ? dot : `${dot}s`}
          {found > 0 && (
            <>
              , <b className="found">{found}</b> {world ? "found" : "returned"}
            </>
          )}
        </div>
        <ul className="spatial-key">
          <li>
            <span className="sw rect" /> {world ? "map square (cell)" : "cell"}
          </li>
          <li>
            <span className="sw rect hot" /> {world ? "searched" : "visited by the query"}
          </li>
          {query && (
            <li>
              <span className="sw query" /> {!world ? "query area" : panel.search ? `the area to search${marker?.label ? ` around ${marker.label}` : ""}` : "the cell kept so far"}
            </li>
          )}
          <li>
            <span className="sw dot" /> {dot}
          </li>
          <li>
            <span className="sw dot found" /> {world ? `${dot} found` : "returned point"}
          </li>
          {marker && (
            <li>
              <span className="sw marker">+</span> {marker.label ?? "location being looked up"}
            </li>
          )}
          {world?.city && (
            <li>
              <span className="sw street" /> street (for the feel of a map)
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
