import type { ReactNode } from "react";
import type { CallTree } from "../model/callTree.ts";
import type { Panel, Scene } from "../model/scene.ts";
import { colorOf } from "./colors.ts";
import type { Deps } from "../model/deps.ts";
import type { Story } from "../model/story.ts";
import { ArrayView, type ArrayLens } from "./views/ArrayView.tsx";
import { BitArrayView } from "./views/BitArrayView.tsx";
import { CallTreeView } from "./views/CallTreeView.tsx";
import { GraphView } from "./views/GraphView.tsx";
import { GridView } from "./views/GridView.tsx";
import { LevelsView } from "./views/LevelsView.tsx";
import { ListView } from "./views/ListView.tsx";
import { PagesView } from "./views/PagesView.tsx";
import { RingView } from "./views/RingView.tsx";
import { SpatialView } from "./views/SpatialView.tsx";
import { RangeView, SearchSpaceView, WindowHistoryView } from "./views/StoryViews.tsx";
import { MapView, ObjectView, SetView } from "./views/TableViews.tsx";
import { TimelineView } from "./views/TimelineView.tsx";
import { TreeView, type TreeLens } from "./views/TreeView.tsx";
import { TrieView } from "./views/TrieView.tsx";

const KIND_LABEL: Record<Panel["kind"], string> = {
  array: "array",
  grid: "grid",
  tree: "binary tree",
  list: "linked list",
  trie: "trie",
  graph: "graph",
  map: "map",
  set: "set",
  object: "object",
  ring: "hash ring",
  spatial: "2D space",
  bits: "bits",
  levels: "levels",
  pages: "pages",
  timeline: "timeline",
};

const WIDE = new Set<Panel["kind"]>(["tree", "graph", "trie", "list", "ring", "spatial", "levels", "pages", "timeline"]);

function PanelBox({ panel, children }: { panel: Panel; children: ReactNode }) {
  const kind =
    panel.kind === "array" && panel.letters
      ? "letter counts"
      : panel.kind === "array" && panel.chars
      ? "string"
      : panel.kind === "array" && panel.heap
        ? "heap"
        : panel.kind === "object"
          ? panel.className
          : KIND_LABEL[panel.kind];
  const size =
    panel.kind === "array" ? `len ${panel.len}` : panel.kind === "map" || panel.kind === "set" ? `size ${panel.size}` : "";
  const wide = WIDE.has(panel.kind);
  return (
    <div className={`panel ${wide ? "wide" : ""}`}>
      <div className="panel-title">
        <b>{panel.name}</b>
        <span className={`kind-tag kind-${panel.kind}`}>{kind}</span>
        {size && <span>{size}</span>}
      </div>
      {children}
    </div>
  );
}

/** The story's extras for one step: the main array's lens, the rule, and a pending question. */
export type StoryView = {
  story: Story;
  lens?: ArrayLens;
  rule?: string;
  broken: boolean;
  quiz?: { on: boolean; toggle: () => void };
  ask?: {
    name: string;
    feedback: string;
    onReveal: () => void;
    /** A question answered by picking a value rather than clicking a cell. */
    choices?: string[];
    wrong?: string;
    onChoose?: (c: string) => void;
  };
  /** Grid cells visited or filled so far, by panel key. */
  trail?: Map<string, Set<string>>;
};

/** What the current step adds to every drawing, story or not: the cells its line reads and writes, and the tree's recursion. */
export type StepLens = { deps?: Deps | null; tree?: TreeLens };

function renderPanel(p: Panel, story?: StoryView, step?: StepLens) {
  switch (p.kind) {
    case "array":
      return (
        <ArrayView
          panel={p}
          lens={story?.lens && p.name === story.story.win?.array ? story.lens : undefined}
          deps={step?.deps?.[p.name]}
        />
      );
    case "grid":
      return <GridView panel={p} trail={story?.trail?.get(p.key)} deps={step?.deps?.[p.name]} />;
    case "tree":
      return <TreeView panel={p} lens={step?.tree} />;
    case "list":
      return <ListView panel={p} />;
    case "trie":
      return <TrieView panel={p} />;
    case "graph":
      return <GraphView panel={p} />;
    case "map":
      return <MapView panel={p} />;
    case "set":
      return <SetView panel={p} />;
    case "object":
      return <ObjectView panel={p} />;
    case "ring":
      return <RingView panel={p} />;
    case "spatial":
      return <SpatialView panel={p} />;
    case "bits":
      return <BitArrayView panel={p} />;
    case "levels":
      return <LevelsView panel={p} />;
    case "pages":
      return <PagesView panel={p} />;
    case "timeline":
      return <TimelineView panel={p} />;
  }
}

export function Visual({
  scene,
  callTree,
  index,
  story,
  step,
}: {
  scene: Scene;
  callTree: CallTree;
  index: number;
  story?: StoryView;
  step?: StepLens;
}) {
  const showTree = callTree.recursive && callTree.nodes.length >= 3;
  const win = story?.story.win;
  const range = story?.story.range;
  const showWindow = win && win.len <= 24 && !win.restarts;
  return (
    <div className="visual">
      {story && (story.rule || story.quiz) && (
        <div className={`rule-bar ${story.broken ? "broken" : ""}`}>
          <span className="dot" />
          <span className="rule-text">
            {story.rule ? `${story.broken ? "Rule broken" : "Rule holds"}: ${story.rule}` : "Key moments pause for your guess."}
          </span>
          {story.quiz && (
            <label className="quiz-toggle" title="Pause at key moments and guess where the pointer goes">
              <input type="checkbox" checked={story.quiz.on} onChange={story.quiz.toggle} />
              Ask me first
            </label>
          )}
        </div>
      )}
      {story?.ask && (
        <div className="ask-bar" role="status">
          <span>
            <b>Your turn.</b>{" "}
            {story.ask.choices ? (
              <>
                What is <code>{story.ask.name}</code> after this line?
              </>
            ) : (
              <>
                Where does <code>{story.ask.name}</code> go next? Click a cell.
              </>
            )}
          </span>
          {story.ask.choices && (
            <span className="ask-choices">
              {story.ask.choices.map((c) => (
                <button key={c} className={`btn ${story.ask!.wrong === c ? "wrong" : ""}`} onClick={() => story.ask!.onChoose?.(c)}>
                  {c}
                </button>
              ))}
            </span>
          )}
          <button className="btn" onClick={story.ask.onReveal}>
            Show me
          </button>
          <span className="ask-feedback">{story.ask.feedback}</span>
        </div>
      )}
      {scene.scalars.length > 0 && (
        <div className="scalars">
          {scene.scalars.map((s) => (
            <div key={`${s.name}:${s.text}`} className={`scalar ${s.changed ? "changed" : ""} ${s.pointer ? "ptr" : ""}`}>
              <span className="k" style={s.pointer ? { color: colorOf(s.name) } : undefined}>
                {s.name}
              </span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="panels">
        {scene.panels.map((p) => (
          <PanelBox key={p.key} panel={p}>
            {renderPanel(p, story, step)}
          </PanelBox>
        ))}
        {scene.panels.length === 0 && scene.scalars.length === 0 && <div className="empty">no variables yet</div>}
      </div>
      {(showWindow || range) && (
        <div className="side-by-side">
          {range && (
            <div className="panel">
              <div className="panel-title">
                <b>search range</b>
                <span>
                  {range.lo}..{range.hi} over time
                </span>
              </div>
              <RangeView range={range} index={index} />
            </div>
          )}
          {showWindow && !range && (
            <div className="panel">
              <div className="panel-title">
                <b>search space</b>
                <span>every start and end brute force would try</span>
              </div>
              <SearchSpaceView story={win} index={index} />
            </div>
          )}
          {showWindow && !range && (
            <div className="panel">
              <div className="panel-title">
                <b>window over time</b>
              </div>
              <WindowHistoryView story={win} index={index} />
            </div>
          )}
        </div>
      )}
      {(scene.frames.length > 1 || showTree) && (
        <div className="side-by-side">
          {scene.frames.length > 1 && (
            <div className="panel" style={{ maxHeight: 360, overflowY: "auto" }}>
              <div className="panel-title">
                <b>call stack</b>
                <span>depth {scene.frames.length}</span>
              </div>
              <div className="stack">
                {[...scene.frames].reverse().map((f, i) => (
                  <div key={i} className={`frame ${i === 0 ? "top" : ""}`}>
                    {f.fn}({f.args})
                  </div>
                ))}
              </div>
            </div>
          )}
          {showTree && (
            <div className="panel" style={{ flex: 1, minWidth: 320 }}>
              <div className="panel-title">
                <b>recursion tree</b>
                <span>{callTree.nodes.filter((n) => n.start <= index).length} calls so far</span>
              </div>
              <CallTreeView tree={callTree} index={index} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
