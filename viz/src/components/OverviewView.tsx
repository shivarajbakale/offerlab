// A tab's overview: what the section is, which problems it teaches you to solve, how to use it,
// and every group with what it covers and a one-line "solves" for each topic.

import { useMemo } from "react";
import { GROUP_INTROS, TAB_INTROS } from "../overviews.ts";
import { problems } from "../problems.ts";
import { oneLiner } from "../sim/intro.ts";
import { parseLesson } from "../sim/lesson.ts";
import { groupsFor, type TabId } from "../sidebarTabs.ts";

export function OverviewView({ tab, onSelect }: { tab: TabId; onSelect: (id: string) => void }) {
  const intro = TAB_INTROS[tab];
  const groups = useMemo(() => groupsFor(tab, problems), [tab]);
  const lines = useMemo(() => new Map(groups.flatMap((g) => g.problems).map((p) => [p.id, p.lesson ? oneLiner(parseLesson(p.lesson)) : ""])), [groups]);

  return (
    <main className="main overview-main">
      <div className="overview">
        <h1>{intro.title}</h1>
        <p className="overview-what">{intro.what}</p>
        <dl className="overview-facts">
          <div>
            <dt>Why it matters</dt>
            <dd>{intro.solves}</dd>
          </div>
          <div>
            <dt>How to use it</dt>
            <dd>{intro.howToUse}</dd>
          </div>
        </dl>
        {groups.map((g) => (
          <section key={g.key} className="overview-group">
            {g.section && <div className="overview-section">{g.section}</div>}
            <h2>{g.label}</h2>
            {GROUP_INTROS[g.key] && <p className="overview-blurb">{GROUP_INTROS[g.key]}</p>}
            <ul>
              {g.problems.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onSelect(p.id)}>
                    <span className="prob-num">{p.number}</span>
                    <span className="overview-title">{p.title}</span>
                    {lines.get(p.id) ? <span className="overview-line">{lines.get(p.id)}</span> : p.difficulty ? <span className="overview-line">{p.difficulty}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
