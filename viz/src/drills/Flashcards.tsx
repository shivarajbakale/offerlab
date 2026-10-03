// A flashcard deck with Leitner review: one card at a time, flip it, say whether you knew it.
// Progress lives in localStorage per deck; without storage it lasts for the visit.

import { useCallback, useEffect, useMemo, useState } from "react";
import { cardId, type Deck } from "../../../system-design/drills/index.ts";
import { problems } from "../problems.ts";
import { BOXES, boxCounts, boxOf, clearLeitner, dueOrder, loadLeitner, review, saveLeitner, type Leitner } from "./leitner.ts";
import { Rich } from "./Rich.tsx";

export function Flashcards({ deck, deckId, onSelect }: { deck: Deck; deckId: string; onSelect: (id: string) => void }) {
  const ids = useMemo(() => deck.cards.map(cardId), [deck]);
  const [state, setState] = useState<Leitner>(() => loadLeitner(deckId));
  const [flipped, setFlipped] = useState(false);
  const [session, setSession] = useState({ knew: 0, missed: 0 });
  const order = useMemo(() => dueOrder(ids, state), [ids, state]);
  const current = order[0];
  const card = deck.cards[ids.indexOf(current)];
  const counts = boxCounts(ids, state);
  const linked = card?.link ? problems.find((p) => p.id === card.link) : undefined;

  const answer = useCallback(
    (knew: boolean) => {
      if (!flipped || !current) return;
      const next = review(state, current, knew, Date.now());
      setState(next);
      saveLeitner(deckId, next);
      setSession((s) => (knew ? { ...s, knew: s.knew + 1 } : { ...s, missed: s.missed + 1 }));
      setFlipped(false);
    },
    [flipped, current, state, deckId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        // A focused button already acts on space and Enter.
        if (tag === "BUTTON") return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "1") answer(false);
      else if (e.key === "2") answer(true);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [answer]);

  if (!card) return null;
  return (
    <div className="drill-body">
      <div className="fc-progress" title="Leitner boxes: a card you know moves up a box; a card you miss goes back to box 1. Lower boxes come round first.">
        {counts.map((n, i) => (
          <div key={i} className={`fc-box ${boxOf(state, current) === i + 1 ? "on" : ""}`}>
            <span className="fc-box-n">{n}</span>
            <span className="fc-box-label">{i === 0 ? "box 1 · new or missed" : i === BOXES - 1 ? `box ${BOXES} · known` : `box ${i + 1}`}</span>
          </div>
        ))}
      </div>
      <div className="fc-session">
        This visit: {session.knew} known, {session.missed} missed · {deck.cards.length} cards
        <button
          className="drill-link"
          onClick={() => {
            clearLeitner(deckId);
            setState({});
            setFlipped(false);
          }}
        >
          Reset progress
        </button>
      </div>

      <button className={`fc-card ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show the question" : "Show the answer"}>
        <span className="fc-side">{flipped ? "Answer" : `Question · box ${boxOf(state, current)}`}</span>
        <span className="fc-text">
          <Rich text={flipped ? card.back : card.front} />
        </span>
        {!flipped && <span className="fc-hint">Click or press space to flip</span>}
      </button>

      {flipped && (
        <div className="fc-actions">
          <button className="drill-btn bad" onClick={() => answer(false)}>
            Missed it <kbd>1</kbd>
          </button>
          <button className="drill-btn ok" onClick={() => answer(true)}>
            Knew it <kbd>2</kbd>
          </button>
          {linked && (
            <button className="drill-link" onClick={() => onSelect(linked.id)}>
              Study it: {linked.title} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
