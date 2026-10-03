// Stacked rows of blocks: a memtable over SSTable levels, or memory over a WAL strip.
// Blocks are keyed by row and id, so a table that moves or appears animates; the blocks the
// current read checks are hot, and blocks whose contents changed flash.

import { AnimatePresence, motion } from "framer-motion";
import type { LevelsBlock, LevelsPanel } from "../../model/systems/levels.ts";
import "./LevelsView.css";

const MAX_ITEMS = 8;

function Block({ b }: { b: LevelsBlock }) {
  const shown = b.items.slice(0, MAX_ITEMS);
  return (
    <div className={`lv-block ${b.hot ? "hot" : ""} ${b.changed ? "changed" : ""}`}>
      <div className="lv-head">
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

function Mark({ label }: { label?: string }) {
  return (
    <motion.div layout="position" className="lv-mark" key="mark">
      <span>{label}</span>
    </motion.div>
  );
}

export function LevelsView({ panel }: { panel: LevelsPanel }) {
  return (
    <div className="lv">
      {panel.rows.map((row) => {
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
        if (row.mark !== undefined) cells.splice(Math.min(row.mark, cells.length), 0, <Mark key="__mark" label={row.markLabel} />);
        return (
          <div key={row.name} className="lv-row">
            <div className="lv-name">{row.name}</div>
            <div className="lv-blocks">
              <AnimatePresence initial={false}>{cells}</AnimatePresence>
              {row.blocks.length === 0 && row.mark === undefined && <span className="lv-empty">empty</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
