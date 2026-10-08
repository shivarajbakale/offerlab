// Small charts over the whole run, with a cursor at the current moment.

import { Paper, Table, Text } from "@mantine/core";
import { useMemo } from "react";
import type { TrafficRun } from "../../../system-design/traffic/index.ts";
import { formatNumber, kindRows, series } from "./model.ts";

const W = 240;
const H = 56;
const COLORS = ["var(--p0)", "var(--p1)", "var(--p2)", "var(--p3)", "var(--p4)", "var(--p5)"];

function Chart({ title, lines, index, unit, max }: { title: string; lines: { name: string; values: number[] }[]; index: number; unit: string; max?: number }) {
  const n = lines[0]?.values.length ?? 0;
  const top = max ?? Math.max(1, ...lines.flatMap((l) => l.values).filter((v) => Number.isFinite(v))) * 1.1;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - (Math.min(v, top) / top) * H;
  return (
    <Paper className="metric" p="xs" radius="md">
      <div className="metric-head">
        <Text size="xs" fw={600} c="dimmed">
          {title}
        </Text>
        <span className="metric-legend">
          {lines.map((l, k) => (
            <span key={l.name} style={{ color: COLORS[k % COLORS.length] }}>
              {l.name} {Number.isFinite(l.values[index]) ? `${formatNumber(l.values[index])}${unit}` : "—"}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="metric-svg" preserveAspectRatio="none">
        {lines.map((l, k) => (
          <polyline
            key={l.name}
            fill="none"
            stroke={COLORS[k % COLORS.length]}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            points={l.values.flatMap((v, i) => (Number.isFinite(v) ? [`${x(i)},${y(v)}`] : [])).join(" ")}
          />
        ))}
        <line x1={x(index)} x2={x(index)} y1={0} y2={H} className="metric-cursor" vectorEffect="non-scaling-stroke" />
      </svg>
    </Paper>
  );
}

/** p99 and errors per request kind over the last second, when the design sends more than one kind. */
function KindTable({ run, index }: { run: TrafficRun; index: number }) {
  const rows = useMemo(() => kindRows(run, index), [run, index]);
  if (!rows.length) return null;
  return (
    <Paper className="metric" p="xs" radius="md">
      <Text size="xs" fw={600} c="dimmed" mb={2}>
        By kind, last second
      </Text>
      <Table className="kind-table" withRowBorders={false} verticalSpacing={1} horizontalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>kind</Table.Th>
            <Table.Th>req/s</Table.Th>
            <Table.Th>p99</Table.Th>
            <Table.Th>errors</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.kind} className={r.errorRate >= 0.01 ? "bad" : ""}>
              <Table.Td>{r.kind}</Table.Td>
              <Table.Td>{formatNumber(r.rate)}</Table.Td>
              <Table.Td>{Number.isFinite(r.p99) ? `${formatNumber(r.p99)} ms` : "—"}</Table.Td>
              <Table.Td>{r.errorRate > 0 ? `${Math.max(1, Math.round(r.errorRate * 100))}%` : "0"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

export function MetricsStrip({ run, index }: { run: TrafficRun; index: number }) {
  const s = useMemo(() => series(run), [run]);
  return (
    <div className="metrics">
      <Chart title="Requests a second" unit="" index={index} lines={[{ name: "sent", values: s.sent }, { name: "served", values: s.ok }]} />
      <Chart title="Latency" unit=" ms" index={index} lines={[{ name: "p50", values: s.p50 }, { name: "p99", values: s.p99 }]} />
      <Chart title="Errors" unit="%" index={index} max={100} lines={[{ name: "failed", values: s.errors }]} />
      <Chart title="CPU busy" unit="%" index={index} max={100} lines={Object.entries(s.util).map(([name, values]) => ({ name, values }))} />
      {s.backlog && <Chart title="Queue backlog" unit="" index={index} lines={[{ name: "jobs", values: s.backlog }]} />}
      {s.stale && <Chart title="Stale reads" unit="%" index={index} max={100} lines={[{ name: "stale", values: s.stale }]} />}
      <KindTable run={run} index={index} />
    </div>
  );
}
