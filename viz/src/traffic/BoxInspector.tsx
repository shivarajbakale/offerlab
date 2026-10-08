// The clicked box, explained: its job, life without it, the frontend idea it resembles, its
// numbers in words, the problems at it now, and a way to see what happens if it breaks.

import { Badge, Button, CloseButton, Group, Paper, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { IconPower } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { Callout, ComponentView, DesignView, Frame } from "../../../system-design/traffic/index.ts";
import { guideFor, metricWords } from "./explain.ts";
import { NoteCard } from "./NoteCard.tsx";

type Props = {
  comp: ComponentView;
  design: DesignView;
  frame: Frame;
  notes: Callout[];
  /** "new" or "changed" compared with the stage before, and that stage's version of this box. */
  diff?: "new" | "changed";
  before?: ComponentView;
  /** Kill every machine of this box from now on, to see what it was holding up. */
  onTurnOff?: () => void;
  onClose: () => void;
};

const TONE: Record<string, string> = { ok: "green", warn: "orange", bad: "red", info: "blue" };

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.05em">
        {label}
      </Text>
      <Text size="sm" lh={1.5}>
        {children}
      </Text>
    </Stack>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.05em" mt="md" mb={4}>
      {children}
    </Text>
  );
}

export function BoxInspector({ comp, design, frame, notes, diff, before, onTurnOff, onClose }: Props) {
  const g = guideFor(comp, design);
  const lines = metricWords(comp, frame);
  return (
    <Paper className="insp" p="md" radius="md" shadow="xs">
      <Group gap="sm" wrap="nowrap" align="baseline">
        <Text fw={700} size="lg">
          {comp.label}
        </Text>
        <Text size="sm" c="dimmed" fs="italic" style={{ flex: 1 }}>
          {g.tagline}
        </Text>
        <CloseButton onClick={onClose} aria-label="Close" />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="sm" mt="sm">
        <Fact label="Its job">{g.job}</Fact>
        <Fact label="Without it">{g.without}</Fact>
        <Fact label="In frontend terms">{g.frontend}</Fact>
        {diff && (
          <Fact
            label={
              <Badge size="xs" variant="light" color={diff === "new" ? "indigo" : "teal"}>
                {diff === "new" ? "New in this stage" : "Changed in this stage"}
              </Badge>
            }
          >
            {diff === "new"
              ? "The stage before didn't have this box. Compare the two stages' numbers to see what it bought."
              : before
                ? `Before: ${before.replicas} machine${before.replicas === 1 ? "" : "s"} with ${before.cores} cores${before.sessions ? `, sessions ${before.sessions}` : ""}. Now: ${comp.replicas} with ${comp.cores}${comp.sessions ? `, sessions ${comp.sessions}` : ""}.`
                : "Resized since the stage before."}
          </Fact>
        )}
      </SimpleGrid>
      {lines.length > 0 && (
        <>
          <Sub>Right now</Sub>
          <Table className="insp-table" verticalSpacing={6} horizontalSpacing="xs">
            <Table.Tbody>
              {lines.map((l) => (
                <Table.Tr key={l.name}>
                  <Table.Td c="dimmed" w={130}>
                    {l.name}
                  </Table.Td>
                  <Table.Td w={120}>
                    <Badge variant="light" color={TONE[l.tone] ?? "gray"} ff="monospace" tt="none" size="md">
                      {l.value}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{l.says}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
      {notes.length > 0 && (
        <>
          <Sub>Problems here</Sub>
          <Stack gap={6}>
            {notes.map((n) => (
              <NoteCard key={n.rule} note={n} />
            ))}
          </Stack>
        </>
      )}
      {onTurnOff && (
        <Group gap="sm" mt="md" wrap="wrap">
          <Button size="xs" color="red" variant="light" leftSection={<IconPower size={14} />} onClick={onTurnOff}>
            What if it breaks? Turn it off now
          </Button>
          <Text size="xs" c="dimmed" style={{ flex: "1 1 240px" }}>
            Every machine of this box is killed from this moment, and the run replays so you can watch what depended on it.
          </Text>
        </Group>
      )}
    </Paper>
  );
}
