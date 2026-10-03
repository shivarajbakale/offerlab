import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { knob } from "../../system-design/traffic/index.ts";
import { parseProblem } from "../src/parseProblem.ts";
import { parseInline, trafficLocate, type PlayLink } from "../src/sim/lesson.ts";
import { designDiff, dotsAt, faultTargets, fromSlider, journeyLines, layout, previousDesign, series, stages, toSlider } from "../src/traffic/model.ts";
import { runTrafficSource } from "../src/traffic/run.ts";

const PATH = "system-design/architectures/01-scale-a-web-app.ts";
const source = readFileSync(join(import.meta.dirname, "../..", PATH), "utf8");
const trace = runTrafficSource(source);

test("an architecture file parses as a traffic problem in the Architectures group", () => {
  const p = parseProblem(PATH, source);
  assert.equal(p.engine, "traffic");
  assert.equal(p.track, "systems");
  assert.equal(p.id, "sd-architectures/01-scale-a-web-app");
  assert.equal(p.categoryLabel, "Architectures");
  assert.equal(p.title, "Scale a Web App");
  const shown = p.lines.slice(p.codeStart - 1, p.codeEnd).join("\n");
  assert.ok(shown.includes("export const writeHeavy") && !shown.includes("test("), "the code panel shows every design and no scenarios");
});

test("every scenario runs, is labelled, and passes", () => {
  assert.equal(trace.error, undefined);
  assert.ok(trace.runs.length >= 11);
  for (const r of trace.runs) assert.equal(r.passed, true, r.label);
  assert.ok(trace.runs.some((r) => r.label === "one machine: latency bends upward as the CPUs fill (#3)"));
});

test("an override re-runs only one scenario with new knobs", () => {
  const i = trace.runs.findIndex((r) => r.label.startsWith("load balancer: three"));
  const one = runTrafficSource(source, { run: i, knobs: { qps: 2000 }, only: true });
  assert.equal(one.runs.length, 1);
  assert.equal(one.runs[0].knobs.qps, 2000);
  assert.equal(one.runs[0].passed, null);
});

test("layout puts components in columns by hops from the users", () => {
  const r = trace.runs.find((x) => x.design.name.startsWith("3. Load"))!;
  const pos = layout(r.design);
  assert.deepEqual([pos.users.col, pos.lb.col, pos.app.col, pos.sessions.col, pos.db.col], [0, 1, 2, 3, 3]);
  assert.deepEqual([pos.sessions.row, pos.db.row], [0, 1]);
});

test("stages and what each one added", () => {
  assert.deepEqual(stages(trace.runs), [1, 2, 3, 4, 5, 6, 7, 8]);
  const s2 = trace.runs.find((x) => x.design.name.startsWith("2."))!;
  const s3 = trace.runs.find((x) => x.design.name.startsWith("3. Load"))!;
  assert.deepEqual(designDiff(previousDesign(trace.runs, s2), s2.design), { db: "changed" });
  assert.deepEqual(designDiff(previousDesign(trace.runs, s3), s3.design), { lb: "new", app: "changed", sessions: "new" });
});

test("tracked requests: where they are and what happened to them", () => {
  const r = trace.runs[0];
  const j = r.journeys.find((x) => x.outcome === "ok" && x.hops.length === 2)!;
  assert.deepEqual(dotsAt([j], j.sent + 5), [{ id: j.id, station: "app", moving: true, outcome: "ok" }]);
  assert.deepEqual(dotsAt([j], j.hops[1].arrive + 0.01).map((d) => d.station), ["db"]);
  assert.deepEqual(dotsAt([j], j.end + 1), []);
  const lines = journeyLines(j);
  assert.match(lines[1], /^app: waited .* for a worker/);
  assert.match(lines.at(-1)!, /^Answered after/);
});

test("knob sliders: log ranges spread by factor and round to 2 digits", () => {
  const k = knob("qps", 200, [10, 1_000_000]);
  assert.equal(fromSlider(k, 0), 10);
  assert.equal(fromSlider(k, 1000), 1_000_000);
  assert.equal(fromSlider(k, toSlider(k, 200)), 200);
  assert.equal(fromSlider(k, 500), 3200);
  const apps = knob("apps", 3, [1, 20]);
  assert.equal(fromSlider(apps, toSlider(apps, 7)), 7);
});

test("chart series are per second and smoothed", () => {
  const r = trace.runs[0];
  const s = series(r);
  assert.equal(s.sent.length, r.frames.length);
  assert.ok(Math.abs(s.sent.at(-1)! - 200) < 60);
  assert.ok(s.errors.every((e) => e === 0));
});

test("traffic play links: @t= in seconds, &req= a tracked request", () => {
  const [paren] = parseInline("see [x](play:cache: the 1,500 (#2)@t=10) now").filter((x) => x.kind === "play") as PlayLink[];
  assert.deepEqual({ scenario: paren.scenario, t: paren.t }, { scenario: "cache: the 1,500 (#2)", t: 10 });
  const [link] = parseInline("[x](play:one machine: 200@t=10&req=0)") as PlayLink[];
  assert.deepEqual({ t: link.t, req: link.req }, { t: 10, req: 0 });
  const r = trace.runs[0];
  const asRun = { label: r.label, steps: r.frames, journeys: r.journeys };
  assert.equal(trafficLocate(asRun, link), 99);
  assert.match(String(trafficLocate(asRun, { ...link, t: 99 })), /only 30 s long/);
  assert.match(String(trafficLocate(asRun, { ...link, req: 7 })), /not one of the tracked/);
});

test("chaos targets use the engine's machine names, shards included", () => {
  const url = runTrafficSource(readFileSync(join(import.meta.dirname, "../../system-design/architectures/02-url-shortener.ts"), "utf8"));
  const sharded = url.runs.find((r) => r.design.components.some((c) => (c.shards ?? 1) > 1))!;
  const names = faultTargets(sharded.design);
  assert.ok(names.includes("db-s1") && !names.includes("db-1"), names.join());
});

test("a request still waiting when the run ends is described as waiting", () => {
  assert.match(journeyLines({ id: 1, kind: "read", user: 1, sent: 0, end: -1, outcome: "pending", hops: [{ station: "app", at: "app", arrive: 1, start: -1, cpuStart: -1, cpuEnd: -1, end: -1, outcome: "ok" }] })[1], /still waiting/);
});

// --- per-kind table, breaker labels, regions, region faults ---

import { breaker, clients, design, external, run as simulate, server } from "../../system-design/traffic/index.ts";
import { backlogLabel, breakerLabel, faultLabel, kindRows, regionLabel } from "../src/traffic/model.ts";

test("a queue box shows the jobs it holds when some are not visible yet", () => {
  assert.equal(backlogLabel({ backlog: 150 }), "backlog 150");
  assert.equal(backlogLabel({ backlog: 150, backlogTotal: 150 }), "backlog 150");
  assert.equal(backlogLabel({ backlog: 150, backlogTotal: 1200 }), "1200 held · 150 ready");
  assert.equal(backlogLabel({ backlog: 0, backlogTotal: 25_000 }), "25k held · 0 ready");
  assert.equal(backlogLabel({}), "backlog 0");
});

test("faults read as a few words, region faults included", () => {
  assert.equal(faultLabel({ at: 1, kind: "kill", target: "app-2" }), "kill app-2");
  assert.equal(faultLabel({ at: 1, kind: "killRegion", region: "us" }), "kill region us");
  assert.equal(faultLabel({ at: 1, kind: "restartRegion", region: "eu" }), "restart region eu");
  assert.equal(regionLabel(["us", "us", "eu"]), "us · eu");
  assert.equal(regionLabel(undefined), "");
});

test("the per-kind table: shown only for designs that send more than one kind", () => {
  const readsOnly = simulate(design("reads", { users: clients({ to: "app", qps: 50, mix: { read: 1, write: 0 } }), app: server({ serviceMs: { read: 1, write: 1 } }) }), { seconds: 2 });
  assert.deepEqual(kindRows(readsOnly, 10), []);
  assert.deepEqual(kindRows(trace.runs[0], 50).map((r) => r.kind), ["read", "write"]);
  const mixed = simulate(
    design("kinds", {
      users: clients({ to: "app", qps: 200, mix: { read: 0.8, write: 0.2 }, hopMs: 0, timeoutMs: { write: 30 } }),
      app: server({ cores: 8, hopMs: 0, serviceMs: { read: 2, write: 40 } }),
    }),
    { seconds: 6 },
  );
  const rows = kindRows(mixed, 40);
  assert.deepEqual(rows.map((r) => r.kind), ["read", "write"]);
  const [read, write] = rows;
  assert.ok(Math.abs(read.rate + write.rate - 200) < 60, `${read.rate} + ${write.rate}`);
  assert.ok(read.p99 < 30 && read.errorRate === 0, `read p99 ${read.p99}`);
  assert.ok(write.errorRate > 0.5, `writes time out at 30 ms: ${write.errorRate}`);
});

test("a breaker's state shows on its link while it is not closed", () => {
  const r = simulate(
    design("breaker", {
      users: clients({ to: "app", qps: 200, hopMs: 0 }),
      app: server({ cores: 8, hopMs: 0, serviceMs: { read: 1, write: 1 }, calls: [breaker("payments", { windowMs: 500, openMs: 2000 })] }),
      payments: external({ label: "Payments", latencyMs: 20, hopMs: 0 }),
    }),
    { seconds: 6, faults: [{ at: 2000, kind: "kill", target: "payments" }] },
  );
  const at = (t: number) => r.frames.find((f) => f.t === t)!;
  assert.equal(breakerLabel(at(1500), "app", "payments"), "");
  assert.equal(breakerLabel(at(3000), "app", "payments"), "breaker open");
  assert.equal(breakerLabel(at(3000), "app", "nowhere"), "");
});
