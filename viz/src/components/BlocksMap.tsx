// The Blocks tab's starting point: the words a beginner needs, then one request's trip through a
// typical system with the building blocks that solve each stop's problems.

import { Button, Card, Group, Paper, SimpleGrid, Text, Title } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { BASICS, BEHIND, STOPS, type Stop } from "../blocksGuide.ts";
import { problems } from "../problems.ts";

const titleOf = (id: string) => problems.find((p) => p.id === id)?.title ?? id;

function StopCard({ stop, onSelect, behind }: { stop: Stop; onSelect: (id: string) => void; behind?: boolean }) {
  return (
    <Card p="sm" radius="md" className={`bm-card ${behind ? "behind" : ""}`}>
      <Text fw={600} size="sm">
        {stop.title}
      </Text>
      <Text size="xs" c="dimmed" mt={4} mb={stop.blocks.length ? "xs" : 0} lh={1.45}>
        {stop.says}
      </Text>
      {stop.blocks.length > 0 && (
        <Group gap={4}>
          {stop.blocks.map((id) => (
            <Button key={id} size="compact-xs" variant="light" radius="xl" onClick={() => onSelect(id)}>
              {titleOf(id)}
            </Button>
          ))}
        </Group>
      )}
    </Card>
  );
}

export function BlocksMap({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <section className="bm">
      <Title order={2} className="ov-group-title" mt="lg">
        Servers 101
      </Title>
      <Text size="sm" c="dimmed" mb="xs">
        New to servers? These words come up in every lesson.
      </Text>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="xs">
        {BASICS.map((b) => (
          <Paper key={b.term} p="sm" radius="md">
            <Text fw={600} size="sm">
              {b.term}
            </Text>
            <Text size="xs" c="dimmed" mt={2} lh={1.45}>
              {b.means}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>

      <Title order={2} className="ov-group-title" mt="xl">
        Where each block lives
      </Title>
      <Text size="sm" c="dimmed" mb="xs">
        Follow one request from a user's phone to the database and back. Each stop has a problem to solve, and the blocks under it are the
        usual answers. Click one to open its lesson.
      </Text>
      <div className="bm-flow">
        {STOPS.map((s, i) => (
          <div key={s.title} className="bm-step">
            <StopCard stop={s} onSelect={onSelect} />
            {i < STOPS.length - 1 && (
              <span className="bm-arrow" aria-hidden>
                <IconArrowRight size={18} />
              </span>
            )}
          </div>
        ))}
      </div>
      <Text className="ov-kicker" mt="lg" mb="xs">
        Across the whole system
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        {BEHIND.map((s) => (
          <StopCard key={s.title} stop={s} onSelect={onSelect} behind />
        ))}
      </SimpleGrid>
    </section>
  );
}
