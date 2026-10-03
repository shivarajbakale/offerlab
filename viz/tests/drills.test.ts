// Practice drills: the estimation grader and unit parser, Leitner boxes, the new content tracks'
// ids and sidebar order, and every drill file loading (and a failure drill playing) as the app does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { problemIds } from "../../system-design/drills/links.ts";
import { formatQuantity, grade, parseQuantity, readEstimate } from "../src/drills/grade.ts";
import { boxCounts, clearLeitner, dueOrder, loadLeitner, review, saveLeitner, type Leitner } from "../src/drills/leitner.ts";
import { loadDrillSource, runDrillSource } from "../src/drills/run.ts";
import { categoryRank, isPracticeCategory, parseProblem } from "../src/parseProblem.ts";
import { compareRows, playDrill, type FailureDrill } from "../../system-design/drills/index.ts";
import { clients, design, loadBalancer, server, viewOf } from "../../system-design/traffic/index.ts";
import { faultRegions } from "../src/traffic/model.ts";

const repo = join(import.meta.dirname, "../..");
const ts = (dir: string) => (existsSync(join(repo, dir)) ? readdirSync(join(repo, dir)).filter((f) => f.endsWith(".ts")) : []);
const drillFiles = ["estimation", "failure", "flashcards"].flatMap((k) => ts(`system-design/drills/${k}`).map((f) => `system-design/drills/${k}/${f}`));

test("parseQuantity: plain numbers, suffixes, byte units and exponents", () => {
  const cases: [string, number | null][] = [
    ["200", 200],
    ["1,500", 1500],
    ["2e9", 2e9],
    ["1.5k", 1500],
    ["3M", 3e6],
    ["3m", 3e6],
    ["4B", 4e9],
    ["4 G", 4e9],
    ["2T", 2e12],
    ["200TB", 200e12],
    ["200 tb", 200e12],
    ["1.5 PB", 1.5e15],
    ["900 GB", 900e9],
    ["64 KB", 64e3],
    ["1 KiB", 1024],
    ["1 GiB", 1024 ** 3],
    ["12 bytes", 12],
    ["3 million", 3e6],
    ["140k/s", 140e3],
    ["140k per second", 140e3],
    ["", null],
    ["abc", null],
    ["12 parsecs", null],
    ["1..2", null],
  ];
  for (const [text, want] of cases) assert.equal(parseQuantity(text), want, JSON.stringify(text));
});

test("formatQuantity: short and readable, bytes in decimal units", () => {
  assert.equal(formatQuantity(9e14, "bytes"), "900 TB");
  assert.equal(formatQuantity(1.2e15, "bytes"), "1.2 PB");
  assert.equal(formatQuantity(138_888.9), "139k");
  assert.equal(formatQuantity(4e9), "4B");
  assert.equal(formatQuantity(0.2), "0.2");
  assert.equal(formatQuantity(512, "bytes"), "512 bytes");
});

test("grade: within the tolerance factor either way; the message says how far and which way", () => {
  const ok = grade(300e12, 900e12, 3, "bytes");
  assert.deepEqual([ok.ok, ok.direction, ok.factor], [true, "low", 3]);
  assert.match(ok.message, /^Within x3: off by x3, a bit low/);
  const high = grade(12e6, 1e6, 3);
  assert.deepEqual([high.ok, high.direction], [false, "high"]);
  assert.match(high.message, /^Off by x12, too high \(12M against 1M\)/);
  const low = grade(1e3, 2.5e3, 2);
  assert.equal(low.ok, false);
  assert.match(low.message, /^Off by x2\.5, too low/);
  assert.match(grade(5, 5, 3).message, /^Spot on/);
});

test("Leitner: knew it moves a card up a box (at most 5); missed it sends it back to box 1", () => {
  let s: Leitner = {};
  s = review(s, "a", true, 1);
  s = review(s, "a", true, 2);
  assert.equal(s.a.box, 3);
  for (let i = 0; i < 5; i++) s = review(s, "a", true, 3 + i);
  assert.equal(s.a.box, 5);
  s = review(s, "a", false, 10);
  assert.deepEqual(s.a, { box: 1, seen: 10 });
});

test("Leitner: due order is lowest box first, then longest since seen, unseen first", () => {
  const s: Leitner = { a: { box: 2, seen: 5 }, b: { box: 1, seen: 9 }, c: { box: 1, seen: 3 } };
  assert.deepEqual(dueOrder(["a", "b", "c", "d"], s), ["d", "c", "b", "a"]);
  assert.deepEqual(boxCounts(["a", "b", "c", "d"], s), [3, 1, 0, 0, 0]);
  // A missed card goes to the back of box 1, behind cards not seen since.
  const after = review(s, "c", false, 20);
  assert.deepEqual(dueOrder(["a", "b", "c", "d"], after), ["d", "b", "c", "a"]);
});

test("Leitner storage: survives junk and missing or throwing storage", () => {
  const g = globalThis as { localStorage?: unknown };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const set = (v: unknown) => Object.defineProperty(globalThis, "localStorage", { value: v, configurable: true, writable: true });
  try {
    const store = new Map<string, string>();
    set({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    saveLeitner("deck", { x: { box: 4, seen: 7 } });
    assert.deepEqual(loadLeitner("deck"), { x: { box: 4, seen: 7 } });
    store.set("viz:leitner:deck", JSON.stringify({ x: { box: 9 }, y: { box: 2, seen: "?" }, z: null }));
    assert.deepEqual(loadLeitner("deck"), { y: { box: 2, seen: 0 } });
    store.set("viz:leitner:deck", "{not json");
    assert.deepEqual(loadLeitner("deck"), {});
    clearLeitner("deck");
    assert.equal(store.has("viz:leitner:deck"), false);
    set({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    assert.deepEqual(loadLeitner("deck"), {});
    saveLeitner("deck", {});
    clearLeitner("deck");
    set(undefined);
    assert.deepEqual(loadLeitner("deck"), {});
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete g.localStorage;
  }
});

test("the new tracks and drills parse with their ids, labels and engines", () => {
  const read = (p: string) => readFileSync(join(repo, p), "utf8");
  const ms = parseProblem("system-design/microservices/01-the-price-of-a-network-hop.ts", read("system-design/microservices/01-the-price-of-a-network-hop.ts"));
  assert.deepEqual([ms.id, ms.categoryLabel, ms.engine, ms.track, ms.title], ["sd-microservices/01-the-price-of-a-network-hop", "Microservices", "traffic", "systems", "The Price of a Network Hop"]);
  const lld = parseProblem("system-design/low-level-design/01-parking-lot.ts", read("system-design/low-level-design/01-parking-lot.ts"));
  assert.deepEqual([lld.id, lld.categoryLabel, lld.engine, lld.title], ["sd-low-level-design/01-parking-lot", "Low-Level Design", "tracer", "Parking Lot"]);
  const shown = lld.lines.slice(lld.codeStart - 1, lld.codeEnd).join("\n");
  assert.ok(shown.includes("class FindThenClaimLot") && !shown.includes("test("), "the code panel runs on to the broken classes");
  const api = parseProblem("system-design/api-design/01-cursor-pagination.ts", read("system-design/api-design/01-cursor-pagination.ts"));
  assert.deepEqual([api.id, api.categoryLabel, api.engine], ["sd-api-design/01-cursor-pagination", "API & Data Modeling", "tracer"]);
  const est = parseProblem("system-design/drills/estimation/01-photo-storage-per-day.ts", read("system-design/drills/estimation/01-photo-storage-per-day.ts"));
  assert.deepEqual([est.id, est.category, est.categoryLabel, est.engine, est.drill, est.title], [
    "sd-drills-estimation/01-photo-storage-per-day",
    "sd-drills-estimation",
    "Estimation Drills",
    "drill",
    "estimation",
    "Photo Storage per Day",
  ]);
  const fd = parseProblem("system-design/drills/failure/02-retry-storm.ts", read("system-design/drills/failure/02-retry-storm.ts"));
  assert.deepEqual([fd.categoryLabel, fd.engine, fd.drill], ["Failure Drills", "drill", "failure"]);
  const fc = parseProblem("system-design/drills/flashcards/01-latency-numbers.ts", read("system-design/drills/flashcards/01-latency-numbers.ts"));
  assert.deepEqual([fc.categoryLabel, fc.drill], ["Flashcards", "flashcards"]);
});

test("sidebar order: primitives, architectures, the three tracks, then practice", () => {
  const order = ["sd-drills-flashcards", "sd-api-design", "sd-03-storage", "sd-drills-estimation", "sd-microservices", "sd-architectures", "sd-low-level-design", "sd-drills-failure", "sd-01-partitioning"];
  const sorted = [...order].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
  assert.deepEqual(sorted, [
    "sd-01-partitioning",
    "sd-03-storage",
    "sd-architectures",
    "sd-microservices",
    "sd-low-level-design",
    "sd-api-design",
    "sd-drills-estimation",
    "sd-drills-failure",
    "sd-drills-flashcards",
  ]);
  assert.deepEqual(sorted.filter(isPracticeCategory), ["sd-drills-estimation", "sd-drills-failure", "sd-drills-flashcards"]);
});

test("links.ts names problems exactly as the visualizer does", () => {
  const ids = new Set<string>();
  const add = (path: string) => ids.add(parseProblem(path, readFileSync(join(repo, path), "utf8")).id);
  for (const d of readdirSync(join(repo, "neetcode-150")).filter((x) => !x.includes("."))) for (const f of ts(`neetcode-150/${d}`)) add(`neetcode-150/${d}/${f}`);
  for (const d of readdirSync(join(repo, "system-design/primitives")).filter((x) => !x.includes("."))) for (const f of ts(`system-design/primitives/${d}`)) add(`system-design/primitives/${d}/${f}`);
  for (const t of ["architectures", "microservices", "low-level-design", "api-design"]) for (const f of ts(`system-design/${t}`)) add(`system-design/${t}/${f}`);
  for (const f of drillFiles) add(f);
  assert.deepEqual([...problemIds()].sort(), [...ids].sort());
});

for (const file of drillFiles) {
  test(`drill loads and plays: ${file}`, () => {
    const source = readFileSync(join(repo, file), "utf8");
    const p = parseProblem(file, source);
    assert.equal(p.engine, "drill");
    assert.ok(p.title && p.level, "needs a `NN. Title` line and a Level: in the header");
    const result = runDrillSource(source);
    assert.ok(!("error" in result), "error" in result ? result.error : "");
    assert.equal(result.drill.kind, p.drill === "flashcards" ? "flashcards" : p.drill, "the folder matches the builder used");
    if (result.drill.kind === "failure") {
      assert.ok(result.play, "a failure drill plays its run and the fix");
      for (const r of [result.play.broken, result.play.fixed]) {
        assert.equal(r.error, undefined);
        assert.equal(r.truncated, false);
        assert.equal(r.frames.length, result.drill.seconds * 10);
      }
      // The run must survive the trip from the worker to the page.
      assert.doesNotThrow(() => structuredClone(result));
    } else {
      assert.equal("play" in result, false);
    }
  });
}

test("a drill file without a drill export is reported, not crashed on", () => {
  const r = loadDrillSource('export const nothing = 1;');
  assert.ok("error" in r && /must export `drill`/.test(r.error));
  const bad = loadDrillSource('import { estimation } from "../index.ts";\nexport const drill = estimation({ title: "x", prompt: "", assumptions: [], steps: [], answer: { value: 1, unit: "" }, tolerance: 3, takeaways: ["t"] });');
  assert.ok("error" in bad && /needs at least one step/.test(bad.error));
});

test("readEstimate: the drill's own unit, its words, $ and bit rates are accepted", () => {
  const cases: [string, string, number][] = [
    ["50000 Gbps", "Gbps", 50000],
    ["50k Gbps", "Gbps", 50000],
    ["50 Tbps", "Gbps", 50000],
    ["500 Mbps", "Gbps", 0.5],
    ["158 servers", "servers", 158],
    ["80 shards", "shards", 80],
    ["12 partitions", "partitions", 12],
    ["3 replicas", "replicas", 3],
    ["250k updates/s", "updates/s", 250e3],
    ["250k updates per second", "updates/s", 250e3],
    ["140k requests/s", "requests/s", 140e3],
    ["$165k", "$/month", 165e3],
    ["$165k/month", "$/month", 165e3],
    ["165k $/month", "$/month", 165e3],
    ["35 min", "min/year", 35],
    ["35 min/year", "min/year", 35],
    ["35 minutes", "min/year", 35],
    ["35", "min/year", 35],
    ["35M", "min/year", 35e6],
    ["200TB", "bytes", 200e12],
  ];
  for (const [text, unit, want] of cases) {
    const r = readEstimate(text, unit);
    assert.ok("value" in r, `${JSON.stringify(text)} in ${unit}: ${"error" in r ? r.error : ""}`);
    assert.ok(Math.abs(r.value - want) <= 1e-9 * want, `${JSON.stringify(text)} in ${unit}: ${r.value}`);
  }
  // Words that are not the drill's unit are still refused.
  assert.ok("error" in readEstimate("158 parsecs", "servers"));
  assert.ok("error" in readEstimate("12 parsecs", ""));
});

test("readEstimate: a lone m in a time unit is ambiguous, not a million", () => {
  const r = readEstimate("35m", "min/year");
  assert.ok("error" in r && /ambiguous/.test(r.error), JSON.stringify(r));
  // Outside a time unit "m" is still million, as before.
  assert.deepEqual(readEstimate("3m", "requests/s"), { value: 3e6 });
  assert.equal(parseQuantity("35m", "min/year"), null);
});

test("failure drills show their neutral title, not the cause in the file header", () => {
  for (const file of drillFiles.filter((f) => f.includes("/failure/"))) {
    const source = readFileSync(join(repo, file), "utf8");
    const p = parseProblem(file, source);
    const r = loadDrillSource(source);
    assert.ok(!("error" in r));
    assert.equal(p.title, r.drill.title, file);
    assert.ok(p.answerTitle && p.answerTitle !== p.title, `${file}: the cause-named title is kept for after the answer`);
  }
  const fd = parseProblem("system-design/drills/failure/02-retry-storm.ts", readFileSync(join(repo, "system-design/drills/failure/02-retry-storm.ts"), "utf8"));
  assert.deepEqual([fd.title, fd.answerTitle], ["A short hiccup, a long outage", "Retry Storm"]);
});

// Loaded as the app loads them, so the drill files' own tests do not run again here.
const failureDrillAt = (slug: string) => {
  const r = loadDrillSource(readFileSync(join(repo, `system-design/drills/failure/${slug}.ts`), "utf8"));
  if ("error" in r) throw new Error(r.error);
  return r.drill as FailureDrill;
};
const row = (rows: ReturnType<typeof compareRows>["rows"], metric: string) => rows.find((r) => r.metric === metric);

test("compareRows: a drill with no faults compares from 1 s, not an empty window", () => {
  const d = failureDrillAt("05-one-hot-shard");
  const c = compareRows(d, playDrill(d));
  assert.equal(c.from, 1);
  const err = row(c.rows, "errorRate")!;
  assert.ok(err.broken > 0.2 && err.fixed < 0.01, JSON.stringify(err));
  const p99 = row(c.rows, "p99")!;
  assert.ok(p99.broken > 500 && p99.fixed > 0 && p99.fixed < 200, JSON.stringify(p99));
  const d2 = failureDrillAt("02-retry-storm");
  assert.equal(compareRows(d2, playDrill(d2)).from, 4);
});

test("compareRows: the rows include the drill's real symptom", () => {
  const stale = failureDrillAt("06-saved-but-not-shown");
  const s = row(compareRows(stale, playDrill(stale)).rows, "staleOwnRate");
  assert.ok(s && s.broken === 1 && s.fixed === 0, JSON.stringify(s));
  // The rate limit refuses the heavy users on purpose, so overall errors go up; the rows split by class.
  const abuse = failureDrillAt("11-ten-users-slow-everyone");
  const rows = compareRows(abuse, playDrill(abuse)).rows;
  assert.equal(row(rows, "errorRate"), undefined);
  const normal = row(rows, "normal.errorRate")!;
  assert.ok(normal.broken > 0.05 && normal.fixed === 0, JSON.stringify(normal));
  assert.ok(row(rows, "normal.p99")!.fixed < 75);
  assert.ok(row(rows, "heavy.errorRate"));
  // Rows nobody moved (no retries at all) are left out.
  assert.equal(row(rows, "retries"), undefined);
  // Checkouts took page views down; the fix isolates them, so the rows split by request kind.
  const bulkhead = failureDrillAt("12-checkout-takes-the-catalog-down");
  const kinds = compareRows(bulkhead, playDrill(bulkhead)).rows;
  const reads = row(kinds, "read.errorRate")!;
  assert.ok(reads.broken > 0.5 && reads.fixed === 0, JSON.stringify(reads));
  assert.ok(row(kinds, "write.errorRate"));
  // A fix that helps every kind keeps the overall rows.
  const stampede = failureDrillAt("01-cache-restart-stampede");
  assert.deepEqual(compareRows(stampede, playDrill(stampede)).rows.map((r) => r.metric), ["errorRate", "p99"]);
  // A backlog drill shows the jobs still queued.
  const backlog = failureDrillAt("08-the-backlog-that-never-drains");
  const q = row(compareRows(backlog, playDrill(backlog)).rows, "backlog")!;
  assert.ok(q.broken > 500 && q.fixed === 0, JSON.stringify(q));
});

test("compareRows: a drill may name its rows", () => {
  const d = failureDrillAt("06-saved-but-not-shown");
  const c = compareRows({ ...d, compare: ["staleOwnRate", "p99"] }, playDrill(d));
  assert.deepEqual(c.rows.map((r) => r.metric), ["staleOwnRate", "p99"]);
});

test("faultRegions: only regions some server is placed in, not where users live", () => {
  const d = design("one", {
    users: clients({ to: "lb", qps: 100, regions: { us: 0.6, eu: 0.4 } }),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 2, region: "us", serviceMs: { read: 5, write: 5 } }),
  });
  assert.deepEqual(viewOf(d).regions, ["us", "eu"]);
  assert.deepEqual(faultRegions(viewOf(d)), ["us"]);
});

test("the drill loader resolves only the modules drills import", () => {
  const r = loadDrillSource('import { x } from "../../kernel/index.ts";\nexport const drill = x;');
  assert.ok("error" in r && /not available/.test(r.error), JSON.stringify(r));
});
