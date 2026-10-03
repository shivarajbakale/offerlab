// Plays an architecture: the canvas, charts, knobs and timeline for one scenario at a time.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { callouts, summary, type TrafficFault, type TrafficTrace } from "../../../system-design/traffic/index.ts";
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
import { FRAME_MS, faultLabel, journeyLines, previousDesign, stageOf, stages } from "./model.ts";
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
  const addFault = useCallback(
    (f: TrafficFault) => {
      const mine = override?.run === runIndex ? override : null;
      setOverride({ run: runIndex, knobs: mine?.knobs, faults: [...(mine?.faults ?? []), f] });
      setJump({ run: runIndex, frame: k });
    },
    [override, runIndex, k],
  );
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

  return (
    <main className="main">
      <header className="header">
        <div className="title-row">
          <h1 className="title">
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>{problem.number}</span> {problem.title}
          </h1>
          {problem.level && <span className={`badge ${problem.level}`}>{problem.level}</span>}
          {run?.label.startsWith("broken: ") && (
            <span className="badge broken" title="This scenario pushes the design past its limit on purpose, to show why the next stage exists">
              broken on purpose
            </span>
          )}
          {stageList.length > 0 && (
            <div className="stage-tabs" role="tablist" title="Each stage fixes what broke the one before">
              {stageList.map((n) => (
                <button
                  key={n}
                  role="tab"
                  className={n === stage ? "on" : ""}
                  onClick={() => pickRun(trace!.runs.findIndex((r) => stageOf(r.design.name) === n))}
                >
                  Stage {n}
                </button>
              ))}
            </div>
          )}
          {trace && trace.runs.length > 0 && (
            <select className="example-select" value={runIndex} onChange={(e) => pickRun(Number(e.target.value))} title="Each scenario comes from the file's tests">
              {trace.runs.map((r, i) => (
                <option key={i} value={i}>
                  {scenarioOptionLabel(r, i, true)}
                </option>
              ))}
            </select>
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
            <CodePanel problem={problem} activeLine={null} callerLines={NO_LINES} explain={false} />
          )}
        </div>
        {!trace && state.status === "loading" && <div className="status">Simulating…</div>}
        {state.status === "error" && <div className="status error">{state.message}</div>}
        {trace && !run && <div className="status error">{trace.error ?? "No run() calls were recorded."}</div>}
        {run && frame && (
          <div className="traffic-stage">
            {(trace?.error || run.error || run.truncated || run.scale > 1) && (
              <div className="notice" style={{ padding: "8px 20px 0" }}>
                {trace?.error && <div>⚠ The file stopped early: {trace.error}</div>}
                {run.error && <div>⚠ {run.error}</div>}
                {run.truncated && <div>The run hit the event limit and stops early.</div>}
                {run.scale > 1 && (
                  <div>
                    At this traffic each simulated request stands for {run.scale} real ones.
                    {run.approximate.length > 0 && ` ${run.approximate.join(", ")} cannot be split that finely, so its numbers are approximate.`}
                  </div>
                )}
              </div>
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
            <div className="arch">
              <ArchCanvas run={run} frame={frame} prev={prev} notes={notes} selected={selected} onSelect={setSelected} />
            </div>
            {notes.length > 0 && (
              <div className="arch-notes">
                {notes.map((n) => (
                  <div key={`${n.at}-${n.rule}`} className={`arch-note sev${n.severity}`}>
                    <b>{run.design.components.find((c) => c.id === n.at)?.label ?? n.at}:</b> {n.text}
                  </div>
                ))}
              </div>
            )}
            {journey && (
              <div className="journey">
                {journeyLines(journey).map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
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
