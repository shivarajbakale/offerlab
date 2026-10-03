// Renders a first-principles lesson. Play links jump the visual to a scenario and moment;
// check-yourself answers stay hidden until asked for.

import { useState } from "react";
import { INTRO_TITLE, readIntro } from "../sim/intro.ts";
import type { Block, Inline, Lesson, PlayLink } from "../sim/lesson.ts";

type OnPlay = (link: PlayLink) => void;
type Props = { onPlay: OnPlay; ready: boolean };

function Inlines({ items, onPlay, ready }: { items: Inline[] } & Props) {
  return (
    <>
      {items.map((x, i) => {
        if (x.kind === "bold") return <strong key={i}>{x.text}</strong>;
        if (x.kind === "italic") return <em key={i}>{x.text}</em>;
        if (x.kind === "code") return <code key={i}>{x.text}</code>;
        if (x.kind === "link")
          return (
            <a key={i} href={x.href} {...(x.href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer" })}>
              {x.text}
            </a>
          );
        if (x.kind === "play")
          return (
            <button
              key={i}
              className="play-link"
              disabled={!ready}
              onClick={() => onPlay(x)}
              title={ready ? `Play "${x.scenario}"` : "Loading scenarios…"}
            >
              {x.text}
            </button>
          );
        return <span key={i}>{x.text}</span>;
      })}
    </>
  );
}

function QA({ block, onPlay, ready }: { block: Extract<Block, { kind: "qa" }> } & Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="qa">
      <p className="qa-q">
        <Inlines items={block.question} onPlay={onPlay} ready={ready} />
      </p>
      {open ? (
        <p className="qa-a">
          <Inlines items={block.answer} onPlay={onPlay} ready={ready} />
        </p>
      ) : (
        <button className="qa-reveal" onClick={() => setOpen(true)}>
          Show answer
        </button>
      )}
    </div>
  );
}

function BlockView({ block, onPlay, ready }: { block: Block } & Props) {
  switch (block.kind) {
    case "heading":
      return <h4>{block.text}</h4>;
    case "para":
      return (
        <p>
          <Inlines items={block.inline} onPlay={onPlay} ready={ready} />
        </p>
      );
    case "code":
      return <pre>{block.text}</pre>;
    case "qa":
      return <QA block={block} onPlay={onPlay} ready={ready} />;
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <Inlines items={item} onPlay={onPlay} ready={ready} />
        </li>
      ));
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
  }
}

/** The opener: what it is and which problem it solves, as a card above the lesson proper. */
function Intro({ lesson, onPlay, ready }: { lesson: Lesson } & Props) {
  const fields = readIntro(lesson);
  if (!fields.length) return null;
  return (
    <section className="lesson-intro" aria-label={INTRO_TITLE}>
      <dl>
        {fields.map((f) => (
          <div key={f.label} className={f.label === "What it is" ? "lead" : ""}>
            <dt>{f.label}</dt>
            <dd>
              <Inlines items={f.inline} onPlay={onPlay} ready={ready} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function LessonView({ lesson, onPlay, ready }: { lesson: Lesson } & Props) {
  return (
    <article className="lesson">
      {lesson.title && <h2>{lesson.title}</h2>}
      <Intro lesson={lesson} onPlay={onPlay} ready={ready} />
      {lesson.sections.filter((s) => s.title !== INTRO_TITLE).map((s, i) => (
        <section key={i}>
          {s.title && <h3>{s.title}</h3>}
          {s.blocks.map((b, j) => (
            <BlockView key={j} block={b} onPlay={onPlay} ready={ready} />
          ))}
        </section>
      ))}
    </article>
  );
}
