// A row of bits or counters (Bloom filter, HyperLogLog) or a grid of counters (count-min sketch).
// The current item's cells are outlined; with newCells in the hint, cells this item set are told
// apart from cells that were already set, so a Bloom filter false positive is visible.

import type { BitsPanel } from "../../model/systems/bits.ts";
import "./BitArrayView.css";

const HOW_LABEL = { new: "set by this item", had: "already set before this item", zero: "still 0" } as const;

function Cell({ cell, at, mark }: { cell: BitsPanel["rows"][number][number]; at: string; mark?: BitsPanel["touched"][number] }) {
  const on = cell.text !== "0";
  return (
    <div
      key={`${at}:${cell.text}`}
      className={["bits-cell", on ? "on" : "", cell.changed ? "changed" : "", mark ? `touched ${mark.how ?? "plain"}` : ""].join(" ")}
      title={`${at}: ${cell.text}${mark?.how ? ` (${HOW_LABEL[mark.how]})` : ""}`}
    >
      {cell.text}
    </div>
  );
}

export function BitArrayView({ panel }: { panel: BitsPanel }) {
  const mark = new Map(panel.touched.map((t) => [`${t.r},${t.c}`, t]));
  const hows = [...new Set(panel.touched.flatMap((t) => (t.how ? [t.how] : [])))];
  const where = panel.touched.map((t) => (panel.grid ? `[${t.r}][${t.c}]` : `${t.c}`)).join(", ");
  const row = panel.rows[0] ?? [];
  const cols = row.length <= 16 ? Math.max(1, row.length) : row.length <= 64 ? 16 : 20;
  const lines = panel.grid ? [] : Array.from({ length: Math.ceil(row.length / cols) }, (_, i) => i * cols);

  return (
    <div className="bits">
      {(panel.item !== undefined || panel.touched.length > 0) && (
        <div className="bits-item">
          {panel.item !== undefined && (
            <>
              item <b>{panel.item}</b>
            </>
          )}
          {panel.touched.length > 0 && (
            <span className="bits-where">
              {panel.item !== undefined ? " → " : ""}
              {panel.grid ? "cells" : panel.touched.length === 1 ? "cell" : "cells"} {where}
            </span>
          )}
        </div>
      )}
      {panel.grid ? (
        <div className="bits-grid" style={{ gridTemplateColumns: `auto repeat(${row.length}, minmax(26px, auto))` }}>
          <span />
          {row.map((_, c) => (
            <span key={c} className="bits-idx">
              {c}
            </span>
          ))}
          {panel.rows.map((cells, r) => [
            <span key={`l${r}`} className="bits-label">
              {panel.rowLabels?.[r] ?? r}
            </span>,
            ...cells.map((cell, c) => <Cell key={`${r},${c}:${cell.text}`} cell={cell} at={`[${r}][${c}]`} mark={mark.get(`${r},${c}`)} />),
          ])}
        </div>
      ) : (
        <div className="bits-lines" style={{ ["--cell" as string]: row.length > 64 ? "22px" : "26px" }}>
          {lines.map((start) => (
            <div key={start} className="bits-line">
              <span className="bits-label">{start}</span>
              {row.slice(start, start + cols).map((cell, i) => (
                <Cell key={`${start + i}:${cell.text}`} cell={cell} at={`${start + i}`} mark={mark.get(`0,${start + i}`)} />
              ))}
            </div>
          ))}
        </div>
      )}
      {hows.length > 0 && (
        <div className="bits-legend">
          {(["new", "had", "zero"] as const)
            .filter((h) => hows.includes(h))
            .map((h) => (
              <span key={h}>
                <i className={`bits-swatch ${h}`} />
                {HOW_LABEL[h]}
              </span>
            ))}
        </div>
      )}
      {panel.verdict && <div className={`bits-verdict ${/false|wrong|lost/i.test(panel.verdict) ? "bad" : ""}`}>{panel.verdict}</div>}
    </div>
  );
}
