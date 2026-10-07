// The hero: the whole curriculum drawn as a transit map. Five lines leave one hub (first
// principles), trains ride them, and every station is a real topic you can pick.

import { motion } from "framer-motion";
import { HUB, INTERCHANGES, LINES, hubY, linePath, type Line, type Station } from "./stations.ts";

type Props = {
  selected: string;
  onPick: (key: string) => void;
  onHover: (key: string | null) => void;
  onHub: () => void;
  trains: boolean;
};

function labelPlacement(line: Line, s: Station): { x: number; y: number; anchor: "middle" | "start" } {
  const ic = INTERCHANGES.find((i) => i.x === s.x && i.lines.includes(line.key));
  if (ic) {
    const ys = LINES.filter((l) => ic.lines.includes(l.key)).map((l) => l.y);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    if (line.y !== top && line.y !== bottom) return { x: s.x + 22, y: line.y - 14, anchor: "start" };
    if (line.y === top) return { x: s.x, y: line.y - 24, anchor: "middle" };
    return { x: s.x, y: line.y + 36, anchor: "middle" };
  }
  const below = s.below ?? line.labels === "below";
  return { x: s.x, y: below ? line.y + 32 : line.y - 20, anchor: "middle" };
}

export function RouteMap({ selected, onPick, onHover, onHub, trains }: Props) {
  return (
    <svg className="route-map" viewBox="0 36 1000 476" role="group" aria-label="Route map of every Offerlab track">
      {/* casing first, so lines read as separate where they run side by side */}
      {LINES.map((l) => (
        <path key={`case-${l.key}`} d={linePath(l)} className="rm-casing" />
      ))}
      {LINES.map((l, i) => (
        <path key={l.key} d={linePath(l)} className="rm-line" stroke={l.color} pathLength={1} style={{ animationDelay: `${0.15 + i * 0.12}s` }} />
      ))}
      {trains &&
        LINES.map((l, i) => (
          <g key={`train-${l.key}`} className="rm-train">
            <rect x={-11} y={-5} width={22} height={10} rx={5} fill="var(--panel)" stroke={l.color} strokeWidth={3} />
            <animateMotion dur={`${11 + i * 1.7}s`} begin={`${-i * 2.3}s`} repeatCount="indefinite" rotate="auto" path={linePath(l)} />
          </g>
        ))}

      {INTERCHANGES.map((ic) => {
        const ys = LINES.filter((l) => ic.lines.includes(l.key)).map((l) => l.y);
        return <rect key={ic.x} className="rm-interchange" x={ic.x - 13} y={Math.min(...ys) - 13} width={26} height={Math.max(...ys) - Math.min(...ys) + 26} rx={13} />;
      })}

      <g className="rm-hub" role="button" tabIndex={0} aria-label="First principles: start with Algorithms" onClick={onHub} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onHub())}>
        <rect x={HUB.x - 16} y={hubY(LINES[0]) - 16} width={32} height={hubY(LINES[4]) - hubY(LINES[0]) + 32} rx={16} />
        <text x={HUB.x - 14} y={hubY(LINES[4]) + 44} className="rm-hub-label">
          First
        </text>
        <text x={HUB.x - 14} y={hubY(LINES[4]) + 62} className="rm-hub-label">
          principles
        </text>
        <text x={HUB.x - 14} y={hubY(LINES[4]) + 82} className="rm-hub-sub">
          every line
        </text>
        <text x={HUB.x - 14} y={hubY(LINES[4]) + 97} className="rm-hub-sub">
          starts here
        </text>
      </g>

      {LINES.map((l) =>
        l.stations.map((s) => {
          const on = s.key === selected;
          const lab = labelPlacement(l, s);
          return (
            <g
              key={s.key}
              className={`rm-station ${on ? "on" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${s.label}, ${l.name}`}
              onClick={() => onPick(s.key)}
              onMouseEnter={() => onHover(s.key)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(s.key)}
              onBlur={() => onHover(null)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(s.key))}
            >
              <circle cx={s.x} cy={l.y} r={22} className="rm-hit" />
              {on && <circle cx={s.x} cy={l.y} r={14} className="rm-pulse" stroke={l.color} />}
              <motion.circle
                cx={s.x}
                cy={l.y}
                initial={false}
                animate={{ r: on ? 11 : 7.5 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                fill={on ? l.color : "var(--panel)"}
                stroke={on ? "var(--panel)" : l.color}
                strokeWidth={on ? 3 : 4}
              />
              <text x={lab.x} y={lab.y} textAnchor={lab.anchor} className="rm-label">
                {s.label}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
