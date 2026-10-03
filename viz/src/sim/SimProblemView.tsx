// Plays a kernel primitive: the cluster picture, the message log, and the handler that ran.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Fault, SimStep } from "../../../system-design/kernel/types.ts";
import { ChaosBar } from "../components/ChaosBar.tsx";
import { chaosVerdict } from "./chaos.ts";
import { CodePanel } from "../components/CodePanel.tsx";
import { LessonView } from "../components/LessonView.tsx";
import { Controls } from "../components/Controls.tsx";
import { NarrationBar } from "../components/NarrationBar.tsx";
import { ClusterView } from "../components/views/ClusterView.tsx";
import { MessageLog } from "../components/views/MessageLog.tsx";
import type { Problem } from "../parseProblem.ts";
import { usePlayer } from "../player/usePlayer.ts";
import { handlerRange } from "./handlers.ts";
import { findRun, parseLesson, scenarioOptionLabel, stepAt, type PlayLink } from "./lesson.ts";
import { narrateSim } from "./narrate.ts";
import { useSimTrace } from "./useSimTrace.ts";

const EMPTY_STEPS: SimStep[] = [];
const NO_LINES: number[] = [];
const NO_FAULTS: Fault[] = [];

export function SimProblemView({ problem }: { problem: Problem }) {
  const [runIndex, setRunIndex] = useState(0);
  // Faults injected with the chaos bar belong to one scenario; switching scenarios plays it clean.
  const [chaos, setChaos] = useState<{ run: number; faults: Fault[] }>({ run: -1, faults: [] });
  const injected = chaos.run === runIndex ? chaos.faults : NO_FAULTS;
  const chaosArg = useMemo(() => (injected.length ? { run: runIndex, faults: injected } : undefined), [runIndex, injected]);
  const state = useSimTrace(problem.id, problem.source, chaosArg);
  const trace = state.status === "ready" ? state.trace : null;
  const run = trace?.runs[runIndex];
  const lesson = useMemo(() => parseLesson(problem.lesson), [problem.lesson]);
  const [tab, setTab] = useState<"learn" | "code">(problem.lesson ? "learn" : "code");
  // A play link picks a scenario and a moment; the jump happens once that scenario's steps are loaded.
  const [jump, setJump] = useState<{ run: number; t?: number } | null>(null);
  const onPlay = useCallback(
    (link: PlayLink) => {
      const r = trace ? findRun(trace.runs, link.scenario) : -1;
      if (r < 0) return;
      // A lesson link describes the scenario as written, so it always plays without injected faults.
      setChaos({ run: -1, faults: [] });
      setRunIndex(r);
      setJump({ run: r, t: link.t });
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
  const narration = useMemo(() => (steps[k] ? narrateSim(steps, k) : null), [steps, k]);
  const activeLine = step?.handler ? (handlerRange(problem.lines, step.handler, step.className)?.start ?? null) : null;

  // Each play-link click is a new object, so a ref remembers which one has been carried out.
  const done = useRef<typeof jump>(null);
  useLayoutEffect(() => {
    if (!jump || done.current === jump || jump.run !== runIndex || !run) return;
    done.current = jump;
    player.pause();
    player.setIndex(Math.max(0, stepAt(run, jump.t)));
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
        <div className="title-row">
          <h1 className="title">
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>{problem.number}</span> {problem.title}
          </h1>
          {problem.level && <span className={`badge ${problem.level}`}>{problem.level}</span>}
          {run?.label.startsWith("broken: ") && (
            <span className="badge broken" title="This scenario runs a deliberately flawed version to show why the real one needs each part">
              broken on purpose
            </span>
          )}
          {trace && trace.runs.length > 0 && (
            <select
              className="example-select"
              value={runIndex}
              onChange={(e) => setRunIndex(Number(e.target.value))}
              title="Each scenario comes from the file's tests"
            >
              {trace.runs.map((r, i) => (
                <option key={i} value={i}>
                  {scenarioOptionLabel(r, i, true)}
                </option>
              ))}
            </select>
          )}
        </div>
        {(problem.approach || problem.approachName) && (
          <div className="approach">
            <b>{problem.approachName || "Approach"}.</b> {problem.approach}{" "}
            <span className="complexity">· {problem.complexity}</span>
          </div>
        )}
      </header>

      <section className="stage">
        <div className="left">
          {problem.lesson && (
            <div className="tabs" role="tablist">
              <button role="tab" className={`tab ${tab === "learn" ? "on" : ""}`} onClick={() => setTab("learn")}>
                Learn
              </button>
              <button role="tab" className={`tab ${tab === "code" ? "on" : ""}`} onClick={() => setTab("code")}>
                Code
              </button>
            </div>
          )}
          {tab === "learn" && problem.lesson ? (
            <LessonView lesson={lesson} onPlay={onPlay} ready={Boolean(trace)} />
          ) : (
            <CodePanel problem={problem} activeLine={activeLine} callerLines={NO_LINES} explain={false} />
          )}
        </div>
        {state.status === "loading" && <div className="status">Simulating…</div>}
        {state.status === "error" && (
          <div className="status error">
            {state.message}
            {injected.length > 0 && (
              <>
                {" "}
                <button className="chaos-reset" onClick={resetChaos}>
                  Reset chaos
                </button>
              </>
            )}
          </div>
        )}
        {trace && !run && <div className="status error">{trace.error ?? "No simulate() calls were recorded."}</div>}
        {run && (
          <div className="sim-stage">
            {(trace?.error || run.error || run.truncated || injected.length > 0) && (
              <div className="notice" style={{ padding: "8px 20px 0" }}>
                {trace?.error && <div>⚠ The file stopped early: {trace.error}</div>}
                {run.error && <div>⚠ {run.error}</div>}
                {run.truncated && <div>Showing the first {steps.length} events of a long run.</div>}
                {injected.length > 0 && (
                  <div>
                    ⚡ Chaos replay. {chaosVerdict(steps).text} (The ✓/✗ in the scenario list checks this scenario&apos;s exact
                    story, which your faults are free to change.)
                  </div>
                )}
              </div>
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

      <NarrationBar narration={narration} hasNotes={false} />
      <Controls player={player} />
    </main>
  );
}
