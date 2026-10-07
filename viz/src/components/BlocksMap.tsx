// The Blocks tab's starting point: the words a beginner needs, then one request's trip through a
// typical system with the building blocks that solve each stop's problems.

import { BASICS, BEHIND, STOPS, type Stop } from "../blocksGuide.ts";
import { problems } from "../problems.ts";

const titleOf = (id: string) => problems.find((p) => p.id === id)?.title ?? id;

function StopCard({ stop, onSelect }: { stop: Stop; onSelect: (id: string) => void }) {
  return (
    <div className="bm-stop">
      <b>{stop.title}</b>
      <p>{stop.says}</p>
      {stop.blocks.length > 0 && (
        <div className="bm-chips">
          {stop.blocks.map((id) => (
            <button key={id} className="bm-chip" onClick={() => onSelect(id)}>
              {titleOf(id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlocksMap({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <section className="bm">
      <h2>Servers 101</h2>
      <p className="overview-blurb">New to servers? These words come up in every lesson.</p>
      <dl className="bm-basics">
        {BASICS.map((b) => (
          <div key={b.term}>
            <dt>{b.term}</dt>
            <dd>{b.means}</dd>
          </div>
        ))}
      </dl>

      <h2>Where each block lives</h2>
      <p className="overview-blurb">
        Follow one request from a user's phone to the database and back. Each stop has a problem to solve, and the blocks under it are the
        usual answers. Click one to open its lesson.
      </p>
      <div className="bm-flow">
        {STOPS.map((s, i) => (
          <div key={s.title} className="bm-step">
            <StopCard stop={s} onSelect={onSelect} />
            {i < STOPS.length - 1 && (
              <span className="bm-arrow" aria-hidden>
                →
              </span>
            )}
          </div>
        ))}
      </div>
      <h3 className="bm-behind-title">Across the whole system</h3>
      <div className="bm-behind">
        {BEHIND.map((s) => (
          <StopCard key={s.title} stop={s} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
