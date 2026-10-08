// Renders a first-principles lesson. Play links jump the visual to a scenario and moment;
// check-yourself answers stay hidden until asked for.

import { Anchor, Button, Code, List, Paper, Text, Title } from "@mantine/core";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { useState } from "react";
import { INTRO_TITLE, readIntro } from "../sim/intro.ts";
import type { Block, Inline, Lesson, PlayLink } from "../sim/lesson.ts";
import "./panels.css";

type OnPlay = (link: PlayLink) => void;
type Props = { onPlay: OnPlay; ready: boolean };

function Inlines({ items, onPlay, ready }: { items: Inline[] } & Props) {
  return (
    <>
      {items.map((x, i) => {
        if (x.kind === "bold") return <strong key={i}>{x.text}</strong>;
        if (x.kind === "italic") return <em key={i}>{x.text}</em>;
        if (x.kind === "code") return <Code key={i}>{x.text}</Code>;
        if (x.kind === "link")
          return (
            <Anchor key={i} href={x.href} {...(x.href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer" })}>
              {x.text}
            </Anchor>
          );
        if (x.kind === "play")
          return (
            <Button
              key={i}
              className="play-link"
              size="compact-xs"
              variant="light"
              radius="xl"
              leftSection={<IconPlayerPlayFilled size={10} />}
              disabled={!ready}
              onClick={() => onPlay(x)}
              title={ready ? `Play "${x.scenario}"` : "Loading scenarios…"}
            >
              {x.text}
            </Button>
          );
        return <span key={i}>{x.text}</span>;
      })}
    </>
  );
}

function QA({ block, onPlay, ready }: { block: Extract<Block, { kind: "qa" }> } & Props) {
  const [open, setOpen] = useState(false);
  return (
    <Paper className="lesson-qa" p="sm" my="sm">
      <Text fw={600} size="sm">
        <Inlines items={block.question} onPlay={onPlay} ready={ready} />
      </Text>
      {open ? (
        <Text size="sm" mt={6}>
          <Inlines items={block.answer} onPlay={onPlay} ready={ready} />
        </Text>
      ) : (
        <Button variant="subtle" size="compact-sm" mt={6} onClick={() => setOpen(true)}>
          Show answer
        </Button>
      )}
    </Paper>
  );
}

function BlockView({ block, onPlay, ready }: { block: Block } & Props) {
  switch (block.kind) {
    case "heading":
      return (
        <Title order={4} className="lesson-h4">
          {block.text}
        </Title>
      );
    case "para":
      return (
        <Text className="lesson-p">
          <Inlines items={block.inline} onPlay={onPlay} ready={ready} />
        </Text>
      );
    case "code":
      return (
        <Code block className="lesson-pre">
          {block.text}
        </Code>
      );
    case "qa":
      return <QA block={block} onPlay={onPlay} ready={ready} />;
    case "list":
      return (
        <List type={block.ordered ? "ordered" : "unordered"} className="lesson-list" spacing={4}>
          {block.items.map((item, i) => (
            <List.Item key={i}>
              <Inlines items={item} onPlay={onPlay} ready={ready} />
            </List.Item>
          ))}
        </List>
      );
  }
}

/** The opener: what it is and which problem it solves, as a card above the lesson proper. */
function Intro({ lesson, onPlay, ready }: { lesson: Lesson } & Props) {
  const fields = readIntro(lesson);
  if (!fields.length) return null;
  return (
    <Paper component="section" className="lesson-opener" aria-label={INTRO_TITLE} p="md">
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
    </Paper>
  );
}

export function LessonView({ lesson, onPlay, ready }: { lesson: Lesson } & Props) {
  return (
    <article className="lesson">
      {lesson.title && (
        <Title order={2} className="lesson-h2">
          {lesson.title}
        </Title>
      )}
      <Intro lesson={lesson} onPlay={onPlay} ready={ready} />
      {lesson.sections.filter((s) => s.title !== INTRO_TITLE).map((s, i) => (
        <section key={i}>
          {s.title && (
            <Title order={3} className="lesson-h3">
              {s.title}
            </Title>
          )}
          {s.blocks.map((b, j) => (
            <BlockView key={j} block={b} onPlay={onPlay} ready={ready} />
          ))}
        </section>
      ))}
    </article>
  );
}
