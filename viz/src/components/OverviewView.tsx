// A tab's overview: what the section is, which problems it teaches you to solve, how to use it,
// and every group with what it covers and a one-line "solves" for each topic.

import { useMemo } from "react";
import { GROUP_INTROS, TAB_INTROS } from "../overviews.ts";
import { problems } from "../problems.ts";
import { tally } from "../progress.ts";
import { useProgress } from "../useProgress.ts";
import { oneLiner } from "../sim/intro.ts";
import { parseLesson } from "../sim/lesson.ts";
import { groupsFor, type TabId } from "../sidebarTabs.ts";

export function OverviewView({ tab, onSelect }: { tab: TabId; onSelect: (id: string) => void }) {
  const intro = TAB_INTROS[tab];
  const groups = useMemo(() => groupsFor(tab, problems), [tab]);
  const progress = useProgress();
  const algorithms = tab === "algorithms";
  const ids = (ps: { id: string }[]) => ps.map((p) => p.id);
  const all = algorithms ? tally(progress, ids(groups.flatMap((g) => g.problems))) : null;
  const total = groups.reduce((n, g) => n + g.problems.length, 0);
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
        {all && (
          <div className="overview-progress" aria-label="Your progress">
            <div className="overview-progress-bar">
              <span className="solved" style={{ width: `${(100 * all.solved) / total}%` }} />
              <span className="attempted" style={{ width: `${(100 * all.attempted) / total}%` }} />
            </div>
            <p>
              <b>{all.solved}</b> of {total} solved · <b>{all.attempted}</b> attempted. Each problem opens on its question with the solution
              hidden; mark it solved there.
            </p>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.key} className="overview-group">
            {g.section && <div className="overview-section">{g.section}</div>}
            <h2>
              {g.label}
              {algorithms && <span className="overview-group-count">{tally(progress, ids(g.problems)).solved}/{g.problems.length} solved</span>}
            </h2>
            {GROUP_INTROS[g.key] && <p className="overview-blurb">{GROUP_INTROS[g.key]}</p>}
            <ul>
              {g.problems.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onSelect(p.id)}>
                    <span className="prob-num">{p.number}</span>
                    <span className="overview-title">
                      {p.title}
                      {progress.entries[p.id]?.status && <span className={`prob-mark ${progress.entries[p.id].status}`} />}
                    </span>
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
