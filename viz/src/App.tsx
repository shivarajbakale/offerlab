import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { CodePanel } from "./components/CodePanel.tsx";
import { Controls } from "./components/Controls.tsx";
import { IntuitionPanel } from "./components/IntuitionPanel.tsx";
import { NarrationBar } from "./components/NarrationBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Visual } from "./components/Visual.tsx";
import { buildCallTree } from "./model/callTree.ts";
import { narrate, type Narration } from "./model/narrate.ts";
import { buildScene } from "./model/scene.ts";
import { usePlayer } from "./player/usePlayer.ts";
import { useTrace } from "./player/useTrace.ts";
import { problems, type Problem } from "./problems.ts";
import type { Run, Step } from "./tracer/types.ts";

const EMPTY_STEPS: Step[] = [];
/** Narrations are computed lazily per step and cached per run. */
const narrationCache = new WeakMap<Step[], Map<number, Narration>>();

function idFromHash(): string | null {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  return problems.some((p) => p.id === id) ? id : null;
}

function useProblemId(): [string, (id: string) => void] {
  const [id, setId] = useState(() => idFromHash() ?? problems.find((p) => p.id.includes("016"))?.id ?? problems[0].id);
  useEffect(() => {
    const onHash = () => {
      const next = idFromHash();
      if (next) setId(next);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const select = useCallback((next: string) => {
    location.hash = `/${next}`;
    setId(next);
  }, []);
  return [id, select];
}

export default function App() {
  const [problemId, selectProblem] = useProblemId();
  const problem = problems.find((p) => p.id === problemId)!;
  return (
    <div className="app">
      <Sidebar activeId={problemId} onSelect={selectProblem} />
      <ProblemView key={problem.id} problem={problem} onSelect={selectProblem} />
    </div>
  );
}

type LeftTab = "code" | "intuition";
const TAB_KEY = "viz:left-tab";
function initialTab(): LeftTab {
  try {
    return localStorage.getItem(TAB_KEY) === "intuition" ? "intuition" : "code";
  } catch {
    return "code";
  }
}

function ProblemView({ problem, onSelect }: { problem: Problem; onSelect: (id: string) => void }) {
  const [tab, setTabState] = useState<LeftTab>(initialTab);
  const setTab = useCallback((t: LeftTab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // Remembering the tab is a convenience only.
    }
  }, []);
  const state = useTrace(problem.id, problem.source);
  const [runIndex, setRunIndex] = useState(0);
  const trace = state.status === "ready" ? state.trace : null;
  const run: Run | undefined = trace?.runs[runIndex];
  const steps = run?.steps ?? EMPTY_STEPS;

  const callTree = useMemo(() => buildCallTree(steps), [steps]);
  // Line each outer frame is paused on (its call site), per step.
  const callerLines = useMemo(() => {
    const last: number[] = [];
    return steps.map((s) => {
      const depth = s.stack.length;
      const callers = last.slice(0, depth - 1);
      last[depth - 1] = s.line;
      last.length = depth;
      return callers;
    });
  }, [steps]);

  const narrationAt = useCallback(
    (k: number) => {
      let cache = narrationCache.get(steps);
      if (!cache) narrationCache.set(steps, (cache = new Map()));
      let n = cache.get(k);
      if (!n && steps[k]) {
        n = narrate(steps, k, problem.lines, problem.hints);
        cache.set(k, n);
      }
      return n ?? null;
    },
    [steps, problem],
  );
  const dwell = useCallback(
    (k: number) => {
      const n = narrationAt(k);
      if (!n) return 1;
      if (n.kind === "say") return 1.6;
      if (n.kind === "code") return 0.6;
      return 1;
    },
    [narrationAt],
  );

  const player = usePlayer(steps.length, `${problem.id}:${runIndex}:${steps.length}`, dwell);
  const k = player.index;
  const step = steps[k];
  const after = steps[k + 1] ?? step;
  const scene = useMemo(() => (after ? buildScene(after, step, problem.hints) : null), [after, step, problem.hints]);
  const narration = step ? narrationAt(k) : null;

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
      else if (e.key === "i") setTab(tab === "code" ? "intuition" : "code");
      else return;
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [player, tab, setTab]);

  return (
    <main className="main">
      <header className="header">
        <div className="title-row">
          <h1 className="title">
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>{problem.number}</span> {problem.title}
          </h1>
          {problem.difficulty && <span className={`badge ${problem.difficulty}`}>{problem.difficulty}</span>}
          {problem.leetcode && (
            <a href={problem.leetcode} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              LeetCode ↗
            </a>
          )}
          {trace && trace.runs.length > 0 && (
            <select
              className="example-select"
              value={runIndex}
              onChange={(e) => setRunIndex(Number(e.target.value))}
              title="Each example comes from the file's test cases"
            >
              {trace.runs.map((r, i) => (
                <option key={i} value={i}>
                  {r.passed === false ? "✗" : r.passed ? "✓" : "·"} Example {i + 1}: {r.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {(problem.approach || problem.approachName) && (
          <div className="approach">
            <b>{problem.approachName || "Approach"}.</b> {problem.approach} <span className="complexity">· {problem.complexity}</span>
          </div>
        )}
      </header>

      <section className="stage">
        <div className="left">
          <div className="tabs" role="tablist">
            <button role="tab" className={`tab ${tab === "code" ? "on" : ""}`} onClick={() => setTab("code")}>
              Code
            </button>
            <button
              role="tab"
              className={`tab ${tab === "intuition" ? "on" : ""}`}
              onClick={() => setTab("intuition")}
              title="Pattern, related problems and real-world uses (press i)"
            >
              Intuition<kbd>i</kbd>
            </button>
          </div>
          {tab === "code" ? (
            <CodePanel problem={problem} activeLine={step?.line ?? null} callerLines={callerLines[k] ?? []} />
          ) : (
            <IntuitionPanel problem={problem} onSelect={onSelect} />
          )}
        </div>
        {state.status === "loading" && <div className="status">Tracing…</div>}
        {state.status === "error" && <div className="status error">{state.message}</div>}
        {trace && !run && (
          <div className="status error">{trace.error ?? "No calls to the solution were recorded."}</div>
        )}
        {run && scene && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
            {(run.truncated || run.error) && (
              <div className="notice" style={{ padding: "8px 20px 0" }}>
                {run.error && <div>⚠ {run.error}</div>}
                {run.truncated && <div>Showing the first {steps.length} steps of a long run.</div>}
              </div>
            )}
            <Visual scene={scene} callTree={callTree} index={k} />
          </div>
        )}
      </section>

      <NarrationBar narration={narration} />
      <Controls player={player} />
    </main>
  );
}
