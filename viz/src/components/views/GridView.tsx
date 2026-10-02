import type { GridPanel } from "../../model/scene.ts";

// Highlight "land"-like cells in character grids ("1", "#", "X", "Q", "O") and true booleans.
const TINT = new Set(["1", "#", "X", "Q", "O"]);
const tinted = (c: { text: string; str?: boolean }) => (c.str ? TINT.has(c.text) : c.text === "true");

export function GridView({ panel }: { panel: GridPanel }) {
  const cols = Math.max(0, ...panel.rows.map((r) => r.length));
  const longest = Math.max(1, ...panel.rows.flatMap((r) => r.map((c) => c.text.length)));
  const cell = Math.min(56, Math.max(cols > 14 ? 26 : 32, longest * 8 + 12));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `22px auto`, ["--cell" as string]: `${cell}px` }}>
      <span />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(${cell}px, auto))` }}>
        {Array.from({ length: cols }, (_, c) => (
          <span key={c} className="grid-head" style={{ height: 16 }}>
            {c}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridAutoRows: cell }}>
        {panel.rows.map((_, r) => (
          <span key={r} className="grid-head">
            {r}
          </span>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(${cell}px, auto))` }}>
        {panel.rows.flatMap((row, r) =>
          Array.from({ length: cols }, (_, c) => {
            const v = row[c];
            const isCursor = panel.cursor?.r === r && panel.cursor?.c === c;
            return (
              <div
                key={`${r}-${c}:${v?.text ?? ""}`}
                className={[
                  "grid-cell",
                  v?.changed ? "changed" : "",
                  v && tinted(v) ? "tint" : "",
                  v?.muted ? "muted" : "",
                  isCursor ? "cursor" : "",
                ].join(" ")}
              >
                {v?.text ?? ""}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
