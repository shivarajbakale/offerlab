// Traffic blocks (012–016): at the moments the lessons link to, the gate picture and its caption
// say in plain words what just happened to a request, and why it matters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captionAt } from "../src/model/caption.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import type { GatePanel } from "../src/model/systems/gate.ts";
import type { Caption } from "../src/model/systems/types.ts";
import { findRun, markStep } from "../src/sim/lesson.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const root = join(import.meta.dirname, "../../system-design/primitives/04-traffic");
const WINDOWS = "013-window-rate-limiters";
const RETRY = "015-retry-backoff-jitter";
const BREAKER = "016-circuit-breaker";

const loaded = new Map<string, { hints: ReturnType<typeof parseHints>; trace: ReturnType<typeof traceSource> }>();
function load(file: string) {
  if (!loaded.has(file)) {
    const src = readFileSync(join(root, `${file}.ts`), "utf8");
    loaded.set(file, { hints: parseHints(src), trace: traceSource(src, SYSTEMS_LIMITS, { scenarios: true }) });
  }
  return loaded.get(file)!;
}

/** The caption and the gate panel at a play link's moment (`scenario@at=mark#nth`). */
function at(file: string, scenario: string, mark: string, nth = 1): { caption: Caption; gate: GatePanel } {
  const { hints, trace } = load(file);
  const i = findRun(trace.runs, scenario);
  assert.ok(i >= 0, `no scenario ${scenario}`);
  const steps = trace.runs[i].steps;
  const k = markStep(steps, hints.marks[mark], nth);
  assert.ok(k >= 0, `${mark}#${nth} not reached`);
  const caption = captionAt(steps, k, hints);
  assert.ok(caption, `no caption at ${mark}#${nth}`);
  const scene = buildScene(steps[k + 1] ?? steps[k], steps[k], hints);
  const gate = scene.panels.find((p) => p.kind === "gate") as GatePanel | undefined;
  assert.ok(gate, `no gate at ${mark}#${nth}`);
  return { caption, gate };
}

test("traffic lessons: every block has the plain-words and when-to-use sections, in place", () => {
  for (const f of ["012-token-and-leaky-bucket", WINDOWS, "014-load-balancing", RETRY, BREAKER]) {
    const md = readFileSync(join(root, `${f}.lesson.md`), "utf8");
    const what = md.indexOf("## What it is");
    const plain = md.indexOf("## In plain words");
    const when = md.indexOf("## When to use which");
    const deep = md.indexOf("## Deep dive");
    assert.ok(what >= 0 && plain > what && md.indexOf("\n## ", what + 5) === plain - 1, `${f}: plain words right after What it is`);
    assert.ok(when > plain && md.indexOf("\n## ", when + 5) === deep - 1, `${f}: when to use which right before Deep dive`);
    assert.match(md.slice(plain, md.indexOf("\n## ", plain + 5)), /In the picture on the right/);
  }
});

test("fixed window: the boundary reset is called out as forgetting a full window", () => {
  const reset = at(WINDOWS, "broken: fixed window", "reset", 2);
  assert.equal(reset.caption.tone, "bad");
  assert.match(reset.caption.text, /forgets that 5 requests were accepted in the last 1s/);
  const tenth = at(WINDOWS, "broken: fixed window", "count", 10);
  assert.equal(tenth.caption.tone, "bad");
  assert.match(tenth.caption.text, /10 requests have now been accepted since t=0.9/);
  assert.equal(tenth.gate.title, "Fixed window");
  assert.equal(tenth.gate.state, "window 1–2");
  assert.deepEqual(tenth.gate.meter, { level: 5, max: 5, unit: "request" });
  assert.equal(tenth.gate.counts.passed, 10);
});

test("sliding log: a rejection names the stored times, and an eviction frees a slot", () => {
  const rej = at(WINDOWS, "sliding log", "logReject");
  assert.match(rej.caption.text, /already holds 5 requests from the last 1s/);
  assert.match(rej.caption.text, /at t=1.9\./);
  assert.equal(rej.gate.title, "Sliding log");
  assert.equal(rej.gate.latest?.outcome, "refused");
  const rec = at(WINDOWS, "sliding log", "record", 6);
  assert.equal(rec.caption.tone, "good");
  assert.match(rec.caption.text, /\[0.92, 0.94, 0.96, 0.98, 1.91\]/);
});

test("sliding counter: the estimate is shown as a sum, and its error is called out", () => {
  const roll = at(WINDOWS, "sliding counter", "roll", 2);
  assert.match(roll.caption.text, /previous window's 5 accepted requests are kept/);
  assert.equal(roll.gate.title, "Sliding counter");
  const block = at(WINDOWS, "sliding counter", "block");
  assert.equal(block.caption.tone, "good");
  assert.match(block.caption.text, /estimate 5 is not under 5/);
  const admit = at(WINDOWS, "sliding counter", "admit", 6);
  assert.equal(admit.caption.tone, "bad");
  assert.match(admit.caption.text, /6 requests have really been accepted/);
  assert.match(at(WINDOWS, "sliding counter", "estimate", 11).caption.text, /5 previous × 0.5 \+ 1 in this window = 3.5/);
});

test("retries: the storm, the waves and the cure each read as a story", () => {
  const storm = at(RETRY, "broken: immediate retries", "overload", 2);
  assert.equal(storm.caption.tone, "bad");
  assert.match(storm.caption.text, /nothing but retries/);
  assert.deepEqual(storm.gate.server, { load: 8, cap: 4 });
  assert.equal(storm.gate.clients?.length, 8);
  assert.equal(storm.gate.state, "immediate");
  const end = at(RETRY, "broken: immediate retries", "giveUp", 8);
  assert.match(end.caption.text, /not one was served/);
  const waves = at(RETRY, "broken: backoff without jitter", "overload", 5);
  assert.match(waves.caption.text, /At t=30, 8 requests/);
  assert.match(waves.caption.text, /came back in the same tick/);
  const roll = at(RETRY, "full jitter", "jitter", 2);
  assert.match(roll.caption.text, /c1 rolls a random wait from 1 to 2 ticks and gets 2/);
  const done = at(RETRY, "full jitter", "served", 8);
  assert.equal(done.caption.tone, "good");
  assert.match(done.caption.text, /All 8 clients have now been served/);
  assert.ok(done.gate.clients?.every((c) => c.last?.outcome === "passed"));
});

test("retries: backoff doubles, the restarting server is drawn down, and the cap gives up", () => {
  const down = at(RETRY, "backoff", "down");
  assert.match(down.caption.text, /still restarting until t=20/);
  assert.equal(down.gate.server?.downUntil, 20);
  assert.match(at(RETRY, "backoff", "ceiling", 3).caption.text, /2\^3 = 8 ticks/);
  const served = at(RETRY, "backoff", "served");
  assert.match(served.caption.text, /attempt 5/);
  assert.equal(served.gate.server?.downUntil, undefined, "the server is back up");
  const cap = at(RETRY, "retry cap", "giveUp");
  assert.equal(cap.caption.tone, "bad");
  assert.match(cap.caption.text, /4 attempts is its limit/);
});

test("circuit breaker: the gate shows the breaker's state and its failure count", () => {
  const blip = at(BREAKER, "closed", "fail", 2);
  assert.match(blip.caption.text, /2 failures in a row, under the threshold of 3/);
  assert.equal(blip.gate.state, "closed");
  const open = at(BREAKER, "open", "open");
  assert.equal(open.caption.tone, "bad");
  assert.match(open.caption.text, /At t=3 the breaker opens. Until t=8/);
  assert.deepEqual(open.gate.meter, { level: 3, max: 3, unit: "failure" });
  const fast = at(BREAKER, "open", "fastFail");
  assert.equal(fast.caption.tone, "good");
  assert.match(fast.caption.text, /in 0 ms, without touching the service/);
  assert.equal(fast.gate.state, "open");
  assert.equal(fast.gate.latest?.outcome, "refused");
});

test("circuit breaker: half-open sends one trial, and its answer decides", () => {
  assert.match(at(BREAKER, "half-open", "trial").caption.text, /is the trial/);
  const second = at(BREAKER, "half-open", "fastFail");
  assert.match(second.caption.text, /A trial call is already out/);
  assert.equal(second.gate.state, "half-open");
  assert.match(at(BREAKER, "half-open", "open").caption.text, /The trial failed, so at t=9 the breaker opens again/);
  const close = at(BREAKER, "recover", "close");
  assert.equal(close.caption.tone, "good");
  assert.match(close.caption.text, /at t=15 the breaker closes/);
});

test("circuit breaker: the broken versions show their cost", () => {
  const none = at(BREAKER, "broken: no breaker", "direct", 24);
  assert.equal(none.caption.tone, "bad");
  assert.match(none.caption.text, /timeout number 20/);
  assert.match(none.caption.text, /20.1 s in total/);
  assert.equal(none.gate.absent, true);
  assert.equal(none.gate.latest?.outcome, "failed");
  const early = at(BREAKER, "broken: no half-open", "straightClosed", 3);
  assert.equal(early.caption.tone, "bad");
  assert.match(early.caption.text, /At t=20 .* time number 3/);
});
