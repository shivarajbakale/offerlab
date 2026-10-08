// The architecture canvas explains itself: every box in every case study has a job, a "without
// it" and a frontend comparison; numbers come with sentences; a traced request's waterfall adds up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { guideFor, linkNoun, metricWords, waterfall } from "../src/traffic/explain.ts";
import { runTrafficSource } from "../src/traffic/run.ts";

const dir = join(import.meta.dirname, "../../system-design/architectures");
const source = readFileSync(join(dir, "02-url-shortener.ts"), "utf8");
const trace = runTrafficSource(source);

test("design explain: every box in the URL shortener has a job, a without-it and a frontend comparison", () => {
  const run = trace.runs.at(-1)!;
  for (const c of run.design.components) {
    const g = guideFor(c, run.design);
    assert.ok(g.tagline.length > 0 && g.tagline.length <= 34, `${c.id} tagline "${g.tagline}"`);
    assert.ok(g.job.length > 20 && g.without.length > 10 && g.frontend.length > 10, c.id);
  }
});

test("design explain: each number has a sentence and a tone, and links say what flows", () => {
  const run = trace.runs[0];
  const frame = run.frames[30];
  for (const c of run.design.components) {
    for (const m of metricWords(c, frame)) {
      assert.ok(m.says.length > 15, `${c.id} ${m.name}`);
      assert.ok(["ok", "warn", "bad", "info"].includes(m.tone));
    }
  }
  const db = run.design.components.find((c) => c.role === "database")!;
  assert.equal(linkNoun(db), "queries");
});

test("design explain: a traced request's waterfall starts at 0, includes the internet, and ends at its total", () => {
  const run = trace.runs[0];
  const j = run.journeys.find((x) => x.outcome === "ok" && x.end > 0)!;
  const rows = waterfall(j, run.design);
  assert.equal(rows[0].label, "Internet");
  assert.equal(rows[0].start, 0);
  assert.ok(Math.abs(Math.max(...rows.map((r) => r.end)) - (j.end - j.sent)) < 0.01);
  for (const r of rows) for (const s of r.segments) assert.ok(s.to >= s.from && s.from >= 0, r.label);
});

test("design explain: every component role used by the case studies has its own words", () => {
  const roles = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/role: "(\w+)"/g)) roles.add(m[1]);
  }
  for (const role of [...roles, "app", "database", "cache", "cdn", "external", "store"]) {
    const c = { id: "x", type: "station", role, label: "X", targets: [], replicas: 2, cores: 4, threads: 50, queue: 100, costPerHour: 1 } as never;
    const g = guideFor(c, { name: "", components: [c], knobs: [] });
    assert.notEqual(g.job, "X", role);
  }
});
