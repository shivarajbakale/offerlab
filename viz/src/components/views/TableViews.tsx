import type { MapPanel, ObjectPanel, SetPanel } from "../../model/scene.ts";

const MAX_ROWS = 40;

export function MapView({ panel }: { panel: MapPanel }) {
  if (panel.size === 0) return <div className="empty">empty</div>;
  return (
    <table className="kv">
      <tbody>
        {panel.rows.slice(0, MAX_ROWS).map((r) => (
          <tr key={r.k.text}>
            <td className={r.k.changed ? "changed" : ""}>{r.k.text}</td>
            <td key={r.v.text} className={r.v.changed ? "changed" : ""} title={r.v.text}>
              {r.v.text}
            </td>
          </tr>
        ))}
        {panel.size > MAX_ROWS && (
          <tr>
            <td colSpan={2} className="empty">
              +{panel.size - MAX_ROWS} more
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function SetView({ panel }: { panel: SetPanel }) {
  if (panel.size === 0) return <div className="empty">∅ empty</div>;
  return (
    <div className="chips">
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
