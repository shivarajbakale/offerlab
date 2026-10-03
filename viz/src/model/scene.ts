// Turns one recorded Step into a Scene: the list of panels (arrays, grids, trees, ...)
// and scalar chips that the visual area draws. `prev` is the step before, used to
// flag what changed.

import type { HeapId, HeapObj, Step, Value } from "../tracer/types.ts";
import type { Hints } from "./hints.ts";
import { fmtPrim, label } from "./heap.ts";
import { BUILDERS, buildSystemsPanels, findVar, sceneVars, toJs, type Builders, type SceneVar, type SystemsPanel } from "./systems/index.ts";

export type Cell = { text: string; changed: boolean; ref?: HeapId; muted?: boolean; str?: boolean };
export type Pointer = { name: string; index: number };
export type NodeName = { name: string; inner: boolean };

export type ArrayPanel = {
  kind: "array";
  key: string;
  name: string;
  cells: Cell[];
  len: number;
  pointers: Pointer[];
  window?: [number, number];
  chars?: boolean;
  heap?: boolean;
};
export type GridPanel = {
  kind: "grid";
  key: string;
  name: string;
  rows: Cell[][];
  cursor?: { r: number; c: number; label: string };
  /** From a `labels:<cols>,<rows>` hint: names to show instead of column and row numbers. */
  colLabels?: string[];
  rowLabels?: string[];
};
export type TreeNodeData = {
  id: HeapId;
  label: string;
  names: NodeName[];
  changed: boolean;
  left: TreeNodeData | null;
  right: TreeNodeData | null;
};
export type TreePanel = { kind: "tree"; key: string; name: string; root: TreeNodeData };
export type ListNodeData = {
  id: HeapId;
  label: string;
  names: NodeName[];
  changed: boolean;
  extra?: string;
};
export type ListPanel = {
  kind: "list";
  key: string;
  name: string;
  nodes: ListNodeData[];
  /** Index in `nodes` that the last node's `next` points back to. */
  cycleTo?: number;
  /** The chain continues into a node already drawn in another list. */
  joins?: string;
};
export type TrieNodeData = {
  id: HeapId;
  char: string;
  end: boolean;
  names: NodeName[];
  changed: boolean;
  children: TrieNodeData[];
};
export type TriePanel = { kind: "trie"; key: string; name: string; root: TrieNodeData };
export type GraphNodeData = {
  id: string;
  label: string;
  names: NodeName[];
  visited: boolean;
  queued: boolean;
};
export type GraphPanel = {
  kind: "graph";
  key: string;
  name: string;
  nodes: GraphNodeData[];
  edges: { from: string; to: string }[];
  directed: boolean;
};
export type MapPanel = {
  kind: "map";
  key: string;
  name: string;
  rows: { k: Cell; v: Cell }[];
  size: number;
};
export type SetPanel = { kind: "set"; key: string; name: string; items: Cell[]; size: number };
export type ObjectPanel = {
  kind: "object";
  key: string;
  name: string;
  className: string;
  fields: { name: string; cell: Cell }[];
};

export type Panel =
  | ArrayPanel
  | GridPanel
  | TreePanel
  | ListPanel
  | TriePanel
  | GraphPanel
  | MapPanel
  | SetPanel
  | ObjectPanel
  | SystemsPanel;

export type Scalar = { name: string; text: string; changed: boolean; pointer: boolean };
export type FrameInfo = { fn: string; args: string };
export type Scene = { panels: Panel[]; scalars: Scalar[]; frames: FrameInfo[] };

const POINTER_NAMES = new Set([
  "i", "j", "k", "l", "r", "lo", "hi", "low", "high", "m", "mid", "left", "right",
  "start", "end", "slow", "fast", "p", "q", "p1", "p2", "idx", "index", "ptr",
  "lp", "rp", "a", "b", "w", "read", "write", "pos",
]);
const WINDOW_PAIRS: [string, string][] = [
  ["l", "r"], ["left", "right"], ["lo", "hi"], ["low", "high"], ["start", "end"], ["i", "j"],
];
const CELL_PAIRS: [string, string][] = [["r", "c"], ["row", "col"], ["i", "j"], ["x", "y"], ["y", "x"]];
const OUTPUT_NAMES = /^(res|result|results|ans|answer|out|output|path|cur|curr|combo|perm|subset|part|stack|queue|q|heap|freq|count|counts|bucket|buckets)$/i;
const VISITED_NAMES = /^(visited|visit|seen|vis|done|explored)$/i;
const QUEUE_NAMES = /^(queue|q|stack|frontier|bfs|deque)$/i;
const CURRENT_NODE_NAMES = /^(node|u|v|cur|curr|course|crs|src|nei|neighbor|nxt|next)$/i;
const ADJ_NAMES = /^(adj|adjList|adjacency|graph|g|neighbors|edgesMap|pre|prereq|prereqs|preMap|children)$/i;
const END_FIELDS = ["isEnd", "end", "isWord", "endOfWord", "terminal", "isEndOfWord", "word"];

type Role = "tree" | "list" | "trie" | "graphNode" | "plain";

function roleOf(o: HeapObj | undefined): Role {
  if (!o || o.kind !== "object") return "plain";
  const f = o.fields;
  if ("left" in f && "right" in f) return "tree";
  if ("children" in f && !("left" in f)) return "trie";
  if ("neighbors" in f) return "graphNode";
  if ("next" in f) return "list";
  return "plain";
}

export type Var = SceneVar;

/** `builders` is for tests; the app always uses the real systems view builders. */
export function buildScene(step: Step, prev: Step | undefined, hints: Hints, builders: Builders = BUILDERS): Scene {
  const heap = step.heap;
  const frames = step.stack;
  const innerIdx = frames.length - 1;
  const inner = frames[innerIdx];
  const prevInner = prev?.stack.at(-1);
  const samePrevFrame =
    prev && prevInner && prev.stack.length === frames.length && prevInner.fn === inner?.fn;

  // ---- collect visible variables (outermost frame first, `this` fields flattened) ----
  // `hide:` drops locals and `this` fields alike; systems views still see everything (below).
  const allVars = sceneVars(step);
  const vars: Var[] = allVars.filter((x) => !hints.hide.includes(x.name));

  // ---- names attached to heap objects (for labelling nodes) ----
  const namesById = new Map<HeapId, NodeName[]>();
  for (const x of vars) {
    if (x.v.t !== "r") continue;
    // Outer frames of the same recursive function only add noise to node labels.
    if (!x.inner && frames[x.frame].fn === inner?.fn) continue;
    const list = namesById.get(x.v.id) ?? [];
    if (!list.some((n) => n.name === x.name)) list.push({ name: x.name, inner: x.inner });
    namesById.set(x.v.id, list);
  }
  const names = (id: HeapId) => namesById.get(id) ?? [];

  const prevObj = (id: HeapId) => prev?.heap[id];
  const prevLabel = (v: Value | undefined) => (prev && v ? label(prev, v) : undefined);
  const cell = (v: Value, prevV: Value | undefined, hadPrev: boolean): Cell => {
    const text = label(step, v);
    const changed = hadPrev && (prevV === undefined || prevLabel(prevV) !== text);
    return {
      text,
      changed,
      ...(v.t === "r" ? { ref: v.id } : {}),
      ...(v.t === "p" && v.v == null ? { muted: true } : {}),
      ...(v.t === "p" && typeof v.v === "string" ? { str: true } : {}),
    };
  };

  const panels: Panel[] = [];
  // Systems views (`@viz ring:` and friends) draw first; what they draw is skipped below.
  const sys = buildSystemsPanels(step, prev, hints, allVars, builders);
  panels.push(...sys.panels);
  const shown = new Set<HeapId>();
  const structureShown = new Set<string>();

  // ---- linked structures: parent maps ----
  const treeParent = new Map<HeapId, HeapId>();
  const listPrev = new Map<HeapId, HeapId>();
  const trieParent = new Map<HeapId, HeapId>();
  for (const [idStr, o] of Object.entries(heap)) {
    const id = Number(idStr);
    if (sys.uses.has(id)) continue;
    const role = roleOf(o);
    if (o.kind !== "object") continue;
    if (role === "tree") {
      for (const k of ["left", "right"]) {
        const c = o.fields[k];
        if (c?.t === "r" && roleOf(heap[c.id]) === "tree") treeParent.set(c.id, id);
      }
    } else if (role === "list") {
      const n = o.fields.next;
      if (n?.t === "r" && !listPrev.has(n.id)) listPrev.set(n.id, id);
    } else if (role === "trie") {
      for (const c of trieChildren(heap, o)) trieParent.set(c.id, id);
    }
  }
  const climb = (id: HeapId, parent: Map<HeapId, HeapId>) => {
    const seen = new Set<HeapId>();
    while (parent.has(id) && !seen.has(id)) {
      seen.add(id);
      id = parent.get(id)!;
    }
    return id;
  };

  const changedNode = (id: HeapId, o: HeapObj) => {
    const p = prevObj(id);
    if (!prev) return false;
    if (!p) return true;
    return JSON.stringify(p) !== JSON.stringify(o);
  };

  const buildTree = (id: HeapId, depth: number): TreeNodeData | null => {
    const o = heap[id];
    if (!o || o.kind !== "object" || depth > 12) return null;
    shown.add(id);
    const child = (k: string) => {
      const c = o.fields[k];
      return c?.t === "r" ? buildTree(c.id, depth + 1) : null;
    };
    return {
      id,
      label: label(step, o.fields.val ?? o.fields.value ?? { t: "p", v: "·" }),
      names: names(id),
      changed: changedNode(id, o),
      left: child("left"),
      right: child("right"),
    };
  };

  const buildTrie = (id: HeapId, char: string, depth: number, budget: { n: number }): TrieNodeData => {
    const o = heap[id] as Extract<HeapObj, { kind: "object" }>;
    shown.add(id);
    const children: TrieNodeData[] = [];
    if (depth < 16) {
      for (const c of trieChildren(heap, o)) {
        if (budget.n-- <= 0) break;
        children.push(buildTrie(c.id, c.char, depth + 1, budget));
      }
    }
    const end = END_FIELDS.some((k) => {
      const v = o.fields[k];
      return v?.t === "p" && (v.v === true || (typeof v.v === "string" && v.v !== ""));
    });
    return { id, char, end, names: names(id), changed: changedNode(id, o), children };
  };

  const addList = (startId: HeapId, name: string) => {
    const head = climb(startId, listPrev);
    const key = `list:${head}`;
    if (structureShown.has(key)) return;
    structureShown.add(key);
    const nodes: ListNodeData[] = [];
    const index = new Map<HeapId, number>();
    let id: HeapId | undefined = head;
    let cycleTo: number | undefined;
    let joins: string | undefined;
    while (id !== undefined && nodes.length < 40) {
      if (index.has(id)) {
        cycleTo = index.get(id);
        break;
      }
      if (shown.has(id)) {
        joins = label(step, { t: "r", id });
        break;
      }
      const o: HeapObj | undefined = heap[id];
      if (!o || o.kind !== "object") break;
      shown.add(id);
      index.set(id, nodes.length);
      const random = o.fields.random;
      nodes.push({
        id,
        label: label(step, o.fields.val ?? o.fields.value ?? { t: "p", v: "·" }),
        names: names(id),
        changed: changedNode(id, o),
        ...("key" in o.fields ? { label: label(step, { t: "r", id }) } : {}),
        ...(random ? { extra: `rand→${random.t === "r" ? label(step, random) : "null"}` } : {}),
      });
      const next: Value | undefined = o.fields.next;
      id = next?.t === "r" ? next.id : undefined;
    }
    const headNames = nodes[0]?.names.map((n) => n.name) ?? [];
    panels.push({ kind: "list", key, name: headNames.length ? headNames.join(" = ") : name, nodes, cycleTo, joins });
  };

  // ---- graph panels ----
  const visitedKeys = new Set<string>();
  const queuedKeys = new Set<string>();
  for (const x of vars) {
    const o = x.v.t === "r" ? heap[x.v.id] : undefined;
    if (!o) continue;
    const isVisited = VISITED_NAMES.test(x.name);
    const isQueue = QUEUE_NAMES.test(x.name);
    if (!isVisited && !isQueue) continue;
    const target = isVisited ? visitedKeys : queuedKeys;
    if (o.kind === "set") for (const it of o.items) target.add(graphKey(step, it));
    if (o.kind === "map") for (const [k] of o.entries) target.add(graphKey(step, k));
    if (o.kind === "array") {
      o.items.forEach((it, i) => {
        if (it.t === "p" && it.v === true) target.add(String(i));
        else if (it.t === "p" && typeof it.v === "number" && isQueue) target.add(String(it.v));
        else if (it.t === "r") target.add(graphKey(step, it));
      });
    }
  }
  const graphNames = (key: string) =>
    vars
      .filter((x) => x.inner && x.v.t === "p" && CURRENT_NODE_NAMES.test(x.name) && String(x.v.v) === key)
      .map((x) => ({ name: x.name, inner: true }));

  const addAdjacencyGraph = (name: string, o: HeapObj, id: HeapId) => {
    const edges: { from: string; to: string }[] = [];
    const keys = new Set<string>();
    const addNeighbors = (from: string, list: Value | undefined) => {
      keys.add(from);
      const lo = list?.t === "r" ? heap[list.id] : undefined;
      const items = lo?.kind === "array" || lo?.kind === "set" ? lo.items : [];
      for (const n of items) {
        const to = graphKey(step, n.t === "r" && heap[n.id]?.kind === "array" ? (heap[n.id] as { items: Value[] }).items[0] : n);
        keys.add(to);
        edges.push({ from, to });
      }
    };
    if (o.kind === "array") o.items.forEach((list, i) => addNeighbors(String(i), list));
    else if (o.kind === "map") for (const [k, list] of o.entries) addNeighbors(graphKey(step, k), list);
    else if (o.kind === "object") for (const [k, list] of Object.entries(o.fields)) addNeighbors(k, list);
    const set = new Set(edges.map((e) => `${e.from}->${e.to}`));
    const directed = edges.some((e) => !set.has(`${e.to}->${e.from}`));
    const dedup = directed ? edges : edges.filter((e) => e.from <= e.to);
    panels.push({
      kind: "graph",
      key: `graph:${id}`,
      name,
      directed,
      edges: dedup,
      nodes: [...keys].map((k) => ({
        id: k,
        label: k,
        names: graphNames(k),
        visited: visitedKeys.has(k),
        queued: queuedKeys.has(k),
      })),
    });
  };

  const addGraphNodes = (name: string) => {
    if (structureShown.has("graphNodes")) return;
    structureShown.add("graphNodes");
    const nodes: GraphNodeData[] = [];
    const edges: { from: string; to: string }[] = [];
    const seenEdge = new Set<string>();
    for (const [idStr, o] of Object.entries(heap)) {
      if (roleOf(o) !== "graphNode" || o.kind !== "object") continue;
      const id = Number(idStr);
      shown.add(id);
      nodes.push({
        id: idStr,
        label: label(step, o.fields.val ?? { t: "p", v: "·" }),
        names: names(id),
        visited: visitedKeys.has(idStr),
        queued: queuedKeys.has(idStr),
      });
      const nb = o.fields.neighbors?.t === "r" ? heap[(o.fields.neighbors as { id: HeapId }).id] : undefined;
      if (nb?.kind === "array") {
        for (const n of nb.items) {
          if (n.t !== "r") continue;
          const k = [idStr, String(n.id)].sort().join("-");
          if (seenEdge.has(k)) continue;
          seenEdge.add(k);
          edges.push({ from: idStr, to: String(n.id) });
        }
      }
    }
    panels.push({ kind: "graph", key: "graphNodes", name, nodes, edges, directed: false });
  };

  // ---- walk variables, creating panels in order of first appearance ----
  const queue: Var[] = [...vars];
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    if (x.v.t !== "r") continue;
    const id = x.v.id;
    if (sys.uses.has(id)) continue;
    const o = heap[id];
    if (!o) continue;
    const role = roleOf(o);

    if (role === "tree") {
      const root = climb(id, treeParent);
      const key = `tree:${root}`;
      if (structureShown.has(key)) continue;
      structureShown.add(key);
      const data = buildTree(root, 0);
      if (data) panels.push({ kind: "tree", key, name: rootName(root, x.name), root: data });
      continue;
    }
    if (role === "list") {
      addList(id, x.name);
      continue;
    }
    if (role === "trie") {
      const root = climb(id, trieParent);
      const key = `trie:${root}`;
      if (structureShown.has(key)) continue;
      structureShown.add(key);
      panels.push({ kind: "trie", key, name: rootName(root, x.name), root: buildTrie(root, "", 0, { n: 200 }) });
      continue;
    }
    if (role === "graphNode") {
      addGraphNodes(x.name);
      continue;
    }
    if (shown.has(id)) continue;
    shown.add(id);
    const p = prevObj(id);

    if (ADJ_NAMES.test(x.name) || hints.graph === x.name) {
      if (isAdjacency(heap, o)) {
        addAdjacencyGraph(x.name, o, id);
        continue;
      }
    }

    switch (o.kind) {
      case "array": {
        const grid = gridRows(heap, o);
        const heapLike = hints.heap === x.name || (hints.heap === undefined && /heap/i.test(x.name));
        if (grid && hints.array !== x.name) {
          const pRows = p?.kind === "array" ? p.items : [];
          panels.push({
            kind: "grid",
            key: `grid:${id}`,
            name: x.name,
            rows: grid.map((row, r) => {
              const pr = pRows[r]?.t === "r" ? prev?.heap[(pRows[r] as { id: HeapId }).id] : undefined;
              const pItems = pr?.kind === "array" ? pr.items : undefined;
              return row.map((v, c) => cell(v, pItems?.[c], Boolean(p)));
            }),
          });
        } else {
          const pItems = p?.kind === "array" ? p.items : undefined;
          panels.push({
            kind: "array",
            key: `array:${id}`,
            name: x.name,
            cells: o.items.map((v, i) => cell(v, pItems?.[i], Boolean(p))),
            len: o.len,
            pointers: [],
            heap: heapLike,
          });
        }
        break;
      }
      case "map": {
        const prevMap = new Map<string, Value>();
        if (p?.kind === "map" && prev) for (const [k, v] of p.entries) prevMap.set(label(prev, k), v);
        panels.push({
          kind: "map",
          key: `map:${id}`,
          name: x.name,
          size: o.size,
          rows: o.entries.map(([k, v]) => {
            const kt = label(step, k);
            const pv = prevMap.get(kt);
            return {
              k: { text: kt, changed: Boolean(p) && pv === undefined },
              v: cell(v, pv, Boolean(p)),
            };
          }),
        });
        break;
      }
      case "set": {
        const prevItems = new Set<string>();
        if (p?.kind === "set" && prev) for (const v of p.items) prevItems.add(label(prev, v));
        panels.push({
          kind: "set",
          key: `set:${id}`,
          name: x.name,
          size: o.size,
          items: o.items.map((v) => {
            const text = label(step, v);
            return { text, changed: Boolean(p) && !prevItems.has(text) };
          }),
        });
        break;
      }
      case "object": {
        const heapField = Object.entries(o.fields).find(
          ([, v]) => v.t === "r" && heap[v.id]?.kind === "array",
        );
        if (/heap|queue|pq/i.test(o.className) && heapField) {
          queue.splice(qi + 1, 0, { ...x, name: x.name, v: heapField[1] });
          shown.delete(id);
          hints = { ...hints, heap: hints.heap ?? x.name };
          continue;
        }
        if (!o.className) {
          // Plain object used as a dictionary.
          const pf = p?.kind === "object" ? p.fields : {};
          panels.push({
            kind: "map",
            key: `map:${id}`,
            name: x.name,
            size: Object.keys(o.fields).length,
            rows: Object.entries(o.fields).map(([k, v]) => ({
              k: { text: k, changed: Boolean(p) && !(k in pf) },
              v: cell(v, pf[k], Boolean(p)),
            })),
          });
          break;
        }
        const pf = p?.kind === "object" ? p.fields : {};
        panels.push({
          kind: "object",
          key: `object:${id}`,
          name: x.name,
          className: o.className,
          fields: Object.entries(o.fields).map(([k, v]) => ({ name: k, cell: cell(v, pf[k], Boolean(p)) })),
        });
        // Pull nested structures (maps, arrays, nodes) out into their own panels.
        for (const [k, v] of Object.entries(o.fields)) {
          if (v.t === "r") queue.push({ name: `${x.name}.${k}`, v, frame: x.frame, inner: x.inner });
        }
        break;
      }
    }
  }

  // ---- primitives of the innermost frame: strings become char arrays, ints become pointers ----
  const scalars: Scalar[] = [];
  // A local shadows a `this` field of the same name (a parameter `name` beside a field `name`).
  const innerAll = vars.filter((x) => x.inner && x.v.t === "p");
  const localNames = new Set(innerAll.filter((x) => !x.field).map((x) => x.name));
  const innerPrims = innerAll.filter((x) => !x.field || !localNames.has(x.name));
  const prevInnerVals = new Map<string, string>();
  if (samePrevFrame && prev) {
    for (const [n, v] of prevInner!.vars) prevInnerVals.set(n, label(prev, v, 0, true));
    const self = prevInner!.vars.find(([n]) => n === "this")?.[1];
    const so = self?.t === "r" ? prev.heap[self.id] : undefined;
    if (so?.kind === "object") {
      for (const [n, v] of Object.entries(so.fields)) if (!prevInnerVals.has(n)) prevInnerVals.set(n, label(prev, v, 0, true));
    }
  }
  const params = new Set(frames.flatMap((f) => f.params));
  const charPanels: ArrayPanel[] = [];
  for (const x of innerPrims) {
    const v = x.v as Extract<Value, { t: "p" }>;
    if (typeof v.v === "string" && v.v.length >= 2 && v.v.length <= 80 && (params.has(x.name) || hints.array === x.name)) {
      const pv = prevInnerVals.get(x.name);
      const prevStr = pv !== undefined ? safeJson(pv) : undefined;
      const panel: ArrayPanel = {
        kind: "array",
        key: `str:${x.name}`,
        name: x.name,
        chars: true,
        len: v.v.length,
        pointers: [],
        cells: [...v.v].map((ch, i) => ({
          text: ch,
          changed: typeof prevStr === "string" && prevStr[i] !== ch,
        })),
      };
      charPanels.push(panel);
    }
  }
  // Strings go first: they are usually the main input (s, t, word).
  panels.unshift(...charPanels);

  // Column and row names for the hinted grid, read even when the label arrays are hidden.
  if (hints.gridLabels) {
    const grid = panels.find((p): p is GridPanel => p.kind === "grid" && p.name === hints.grid);
    const names = (name: string | undefined) => {
      const js = name ? toJs(step, findVar(step, allVars, name)) : undefined;
      return Array.isArray(js) && js.every((x) => typeof x === "string" || typeof x === "number") ? js.map(String) : undefined;
    };
    const cols = names(hints.gridLabels[0]);
    const rows = names(hints.gridLabels[1]);
    if (grid && cols) grid.colLabels = cols;
    if (grid && rows) grid.rowLabels = rows;
  }

  const arrays = panels.filter((p): p is ArrayPanel => p.kind === "array" && !p.heap);
  const primary = hints.array
    ? arrays.find((a) => a.name === hints.array) ?? arrays[0]
    : arrays[0];
  const pointerTargets = arrays.filter((a) => a === primary || !OUTPUT_NAMES.test(a.name.split(".").pop()!));

  const intOf = (name: string) => {
    const x = innerPrims.find((p) => p.name === name);
    return x && x.v.t === "p" && typeof x.v.v === "number" && Number.isInteger(x.v.v) ? x.v.v : undefined;
  };
  const pointerNames = new Set(
    innerPrims
      .filter((x) => !hints.values.includes(x.name))
      .filter((x) => POINTER_NAMES.has(x.name) || hints.pointers.includes(x.name) || hints.window?.includes(x.name))
      .map((x) => x.name),
  );
  const usedAsPointer = new Set<string>();

  // Grid cursor: (r, c), (i, j), ... within bounds of the grid.
  const grids = panels.filter((p): p is GridPanel => p.kind === "grid");
  const primaryGrid = hints.grid ? grids.find((g) => g.name === hints.grid) ?? grids[0] : grids[0];
  if (primaryGrid) {
    for (const [a, b] of CELL_PAIRS) {
      const r = intOf(a);
      const c = intOf(b);
      if (r === undefined || c === undefined) continue;
      if (r >= 0 && r < primaryGrid.rows.length && c >= 0 && c < (primaryGrid.rows[r]?.length ?? 0)) {
        primaryGrid.cursor = { r, c, label: `${a},${b}` };
        usedAsPointer.add(a).add(b);
        break;
      }
    }
  }

  for (const arr of pointerTargets) {
    for (const name of pointerNames) {
      const v = intOf(name);
      if (v === undefined || v < -1 || v > arr.len) continue;
      if (arr !== primary && (v < 0 || v >= arr.len)) continue;
      arr.pointers.push({ name, index: v });
      usedAsPointer.add(name);
    }
    const pair = hints.window
      ? [hints.window]
      : WINDOW_PAIRS.filter(([a, b]) => arr === primary && pointerNames.has(a) && pointerNames.has(b));
    for (const [a, b] of pair) {
      const l = intOf(a);
      const r = intOf(b);
      if (l !== undefined && r !== undefined && l <= r && arr === primary) {
        arr.window = [Math.max(0, l), Math.min(arr.len - 1, r)];
        break;
      }
    }
  }

  const charNames = new Set(charPanels.map((p) => p.name));
  const scalarNames = new Set<string>();
  for (const x of innerPrims) {
    if (charNames.has(x.name) || scalarNames.has(x.name)) continue;
    scalarNames.add(x.name);
    const text = label(step, x.v, 0, true);
    const before = prevInnerVals.get(x.name);
    scalars.push({
      name: x.name,
      text,
      changed: Boolean(samePrevFrame) && before !== text,
      pointer: usedAsPointer.has(x.name),
    });
  }

  const frameInfos: FrameInfo[] = frames.map((f) => ({
    fn: f.fn,
    args: f.params
      .filter((n) => n !== "this")
      .map((n) => {
        const v = f.vars.find(([k]) => k === n)?.[1];
        return v ? label(step, v, 1, true) : "?";
      })
      .join(", "),
  }));

  return { panels, scalars, frames: frameInfos };

  function rootName(root: HeapId, fallback: string) {
    const ns = names(root);
    return ns.length ? ns.map((n) => n.name).join(" = ") : fallback;
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function graphKey(_step: Step, v: Value): string {
  if (v.t === "p") return fmtPrim(v.v);
  return String(v.t === "r" ? v.id : v.name);
}

function trieChildren(heap: Step["heap"], o: Extract<HeapObj, { kind: "object" }>) {
  const out: { char: string; id: HeapId }[] = [];
  const ch = o.fields.children;
  const co = ch?.t === "r" ? heap[ch.id] : undefined;
  if (!co) return out;
  if (co.kind === "map") {
    for (const [k, v] of co.entries) if (v.t === "r") out.push({ char: k.t === "p" ? String(k.v) : "?", id: v.id });
  } else if (co.kind === "object") {
    for (const [k, v] of Object.entries(co.fields)) if (v.t === "r") out.push({ char: k, id: v.id });
  } else if (co.kind === "array") {
    co.items.forEach((v, i) => {
      if (v.t === "r") out.push({ char: String.fromCharCode(97 + i), id: v.id });
    });
  }
  return out;
}

function gridRows(heap: Step["heap"], o: Extract<HeapObj, { kind: "array" }>): Value[][] | null {
  if (o.items.length === 0) return null;
  const rows: Value[][] = [];
  for (const it of o.items) {
    const row = it.t === "r" ? heap[it.id] : undefined;
    if (row?.kind !== "array") return null;
    if (row.items.some((x) => x.t !== "p")) return null;
    rows.push(row.items);
  }
  // A ragged list of short lists (e.g. result triplets) still reads fine as a grid.
  return rows;
}

function isAdjacency(heap: Step["heap"], o: HeapObj): boolean {
  const lists: Value[] =
    o.kind === "array" ? o.items : o.kind === "map" ? o.entries.map((e) => e[1]) : o.kind === "object" ? Object.values(o.fields) : [];
  if (lists.length === 0) return false;
  return lists.every((v) => {
    const l = v.t === "r" ? heap[v.id] : undefined;
    return l?.kind === "array" || l?.kind === "set";
  });
}
