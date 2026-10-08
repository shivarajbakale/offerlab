import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { CodePanel } from "./components/CodePanel.tsx";
import { Controls } from "./components/Controls.tsx";
import { IntuitionPanel } from "./components/IntuitionPanel.tsx";
import { LessonView } from "./components/LessonView.tsx";
import { NarrationBar } from "./components/NarrationBar.tsx";
import { ExplainCard } from "./components/ExplainCard.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Visual, type StepLens, type StoryView } from "./components/Visual.tsx";
import { SimProblemView } from "./sim/SimProblemView.tsx";
import { TrafficProblemView } from "./traffic/TrafficProblemView.tsx";
import { DrillView } from "./drills/DrillView.tsx";
import { OverviewView } from "./components/OverviewView.tsx";
import { LandingView } from "./landing/LandingView.tsx";
import { overviewTab } from "./sidebarTabs.ts";
import { findRun, markLocate, parseLesson, scenarioOptionLabel, storyChapters, type PlayLink } from "./sim/lesson.ts";
import { ChapterStrip } from "./components/ChapterStrip.tsx";
import { buildCallTree } from "./model/callTree.ts";
import { narrate, type Narration } from "./model/narrate.ts";
import { explain as explainStep, type Explanation } from "./model/explain.ts";
import { buildScene } from "./model/scene.ts";
import { captionAt } from "./model/caption.ts";
import { lineDeps } from "./model/deps.ts";
import { buildStory, leftWindow } from "./model/story.ts";
import { usePlayer } from "./player/usePlayer.ts";
import { useTrace } from "./player/useTrace.ts";
import { problems, type Problem } from "./problems.ts";
import { isRevealed, reveal } from "./progress.ts";
import { getProgress, updateProgress, useProgress } from "./useProgress.ts";
import { QuestionPanel, SolutionHidden } from "./components/QuestionPanel.tsx";
import type { Run, Step } from "./tracer/types.ts";

const EMPTY_STEPS: Step[] = [];
/** Narrations are computed lazily per step and cached per run. */
const narrationCache = new WeakMap<Step[], Map<number, Narration>>();
const explainCache = new WeakMap<Step[], Map<number, Explanation>>();

/** The landing page: the front door a first visit opens on. */
const WELCOME = "welcome";
const isPage = (id: string) => id === WELCOME || problems.some((p) => p.id === id) || overviewTab(id) !== null;

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
  // A link wins, then the last page; a first visit opens the landing page.
  const [id, setId] = useState(() => idFromHash() ?? lastPage() ?? WELCOME);
  useEffect(() => {
    // The landing page is not remembered, so a return visit goes back to the last lesson.
    if (id === WELCOME) return;
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
  if (problemId === WELCOME) return <LandingView onOpen={select} />;
  return (
    <div className="app">
      <div className="topbar">
        <button className="menu-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button className="brand brand-home" onClick={() => select(WELCOME)} aria-label="Offerlab home">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          Offerlab
        </button>
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

type LeftTab = "learn" | "problem" | "code" | "intuition";
const TAB_KEY = "viz:left-tab";
function initialTab(): LeftTab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return t === "intuition" || t === "problem" ? t : "code";
  } catch {
    return "code";
  }
}

const KEY_ONLY_KEY = "viz:key-steps";
function initialKeyOnly(): boolean {
  try {
    return localStorage.getItem(KEY_ONLY_KEY) === "1";
  } catch {
    return false;
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
  // Algorithms open on the question, with the solution hidden until asked for.
  const progress = useProgress();
  const revealed = systems || isRevealed(progress, problem.id);
  const [tab, setTabState] = useState<LeftTab>(() =>
    systems ? (problem.lesson ? "learn" : "code") : isRevealed(getProgress(), problem.id) ? initialTab() : "problem",
  );
  const setTab = useCallback((t: LeftTab) => {
    setTabState(t);
    if (systems) return;
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // Remembering the tab is a convenience only.
    }
  }, [systems]);
  const showSolution = useCallback(() => {
    updateProgress((p, now) => reveal(p, problem.id, now));
    setTab("code");
  }, [problem.id, setTab]);
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
  const trace = state.status === "ready" ? state.trace : null;
  const lesson = useMemo(() => parseLesson(problem.lesson), [problem.lesson]);
  // Building blocks tell their scenarios as a story; until one is picked, start at chapter 1.
  const chapters = useMemo(() => (systems && trace ? storyChapters(trace.runs, lesson) : []), [systems, trace, lesson]);
  const [pickedRun, setRunIndex] = useState<number | null>(null);
  const runIndex = pickedRun ?? chapters[0]?.run ?? 0;
  const run: Run | undefined = trace?.runs[runIndex];
  const steps = run?.steps ?? EMPTY_STEPS;

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
  // The explain card's "what the line did" row never repeats the @say, which the card shows as the reason.
  const plainHints = useMemo(() => ({ ...problem.hints, say: {} }), [problem.hints]);
  const explainAt = useCallback(
    (k: number) => {
      let cache = explainCache.get(steps);
      if (!cache) explainCache.set(steps, (cache = new Map()));
      let e = cache.get(k);
      if (!e && steps[k]) {
        e = explainStep(steps, k, problem.lines, problem.hints, problem.why, narrate(steps, k, problem.lines, plainHints));
        cache.set(k, e);
      }
      return e ?? null;
    },
    [steps, problem, plainHints],
  );
  // "Key steps only": stepping and playing skip to the steps that carry a written reason.
  const [keyOnly, setKeyOnlyState] = useState(initialKeyOnly);
  const setKeyOnly = useCallback((on: boolean) => {
    setKeyOnlyState(on);
    try {
      localStorage.setItem(KEY_ONLY_KEY, on ? "1" : "0");
    } catch {
      // Remembering the toggle is a convenience only.
    }
  }, []);
  const keyStops = useMemo(() => {
    if (systems) return [];
    const out: number[] = [];
    for (let i = 0; i < steps.length; i++) if (explainAt(i)?.key) out.push(i);
    return out;
  }, [steps, explainAt, systems]);
  const story = useMemo(() => (systems ? null : buildStory(steps, problem.hints, problem.lines)), [steps, problem, systems]);
  const keySteps = useMemo(() => new Set(story?.marks.map((m) => m.index)), [story]);
  const dwell = useCallback(
    (k: number) => {
      if (keySteps.has(k)) return 1.8;
      if (explainAt(k)?.key) return 2.2;
      const n = narrationAt(k);
      if (!n) return 1;
      if (n.kind === "say") return 1.6;
      if (n.kind === "code") return 0.6;
      return 1;
    },
    [narrationAt, keySteps, explainAt],
  );

  const player = usePlayer(steps.length, `${problem.id}:${runIndex}:${steps.length}`, dwell, keyOnly && keyStops.length > 1 ? keyStops : null, !revealed);
  const k = player.index;

  const shownK = k;

  const step = steps[shownK];
  const after = steps[shownK + 1] ?? step;
  const scene = useMemo(() => (after ? buildScene(after, step, problem.hints) : null), [after, step, problem.hints]);
  // A building block's own words for the picture: the view's caption, else the latest @caption.
  const ownCaption = scene?.panels.some((p) => "caption" in p) ?? false;
  // A block whose picture explains itself drops the code-level extras (call stack, line narration).
  const selfExplained = systems && (ownCaption || Object.keys(problem.hints.caption).length > 0);
  const caption = useMemo(() => (systems && !ownCaption ? captionAt(steps, shownK, problem.hints) : null), [systems, ownCaption, steps, shownK, problem.hints]);
  const narration = step ? narrationAt(shownK) : null;
  const explanation = step && !systems ? explainAt(shownK) : null;

  const storyView: StoryView | undefined = useMemo(() => {
    if (!story) return undefined;
    const win = story.win;
    const trail = new Map<string, Set<string>>();
    for (const [key, cells] of story.trail) {
      const set = new Set<string>();
      for (const [rc, at] of cells) if (at <= shownK) set.add(rc);
      trail.set(key, set);
    }
    return {
      story,
      rule: problem.hints.rule,
      broken: story.broken[shownK] ?? false,
      trail,
      lens: win
        ? {
            mode: win.mode,
            best: win.best[shownK] ?? null,
            bestName: problem.hints.best,
            justLeft: leftWindow(win.wins[shownK - 1] ?? null, win.wins[shownK] ?? null),
            arcRoom: problem.hints.arcs.length > 0,
          }
        : undefined,
    };
  }, [story, shownK, problem.hints]);

  // Every drawing, story or not: what the line reads and writes, and how far the tree's recursion has got.
  const stepLens: StepLens = useMemo(() => {
    const deps = step ? lineDeps(problem.lines[step.line - 1], step) : null;
    let tree: StepLens["tree"];
    if (callTree.recursive) {
      const path = new Set<number>();
      const done = new Map<number, string | undefined>();
      for (const n of callTree.nodes) {
        if (n.node === undefined || n.start > shownK) continue;
        if (n.end >= shownK) {
          path.add(n.node);
          done.delete(n.node);
        } else done.set(n.node, n.retStep !== undefined && n.retStep <= shownK ? n.ret : undefined);
      }
      if (path.size || done.size) tree = { path, done };
    }
    return { deps, tree };
  }, [step, shownK, callTree, problem.lines]);

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
      else if (e.key === "k" && keyStops.length > 1) setKeyOnly(!keyOnly);
      else if (e.key === "i" && !systems) setTab(tab === "intuition" ? "code" : "intuition");
      else if (e.key === "p" && !systems) setTab("problem");
      else if (e.key === "e" && hasNotes) {
        setTab("code");
        setExplain(tab === "code" ? !explain : true);
      } else return;
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [player, tab, setTab, explain, setExplain, hasNotes, systems, keyStops, keyOnly, setKeyOnly]);

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
          {revealed && trace && trace.runs.length > 0 && (
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
        {revealed && (problem.approach || problem.approachName) && (
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
            {!systems && (
              <button role="tab" className={`tab ${tab === "problem" ? "on" : ""}`} onClick={() => setTab("problem")} title="The question, hints and your progress (press p)">
                Problem<kbd>p</kbd>
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
            {tab === "code" && hasNotes && revealed && (
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
          ) : tab === "problem" && !systems ? (
            <QuestionPanel problem={problem} onShowSolution={showSolution} />
          ) : !revealed ? (
            <SolutionHidden onShow={showSolution} onProblem={() => setTab("problem")} />
          ) : tab === "code" || systems ? (
            <CodePanel
              problem={problem}
              activeLine={steps[k]?.line ?? null}
              callerLines={callerLines[k] ?? []}
              explain={explain}
            />
          ) : (
            <IntuitionPanel problem={problem} onSelect={onSelect} />
          )}
        </div>
        {!revealed && (
          <div className="visual-col">
            <SolutionHidden onShow={showSolution} />
          </div>
        )}
        {revealed && state.status === "loading" && <div className="status">Tracing…</div>}
        {revealed && state.status === "error" && <div className="status error">{state.message}</div>}
        {revealed && trace && !run && (
          <div className="status error">{trace.error ?? "No calls to the solution were recorded."}</div>
        )}
        {revealed && run && scene && (
          <div className="visual-col">
            {(run.truncated || run.error) && (
              <div className="notice" style={{ padding: "8px 20px 0" }}>
                {run.error && <div>⚠ {run.error}</div>}
                {run.truncated && <div>Showing the first {steps.length} steps of a long run.</div>}
              </div>
            )}
            <ChapterStrip chapters={chapters} current={runIndex} onPick={setRunIndex} />
            {explanation && <ExplainCard ex={explanation} />}
            <Visual scene={scene} callTree={callTree} index={shownK} story={storyView} step={stepLens} caption={caption ?? (selfExplained && !ownCaption && run ? { tone: "info", text: `Setting up: ${run.label.replace(/^broken: /, "")}.` } : null)} plain={selfExplained} />
          </div>
        )}
      </section>

      <div className="dock">
        {systems && (
          <NarrationBar
            narration={selfExplained ? null : narration}
            why={step ? problem.why[step.line] : undefined}
            hasNotes={hasNotes}
          />
        )}
        {revealed && (
          <Controls
            player={player}
            marks={story?.marks}
            keyOnly={keyStops.length > 1 ? { on: keyOnly, toggle: () => setKeyOnly(!keyOnly), count: keyStops.length } : undefined}
          />
        )}
      </div>
    </main>
  );
}
