// Inject a fault at the moment being shown. The scenario replays from the start with the fault
// added, so everything after it is exactly what the protocol does about it.

import { Button, Group, Select, Text, Tooltip } from "@mantine/core";
import { IconBolt, IconRotate } from "@tabler/icons-react";
import { useState } from "react";
import type { Fault } from "../../../system-design/kernel/types.ts";
import { describeFault } from "../sim/chaos.ts";

export function ChaosBar({
  ids,
  up,
  partitioned,
  t,
  faults,
  onAdd,
  onReset,
}: {
  ids: string[];
  up: Record<string, boolean>;
  partitioned: boolean;
  t: number;
  faults: Fault[];
  onAdd: (f: Fault) => void;
  onReset: () => void;
}) {
  const [isolate, setIsolate] = useState(ids[0] ?? "");
  const target = ids.includes(isolate) ? isolate : ids[0];
  return (
    <Group className="chaos" gap={6} wrap="wrap">
      <Tooltip label="Each button replays the scenario with that fault injected at this moment">
        <Group gap={4} className="chaos-label" wrap="nowrap">
          <IconBolt size={15} />
          Chaos at t={t}
        </Group>
      </Tooltip>
      {ids.map((id) => (
        <Button
          key={id}
          size="compact-xs"
          variant="light"
          color={up[id] ? "red" : "green"}
          onClick={() => onAdd({ at: t, kind: up[id] ? "crash" : "recover", node: id })}
        >
          {up[id] ? `Crash ${id}` : `Restart ${id}`}
        </Button>
      ))}
      <Group gap={4} wrap="nowrap">
        <Select
          size="xs"
          w={90}
          allowDeselect={false}
          value={target ?? null}
          onChange={(v) => v && setIsolate(v)}
          data={ids}
          aria-label="Node to cut off"
          comboboxProps={{ width: "max-content" }}
          classNames={{ input: "chaos-select" }}
        />
        <Button
          size="compact-xs"
          variant="default"
          onClick={() => onAdd({ at: t, kind: "partition", groups: [[target], ids.filter((x) => x !== target)] })}
        >
          Cut off
        </Button>
      </Group>
      {partitioned && (
        <Button size="compact-xs" variant="light" color="green" onClick={() => onAdd({ at: t, kind: "heal" })}>
          Heal network
        </Button>
      )}
      <Button size="compact-xs" variant="default" onClick={() => onAdd({ at: t, kind: "drop", count: 1 })}>
        Lose next message
      </Button>
      <Button size="compact-xs" variant="default" onClick={() => onAdd({ at: t, kind: "delay", extra: 5, until: t + 20 })}>
        Slow network
      </Button>
      {faults.length > 0 && (
        <Group className="chaos-list" gap="xs" wrap="wrap">
          <Text span inherit>
            Injected: {faults.map(describeFault).join(" · ")}
          </Text>
          <Button size="compact-xs" variant="subtle" color="orange" leftSection={<IconRotate size={13} />} onClick={onReset}>
            Reset
          </Button>
        </Group>
      )}
    </Group>
  );
}
