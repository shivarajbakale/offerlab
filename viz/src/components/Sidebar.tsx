import { useState } from "react";
import { categories } from "../problems.ts";

export function Sidebar({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const activeCat = activeId.split("/")[0];
  const [open, setOpen] = useState<Set<string>>(() => new Set([activeCat]));
  const q = query.trim().toLowerCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-dot" />
          Algorithm Visualizer
        </div>
        <input
          className="search"
          placeholder="Search 150 problems…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <nav className="sidebar-list">
        {categories.map((c) => {
          const items = c.problems.filter(
            (p) => !q || p.title.toLowerCase().includes(q) || p.number.includes(q) || c.label.toLowerCase().includes(q),
          );
          if (!items.length) return null;
          const isOpen = Boolean(q) || open.has(c.category) || c.category === activeCat;
          return (
            <div key={c.category} className="cat">
              <button
                className="cat-head"
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(c.category)) next.delete(c.category);
                    else next.add(c.category);
                    return next;
                  })
                }
              >
                <span>{c.label}</span>
                <span>{isOpen ? "−" : c.problems.length}</span>
              </button>
              {isOpen &&
                items.map((p) => (
                  <button
                    key={p.id}
                    className={`prob ${p.id === activeId ? "active" : ""}`}
                    onClick={() => onSelect(p.id)}
                  >
                    <span className="prob-num">{p.number}</span>
                    <span>{p.title}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
