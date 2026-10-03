// A 2D plane: cells or quadtree nodes as outlined rects (filled when the query visited them),
// points as dots (highlighted when the query returned them), the query box dashed, and the
// location being encoded or searched from as a crosshair.

import { motion } from "framer-motion";
import type { SpatialPanel } from "../../model/systems/spatial.ts";
import "./SpatialView.css";

const SIZE = 360;
const PAD = 6;

export function SpatialView({ panel }: { panel: SpatialPanel }) {
  const { bounds: b, rects, points, query, marker } = panel;
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
        <rect x={0} y={0} width={SIZE} height={SIZE} className="spatial-plane" />
        <g clipPath={`url(#clip-${panel.key})`}>
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
            </g>
          )}
        </g>
      </svg>
      <div className="spatial-side">
        <div>
          <b>{rects.length}</b> {rects.length === 1 ? "cell" : "cells"}
          {visited > 0 && (
            <>
              , <b className="hot">{visited}</b> visited by the query
            </>
          )}
        </div>
        <div>
          <b>{points.length}</b> {points.length === 1 ? "point" : "points"}
          {found > 0 && (
            <>
              , <b className="found">{found}</b> returned
            </>
          )}
        </div>
        <ul className="spatial-key">
          <li>
            <span className="sw rect" /> cell
          </li>
          <li>
            <span className="sw rect hot" /> visited by the query
          </li>
          {query && (
            <li>
              <span className="sw query" /> query area
            </li>
          )}
          <li>
            <span className="sw dot found" /> returned point
          </li>
          {marker && (
            <li>
              <span className="sw marker">+</span> location being looked up
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
