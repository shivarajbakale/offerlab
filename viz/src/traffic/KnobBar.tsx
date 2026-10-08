// Sliders for a design's knobs. A change is committed on release, which re-runs the scenario.

import { Button, Group, Loader, Slider, Stack, Text } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useState } from "react";
import type { Knob } from "../../../system-design/traffic/index.ts";
import { formatNumber, fromSlider, toSlider } from "./model.ts";

const NAMES: Record<string, string> = {
  qps: "Requests a second",
  apps: "App servers",
  cacheKeys: "Cache size (keys)",
  dbReplicas: "Database copies",
  lagMs: "Replica lag (ms)",
  consumers: "Queue consumers",
  writes: "Share of writes",
};

type Props = {
  knobs: Knob[];
  values: Record<string, number>;
  changed: boolean;
  busy: boolean;
  onCommit: (name: string, value: number) => void;
  onReset: () => void;
};

export function KnobBar({ knobs, values, changed, busy, onCommit, onReset }: Props) {
  const [drag, setDrag] = useState<{ name: string; value: number } | null>(null);
  if (!knobs.length) return null;
  return (
    <Group className="knobs" gap="lg" align="flex-end">
      {knobs.map((k) => {
        const v = drag?.name === k.knob ? drag.value : (values[k.knob] ?? k.value);
        return (
          <Stack key={k.knob} className="knob" gap={4}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {NAMES[k.knob] ?? k.knob}
              </Text>
              <Text size="xs" ff="monospace" fw={600}>
                {formatNumber(v)}
              </Text>
            </Group>
            <Slider
              size="sm"
              min={0}
              max={1000}
              label={null}
              value={toSlider(k, v)}
              onChange={(s) => setDrag({ name: k.knob, value: fromSlider(k, s) })}
              onChangeEnd={(s) => {
                onCommit(k.knob, fromSlider(k, s));
                setDrag(null);
              }}
              aria-label={NAMES[k.knob] ?? k.knob}
            />
          </Stack>
        );
      })}
      {busy && (
        <Group gap={6}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Simulating…
          </Text>
        </Group>
      )}
      {changed && (
        <Button size="xs" variant="default" leftSection={<IconRestore size={14} />} onClick={onReset}>
          Reset knobs
        </Button>
      )}
    </Group>
  );
}
