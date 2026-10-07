import type { MapPanel, ObjectPanel, SetPanel } from "../../model/scene.ts";

const MAX_ROWS = 40;

export function MapView({ panel }: { panel: MapPanel }) {
  if (panel.size === 0) return <div className="empty">{"{ }"} empty</div>;
  return (
    <div className="map">
      <div className="map-head">
        <span>key</span>
        <span />
        <span>value</span>
      </div>
      {panel.rows.slice(0, MAX_ROWS).map((r) => (
        <div className="map-row" key={r.k.text}>
          <span className={`map-key ${r.k.changed ? "changed" : ""}`} title={r.k.text}>
            {r.k.text}
          </span>
          <span className="map-arrow" aria-hidden="true">
            →
          </span>
          <span key={r.v.text} className={`map-val ${r.v.changed ? "changed" : ""}`} title={r.v.text}>
            {r.v.text}
          </span>
        </div>
      ))}
      {panel.size > MAX_ROWS && <div className="empty">+{panel.size - MAX_ROWS} more</div>}
    </div>
  );
}

export function SetView({ panel }: { panel: SetPanel }) {
  if (panel.size === 0) return <div className="empty">∅ empty</div>;
  return (
    <div className="chips set">
      {panel.items.map((c) => (
        <span key={c.text} className={`chip ${c.changed ? "changed" : ""}`}>
          {c.text}
        </span>
      ))}
      {panel.size > panel.items.length && <span className="empty">+{panel.size - panel.items.length}</span>}
    </div>
  );
}

export function ObjectView({ panel }: { panel: ObjectPanel }) {
  return (
    <table className="kv">
      <tbody>
        {panel.fields.map((f) => (
          <tr key={f.name}>
            <td>{f.name}</td>
            <td key={f.cell.text} className={f.cell.changed ? "changed" : ""}>
              {f.cell.text}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
