// A flashcard deck with Leitner review: one card at a time, flip it, say whether you knew it.
// Progress lives in localStorage per deck; without storage it lasts for the visit.

import { Button, Group, Kbd, Paper, Progress, SimpleGrid, Text, Tooltip } from "@mantine/core";
import { IconArrowRight, IconCheck, IconRotate, IconX } from "@tabler/icons-react";
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
  const known = counts[BOXES - 1] ?? 0;
  return (
    <div className="drill-body">
      <Tooltip label="Leitner boxes: a card you know moves up a box; a card you miss goes back to box 1. Lower boxes come round first.">
        <SimpleGrid className="fc-progress" cols={{ base: 3, sm: 5 }} spacing={6}>
          {counts.map((n, i) => (
            <Paper key={i} className={`fc-box ${boxOf(state, current) === i + 1 ? "on" : ""}`} p="xs" radius="md">
              <span className="fc-box-n">{n}</span>
              <span className="fc-box-label">{i === 0 ? "box 1 · new or missed" : i === BOXES - 1 ? `box ${BOXES} · known` : `box ${i + 1}`}</span>
            </Paper>
          ))}
        </SimpleGrid>
      </Tooltip>
      <Progress value={(100 * known) / Math.max(1, ids.length)} size="sm" color="green" aria-label="Cards known" />
      <Group className="fc-session" justify="space-between" gap="xs">
        <Text size="xs" c="dimmed">
          This visit: {session.knew} known, {session.missed} missed · {deck.cards.length} cards
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<IconRotate size={13} />}
          onClick={() => {
            clearLeitner(deckId);
            setState({});
            setFlipped(false);
          }}
        >
          Reset progress
        </Button>
      </Group>

      <Paper
        component="button"
        className={`fc-card ${flipped ? "flipped" : ""}`}
        radius="lg"
        shadow="sm"
        onClick={() => setFlipped(!flipped)}
        aria-label={flipped ? "Show the question" : "Show the answer"}
      >
        <span className="fc-side">{flipped ? "Answer" : `Question · box ${boxOf(state, current)}`}</span>
        <span className="fc-text">
          <Rich text={flipped ? card.back : card.front} />
        </span>
        {!flipped && (
          <span className="fc-hint">
            Click or press <Kbd size="xs">space</Kbd> to flip
          </span>
        )}
      </Paper>

      {flipped && (
        <Group className="fc-actions" gap="sm">
          <Button variant="light" color="red" leftSection={<IconX size={16} />} rightSection={<Kbd size="xs">1</Kbd>} onClick={() => answer(false)}>
            Missed it
          </Button>
          <Button variant="light" color="green" leftSection={<IconCheck size={16} />} rightSection={<Kbd size="xs">2</Kbd>} onClick={() => answer(true)}>
            Knew it
          </Button>
          {linked && (
            <Button variant="subtle" rightSection={<IconArrowRight size={16} />} onClick={() => onSelect(linked.id)}>
              Study it: {linked.title}
            </Button>
          )}
        </Group>
      )}
    </div>
  );
}
