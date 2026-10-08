// One request's trip as a waterfall, read like the Network tab in browser DevTools: a row per stop,
// a shared time axis, and coloured parts for waiting in line, waiting for a CPU, working, and
// waiting on the next stop.

import { CloseButton, Group, Paper, Text } from "@mantine/core";
import type { DesignView, Journey } from "../../../system-design/traffic/index.ts";
import { ms, waterfall } from "./explain.ts";

const OUTCOME: Record<Journey["outcome"], string> = { ok: "answered", rejected: "rejected", failed: "failed", timeout: "the user gave up (timeout)", pending: "still in flight" };

export function Waterfall({ journey, design, onClose }: { journey: Journey; design: DesignView; onClose: () => void }) {
  const rows = waterfall(journey, design);
  const total = journey.end >= 0 ? journey.end - journey.sent : Math.max(...rows.map((r) => r.end), 1);
  const scale = (t: number) => `${Math.max(0, Math.min(100, (t / total) * 100))}%`;
  const work = rows.reduce((n, r) => n + r.segments.filter((s) => s.kind === "work").reduce((a, s) => a + s.to - s.from, 0), 0);
  const line = rows.reduce((n, r) => n + r.segments.filter((s) => s.kind === "line" || s.kind === "cpu").reduce((a, s) => a + s.to - s.from, 0), 0);
  const net = rows.reduce((n, r) => n + r.segments.filter((s) => s.kind === "net").reduce((a, s) => a + s.to - s.from, 0), 0);
  return (
    <Paper className="wf" p="md" radius="md" shadow="xs">
      <Group gap="sm" wrap="nowrap">
        <Text fw={700} style={{ flex: 1 }}>
          Request #{journey.id}: a {journey.kind}, {OUTCOME[journey.outcome]} after {ms(total)}
        </Text>
        <CloseButton onClick={onClose} aria-label="Close" />
      </Group>
      <Text size="sm" c="dimmed" mt={4} mb="sm" lh={1.5}>
        Read it like the Network tab in DevTools: one row per stop, time running left to right. Of the {ms(total)}, {ms(net)} was the trip over the internet,{" "}
        {ms(work)} was real work, {ms(line)} was waiting in line, and the rest was short network hops between the servers.
      </Text>
      <div className="wf-rows">
        {rows.map((r, i) => (
          <div key={i} className="wf-row">
            <div className="wf-label" title={r.at}>
              {r.label}
              <span>{r.at}</span>
            </div>
            <div className="wf-track">
              <span className="wf-span" style={{ left: scale(r.start), width: `calc(${scale(r.end)} - ${scale(r.start)})` }} />
              {r.segments.map((s, k) => (
                <span key={k} className={`wf-seg ${s.kind}`} style={{ left: scale(s.from), width: `max(2px, calc(${scale(s.to)} - ${scale(s.from)}))` }} />
              ))}
            </div>
            <div className="wf-time">{ms(r.end - r.start)}</div>
            <div className={`wf-words ${r.outcome !== "ok" ? "bad" : ""}`}>{r.words}</div>
          </div>
        ))}
      </div>
      <div className="wf-legend">
        <span>
          <i className="wf-seg line" /> waiting in line
        </span>
        <span>
          <i className="wf-seg cpu" /> waiting for a CPU
        </span>
        <span>
          <i className="wf-seg work" /> working
        </span>
        <span>
          <i className="wf-seg downstream" /> waiting on the next stop
        </span>
        <span>
          <i className="wf-seg net" /> over the internet
        </span>
      </div>
    </Paper>
  );
}
