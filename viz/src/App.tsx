import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { CodePanel } from "./components/CodePanel.tsx";
import { Controls } from "./components/Controls.tsx";
import { IntuitionPanel } from "./components/IntuitionPanel.tsx";
import { LessonView } from "./components/LessonView.tsx";
import { NarrationBar } from "./components/NarrationBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Visual } from "./components/Visual.tsx";
import { SimProblemView } from "./sim/SimProblemView.tsx";
import { TrafficProblemView } from "./traffic/TrafficProblemView.tsx";
import { DrillView } from "./drills/DrillView.tsx";
import { OverviewView } from "./components/OverviewView.tsx";
import { overviewId, overviewTab } from "./sidebarTabs.ts";
import { findRun, markLocate, parseLesson, scenarioOptionLabel, type PlayLink } from "./sim/lesson.ts";
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

const isPage = (id: string) => problems.some((p) => p.id === id) || overviewTab(id) !== null;

function idFromHash(): string | null {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  return isPage(id) ? id : null;
}

const LAST_KEY = "viz:last-page";
/** The page open last time, so a return visit picks up where it left off. */
function lastPage(): string | null {
  try {
    const id = localStorage.getItem(LAST_KEY);
    return id && isPage(id) ? id : null;
  } catch {
    return null;
  }
}

function useProblemId(): [string, (id: string) => void] {
  // A link wins, then the last page; a first visit opens the Algorithms overview.
  const [id, setId] = useState(() => idFromHash() ?? lastPage() ?? overviewId("algorithms"));
  useEffect(() => {
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      // Storage blocked: every visit opens the overview.
    }
  }, [id]);
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
  const problem = problems.find((p) => p.id === problemId);
  const overview = overviewTab(problemId);
  // Phones and portrait tablets show the sidebar as a drawer behind a menu button.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const select = useCallback(
    (id: string) => {
      selectProblem(id);
      setNavOpen(false);
    },
    [selectProblem],
  );
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [navOpen]);
  return (
    <div className="app">
      <div className="topbar">
        <button className="menu-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="brand">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          Offerlab
        </div>
      </div>
      <Sidebar activeId={problemId} onSelect={select} open={navOpen} onClose={closeNav} />
      {navOpen && <div className="scrim" onClick={closeNav} />}
      {overview || !problem ? (
        <OverviewView key={problemId} tab={overview ?? "algorithms"} onSelect={selectProblem} />
      ) : problem.engine === "kernel" ? (
        <SimProblemView key={problem.id} problem={problem} />
      ) : problem.engine === "traffic" ? (
        <TrafficProblemView key={problem.id} problem={problem} />
      ) : problem.engine === "drill" ? (
        <DrillView key={problem.id} problem={problem} onSelect={selectProblem} />
      ) : (
        <ProblemView key={problem.id} problem={problem} onSelect={selectProblem} />
      )}
    </div>
  );
}

type LeftTab = "learn" | "code" | "intuition";
const TAB_KEY = "viz:left-tab";
function initialTab(): LeftTab {
  try {
    return localStorage.getItem(TAB_KEY) === "intuition" ? "intuition" : "code";
  } catch {
    return "code";
  }
}

const EXPLAIN_KEY = "viz:explain";
function initialExplain(): boolean {
  try {
    return localStorage.getItem(EXPLAIN_KEY) === "1";
  } catch {
    return false;
  }
}

function ProblemView({ problem, onSelect }: { problem: Problem; onSelect: (id: string) => void }) {
  // Systems primitives open on their lesson; algorithms remember the last tab used.
  const systems = problem.track === "systems";
  const [tab, setTabState] = useState<LeftTab>(() => (systems ? (problem.lesson ? "learn" : "code") : initialTab()));
  const setTab = useCallback((t: LeftTab) => {
    setTabState(t);
    if (systems) return;
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // Remembering the tab is a convenience only.
    }
  }, [systems]);
  const [explain, setExplainState] = useState(initialExplain);
  const setExplain = useCallback((on: boolean) => {
    setExplainState(on);
    try {
      localStorage.setItem(EXPLAIN_KEY, on ? "1" : "0");
    } catch {
      // Remembering the toggle is a convenience only.
    }
  }, []);
  const hasNotes = Object.keys(problem.why).length > 0;
  const traceOptions = useMemo(() => ({ scenarios: problem.track === "systems" }), [problem.track]);
  const state = useTrace(problem.id, problem.source, traceOptions);
  const [runIndex, setRunIndex] = useState(0);
  const trace = state.status === "ready" ? state.trace : null;
  const run: Run | undefined = trace?.runs[runIndex];
  const steps = run?.steps ?? EMPTY_STEPS;

  const lesson = useMemo(() => parseLesson(problem.lesson), [problem.lesson]);
  const locate = useMemo(() => markLocate(problem.hints.marks), [problem.hints]);
  // A play link picks a scenario and a marked line; the jump happens once that scenario is showing.
  const [jump, setJump] = useState<{ run: number; link: PlayLink } | null>(null);
  const onPlay = useCallback(
    (link: PlayLink) => {
      const r = trace ? findRun(trace.runs, link.scenario) : -1;
      if (r < 0) return;
      setRunIndex(r);
      setJump({ run: r, link });
    },
    [trace],
  );

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

  // Each play-link click is a new object, so a ref remembers which one has been carried out.
  const done = useRef<typeof jump>(null);
  useLayoutEffect(() => {
    if (!jump || done.current === jump || jump.run !== runIndex || !run) return;
    done.current = jump;
    const at = locate(run, jump.link);
    player.pause();
    player.setIndex(typeof at === "number" ? Math.max(0, at) : 0);
  }, [jump, runIndex, run, player, locate]);

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
      else if (e.key === "i" && !systems) setTab(tab === "code" ? "intuition" : "code");
      else if (e.key === "e" && hasNotes) {
        setTab("code");
        setExplain(tab === "code" ? !explain : true);
      } else return;
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [player, tab, setTab, explain, setExplain, hasNotes, systems]);

  return (
    <main className="main">
      <header className="header">
        <div className="title-row">
          <h1 className="title">
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>{problem.number}</span> {problem.title}
          </h1>
          {problem.difficulty && <span className={`badge ${problem.difficulty}`}>{problem.difficulty}</span>}
          {systems && problem.level && <span className={`badge ${problem.level}`}>{problem.level}</span>}
          {run?.label.startsWith("broken: ") && (
            <span className="badge broken" title="This scenario runs a deliberately flawed version to show why the real one needs each part">
              broken on purpose
            </span>
          )}
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
                  {scenarioOptionLabel(r, i, systems)}
                </option>
              ))}
            </select>
          )}
        </div>
        {(problem.approach || problem.approachName) && (
          <div className="approach" onClick={(e) => e.currentTarget.classList.toggle("expanded")}>
            <b>{problem.approachName || "Approach"}.</b> {problem.approach} <span className="complexity">· {problem.complexity}</span>
          </div>
        )}
      </header>

      <section className="stage">
        <div className="left">
          <div className="tabs" role="tablist">
            {systems && problem.lesson && (
              <button role="tab" className={`tab ${tab === "learn" ? "on" : ""}`} onClick={() => setTab("learn")}>
                Learn
              </button>
            )}
            <button role="tab" className={`tab ${tab === "code" ? "on" : ""}`} onClick={() => setTab("code")}>
              Code
            </button>
            {!systems && (
              <button
                role="tab"
                className={`tab ${tab === "intuition" ? "on" : ""}`}
                onClick={() => setTab("intuition")}
                title="Pattern, related problems and real-world uses (press i)"
              >
                Intuition<kbd>i</kbd>
              </button>
            )}
            {tab === "code" && hasNotes && (
              <label
                className={`explain-toggle ${explain ? "on" : ""}`}
                title="Show a plain-English note under every line (press e). Otherwise hover or click a line's dot."
              >
                <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} />
                Explain lines<kbd>e</kbd>
              </label>
            )}
          </div>
          {tab === "learn" && systems && problem.lesson ? (
            <LessonView lesson={lesson} onPlay={onPlay} ready={Boolean(trace)} />
          ) : tab === "code" || systems ? (
            <CodePanel
              problem={problem}
              activeLine={step?.line ?? null}
              callerLines={callerLines[k] ?? []}
              explain={explain}
            />
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
          <div className="visual-col">
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

      <div className="dock">
        <NarrationBar narration={narration} why={step ? problem.why[step.line] : undefined} hasNotes={hasNotes} />
        <Controls player={player} />
      </div>
    </main>
  );
}
