// An estimation drill: the question and its assumptions, the reader's number graded by factor,
// then the worked answer one step at a time, then what to remember.

import { Alert, Badge, Button, Group, List, Paper, Table, Text, TextInput, Timeline, Title } from "@mantine/core";
import { IconBulb, IconCheck, IconPlayerTrackNext, IconX } from "@tabler/icons-react";
import { useState } from "react";
import type { Estimation } from "../../../system-design/drills/index.ts";
import { formatQuantity, grade, readEstimate, type Grade } from "./grade.ts";
import { Rich } from "./Rich.tsx";

export function EstimationDrill({ drill }: { drill: Estimation }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Grade | null>(null);
  const [shown, setShown] = useState(0);
  const unit = drill.answer.unit;
  const read = readEstimate(text, unit);
  const value = "value" in read ? read.value : null;
  const valid = value !== null && value > 0;
  const check = () => {
    if (valid) setResult(grade(value, drill.answer.value, drill.tolerance, unit));
  };
  const done = shown >= drill.steps.length;

  const reading =
    text.trim() === ""
      ? `Suffixes: k, M, B (billion), T${unit === "bytes" ? "; KB, MB, GB, TB, PB" : ""}`
      : valid
        ? `reads as ${formatQuantity(value, unit)}${unit && unit !== "bytes" ? ` ${unit}` : ""}`
        : "error" in read
          ? read.error
          : "must be above zero";
  const invalid = text.trim() !== "" && !valid;

  return (
    <div className="drill-body">
      <Paper className="drill-card" p="md" radius="md" shadow="xs">
        <p className="drill-prompt">
          <Rich text={drill.prompt} />
        </p>
        <Table className="drill-table" verticalSpacing={5} horizontalSpacing="xs" fz="sm" striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Assume</Table.Th>
              <Table.Th className="num">Value</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {drill.assumptions.map((a) => (
              <Table.Tr key={a.name}>
                <Table.Td>
                  {a.note ? <Rich text={a.note} /> : a.name} <span className="drill-name">{a.name}</span>
                </Table.Td>
                <Table.Td className="num">
                  {formatQuantity(a.value, a.unit === "bytes" ? "bytes" : "")}
                  {a.unit && a.unit !== "bytes" ? ` ${a.unit}` : ""}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper className="drill-card" p="md" radius="md" shadow="xs">
        <Group align="flex-start" gap="xs" wrap="wrap">
          <TextInput
            className="drill-answer"
            label={`Your estimate${unit ? ` (${unit})` : ""}`}
            value={text}
            placeholder={unit === "bytes" ? "e.g. 200TB or 2e14" : "e.g. 12k or 1.2e4"}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            error={invalid ? reading : undefined}
            description={invalid ? undefined : reading}
            inputWrapperOrder={["label", "input", "description", "error"]}
            aria-invalid={invalid}
          />
          <Button mt={25} disabled={!valid} onClick={check}>
            Check
          </Button>
        </Group>
        {result && (
          <Alert
            mt="sm"
            variant="light"
            color={result.ok ? "green" : "red"}
            icon={result.ok ? <IconCheck size={18} /> : <IconX size={18} />}
            classNames={{ message: "drill-verdict" }}
          >
            {result.message}
          </Alert>
        )}
      </Paper>

      <Paper className="drill-card" p="md" radius="md" shadow="xs">
        <Title order={3} className="drill-h">
          Working
        </Title>
        {shown === 0 && !result && (
          <Text size="sm" c="dimmed" mb="sm">
            Make your own estimate first, then compare the working.
          </Text>
        )}
        {shown > 0 && (
          <Timeline className="drill-steps" active={shown - 1} bulletSize={22} lineWidth={2} mb="md">
            {drill.steps.slice(0, shown).map((s, i) => (
              <Timeline.Item
                key={s.label}
                bullet={<Text size="xs" fw={700}>{i + 1}</Text>}
                title={
                  <Group gap="xs" wrap="wrap">
                    <span className="drill-step-label">{s.label}</span>
                    <Badge variant="light" className="drill-step-value" tt="none">
                      {formatQuantity(s.value, s.unit === "bytes" ? "bytes" : "")}
                      {s.unit !== "bytes" ? ` ${s.unit}` : ""}
                    </Badge>
                  </Group>
                }
              >
                <Text size="sm" c="dimmed" className="drill-step-how">
                  <Rich text={s.how} />
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
        {!done && (
          <Button variant="light" leftSection={<IconPlayerTrackNext size={16} />} onClick={() => setShown(shown + 1)}>
            {shown === 0 ? "Show the first step" : `Next step (${shown + 1} of ${drill.steps.length})`}
          </Button>
        )}
        {done && (
          <>
            <Alert variant="light" color="indigo" className="drill-final" icon={<IconCheck size={18} />}>
              Answer: <b>{formatQuantity(drill.answer.value, unit)}</b>
              {unit !== "bytes" ? ` ${unit}` : ""} · anything within x{drill.tolerance} counts
            </Alert>
            <Title order={3} className="drill-h">
              Takeaways
            </Title>
            <List className="drill-takeaways" spacing={6} size="sm" icon={<IconBulb size={16} color="var(--mantine-color-yellow-6)" />}>
              {drill.takeaways.map((t, i) => (
                <List.Item key={i}>
                  <Rich text={t} />
                </List.Item>
              ))}
            </List>
          </>
        )}
      </Paper>
    </div>
  );
}
