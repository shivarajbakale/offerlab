// Chaos for architectures: kill, restart or slow a server, or kill a whole region, at the current moment, then watch.

import { Badge, Button, Group, Select, Text, Tooltip } from "@mantine/core";
import { IconBolt } from "@tabler/icons-react";
import { useState } from "react";
import type { DesignView, TrafficFault } from "../../../system-design/traffic/index.ts";
import { faultLabel, faultRegions, faultTargets } from "./model.ts";

type Action = "kill" | "restart" | "slow" | "killRegion" | "restartRegion";

export function TrafficChaos({ design, t, faults, onAdd, onReset }: { design: DesignView; t: number; faults: TrafficFault[]; onAdd: (f: TrafficFault) => void; onReset: () => void }) {
  // Only regions some server is in: a region where only users live has nothing to kill.
  const regions = faultRegions(design);
  const [target, setTarget] = useState("");
  const [picked, setAction] = useState<Action>("kill");
  // A region action only makes sense while the design has regions.
  const action: Action = regions.length || (picked !== "killRegion" && picked !== "restartRegion") ? picked : "kill";
  const regional = action === "killRegion" || action === "restartRegion";
  const targets = regional ? regions : faultTargets(design);
  const at = Math.round(t);
  // The chosen server may not exist in this scenario (fewer replicas, another stage): fall back to the first.
  const chosen = targets.includes(target) ? target : (targets[0] ?? "");
  const add = () => {
    if (!chosen) return;
    if (action === "killRegion" || action === "restartRegion") onAdd({ at, kind: action, region: chosen });
    else onAdd(action === "slow" ? { at, kind: "slow", target: chosen, factor: 10, durationMs: 5000 } : { at, kind: action, target: chosen });
  };
  const actions = [
    { value: "kill", label: "kill" },
    { value: "restart", label: "restart (memory is wiped)" },
    { value: "slow", label: "slow down 10× for 5 s" },
    ...(regions.length > 0
      ? [
          { value: "killRegion", label: "kill a whole region" },
          { value: "restartRegion", label: "restart a region" },
        ]
      : []),
  ];
  return (
    <Group className="traffic-chaos" gap="xs">
      <Tooltip label="Replays this scenario with a fault added at the current moment">
        <Group gap={4} wrap="nowrap">
          <IconBolt size={15} color="var(--warn)" />
          <Text size="xs" fw={600}>
            Chaos at {(at / 1000).toFixed(1)} s
          </Text>
        </Group>
      </Tooltip>
      <Select size="xs" w={200} allowDeselect={false} data={actions} value={action} onChange={(v) => v && setAction(v as Action)} aria-label="Fault" />
      <Select size="xs" w={150} allowDeselect={false} data={targets} value={chosen || null} onChange={(v) => v && setTarget(v)} aria-label="Target" />
      <Button size="xs" color="red" variant="light" onClick={add}>
        Inject
      </Button>
      {faults.map((f, i) => (
        <Badge key={i} color="red" variant="light" ff="monospace" tt="none">
          {faultLabel(f)} @ {(f.at / 1000).toFixed(1)} s
        </Badge>
      ))}
      {faults.length > 0 && (
        <Button size="xs" variant="subtle" color="gray" onClick={onReset}>
          Reset chaos
        </Button>
      )}
    </Group>
  );
}
