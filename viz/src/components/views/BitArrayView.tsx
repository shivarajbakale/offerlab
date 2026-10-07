// A row of bits or counters (Bloom filter, HyperLogLog) or a grid of counters (count-min sketch).
// The current item's cells are outlined; with newCells in the hint, cells this item set are told
// apart from cells that were already set, so a Bloom filter false positive is visible. With the
// hint's options it reads as a real-world exchange: the question about the item, the cells it
// hashes to, the answer, and what a wrong answer costs.

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

const plural = (n: number, unit: string) => `${unit}${n === 1 ? "" : "s"}`;

export function BitArrayView({ panel }: { panel: BitsPanel }) {
  const mark = new Map(panel.touched.map((t) => [`${t.r},${t.c}`, t]));
  const hows = [...new Set(panel.touched.flatMap((t) => (t.how ? [t.how] : [])))];
  const unit = panel.unit;
  const where = panel.grid
    ? panel.touched.map((t) => `${unit} ${t.c} in row ${t.r}`).join(", ")
    : `${plural(panel.touched.length, unit)} ${panel.touched.map((t) => t.c).join(", ")}`;
  const row = panel.rows[0] ?? [];
  const size = panel.grid
    ? `${panel.rows.length} rows × ${row.length} ${plural(row.length, unit)}`
    : `${row.length} ${plural(row.length, unit)}`;
  const cols = row.length <= 16 ? Math.max(1, row.length) : row.length <= 64 ? 16 : 20;
  const lines = panel.grid ? [] : Array.from({ length: Math.ceil(row.length / cols) }, (_, i) => i * cols);

  return (
    <div className="bits">
      {panel.title && (
        <div className="bits-title">
          <b>{panel.title}</b> <span>{size} in memory</span>
        </div>
      )}
      {panel.ask && <div className="bits-ask">{panel.ask}</div>}
      {(panel.item !== undefined || panel.touched.length > 0) && (
        <div className="bits-item">
          {panel.item !== undefined && (
            <>
              item <b>"{panel.item}"</b>
            </>
          )}
          {panel.touched.length > 0 && (
            <span className="bits-where">
              {panel.item !== undefined ? " hashes to " : ""}
              {where}
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
      {panel.answer && (
        <div className={`bits-answer ${panel.answer.tone}`}>
          <span className="bits-tag">Answer</span>
          {panel.answer.text}
        </div>
      )}
      {panel.verdict && <div className={`bits-verdict ${/false|wrong|lost/i.test(panel.verdict) ? "bad" : ""}`}>{panel.verdict}</div>}
      {panel.cost && (
        <div className="bits-cost">
          <span className="bits-tag">{panel.costLabel ?? "If wrong"}</span>
          {panel.cost}
        </div>
      )}
    </div>
  );
}
