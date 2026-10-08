import { Anchor, Badge, Card, Chip, Group, List, Text, Title, UnstyledButton } from "@mantine/core";
import { IconBulb, IconExternalLink } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { patternById, type Pattern } from "../patterns/index.ts";
import { problems, type Problem } from "../problems.ts";
import { useTokens } from "./highlight.ts";
import "./panels.css";

const DIFF_COLOR: Record<string, string> = { Easy: "green", Medium: "orange", Hard: "red" };

/** A card's small uppercase heading. */
function CardTitle({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <Title order={3} className="intu-title" c={accent ? "indigo" : "dimmed"}>
      {children}
    </Title>
  );
}

/** "Why this works and where else it works": the per-problem insight plus its pattern(s). */
export function IntuitionPanel({ problem, onSelect }: { problem: Problem; onSelect: (id: string) => void }) {
  const own = problem.patterns.map((id) => patternById.get(id)).filter((p): p is Pattern => Boolean(p));
  const [active, setActive] = useState(0);
  const pattern = own[active] ?? own[0];

  return (
    <div className="intuition">
      {problem.insight && (
        <Card component="section" className="intu-insight" padding="md">
          <CardTitle accent>
            <IconBulb size={14} /> Key insight
          </CardTitle>
          <Text size="sm">{problem.insight}</Text>
        </Card>
      )}

      {pattern && (
        <>
          <Group gap={6} wrap="wrap">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" lts="0.06em" mr={2}>
              Pattern
            </Text>
            <Chip.Group value={String(active)} onChange={(v) => setActive(Number(v))}>
              {own.map((p, i) => (
                <Chip key={p.id} value={String(i)} size="xs" variant="outline">
                  {p.name}
                </Chip>
              ))}
            </Chip.Group>
          </Group>
          <PatternView key={pattern.id} pattern={pattern} problem={problem} onSelect={onSelect} />
        </>
      )}

      {problem.realWorld && (
        <Card component="section" padding="md">
          <CardTitle>This problem in the real world</CardTitle>
          <Text size="sm">{problem.realWorld}</Text>
        </Card>
      )}

      {!problem.insight && !pattern && (
        <Text c="dimmed" size="sm">
          No intuition notes for this problem yet.
        </Text>
      )}
    </div>
  );
}

function PatternView({ pattern, problem, onSelect }: { pattern: Pattern; problem: Problem; onSelect: (id: string) => void }) {
  const inApp = problems.filter((p) => p.patterns.includes(pattern.id));
  const total = inApp.length + pattern.related.length;
  return (
    <>
      <Card component="section" padding="md">
        <CardTitle>The intuition</CardTitle>
        <Text size="sm">{pattern.intuition}</Text>
        <Title order={4} className="intu-sub">
          Reach for it when you see
        </Title>
        <List size="sm" spacing={2}>
          {pattern.signals.map((s) => (
            <List.Item key={s}>{s}</List.Item>
          ))}
        </List>
        <Title order={4} className="intu-sub">
          Template
        </Title>
        <Template id={`pattern:${pattern.id}`} code={pattern.template.replace(/^\n+|\s+$/g, "")} />
      </Card>

      <Card component="section" padding="md">
        <CardTitle>
          Same trick solves{" "}
          <Badge size="sm" circle={total < 10}>
            {total}
          </Badge>
        </CardTitle>
        <ul className="intu-solves">
          {inApp.map((p) => (
            <li key={p.id} className={p.id === problem.id ? "current" : ""}>
              <UnstyledButton className="intu-link" onClick={() => onSelect(p.id)} disabled={p.id === problem.id}>
                <span className="intu-dot in" title="In this app" />
                <span className="intu-num">{p.number}</span> {p.title}
              </UnstyledButton>
              <Badge size="xs" variant="light" color={DIFF_COLOR[p.difficulty] ?? "gray"}>
                {p.difficulty}
              </Badge>
            </li>
          ))}
          {pattern.related.map((r) => (
            <li key={r.slug}>
              <Anchor className="intu-link" href={`https://leetcode.com/problems/${r.slug}/`} target="_blank" rel="noreferrer" underline="never">
                <span className="intu-dot" title="On LeetCode" />
                {r.title} <IconExternalLink size={12} className="intu-ext" />
                {r.premium && (
                  <Badge size="xs" color="yellow" variant="light" title="LeetCode Premium">
                    Premium
                  </Badge>
                )}
              </Anchor>
              <Badge size="xs" variant="light" color={DIFF_COLOR[r.difficulty] ?? "gray"}>
                {r.difficulty}
              </Badge>
            </li>
          ))}
        </ul>
        <Text size="xs" c="dimmed" mt="xs">
          <span className="intu-dot in" /> in this app (click to visualize) <span className="intu-dot" /> practice on LeetCode
        </Text>
      </Card>

      <Card component="section" padding="md">
        <CardTitle>Where {pattern.name} shows up in real systems</CardTitle>
        <dl className="intu-real">
          {pattern.realWorld.map((r) => (
            <div key={r.title}>
              <dt>{r.title}</dt>
              <dd>{r.text}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

function Template({ id, code }: { id: string; code: string }) {
  const tokens = useTokens(id, code);
  return (
    <pre className="template">
      {tokens
        ? tokens.map((line, n) => (
            <div key={n}>
              {line.map((t, i) => (
                <span key={i} style={t.htmlStyle as React.CSSProperties}>
                  {t.content}
                </span>
              ))}
              {line.length === 0 && "\n"}
            </div>
          ))
        : code}
    </pre>
  );
}
