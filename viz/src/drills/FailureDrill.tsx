// A failure drill: a traffic run with a hidden fault. The reader watches the canvas and charts,
// picks a diagnosis, and only then sees the fault, the reasoning, and the fixed design playing.
// Before the answer nothing names the cause: no fault marks, no "slower" tags, and callouts show
// only where something is wrong and how badly.

import { Alert, Badge, Group, List, Radio, SegmentedControl, Stack, Table, Text, Title } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { compareRows, type CompareRow, type FailureDrill as Drill } from "../../../system-design/drills/index.ts";
import { callouts, type Frame, type TrafficRun } from "../../../system-design/traffic/index.ts";
import { Controls } from "../components/Controls.tsx";
import { usePlayer } from "../player/usePlayer.ts";
import { ArchCanvas } from "../traffic/ArchCanvas.tsx";
import { MetricsStrip } from "../traffic/MetricsStrip.tsx";
import { FRAME_MS } from "../traffic/model.ts";
import "../traffic/traffic.css";
import { Rich } from "./Rich.tsx";

const dwell = () => FRAME_MS / 1100;
const SEVERITY = { 1: "notice", 2: "warning", 3: "serious" } as const;

/** The frame without anything that names the fault (a slowed machine's "10x slower" tag). */
function masked(frame: Frame): Frame {
  const stations = Object.fromEntries(Object.entries(frame.stations).map(([id, s]) => [id, s.slow > 1 ? { ...s, slow: 1 } : s]));
  return { ...frame, stations };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ms = (x: number) => (Number.isFinite(x) && x > 0 ? `${Math.round(x)} ms` : "—");
const show = (r: CompareRow, x: number) => (r.unit === "share" ? (Number.isFinite(x) ? pct(x) : "—") : r.unit === "ms" ? ms(x) : String(Math.round(x)));

export function FailureDrill({ drill, play, answerTitle }: { drill: Drill; play: { broken: TrafficRun; fixed: TrafficRun }; answerTitle?: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [showFix, setShowFix] = useState(false);
  const answered = picked !== null;
  const run = showFix ? play.fixed : play.broken;
  const frames = run.frames;
  // Both runs have the same length, so switching between them keeps the moment on screen.
  const player = usePlayer(frames.length, drill.title, dwell);
  const k = player.index;
  const frame = frames[k];
  // Before the answer, a "this machine is slowed" callout would point straight at the fault.
  const notes = useMemo(() => (frame ? callouts(run, k).filter((n) => answered || n.rule !== "slowed") : []), [run, frame, k, answered]);
  const { from, rows } = useMemo(() => compareRows(drill, play), [drill, play]);
  const label = (id: string) => run.design.components.find((c) => c.id === id)?.label ?? id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "ArrowRight") player.step(1);
      else if (e.key === "ArrowLeft") player.step(-1);
      else if (e.key === "Home") player.step(-player.count);
      else if (e.key === "End") player.step(player.count);
      else if (e.key === "]") player.faster();
      else if (e.key === "[") player.slower();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [player]);

  return (
    <>
      <section className="stage">
        <div className="left drill-left">
          <div className="drill-panel">
            <p className="drill-prompt">
              <Rich text={drill.context} />
            </p>
            <p className="drill-question">
              <Rich text={drill.question} />
            </p>
            <Radio.Group value={picked === null ? null : String(picked)} onChange={(v) => !answered && setPicked(Number(v))}>
              <Stack className="drill-options" gap="xs">
                {drill.options.map((o, i) => {
                  const state = !answered ? "" : o.correct ? "right" : i === picked ? "wrong" : "other";
                  return (
                    <Radio.Card key={i} value={String(i)} className={`drill-option ${state}`} disabled={answered} radius="md" p="sm">
                      <Group wrap="nowrap" align="flex-start" gap="sm">
                        {answered && o.correct ? (
                          <IconCheck size={18} className="drill-option-mark ok" />
                        ) : answered && i === picked ? (
                          <IconX size={18} className="drill-option-mark bad" />
                        ) : (
                          <Radio.Indicator size="sm" mt={2} disabled={answered} />
                        )}
                        <Stack gap={4}>
                          <span className="drill-option-text">
                            <Rich text={o.text} />
                          </span>
                          {answered && (
                            <span className="drill-option-why">
                              <Rich text={o.why} />
                            </span>
                          )}
                        </Stack>
                      </Group>
                    </Radio.Card>
                  );
                })}
              </Stack>
            </Radio.Group>
            {!answered && (
              <Text size="sm" c="dimmed" mt="sm">
                <span className="not-phone">Press play and read the canvas and charts. </span>
                <span className="phone-only">Read the symptoms above. </span>
                Pick an answer to see what really happened.
              </Text>
            )}
            {answered && (
              <>
                <Alert
                  mt="sm"
                  variant="light"
                  color={drill.options[picked].correct ? "green" : "red"}
                  icon={drill.options[picked].correct ? <IconCheck size={18} /> : <IconX size={18} />}
                  classNames={{ message: "drill-verdict" }}
                >
                  {drill.options[picked].correct ? "Right." : "Not this time: the right answer is marked."}
                </Alert>
                {answerTitle && (
                  <Title order={3} className="drill-h">
                    What it was: {answerTitle}
                  </Title>
                )}
                <Title order={3} className="drill-h">
                  What was injected
                </Title>
                <List className="drill-faults" size="sm">
                  {drill.faults.map((f, i) => (
                    <List.Item key={i}>
                      {"region" in f ? `${f.kind} ${f.region}` : f.kind === "slow" ? `${f.target} slowed ${f.factor}x for ${f.durationMs / 1000} s` : `${f.kind} ${f.target}`} at {f.at / 1000} s
                    </List.Item>
                  ))}
                </List>
                <Title order={3} className="drill-h">
                  The fix
                </Title>
                <p>
                  <Rich text={drill.fix.explain} />
                </p>
                <Table className="drill-table" verticalSpacing={5} horizontalSpacing="xs" fz="sm" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>From {from} s on</Table.Th>
                      <Table.Th className="num">As it happened</Table.Th>
                      <Table.Th className="num">With the fix</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((r) => (
                      <Table.Tr key={r.metric}>
                        <Table.Td>{r.label}</Table.Td>
                        <Table.Td className="num">{show(r, r.broken)}</Table.Td>
                        <Table.Td className="num">{show(r, r.fixed)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </>
            )}
          </div>
        </div>
        {frame && (
          <div className="traffic-stage">
            {answered && (
              <Group className="drill-play-switch" gap="sm">
                <SegmentedControl
                  size="xs"
                  value={showFix ? "fixed" : "broken"}
                  onChange={(v) => setShowFix(v === "fixed")}
                  data={[
                    { value: "broken", label: "As it happened" },
                    { value: "fixed", label: "With the fix" },
                  ]}
                />
                <Badge variant="default" tt="none">
                  {run.design.name}
                </Badge>
              </Group>
            )}
            <div className="arch">
              <ArchCanvas run={run} frame={answered ? frame : masked(frame)} notes={notes} selected={null} onSelect={() => {}} />
            </div>
            {notes.length > 0 && (
              <div className="arch-notes">
                {notes.map((n, i) => (
                  <div key={`${n.at}-${n.rule}-${i}`} className={`arch-note sev${n.severity}`}>
                    <b>{label(n.at)}:</b> {answered ? n.text : `something is wrong here (${SEVERITY[n.severity]}).`}
                  </div>
                ))}
              </div>
            )}
            <MetricsStrip run={run} index={k} />
          </div>
        )}
      </section>
      <div className="dock">
        <div className="narration" />
        <Controls
          player={player}
          counter={`t = ${((k + 1) / 10).toFixed(1)} s / ${run.seconds} s`}
          marks={answered ? run.faults.map((f) => ({ index: Math.max(0, Math.round(f.at / FRAME_MS) - 1), label: `${f.kind} ${"region" in f ? f.region : f.target} at ${f.at / 1000} s` })) : undefined}
        />
      </div>
    </>
  );
}
