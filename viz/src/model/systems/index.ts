// Runs the builder for each `@viz <kind>:` hint and collects the panels and the heap ids they drew.

import type { HeapId, Step, Value } from "../../tracer/types.ts";
import type { Hints } from "../hints.ts";
import { buildBalancer, type BalancerPanel } from "./balancer.ts";
import { buildBits, type BitsPanel } from "./bits.ts";
import { buildGate, type GatePanel } from "./gate.ts";
import { buildLevels, type LevelsPanel } from "./levels.ts";
import { buildPages, type PagesPanel } from "./pages.ts";
import { buildRing, type RingPanel } from "./ring.ts";
import { buildSpatial, type SpatialPanel } from "./spatial.ts";
import { buildTimeline, type TimelinePanel } from "./timeline.ts";
import type { Builder, SystemsCtx, SystemsKind } from "./types.ts";

export type SystemsPanel = RingPanel | SpatialPanel | BitsPanel | LevelsPanel | PagesPanel | TimelinePanel | BalancerPanel | GatePanel;
/** Scene variables, as collected by buildScene: `this` fields are flattened in. */
export type SceneVar = { name: string; v: Value; frame: number; inner: boolean; field?: boolean };
export type Builders = Partial<Record<SystemsKind, Builder<SystemsPanel>>>;

export const BUILDERS: Builders = {
  ring: buildRing,
  spatial: buildSpatial,
  bits: buildBits,
  levels: buildLevels,
  pages: buildPages,
  timeline: buildTimeline,
  balancer: buildBalancer,
  gate: buildGate,
};

/** A variable by name (innermost frame first), then through object fields or array indexes. */
export function findVar(step: Step, vars: SceneVar[], path: string): Value | undefined {
  const [head, ...rest] = path.split(".");
  let v: Value | undefined;
  for (let i = vars.length - 1; i >= 0; i--) {
    if (vars[i].name === head) {
      v = vars[i].v;
      break;
    }
  }
  for (const seg of rest) {
    const o = v?.t === "r" ? step.heap[v.id] : undefined;
    if (o?.kind === "object") v = o.fields[seg];
    else if (o?.kind === "array" && /^\d+$/.test(seg)) v = o.items[Number(seg)];
    else return undefined;
  }
  return v;
}

/** Plain JS copy of a recorded value. Objects carry `__class` and `__id`; stops at depth 12. */
export function toJs(step: Step, v: Value | undefined, depth = 0): unknown {
  if (!v || depth > 12) return undefined;
  if (v.t === "p") return v.v;
  if (v.t === "f") return `ƒ ${v.name}`;
  const o = step.heap[v.id];
  if (!o) return undefined;
  const sub = (x: Value) => toJs(step, x, depth + 1);
  switch (o.kind) {
    case "array":
      return o.items.map(sub);
    case "map":
      return new Map(o.entries.map(([k, x]) => [sub(k), sub(x)]));
    case "set":
      return new Set(o.items.map(sub));
    case "object": {
      const out: Record<string, unknown> = { __class: o.className, __id: v.id };
      for (const [k, x] of Object.entries(o.fields)) out[k] = sub(x);
      return out;
    }
  }
}

/** A step's variables, collected the way buildScene collects them (`this` fields flattened in). */
export function sceneVars(step: Step): SceneVar[] {
  const vars: SceneVar[] = [];
  const inner = step.stack.length - 1;
  step.stack.forEach((f, fi) => {
    for (const [name, v] of f.vars) {
      if (name !== "this") {
        vars.push({ name, v, frame: fi, inner: fi === inner });
        continue;
      }
      const self = v.t === "r" ? step.heap[v.id] : undefined;
      if (self?.kind === "object") {
        for (const [field, fv] of Object.entries(self.fields)) vars.push({ name: field, v: fv, frame: fi, inner: fi === inner, field: true });
      }
    }
  });
  return vars;
}

export function buildSystemsPanels(
  step: Step,
  prev: Step | undefined,
  hints: Hints,
  vars: SceneVar[],
  builders: Builders = BUILDERS,
): { panels: SystemsPanel[]; uses: Set<HeapId> } {
  const panels: SystemsPanel[] = [];
  const uses = new Set<HeapId>();
  if (hints.systems.length === 0) return { panels, uses };
  const prevVars = prev ? sceneVars(prev) : [];
  // The app draws the state after a line ran (step) with that line's step as `prev`.
  const ran = prev?.line ?? step.line;
  const mark = Object.entries(hints.marks).find(([, line]) => line === ran)?.[0];
  for (const hint of hints.systems) {
    const build = builders[hint.kind];
    if (!build) continue;
    const ctx: SystemsCtx = {
      step,
      prev,
      args: hint.args,
      find: (name) => findVar(step, vars, name),
      findPrev: (name) => (prev ? findVar(prev, prevVars, name) : undefined),
      js: (v) => toJs(step, v),
      jsPrev: (v) => (prev ? toJs(prev, v) : undefined),
      ...(mark ? { mark } : {}),
      ran,
      markLine: (name) => hints.marks[name],
    };
    const built = build(ctx);
    if (!built) continue;
    panels.push(built.panel);
    for (const id of built.uses) uses.add(id);
  }
  return { panels, uses };
}
