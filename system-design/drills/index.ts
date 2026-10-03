// Practice drills: plain data the visualizer turns into a quiz, plus helpers their tests use.
//
// Three kinds, one file each under system-design/drills/<kind>/NN-slug.ts:
//
//   estimation/  export const drill = estimation({...})     a back-of-the-envelope question
//   failure/     export const drill = failureDrill({...})   a traffic run with a hidden fault
//   flashcards/  export const deck = flashcards(title, [...]) cards with Leitner review
//
// Every file starts with the usual header comment (`NN. Title`, `Level:`), exports exactly one
// `drill` or `deck`, and has node:test tests proving the data right (see each builder). The
// builders check the shape and throw a readable error, so a malformed drill fails `npm test`.
// Keep drill files self-contained: build designs with system-design/traffic/index.ts here rather
// than importing an architecture file, whose own tests would then run a second time.
//
// This module runs in Node and in the browser, so it must not import node:fs (links.ts does).

import { replicaNames, run, summary, viewOf, type Design, type Summary, type TrafficFault, type TrafficRun } from "../traffic/index.ts";

// ---------- estimation ----------

/** A number the reader is given. `name` is how steps and tests refer to it. */
export type Assumption = { name: string; value: number; unit?: string; note?: string };
/** One line of the worked answer, revealed one at a time. `how` says how it follows from earlier lines. */
export type EstimationStep = { label: string; value: number; unit: string; how: string };

export type Estimation = {
  kind: "estimation";
  title: string;
  /** The question, as an interviewer would ask it. */
  prompt: string;
  assumptions: Assumption[];
  steps: EstimationStep[];
  /**
   * The expected answer, equal to the last step's value. `unit` is shown to the reader: "bytes"
   * lets them type 200TB, anything else ("requests/s", "machines") takes plain numbers and k/M/B/T,
   * optionally followed by the unit or one of its words ("158 machines"); "$" is ignored, a "Gbps"
   * answer converts any of bps..Pbps, and in a time unit ("min/year") a lone "m" is refused as ambiguous.
   */
  answer: { value: number; unit: string };
  /** Accepted if the guess is within this factor of the answer either way (3 = between a third and 3x). */
  tolerance: number;
  /** What to remember, shown after the last step. */
  takeaways: string[];
};

export function estimation(spec: Omit<Estimation, "kind">): Estimation {
  const where = `estimation "${spec.title}"`;
  const names = new Set<string>();
  for (const a of spec.assumptions) {
    if (!a.name || names.has(a.name)) throw new Error(`${where}: assumption names must be unique and non-empty (${a.name})`);
    if (!Number.isFinite(a.value)) throw new Error(`${where}: assumption ${a.name} is not a number`);
    names.add(a.name);
  }
  const labels = new Set<string>();
  for (const s of spec.steps) {
    if (!s.label || labels.has(s.label)) throw new Error(`${where}: step labels must be unique and non-empty (${s.label})`);
    if (!Number.isFinite(s.value) || s.value <= 0) throw new Error(`${where}: step "${s.label}" needs a positive value`);
    if (!s.how) throw new Error(`${where}: step "${s.label}" needs a "how"`);
    labels.add(s.label);
  }
  if (!spec.steps.length) throw new Error(`${where}: needs at least one step`);
  if (!(spec.answer.value > 0)) throw new Error(`${where}: the answer must be positive`);
  if (spec.answer.value !== spec.steps.at(-1)!.value) throw new Error(`${where}: the answer must equal the last step's value`);
  if (!(spec.tolerance > 1)) throw new Error(`${where}: tolerance is a factor above 1, such as 3`);
  if (!spec.takeaways.length) throw new Error(`${where}: needs at least one takeaway`);
  return { kind: "estimation", ...spec };
}

/** The assumptions by name, for tests that recompute the steps. */
export function given(d: Estimation): Record<string, number> {
  return Object.fromEntries(d.assumptions.map((a) => [a.name, a.value]));
}

/**
 * Compares every step with the value a test recomputed for it (relative error under 1e-9).
 * Returns readable problems; a test asserts the list is empty. Every step must be recomputed.
 */
export function checkSteps(d: Estimation, expected: Record<string, number>): string[] {
  const out: string[] = [];
  for (const s of d.steps) {
    const want = expected[s.label];
    if (want === undefined) out.push(`step "${s.label}" was not recomputed`);
    else if (Math.abs(s.value - want) > 1e-9 * Math.abs(want)) out.push(`step "${s.label}" says ${s.value}, but it works out to ${want}`);
  }
  for (const label of Object.keys(expected)) if (!d.steps.some((s) => s.label === label)) out.push(`no step "${label}"`);
  return out;
}

// ---------- failure ----------

/** One answer to choose from. Exactly one is `correct`; every one says `why` it is right or wrong. */
export type DrillOption = { text: string; correct?: boolean; why: string };

export type FailureDrill = {
  kind: "failure";
  title: string;
  /** What the reader is told before they look: the system and what the pager said. */
  context: string;
  design: Design;
  knobs: Record<string, number>;
  /** Injected into the run and hidden from the reader until they answer. */
  faults: TrafficFault[];
  seconds: number;
  seed: number;
  question: string;
  options: DrillOption[];
  /**
   * The fixed design, played under the same seed and seconds. It faces `faults` (or the drill's
   * own when left out: give your own when the fix renames the machines) with `knobs` (or the drill's).
   */
  fix: { design: Design; explain: string; knobs?: Record<string, number>; faults?: TrafficFault[] };
  /**
   * The rows of the "as it happened / with the fix" table, after the answer. Left out, they are
   * chosen from the runs (see `compareRows`); name them when the symptom is something else.
   */
  compare?: CompareMetric[];
};

// ---------- the before/after table ----------

const CLASSES = ["normal", "heavy", "far"] as const;
type ClassName = (typeof CLASSES)[number];
const KINDS = ["read", "write", "static"] as const;
type KindName = (typeof KINDS)[number];
type Group = ClassName | KindName;
/**
 * A row of the comparison table: a whole-run number, one user class's or one request kind's
 * ("heavy.errorRate", "read.p99"), or "backlog" (jobs still queued at the end, all queues).
 */
export type CompareMetric = "errorRate" | "p99" | "retries" | "serviceRetries" | "staleRate" | "staleOwnRate" | "degradedRate" | "backlog" | `${Group}.errorRate` | `${Group}.p99`;
export type CompareRow = { metric: CompareMetric; label: string; unit: "share" | "ms" | "perSecond" | "count"; broken: number; fixed: number };

const GROUP_LABEL: Record<Group, string> = { normal: "ordinary users", heavy: "heavy users", far: "far users", read: "reads", write: "writes", static: "static files" };
const METRICS: Record<string, { label: string; unit: CompareRow["unit"] }> = {
  errorRate: { label: "Requests failed", unit: "share" },
  p99: { label: "p99 latency", unit: "ms" },
  retries: { label: "Client retries a second", unit: "perSecond" },
  serviceRetries: { label: "Service retries a second", unit: "perSecond" },
  staleRate: { label: "Reads that were stale", unit: "share" },
  staleOwnRate: { label: "Users not seeing their own write", unit: "share" },
  degradedRate: { label: "Answers served degraded", unit: "share" },
  backlog: { label: "Jobs still queued at the end", unit: "count" },
  ...Object.fromEntries(
    [...CLASSES, ...KINDS].flatMap((g) => [
      [`${g}.errorRate`, { label: `Requests failed, ${GROUP_LABEL[g]}`, unit: "share" as const }],
      [`${g}.p99`, { label: `p99 latency, ${GROUP_LABEL[g]}`, unit: "ms" as const }],
    ]),
  ),
};

function metricOf(s: Summary, m: CompareMetric): number {
  if (m === "backlog") return Object.values(s.backlog).reduce((a, b) => a + b, 0);
  const dot = m.indexOf(".");
  if (dot < 0) return s[m as "errorRate"];
  const name = m.slice(0, dot);
  const g = (CLASSES as readonly string[]).includes(name) ? s.byClass[name as ClassName] : s.byKind[name as KindName];
  if (!g) return NaN;
  return m.endsWith(".p99") ? g.p99 : g.errorRate;
}

/** The table starts at the first fault; a drill with no fault (the design is the bug) skips the first, warm-up second. */
export const compareFrom = (d: FailureDrill) => (d.faults.length ? Math.min(...d.faults.map((f) => f.at / 1000)) : 1);

/**
 * The before/after rows. A drill's `compare` names them; by default they are:
 * - requests failed and p99, split per user class when the run has heavy or far users (a fix such
 *   as a rate limit refuses the heavy ones on purpose, so the overall rate would rise), or else
 *   per request kind when the fix helps one kind (failures down 5 points or more) but not another
 *   (one kind of request was taking the other down, and the fix isolates them);
 * - then any of client retries, service retries, stale reads, stale own reads, degraded answers
 *   and jobs still queued whose value differs between the two runs.
 */
export function compareRows(d: FailureDrill, play: { broken: TrafficRun; fixed: TrafficRun }): { from: number; rows: CompareRow[] } {
  const from = compareFrom(d);
  const a = summary(play.broken, from);
  const b = summary(play.fixed, from);
  let metrics: CompareMetric[] = d.compare ?? [];
  if (!d.compare) {
    const both = (g: Group): CompareMetric[] => [`${g}.errorRate`, `${g}.p99`];
    const classes = CLASSES.filter((c) => a.byClass[c].sent > 0);
    const kinds = KINDS.filter((k) => (a.byKind[k]?.sent ?? 0) > 0);
    const change = (k: KindName) => b.byKind[k]!.errorRate - a.byKind[k]!.errorRate;
    const traded = kinds.some((k) => change(k) < -0.05) && kinds.some((k) => change(k) > -0.01);
    if (classes.length > 1) metrics = classes.flatMap(both);
    else if (traded) metrics = kinds.flatMap(both);
    else metrics = ["errorRate", "p99"];
    for (const m of ["retries", "serviceRetries", "staleRate", "staleOwnRate", "degradedRate", "backlog"] as const) {
      const scale = METRICS[m].unit === "share" ? 0.005 : 0.5;
      if (Math.abs(metricOf(a, m) - metricOf(b, m)) > scale) metrics.push(m);
    }
  }
  return { from, rows: metrics.map((m) => ({ metric: m, ...METRICS[m], broken: metricOf(a, m), fixed: metricOf(b, m) })) };
}

function checkFaults(where: string, d: Design, knobs: Record<string, number>, faults: TrafficFault[]) {
  const machines = viewOf(d, knobs).components.filter((c) => c.type === "station").flatMap(replicaNames);
  const regions = new Set(viewOf(d, knobs).components.flatMap((c) => c.regions ?? []));
  for (const f of faults) {
    if ("region" in f) {
      if (!regions.has(f.region)) throw new Error(`${where}: fault region "${f.region}" is not a region in "${d.name}"`);
      continue;
    }
    if (!machines.includes(f.target)) throw new Error(`${where}: fault target "${f.target}" is not a machine in "${d.name}" (${machines.join(", ")})`);
  }
}

export function failureDrill(spec: Omit<FailureDrill, "kind" | "knobs"> & { knobs?: Record<string, number> }): FailureDrill {
  const where = `failure drill "${spec.title}"`;
  const knobs = spec.knobs ?? {};
  if (spec.options.length < 2) throw new Error(`${where}: needs at least two options`);
  if (spec.options.filter((o) => o.correct).length !== 1) throw new Error(`${where}: exactly one option must be correct`);
  if (spec.options.some((o) => !o.text || !o.why)) throw new Error(`${where}: every option needs text and a why`);
  if (!(spec.seconds > 0)) throw new Error(`${where}: seconds must be positive`);
  for (const m of spec.compare ?? []) if (!(m in METRICS)) throw new Error(`${where}: unknown compare row "${m}" (${Object.keys(METRICS).join(", ")})`);
  if (spec.compare && !spec.compare.length) throw new Error(`${where}: compare needs at least one row, or leave it out`);
  checkFaults(where, spec.design, knobs, spec.faults);
  checkFaults(`${where} (fix)`, spec.fix.design, spec.fix.knobs ?? knobs, spec.fix.faults ?? spec.faults);
  return { kind: "failure", ...spec, knobs };
}

/** The run the reader diagnoses, and the same moment with the fix in place. */
export function playDrill(d: FailureDrill): { broken: TrafficRun; fixed: TrafficRun } {
  const base = { seconds: d.seconds, seed: d.seed };
  const broken = run(d.design, { ...base, knobs: d.knobs, faults: d.faults });
  const fixed = run(d.fix.design, { ...base, knobs: d.fix.knobs ?? d.knobs, faults: d.fix.faults ?? d.faults });
  broken.label = d.title;
  fixed.label = `${d.title}: fixed`;
  return { broken, fixed };
}

// ---------- flashcards ----------

/** `link` is a problem id ("sd-05-replication/017-leader-follower-replication") the card is about. */
export type Card = { front: string; back: string; link?: string };
export type Deck = { kind: "flashcards"; title: string; cards: Card[] };

export function flashcards(title: string, cards: Card[]): Deck {
  const where = `deck "${title}"`;
  if (!cards.length) throw new Error(`${where}: needs cards`);
  const fronts = new Set<string>();
  for (const c of cards) {
    if (!c.front.trim() || !c.back.trim()) throw new Error(`${where}: every card needs a front and a back`);
    if (fronts.has(c.front)) throw new Error(`${where}: two cards have the front "${c.front}"`);
    fronts.add(c.front);
  }
  return { kind: "flashcards", title, cards };
}

/** A card's stable id: a hash of its front, so reordering or adding cards keeps review progress. */
export function cardId(c: Card): string {
  let h = 5381;
  for (let i = 0; i < c.front.length; i++) h = (Math.imul(h, 33) + c.front.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type Drill = Estimation | FailureDrill | Deck;
