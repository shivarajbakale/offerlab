// Every primitive teaches from first principles: a complete lesson whose play links all resolve,
// and at least one broken-on-purpose scenario that really shows its failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHints } from "../src/model/hints.ts";
import { isKernelSource, parseProblem } from "../src/parseProblem.ts";
import { lessonProblems, markLocate, parseLesson, simLocate, trafficLocate } from "../src/sim/lesson.ts";
import { runSimSource } from "../src/sim/run.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";
import { introProblems, type IntroKind } from "../src/sim/intro.ts";
import { runTrafficSource } from "../src/traffic/run.ts";

const sd = join(import.meta.dirname, "../../system-design");
// Every topic id the app knows, for the in-app links in lesson openers.
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && !["index.ts", "links.ts"].includes(e.name) ? [join(dir, e.name)] : [],
  );
const repo = join(sd, "..");
const knownIds = new Set(
  ["neetcode-150", "system-design/primitives", "system-design/architectures", "system-design/microservices", "system-design/low-level-design", "system-design/api-design", "system-design/drills"]
    .flatMap((d) => walk(join(repo, d)))
    .filter((f) => /neetcode-150|primitives\/[^/]+\/|architectures|microservices|low-level-design|api-design|drills\/(estimation|failure|flashcards)/.test(f))
    .map((f) => parseProblem(f.slice(repo.length + 1), readFileSync(f, "utf8")).id),
);
/** Lessons open with "What it is" (sim/intro.ts): what the topic is and which problem it solves. */
function checkIntro(lessonMd: string, kind: IntroKind) {
  assert.deepEqual(introProblems(parseLesson(lessonMd), kind, knownIds), []);
}
const tsIn = (dir: string) => (existsSync(join(sd, dir)) ? readdirSync(join(sd, dir)).filter((f) => f.endsWith(".ts")) : []);
// Tracer and kernel topics: the primitives (in group folders), and the flat low-level design and
// API tracks, which play on the tracer in scenario mode like primitives 001-016.
const files = [
  ...readdirSync(join(sd, "primitives"))
    .filter((d) => !d.includes("."))
    .flatMap((d) => tsIn(`primitives/${d}`).map((f) => `primitives/${d}/${f}`)),
  ...tsIn("low-level-design").map((f) => `low-level-design/${f}`),
  ...tsIn("api-design").map((f) => `api-design/${f}`),
];

for (const file of files) {
  const source = readFileSync(join(sd, file), "utf8");
  const kernel = isKernelSource(source);
  test(`lesson: ${file}`, () => {
    const lessonPath = join(sd, file.replace(/\.ts$/, ".lesson.md"));
    assert.ok(existsSync(lessonPath), `missing ${file.replace(/\.ts$/, ".lesson.md")}`);
    const trace = kernel ? runSimSource(source) : traceSource(source, SYSTEMS_LIMITS, { scenarios: true });
    const locate = kernel ? simLocate : markLocate(parseHints(source).marks);
    assert.deepEqual(parseHints(source).errors, [], "hint mistakes (duplicate @mark, unknown @viz view, @say with @mark)");
    assert.equal(trace.error, undefined);
    assert.deepEqual(
      trace.runs.filter((r) => r.truncated || r.error).map((r) => r.label),
      [],
      "runs must not be truncated or end in an error",
    );
    assert.deepEqual(lessonProblems(parseLesson(readFileSync(lessonPath, "utf8")), trace.runs, locate), []);
    checkIntro(readFileSync(lessonPath, "utf8"), "concept");
    if (!kernel) {
      // A play link must land on a line the Code panel shows, broken-on-purpose subclasses included.
      const { codeStart, codeEnd } = parseProblem(`system-design/${file}`, source);
      const hidden = Object.entries(parseHints(source).marks).filter(([, l]) => l < codeStart || l > codeEnd);
      assert.deepEqual(hidden.map(([name]) => name), [], "marks outside the Code panel");
    }
    const broken = trace.runs.filter((r) => r.label.startsWith("broken: "));
    assert.ok(broken.length >= 1, "needs at least one broken: scenario");
    for (const r of broken) assert.equal(r.passed, true, `${r.label} did not show its failure`);
  });
}

// Architectures and microservices follow the same lesson contract, with play links into traffic runs.
for (const file of [...tsIn("architectures").map((f) => `architectures/${f}`), ...tsIn("microservices").map((f) => `microservices/${f}`)]) {
  test(`lesson: ${file}`, () => {
    const lessonPath = join(sd, file.replace(/\.ts$/, ".lesson.md"));
    assert.ok(existsSync(lessonPath), `missing ${file.replace(/\.ts$/, ".lesson.md")}`);
    const trace = runTrafficSource(readFileSync(join(sd, file), "utf8"));
    assert.equal(trace.error, undefined);
    assert.deepEqual(trace.runs.filter((r) => r.truncated || r.error).map((r) => r.label), []);
    const runs = trace.runs.map((r) => ({ label: r.label, steps: r.frames, journeys: r.journeys }));
    assert.deepEqual(lessonProblems(parseLesson(readFileSync(lessonPath, "utf8")), runs, trafficLocate), []);
    checkIntro(readFileSync(lessonPath, "utf8"), file.startsWith("architectures/") ? "study" : "concept");
    const broken = trace.runs.filter((r) => r.label.startsWith("broken: "));
    assert.ok(broken.length >= 1, "needs at least one broken: scenario");
    for (const r of broken) assert.equal(r.passed, true, `${r.label} did not show its failure`);
  });
}
