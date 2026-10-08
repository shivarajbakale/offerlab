// A tab's overview: what the section is, which problems it teaches you to solve, how to use it,
// and every group with what it covers and a one-line "solves" for each topic.

import { Badge, Group, Paper, Progress, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { useMemo } from "react";
import { GROUP_INTROS, TAB_INTROS } from "../overviews.ts";
import { problems } from "../problems.ts";
import { tally } from "../progress.ts";
import { useProgress } from "../useProgress.ts";
import { oneLiner } from "../sim/intro.ts";
import { parseLesson } from "../sim/lesson.ts";
import { groupsFor, type TabId } from "../sidebarTabs.ts";
import { CHOOSERS } from "../blocksGuide.ts";
import { BlocksMap } from "./BlocksMap.tsx";
import "./overview.css";

const DIFFICULTY_COLOR: Record<string, string> = { Easy: "green", Medium: "orange", Hard: "red" };

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
      <div className="ov">
        <Title order={1} className="ov-title">
          {intro.title}
        </Title>
        <Text size="lg" className="ov-what">
          {intro.what}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" mb="xl">
          <Paper p="md" radius="md" className="ov-fact">
            <Text className="ov-kicker">Why it matters</Text>
            <Text size="sm" mt={4}>
              {intro.solves}
            </Text>
          </Paper>
          <Paper p="md" radius="md" className="ov-fact">
            <Text className="ov-kicker">How to use it</Text>
            <Text size="sm" mt={4}>
              {intro.howToUse}
            </Text>
          </Paper>
        </SimpleGrid>
        {all && (
          <Paper p="md" radius="md" mb="md" aria-label="Your progress">
            <Progress.Root size="md" radius="xl">
              <Progress.Section value={(100 * all.solved) / total} color="green" />
              <Progress.Section value={(100 * all.attempted) / total} color="orange" />
            </Progress.Root>
            <Text size="sm" mt="xs">
              <b>{all.solved}</b> of {total} solved · <b>{all.attempted}</b> attempted. Each problem opens on its question with the solution
              hidden; mark it solved there.
            </Text>
          </Paper>
        )}
        {tab === "blocks" && <BlocksMap onSelect={onSelect} />}
        {groups.map((g) => (
          <section key={g.key} className="ov-group">
            {g.section && <Text className="ov-kicker ov-section">{g.section}</Text>}
            <Group gap="sm" align="center" mt="lg" mb={4}>
              <Title order={2} className="ov-group-title">
                {g.label}
              </Title>
              {algorithms && (
                <Badge variant="default" ff="monospace">
                  {tally(progress, ids(g.problems)).solved}/{g.problems.length} solved
                </Badge>
              )}
            </Group>
            {GROUP_INTROS[g.key] && (
              <Text size="sm" c="dimmed" mb="xs">
                {GROUP_INTROS[g.key]}
              </Text>
            )}
            {CHOOSERS[g.key] && (
              <Paper p="sm" radius="md" mb="sm" className="ov-chooser">
                <Text className="ov-kicker" mb={4}>
                  Which one when
                </Text>
                <Stack gap={2}>
                  {CHOOSERS[g.key].map((c) => (
                    <UnstyledButton key={c.pick + c.need} className="ov-choice" onClick={() => onSelect(c.pick)}>
                      <span className="ov-need">{c.need}</span>
                      <Text span size="sm" fw={600} c="indigo" className="ov-pick">
                        <IconArrowRight size={14} /> {problems.find((p) => p.id === c.pick)?.title ?? c.pick}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              </Paper>
            )}
            <Paper radius="md" className="ov-list">
              {g.problems.map((p) => {
                const status = progress.entries[p.id]?.status;
                const line = lines.get(p.id);
                return (
                  <UnstyledButton key={p.id} className="ov-row" onClick={() => onSelect(p.id)}>
                    <span className="prob-num">{p.number}</span>
                    <span className="ov-row-title">
                      {p.title}
                      {status && <span className={`prob-mark ${status}`} title={status === "solved" ? "Solved" : "Attempted"} />}
                    </span>
                    {line ? (
                      <Text span size="sm" c="dimmed" className="ov-row-line">
                        {line}
                      </Text>
                    ) : p.difficulty ? (
                      <Badge color={DIFFICULTY_COLOR[p.difficulty] ?? "gray"} className="ov-row-line">
                        {p.difficulty}
                      </Badge>
                    ) : null}
                  </UnstyledButton>
                );
              })}
            </Paper>
          </section>
        ))}
      </div>
    </main>
  );
}
