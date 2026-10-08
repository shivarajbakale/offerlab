// Plays a kernel primitive: the cluster picture, the message log, and the handler that ran.

import { Alert, Badge, Button, Group, Loader, Select, Tabs, Text, Title, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconBolt } from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Fault, SimStep } from "../../../system-design/kernel/types.ts";
import { ChaosBar } from "../components/ChaosBar.tsx";
import { chaosVerdict } from "./chaos.ts";
import { CodePanel } from "../components/CodePanel.tsx";
import { LessonView } from "../components/LessonView.tsx";
import { Controls } from "../components/Controls.tsx";
import { ClusterView } from "../components/views/ClusterView.tsx";
import { MessageLog } from "../components/views/MessageLog.tsx";
import type { Problem } from "../parseProblem.ts";
import { usePlayer } from "../player/usePlayer.ts";
import { handlerRange } from "./handlers.ts";
import { findRun, parseLesson, landingStep, scenarioOptionLabel, storyChapters, testNames, type PlayLink } from "./lesson.ts";
import { simCaption } from "./narrate.ts";
import { ChapterStrip } from "../components/ChapterStrip.tsx";
import { Callout } from "../components/views/Callout.tsx";
import { useSimTrace } from "./useSimTrace.ts";
import "./sim.css";

const EMPTY_STEPS: SimStep[] = [];
const NO_LINES: number[] = [];
const NO_FAULTS: Fault[] = [];
const LEVEL_COLOR: Record<string, string> = { Senior: "indigo", Staff: "red" };

export function SimProblemView({ problem }: { problem: Problem }) {
  const [pickedRun, setRunIndex] = useState<number | null>(null);
  const lesson = useMemo(() => parseLesson(problem.lesson), [problem.lesson]);
  // Scenarios play as a story; until one is picked, start at chapter 1. Each test is one scenario,
  // in file order, so the chapters can be worked out before the simulation has run.
  const chapters = useMemo(
    () => storyChapters(testNames(problem.source).map((label) => ({ label })), lesson),
    [problem.source, lesson],
  );
  const runIndex = pickedRun ?? chapters[0]?.run ?? 0;
  // Faults injected with the chaos bar belong to one scenario; switching scenarios plays it clean.
  const [chaos, setChaos] = useState<{ run: number; faults: Fault[] }>({ run: -1, faults: [] });
  const injected = chaos.run === runIndex ? chaos.faults : NO_FAULTS;
  const chaosArg = useMemo(() => (injected.length ? { run: runIndex, faults: injected } : undefined), [runIndex, injected]);
  const state = useSimTrace(problem.id, problem.source, chaosArg);
  const trace = state.status === "ready" ? state.trace : null;
  const run = trace?.runs[runIndex];
  const [tab, setTab] = useState<"learn" | "code">(problem.lesson ? "learn" : "code");
  // A play link picks a scenario and a moment; the jump happens once that scenario's steps are loaded.
  const [jump, setJump] = useState<{ run: number; t?: number; about?: string } | null>(null);
  const onPlay = useCallback(
    (link: PlayLink) => {
      const r = trace ? findRun(trace.runs, link.scenario) : -1;
      if (r < 0) return;
      // A lesson link describes the scenario as written, so it always plays without injected faults.
      setChaos({ run: -1, faults: [] });
      setRunIndex(r);
      setJump({ run: r, t: link.t, about: link.text });
    },
    [trace],
  );
  const steps = run?.steps ?? EMPTY_STEPS;
  const hasClient = useMemo(
    () => steps.some((s) => s.node === "client" || s.inFlight.some((m) => m.from === "client" || m.to === "client")),
    [steps],
  );
  const dwell = useCallback((i: number) => (steps[i]?.note || steps[i]?.violation ? 1.6 : 1), [steps]);

  const player = usePlayer(steps.length, `${problem.id}:${runIndex}:${steps.length}`, dwell);
  const k = player.index;
  const step = steps[k];
  const caption = useMemo(() => simCaption(steps, k), [steps, k]);
  const activeLine = step?.handler ? (handlerRange(problem.lines, step.handler, step.className)?.start ?? null) : null;

  // Each play-link click is a new object, so a ref remembers which one has been carried out.
  const done = useRef<typeof jump>(null);
  useLayoutEffect(() => {
    if (!jump || done.current === jump || jump.run !== runIndex || !run) return;
    done.current = jump;
    player.pause();
    player.setIndex(Math.max(0, landingStep(run, jump.t, jump.about)));
  }, [jump, runIndex, run, player]);

  const addFault = useCallback(
    (f: Fault) => {
      setChaos({ run: runIndex, faults: [...injected, f] });
      setJump({ run: runIndex, t: f.at });
    },
    [runIndex, injected],
  );
  const resetChaos = useCallback(() => {
    setChaos({ run: -1, faults: [] });
    setJump({ run: runIndex, t: step?.t });
  }, [runIndex, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
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
    <main className="main">
      <header className="header">
        <Group className="title-row" gap="sm" wrap="wrap">
          <Title order={1} className="title">
            <Text span c="dimmed" fw={500} inherit>
              {problem.number}
            </Text>{" "}
            {problem.title}
          </Title>
          {problem.level && <Badge color={LEVEL_COLOR[problem.level] ?? "gray"}>{problem.level}</Badge>}
          {run?.label.startsWith("broken: ") && (
            <Tooltip label="This scenario runs a deliberately flawed version to show why the real one needs each part">
              <Badge color="red" variant="outline">
                broken on purpose
              </Badge>
            </Tooltip>
          )}
          {trace && trace.runs.length > 0 && (
            <Tooltip label="Each scenario comes from the file's tests">
              <Select
                className="example-select"
                size="xs"
                allowDeselect={false}
                comboboxProps={{ width: "max-content", position: "bottom-end" }}
                value={String(runIndex)}
                onChange={(v) => v !== null && setRunIndex(Number(v))}
                data={trace.runs.map((r, i) => ({ value: String(i), label: scenarioOptionLabel(r, i, true) }))}
                aria-label="Scenario"
              />
            </Tooltip>
          )}
        </Group>
        {(problem.approach || problem.approachName) && (
          <div className="approach" onClick={(e) => e.currentTarget.classList.toggle("expanded")}>
            <b>{problem.approachName || "Approach"}.</b> {problem.approach}{" "}
            <span className="complexity">· {problem.complexity}</span>
          </div>
        )}
      </header>

      <section className="stage">
        <div className="left">
          {problem.lesson && (
            <Group className="tabs" gap={0} wrap="nowrap">
              <Tabs value={tab} onChange={(v) => v && setTab(v as "learn" | "code")}>
                <Tabs.List>
                  <Tabs.Tab value="learn">Learn</Tabs.Tab>
                  <Tabs.Tab value="code">Code</Tabs.Tab>
                </Tabs.List>
              </Tabs>
            </Group>
          )}
          {tab === "learn" && problem.lesson ? (
            <LessonView lesson={lesson} onPlay={onPlay} ready={Boolean(trace)} />
          ) : (
            <CodePanel problem={problem} activeLine={activeLine} callerLines={NO_LINES} explain={false} />
          )}
        </div>
        {state.status === "loading" && (
          <Group className="status" gap="sm">
            <Loader size="sm" /> Simulating…
          </Group>
        )}
        {state.status === "error" && (
          <Alert className="status" color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="The simulation failed">
            <pre className="status-pre">{state.message}</pre>
            {injected.length > 0 && (
              <Button size="compact-sm" variant="default" mt="xs" onClick={resetChaos}>
                Reset chaos
              </Button>
            )}
          </Alert>
        )}
        {trace && !run && (
          <Alert className="status" color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
            {trace.error ?? "No simulate() calls were recorded."}
          </Alert>
        )}
        {run && (
          <div className="sim-stage">
            {(trace?.error || run.error || run.truncated) && (
              <Alert className="sim-alert" color="orange" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
                {trace?.error && <div>The file stopped early: {trace.error}</div>}
                {run.error && <div>{run.error}</div>}
                {run.truncated && <div>Showing the first {steps.length} events of a long run.</div>}
              </Alert>
            )}
            {injected.length > 0 && (
              <Alert className="sim-alert" color="orange" variant="light" icon={<IconBolt size={16} />} p="xs">
                Chaos replay. {chaosVerdict(steps).text} (The ✓/✗ in the scenario list checks this scenario&apos;s exact story,
                which your faults are free to change.)
              </Alert>
            )}
            {step && (
              <ChaosBar
                ids={Object.keys(step.nodes)}
                up={Object.fromEntries(Object.entries(step.nodes).map(([id, v]) => [id, v.up]))}
                partitioned={step.partitions.length > 0}
                t={step.t}
                faults={injected}
                onAdd={addFault}
                onReset={resetChaos}
              />
            )}
            <ChapterStrip chapters={chapters} current={runIndex} onPick={setRunIndex} />
            {caption && (
              <div className="sim-caption">
                <Callout caption={caption} />
              </div>
            )}
            {step && <ClusterView key={`cluster-${runIndex}`} step={step} prev={steps[k - 1]} hasClient={hasClient} />}
            {step && (
              <MessageLog
                key={`log-${runIndex}`}
                steps={steps}
                index={k}
                onJump={(i) => {
                  player.pause();
                  player.setIndex(i);
                }}
              />
            )}
          </div>
        )}
      </section>

      <div className="dock">
        <Controls player={player} />
      </div>
    </main>
  );
}
