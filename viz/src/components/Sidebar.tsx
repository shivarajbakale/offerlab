import { useEffect, useRef, useState } from "react";
import { problems } from "../problems.ts";
import { GROUP_INTROS } from "../overviews.ts";
import { groupKeyOf, groupsFor, overviewId, overviewTab, TABS, tabOf, type TabId } from "../sidebarTabs.ts";

const Chevron = () => (
  <svg className="cat-chevron" width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** On narrow screens the sidebar is a drawer: `open` slides it in and `onClose` dismisses it. */
export function Sidebar({
  activeId,
  onSelect,
  open: drawerOpen = false,
  onClose,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  open?: boolean;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const active = problems.find((p) => p.id === activeId);
  const activeGroup = active ? groupKeyOf(active) : "";
  const [open, setOpen] = useState<Set<string>>(() => new Set([activeGroup]));
  // Opening a topic from anywhere (a link, the overview, a hash) expands its group.
  useEffect(() => {
    if (activeGroup) setOpen((s) => (s.has(activeGroup) ? s : new Set(s).add(activeGroup)));
  }, [activeGroup]);
  const q = query.trim().toLowerCase();
  const tab: TabId = active ? tabOf(active) : (overviewTab(activeId) ?? "algorithms");
  // Coming back to a tab opens the topic you last had open there.
  const last = useRef(new Map<TabId, string>());
  useEffect(() => {
    last.current.set(tab, activeId);
  }, [tab, activeId]);
  const shown = groupsFor(tab, problems);
  const count = shown.reduce((n, g) => n + g.problems.length, 0);
  const noun = TABS.find((t) => t.id === tab)!.noun;
  const matches = (label: string) => (p: { title: string; number: string }) =>
    !q || p.title.toLowerCase().includes(q) || p.number.includes(q) || label.toLowerCase().includes(q);

  return (
    <aside className={`sidebar ${drawerOpen ? "open" : ""}`} aria-label="Topics">
      <div className="sidebar-head">
        <div className="brand">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          Offerlab
          {onClose && (
            <button className="drawer-close" aria-label="Close menu" onClick={onClose}>
              ×
            </button>
          )}
        </div>
        <div className="track-switch" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              title={t.title}
              aria-selected={t.id === tab}
              className={t.id === tab ? "on" : ""}
              onClick={() => {
                if (t.id !== tab) onSelect(last.current.get(t.id) ?? overviewId(t.id));
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder={`Search ${count} ${noun}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <nav className="sidebar-list">
        {!q && (
          <button className={`prob overview-link ${activeId === overviewId(tab) ? "active" : ""}`} onClick={() => onSelect(overviewId(tab))}>
            <span className="prob-num">◎</span>
            <span>Overview: what's in this tab</span>
          </button>
        )}
        {shown.map((g) => {
          const items = g.problems.filter(matches(g.label));
          if (!items.length) return null;
          const isOpen = Boolean(q) || open.has(g.key);
          const bodyId = `cat-${g.key}`;
          return (
            <div key={g.key} className={`cat ${isOpen ? "open" : ""}`}>
              {g.section && <div className="sidebar-section">{g.section}</div>}
              <button
                className="cat-head"
                title={GROUP_INTROS[g.key]}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
              >
                <Chevron />
                <span className="cat-label">{g.label}</span>
                <span className="cat-count">{q ? items.length : g.problems.length}</span>
              </button>
              <div className="cat-body" id={bodyId} inert={!isOpen}>
                <div className="cat-items">
                  {items.map((p) => (
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
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
