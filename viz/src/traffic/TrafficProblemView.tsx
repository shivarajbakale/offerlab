// Plays an architecture: the canvas, charts, knobs and timeline for one scenario at a time.

import { Alert, Badge, Button, Center, Group, Loader, SegmentedControl, Select, Tabs, Text, Title, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconRoute } from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { callouts, replicaNames, summary, type Journey, type TrafficFault, type TrafficTrace } from "../../../system-design/traffic/index.ts";
import { BoxInspector } from "./BoxInspector.tsx";
import { NoteCard } from "./NoteCard.tsx";
import { Waterfall } from "./Waterfall.tsx";
import { CodePanel } from "../components/CodePanel.tsx";
import { Controls } from "../components/Controls.tsx";
import { LessonView } from "../components/LessonView.tsx";
import { NarrationBar } from "../components/NarrationBar.tsx";
import type { Problem } from "../parseProblem.ts";
import { usePlayer } from "../player/usePlayer.ts";
import { findRun, parseLesson, scenarioOptionLabel, type PlayLink } from "../sim/lesson.ts";
import { ArchCanvas } from "./ArchCanvas.tsx";
import { KnobBar } from "./KnobBar.tsx";
import { MetricsStrip } from "./MetricsStrip.tsx";
import { TrafficChaos } from "./TrafficChaos.tsx";
import { FRAME_MS, designDiff, faultLabel, previousDesign, stageOf, stages } from "./model.ts";
import type { Override } from "./run.ts";
import { useTrafficTrace } from "./useTrafficTrace.ts";
import "./traffic.css";

const NO_LINES: number[] = [];
// One frame is 100 ms of simulated time; at 1x it plays in real time.
const dwell = () => FRAME_MS / 1100;

export function TrafficProblemView({ problem }: { problem: Problem }) {
  const [runIndex, setRunIndex] = useState(0);
  const [override, setOverride] = useState<Override | null>(null);
  const active = override && override.run === runIndex ? override : undefined;
  const state = useTrafficTrace(problem.id, problem.source, active);
  // While a knob change is simulating, keep showing the previous result instead of a blank screen.
  const [shown, setShown] = useState<TrafficTrace | null>(null);
  if (state.status === "ready" && state.trace !== shown) setShown(state.trace);
  const trace = state.status === "ready" ? state.trace : shown;
  const run = trace?.runs[runIndex];
  const frames = run?.frames ?? [];
  const lesson = useMemo(() => parseLesson(problem.lesson), [problem.lesson]);
  const [tab, setTab] = useState<"learn" | "code">(problem.lesson ? "learn" : "code");
  const [selected, setSelected] = useState<number | null>(null);
  const [box, setBox] = useState<string | null>(null);
  const [jump, setJump] = useState<{ run: number; frame: number; req?: number } | null>(null);

  const onPlay = useCallback(
    (link: PlayLink) => {
      const r = trace ? findRun(trace.runs, link.scenario) : -1;
      if (r < 0) return;
      // A lesson link describes the scenario as written, so it always plays with the file's knobs.
      setOverride(null);
      setRunIndex(r);
      setJump({ run: r, frame: Math.max(0, Math.round((link.t ?? 0) * 10) - 1), req: link.req });
    },
    [trace],
  );

  const player = usePlayer(frames.length, `${problem.id}:${runIndex}:${frames.length}`, dwell);
  const k = player.index;
  const frame = frames[k];

  const done = useRef<typeof jump>(null);
  useLayoutEffect(() => {
    if (!jump || done.current === jump || jump.run !== runIndex || !run) return;
    done.current = jump;
    player.pause();
    player.setIndex(jump.frame);
    setSelected(jump.req ?? null);
  }, [jump, runIndex, run, player]);

  const notes = useMemo(() => (run && frame ? callouts(run, k) : []), [run, frame, k]);
  const narration = notes[0] ? { kind: "say" as const, text: notes[0].text } : null;
  const prev = useMemo(() => (trace && run ? previousDesign(trace.runs, run) : undefined), [trace, run]);
  const stageList = useMemo(() => (trace ? stages(trace.runs) : []), [trace]);
  const stage = run ? stageOf(run.design.name) : NaN;
  const journey = selected === null ? undefined : run?.journeys.find((j) => j.id === selected);

  const commitKnob = useCallback(
    (name: string, value: number) => {
      if (!run) return;
      const mine = override?.run === runIndex ? override : null;
      setOverride({ run: runIndex, knobs: { ...mine?.knobs, [name]: value }, faults: mine?.faults });
      setJump({ run: runIndex, frame: k });
    },
    [run, override, runIndex, k],
  );
  const addFaults = useCallback(
    (fs: TrafficFault[]) => {
      const mine = override?.run === runIndex ? override : null;
      setOverride({ run: runIndex, knobs: mine?.knobs, faults: [...(mine?.faults ?? []), ...fs] });
      setJump({ run: runIndex, frame: k });
    },
    [override, runIndex, k],
  );
  const addFault = useCallback((f: TrafficFault) => addFaults([f]), [addFaults]);
  const resetFaults = useCallback(() => {
    const mine = override?.run === runIndex ? override : null;
    setOverride(mine?.knobs ? { run: runIndex, knobs: mine.knobs } : null);
    setJump({ run: runIndex, frame: k });
  }, [override, runIndex, k]);
  // Running cost over the last second of simulated time.
  const money = useMemo(() => (run && frame ? summary(run, frame.t / 1000 - 1, frame.t / 1000) : null), [run, frame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      // A focused knob slider uses the arrow keys itself.
      if ((e.target as HTMLElement).closest?.('[role="slider"]')) return;
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

  const pickRun = (i: number) => {
    setRunIndex(i);
    setSelected(null);
  };
  const diff = useMemo(() => (run ? designDiff(prev, run.design) : {}), [prev, run]);
  const boxComp = run?.design.components.find((c) => c.id === box);
  /** A typical request that finished in the last two seconds: the one closest to the median time. */
  const traceOne = () => {
    if (!run || !frame) return;
    const done = run.journeys.filter((j: Journey) => j.end >= 0 && j.end <= frame.t && j.end > frame.t - 2000);
    const pool = done.filter((j) => j.outcome === "ok").length ? done.filter((j) => j.outcome === "ok") : done;
    if (!pool.length) return;
    const sorted = [...pool].sort((a, b) => a.end - a.sent - (b.end - b.sent));
    setSelected(sorted[Math.floor(sorted.length / 2)].id);
  };

  return (
    <main className="main">
      <header className="header">
        <div className="title-row">
          <Title order={1} className="title">
            <Text span inherit c="dimmed" fw={500}>
              {problem.number}
            </Text>{" "}
            {problem.title}
          </Title>
          {problem.level && <Badge color={problem.level === "Staff" ? "red" : problem.level === "Senior" ? "indigo" : "gray"}>{problem.level}</Badge>}
          {run?.label.startsWith("broken: ") && (
            <Tooltip label="This scenario pushes the design past its limit on purpose, to show why the next stage exists">
              <Badge color="red" leftSection={<IconAlertTriangle size={12} />}>
                broken on purpose
              </Badge>
            </Tooltip>
          )}
          {stageList.length > 0 && (
            <Tooltip label="Each stage fixes what broke the one before">
              <SegmentedControl
                className="stage-tabs"
                size="xs"
                value={String(stage)}
                onChange={(v) => pickRun(trace!.runs.findIndex((r) => stageOf(r.design.name) === Number(v)))}
                data={stageList.map((n) => ({ value: String(n), label: `Stage ${n}` }))}
              />
            </Tooltip>
          )}
          {trace && trace.runs.length > 0 && (
            <Select
              className="example-select"
              size="xs"
              ml="auto"
              w={360}
              maw="100%"
              allowDeselect={false}
              aria-label="Scenario"
              value={String(runIndex)}
              onChange={(v) => v !== null && pickRun(Number(v))}
              data={trace.runs.map((r, i) => ({ value: String(i), label: scenarioOptionLabel(r, i, true) }))}
              comboboxProps={{ width: "max-content", position: "bottom-end" }}
            />
          )}
        </div>
        {run && (
          <div className="approach" onClick={(e) => e.currentTarget.classList.toggle("expanded")}>
            {run.design.name}
            {money && Number.isFinite(money.costPerMillion) && (
              <span className="cost">
                {" "}
                · ${money.costPerHour.toFixed(2)} an hour · ${money.costPerMillion.toFixed(2)} per million requests served
              </span>
            )}
          </div>
        )}
      </header>

      <section className="stage">
        <div className="left">
          {problem.lesson && (
            <Tabs value={tab} onChange={(v) => v && setTab(v as "learn" | "code")} className="left-tabs">
              <Tabs.List px="xs">
                <Tabs.Tab value="learn">Learn</Tabs.Tab>
                <Tabs.Tab value="code">Code</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          )}
          {tab === "learn" && problem.lesson ? (
            <LessonView lesson={lesson} onPlay={onPlay} ready={Boolean(trace)} />
          ) : (
            <CodePanel problem={problem} activeLine={null} callerLines={NO_LINES} explain={false} />
          )}
        </div>
        {!trace && state.status === "loading" && (
          <Center p="xl">
            <Group gap="sm">
              <Loader size="sm" />
              <Text c="dimmed">Simulating…</Text>
            </Group>
          </Center>
        )}
        {state.status === "error" && (
          <Alert m="md" color="red" variant="light" title="The simulation failed" className="traffic-error">
            {state.message}
          </Alert>
        )}
        {trace && !run && (
          <Alert m="md" color="red" variant="light" className="traffic-error">
            {trace.error ?? "No run() calls were recorded."}
          </Alert>
        )}
        {run && frame && (
          <div className="traffic-stage">
            {(trace?.error || run.error || run.truncated || run.scale > 1) && (
              <Alert className="traffic-notice" color="yellow" variant="light" p="xs" radius="md" icon={<IconAlertTriangle size={16} />}>
                {trace?.error && <div>The file stopped early: {trace.error}</div>}
                {run.error && <div>{run.error}</div>}
                {run.truncated && <div>The run hit the event limit and stops early.</div>}
                {run.scale > 1 && (
                  <div>
                    At this traffic each simulated request stands for {run.scale} real ones.
                    {run.approximate.length > 0 && ` ${run.approximate.join(", ")} cannot be split that finely, so its numbers are approximate.`}
                  </div>
                )}
              </Alert>
            )}
            <KnobBar
              knobs={run.design.knobs}
              values={run.knobs}
              changed={Boolean(active?.knobs)}
              busy={state.status === "loading"}
              onCommit={commitKnob}
              onReset={() => {
                setOverride(active?.faults ? { run: runIndex, faults: active.faults } : null);
                setJump({ run: runIndex, frame: k });
              }}
            />
            <TrafficChaos design={run.design} t={frame.t} faults={active?.faults ?? []} onAdd={addFault} onReset={resetFaults} />
            <Group className="arch-help" gap={8}>
              <Text size="sm" c="dimmed">
                Click any box to see what it does and what its numbers mean. Click a moving dot, or
              </Text>
              <Button size="compact-sm" variant="light" leftSection={<IconRoute size={14} />} onClick={traceOne}>
                Trace a request
              </Button>
              <Text size="sm" c="dimmed">
                to see where its time went.
              </Text>
            </Group>
            <div className="arch">
              <ArchCanvas run={run} frame={frame} prev={prev} notes={notes} selected={selected} onSelect={setSelected} box={box} onBox={(id) => setBox(box === id ? null : id)} />
            </div>
            {boxComp && (
              <BoxInspector
                comp={boxComp}
                design={run.design}
                frame={frame}
                notes={notes.filter((n) => n.at === boxComp.id)}
                diff={diff[boxComp.id]}
                before={prev?.components.find((c) => c.id === boxComp.id)}
                onTurnOff={
                  boxComp.type === "station" && boxComp.role !== "cdn"
                    ? () => addFaults(replicaNames(boxComp).map((target) => ({ at: Math.max(100, Math.round(frame.t / 100) * 100), kind: "kill" as const, target })))
                    : undefined
                }
                onClose={() => setBox(null)}
              />
            )}
            {notes.length > 0 && (
              <div className="arch-notes">
                {notes.map((n) => (
                  <Tooltip key={`${n.at}-${n.rule}`} label="Show this box's details">
                    <div>
                      <NoteCard note={n} title={run.design.components.find((c) => c.id === n.at)?.label ?? n.at} onClick={() => setBox(n.at)} />
                    </div>
                  </Tooltip>
                ))}
              </div>
            )}
            {journey && <Waterfall journey={journey} design={run.design} onClose={() => setSelected(null)} />}
            <MetricsStrip run={run} index={k} />
          </div>
        )}
      </section>

      <div className="dock">
        <NarrationBar narration={narration} hasNotes={false} />
        <Controls
          player={player}
          counter={`t = ${((k + 1) / 10).toFixed(1)} s / ${run?.seconds ?? 0} s`}
          marks={run?.faults.map((f) => ({ index: Math.max(0, Math.round(f.at / FRAME_MS) - 1), label: `${faultLabel(f)} at ${f.at / 1000} s` }))}
        />
      </div>
    </main>
  );
}
