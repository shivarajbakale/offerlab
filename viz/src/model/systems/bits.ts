// BitArrayView data: a row (Bloom filter, HyperLogLog) or grid (count-min sketch) of cells.
//
// Hint: `@viz bits:<cells>,<touched>[,<verdict>][,<newCells>]`
// - cells: a number array (one row) or an array of number arrays (a grid);
// - touched: the cells the current item maps to, as indexes or [row, col] pairs;
// - verdict: an optional string, such as "maybe present (false positive)";
// - newCells: optional; the touched cells this item changed from 0. When it is given, every
//   other touched cell is "had" (already non-zero before this item) or "zero", which is what
//   makes a Bloom filter's false positive visible: every cell it checks was set by someone else.
// The item itself is a local named `item` in the frame that holds the cells, if there is one
// (found even when hidden with `hide:item`).
//
// Options after the variable names (values use `_` for spaces), so the picture reads as the
// real-world question it answers, not just cells:
// - title=Bloom_filter       what the structure is called, shown with its size;
// - unit=bit                 what one cell is ("bit 13", "32 bits");
// - ask=<var>                a string: the real-world question about the current item;
// - answer=<var>             a string: the short answer (a `good:` or `bad:` prefix sets its tone);
// - cost=<var>               a string: what it costs when that answer is wrong;
// - costLabel=How_far_off     the label for that line (default "If wrong").
// Empty strings are left out.

import type { HeapId, Value } from "../../tracer/types.ts";
import type { Builder } from "./types.ts";

export type BitsPanel = {
  kind: "bits";
  key: string;
  name: string;
  rows: { text: string; changed: boolean }[][];
  /** Set for a grid only: one label per row. */
  rowLabels?: string[];
  /** Cells the current item hashes to. `how` is set only when the hint names newCells. */
  touched: { r: number; c: number; how?: "new" | "had" | "zero" }[];
  verdict?: string;
  /** The current item: a local named `item` in the innermost frame that holds the cells. */
  item?: string;
  /** True when the cells came as rows (keep them aligned); false for one row (free to wrap). */
  grid: boolean;
  /** What the structure is called (`title=`), and what one cell is (`unit=`, default "cell"). */
  title?: string;
  unit: string;
  /** The real-world question, its short answer (with a tone) and the cost of a wrong answer. */
  ask?: string;
  answer?: { text: string; tone: "info" | "good" | "bad" };
  cost?: string;
  costLabel?: string;
};

const isNumRow = (x: unknown): x is unknown[] => Array.isArray(x) && x.every((v) => !Array.isArray(v));
const text = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v));

export const buildBits: Builder<BitsPanel> = (ctx) => {
  const opt: Record<string, string> = {};
  const names: string[] = [];
  for (const a of ctx.args) {
    const eq = a.indexOf("=");
    if (eq < 0) names.push(a);
    else opt[a.slice(0, eq)] = a.slice(eq + 1).replace(/_/g, " ");
  }
  const [cellsName, touchedName, verdictName, newName] = names;
  const cellsV = ctx.find(cellsName);
  const cells = ctx.js(cellsV);
  if (!Array.isArray(cells) || cellsV?.t !== "r") return null;
  const grid = cells.length > 0 && cells.every(Array.isArray);
  if (!grid && !isNumRow(cells)) return null;
  const rowsJs = (grid ? cells : [cells]) as unknown[][];
  const prevJs = ctx.jsPrev(ctx.findPrev(cellsName));
  const prevRows = Array.isArray(prevJs) ? ((grid ? prevJs : [prevJs]) as unknown[][]) : undefined;

  const uses: HeapId[] = [cellsV.id];
  const refsIn = (v: Value | undefined) => {
    if (v?.t !== "r") return;
    uses.push(v.id);
    const o = ctx.step.heap[v.id];
    if (o?.kind === "array") for (const x of o.items) if (x.t === "r") uses.push(x.id);
  };
  if (grid) refsIn(cellsV);

  const rows = rowsJs.map((row, r) =>
    row.map((v, c) => ({ text: text(v), changed: prevRows !== undefined && prevRows[r]?.[c] !== undefined && prevRows[r][c] !== v })),
  );

  const touchedV = touchedName ? ctx.find(touchedName) : undefined;
  refsIn(touchedV);
  const touchedJs = ctx.js(touchedV);
  const cellAt = (t: unknown): { r: number; c: number } | null =>
    typeof t === "number" ? { r: 0, c: t } : Array.isArray(t) && typeof t[0] === "number" && typeof t[1] === "number" ? { r: t[0], c: t[1] } : null;
  let touched: BitsPanel["touched"] = Array.isArray(touchedJs)
    ? touchedJs.map(cellAt).filter((t): t is { r: number; c: number } => t !== null && rowsJs[t.r]?.[t.c] !== undefined)
    : [];

  if (newName) {
    const newV = ctx.find(newName);
    refsIn(newV);
    const fresh = ctx.js(newV);
    const isNew = new Set((Array.isArray(fresh) ? fresh.map(cellAt) : []).flatMap((t) => (t ? [`${t.r},${t.c}`] : [])));
    touched = touched.map((t) => ({
      ...t,
      how: rowsJs[t.r][t.c] === 0 ? "zero" : isNew.has(`${t.r},${t.c}`) ? "new" : "had",
    }));
  }

  const verdict = verdictName ? ctx.js(ctx.find(verdictName)) : undefined;
  // The item belongs to the innermost frame that holds the cells (as a local or a `this` field),
  // not to whichever frame happens to have a local called `item`.
  const head = cellsName.split(".")[0];
  const owner = ctx.step.stack.findLast((f) =>
    f.vars.some(([name, v]) => {
      if (name === head) return true;
      const self = name === "this" && v.t === "r" ? ctx.step.heap[v.id] : undefined;
      return self?.kind === "object" && head in self.fields;
    }),
  );
  const itemV = owner?.vars.find(([name]) => name === "item")?.[1];
  const item = ctx.js(itemV);
  const str = (name: string | undefined) => {
    const v = name ? ctx.js(ctx.find(name.replace(/ /g, "_"))) : undefined;
    return typeof v === "string" && v ? v : undefined;
  };
  const ask = str(opt.ask);
  const answerText = str(opt.answer);
  const tone = answerText?.match(/^(good|bad):\s*/);
  const cost = str(opt.cost);
  return {
    panel: {
      kind: "bits",
      key: `bits:${cellsName}`,
      name: cellsName,
      rows,
      ...(grid ? { rowLabels: rows.map((_, r) => `row ${r}`) } : {}),
      touched,
      ...(typeof verdict === "string" && verdict ? { verdict } : {}),
      ...(typeof item === "string" || typeof item === "number" ? { item: String(item) } : {}),
      grid,
      ...(opt.title ? { title: opt.title } : {}),
      unit: opt.unit ?? "cell",
      ...(ask ? { ask } : {}),
      ...(answerText ? { answer: { text: answerText.slice(tone?.[0].length ?? 0), tone: (tone?.[1] as "good" | "bad" | undefined) ?? "info" } } : {}),
      ...(cost ? { cost, costLabel: opt.costLabel ?? "If wrong" } : {}),
    },
    uses,
  };
};
