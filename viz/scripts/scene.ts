// Debug: print narration + scene summary per step.  node scripts/scene.ts <file> [run] [maxSteps]
import { readFileSync } from "node:fs";
import { traceSource } from "../src/tracer/trace.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import { narrate } from "../src/model/narrate.ts";
const src = readFileSync(process.argv[2], "utf8");
const lines = src.split("\n");
const hints = parseHints(src);
const run = traceSource(src).runs[Number(process.argv[3] ?? 0)];
console.log("RUN", run.label);
const steps = run.steps;
for (let k = 0; k < Math.min(steps.length, Number(process.argv[4] ?? 25)); k++) {
  const state = steps[k + 1] ?? steps[k];
  const scene = buildScene(state, steps[k], hints);
  const n = narrate(steps, k, lines, hints);
  console.log(`#${k} L${steps[k].line} ${steps[k].event}: ${n.text}`);
  for (const p of scene.panels) {
    const extra = p.kind === "array" ? `[${p.cells.map((c) => c.text + (c.changed ? "*" : "")).join(" ")}] ptr=${p.pointers.map((q) => q.name + "@" + q.index).join(",")} win=${p.window ?? ""}`
      : p.kind === "grid" ? `${p.rows.length}x${p.rows[0]?.length} cursor=${JSON.stringify(p.cursor)}`
      : p.kind === "tree" ? `root=${p.root.label}`
      : p.kind === "list" ? p.nodes.map((x) => x.label + (x.names.length ? "(" + x.names.map((q) => q.name).join("/") + ")" : "")).join("->") + (p.cycleTo !== undefined ? " cycle@" + p.cycleTo : "")
      : p.kind === "map" ? p.rows.map((r) => r.k.text + ":" + r.v.text).join(" ")
      : p.kind === "set" ? p.items.map((i) => i.text).join(" ")
      : p.kind === "graph" ? `nodes=${p.nodes.length} edges=${p.edges.length} visited=${p.nodes.filter((x) => x.visited).length}`
      : p.kind === "trie" ? `trie` : p.kind === "object" ? p.className : "";
    console.log(`    ${p.kind} ${p.name}: ${extra}`);
  }
  console.log(`    scalars: ${scene.scalars.map((s) => s.name + "=" + s.text + (s.changed ? "*" : "")).join(" ")}  frames: ${scene.frames.map((f) => f.fn).join(">")}`);
}
