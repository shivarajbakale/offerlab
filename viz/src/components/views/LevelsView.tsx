// Stacked rows of blocks: a memtable over SSTable levels, or memory over a WAL strip.
// Blocks are keyed by row and id, so a table that moves or appears animates; the blocks the
// current read checks are hot (numbered in the order it checked them), and blocks whose
// contents changed flash. When the hint says where rows live, rows are grouped into a memory
// band, a buffer band and a disk band, so a crash's effect is plain: it wipes the memory and
// buffer bands, and only the disk band is left.

import { AnimatePresence, motion } from "framer-motion";
import type { LevelsBlock, LevelsPanel, LevelsPlace } from "../../model/systems/levels.ts";
import "./LevelsView.css";

const MAX_ITEMS = 8;

function Block({ b }: { b: LevelsBlock }) {
  const shown = b.items.slice(0, MAX_ITEMS);
  return (
    <div className={`lv-block ${b.hot ? "hot" : ""} ${b.changed ? "changed" : ""} ${b.pending ? "pending" : ""}`}>
      <div className="lv-head">
        {b.hotOrder !== undefined && (
          <span className="lv-order" title={`checked in place ${b.hotOrder}`}>
            {b.hotOrder}
          </span>
        )}
        <span className="lv-label">{b.label}</span>
        {b.range && <span className="lv-range">{b.range}</span>}
      </div>
      {b.items.length > 0 && (
        <div className="lv-items">
          {shown.map((it, i) => (
            <span key={i} className={`lv-item ${it.endsWith("=†") ? "tomb" : ""}`} title={it}>
              {it}
            </span>
          ))}
          {b.items.length > MAX_ITEMS && <span className="lv-more">+{b.items.length - MAX_ITEMS}</span>}
        </div>
      )}
    </div>
  );
}

function Mark({ label, placed }: { label?: string; placed: boolean }) {
  return (
    <motion.div layout="position" className={`lv-mark ${placed ? "placed" : ""}`} key="mark">
      {placed ? (
        <span>
          <b>◀ on disk</b>
          <br />
          buffer ▶
        </span>
      ) : (
        <span>{label}</span>
      )}
    </motion.div>
  );
}

const BAND: Record<LevelsPlace, { title: string; note: string }> = {
  memory: { title: "Memory", note: "fast, but wiped by a crash" },
  buffer: { title: "OS buffer", note: "written, not yet forced to disk: a crash loses it" },
  disk: { title: "Disk", note: "slower, but survives a crash" },
};
const ORDER: LevelsPlace[] = ["memory", "buffer", "disk"];

type RowData = LevelsPanel["rows"][number];

export function LevelsView({ panel }: { panel: LevelsPanel }) {
  if (!panel.rows.some((r) => r.place)) {
    return (
      <div className="lv">
        {panel.rows.map((row) => (
          <Row key={row.name} row={row} placed={false} />
        ))}
      </div>
    );
  }
  const bands = ORDER.map((place) => ({ place, rows: panel.rows.filter((r) => (r.place ?? "disk") === place) })).filter((b) => b.rows.length);
  return (
    <div className="lv banded">
      {bands.map(({ place, rows }) => (
        <section key={place} className={`lv-band ${place}`}>
          <header className="lv-band-head">
            <span className="lv-band-title">{BAND[place].title}</span>
            <span className="lv-band-note">{BAND[place].note}</span>
          </header>
          {rows.map((row) => (
            <Row key={row.name} row={row} placed />
          ))}
        </section>
      ))}
    </div>
  );
}

function Row({ row, placed }: { row: RowData; placed: boolean }) {
  const cells = row.blocks.map((b) => (
    <motion.div
      key={b.id}
      layout="position"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
    >
      <Block b={b} />
    </motion.div>
  ));
  if (row.mark !== undefined) cells.splice(Math.min(row.mark, cells.length), 0, <Mark key="__mark" label={row.markLabel} placed={placed} />);
  return (
    <div className="lv-row">
      <div className="lv-name" title={row.name}>
        {row.title ?? row.name}
      </div>
      <div className="lv-blocks">
        <AnimatePresence initial={false}>{cells}</AnimatePresence>
        {row.blocks.length === 0 && (row.mark === undefined || placed) && <span className="lv-empty">empty</span>}
      </div>
    </div>
  );
}
