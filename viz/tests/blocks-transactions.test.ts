// Transactions & messaging blocks explain themselves: at the moments their lessons link to, the
// caption over the cluster picture tells the order story in plain words, broken scenarios say what
// went wrong and what it costs the customer, and every node is labelled in words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRun, lessonProblems, parseLesson, stepAt } from "../src/sim/lesson.ts";
import { simCaption } from "../src/sim/narrate.ts";
import { runSimSource } from "../src/sim/run.ts";
import type { SimTrace } from "../../system-design/kernel/types.ts";

const dir = join(import.meta.dirname, "../../system-design/primitives/06-transactions-messaging");
const TPC = "024-two-phase-commit";
const SAGA = "025-saga-with-compensation";
const OUTBOX = "026-transactional-outbox-idempotent-consumer";
const KAFKA = "027-kafka-partitions-consumer-groups";
const BLOCKS = [TPC, SAGA, OUTBOX, KAFKA];

const traces = new Map<string, SimTrace>();
function trace(block: string) {
  if (!traces.has(block)) traces.set(block, runSimSource(readFileSync(join(dir, `${block}.ts`), "utf8")));
  return traces.get(block)!;
}

/** The caption shown when a play link jumps to `scenario@t=t`. */
function at(block: string, scenario: string, t: number) {
  const { runs } = trace(block);
  const r = findRun(runs, scenario);
  assert.ok(r >= 0, `no single scenario "${scenario}" in ${block}`);
  const k = stepAt(runs[r], t);
  assert.ok(k >= 0, `${scenario} has no step at t=${t}`);
  return simCaption(runs[r].steps, k)!;
}

/** Every caption of a scenario, in order. */
function captions(block: string, scenario: string) {
  const { runs } = trace(block);
  const run = runs[findRun(runs, scenario)];
  return run.steps.map((_, k) => simCaption(run.steps, k)!);
}

test("transactions blocks: every scenario passes, links resolve, and both plain-words sections are there", () => {
  for (const block of BLOCKS) {
    const t = trace(block);
    assert.equal(t.error, undefined, block);
    for (const run of t.runs) assert.equal(run.passed, true, `${block}: ${run.label}`);
    const lesson = parseLesson(readFileSync(join(dir, `${block}.lesson.md`), "utf8"));
    assert.deepEqual(lessonProblems(lesson, t.runs), [], block);
    const md = readFileSync(join(dir, `${block}.lesson.md`), "utf8");
    assert.ok(md.indexOf("## In plain words") > md.indexOf("## What it is"), `${block}: In plain words`);
    assert.ok(md.indexOf("## When to use which") < md.indexOf("## Deep dive") && md.includes("## When to use which"), `${block}: When to use which`);
    assert.match(md, /In the picture on the right/, block);
  }
});

test("transactions blocks: every node is labelled with a role and a summary in words", () => {
  for (const block of BLOCKS) {
    for (const run of trace(block).runs) {
      const last = run.steps.at(-1)!;
      for (const [id, n] of Object.entries(last.nodes)) {
        assert.equal(typeof n.state.role, "string", `${block} ${id} role`);
        assert.ok(String(n.state.summary).length > 0, `${block} ${id} summary`);
      }
    }
  }
});

test("2PC: the story is an order for the last lamp, and each phase is named", () => {
  assert.match(at(TPC, "commit", 1).text, /customer orders the last lamp.*Phase 1/);
  const decide = captions(TPC, "commit").find((c) => /Phase 2/.test(c.text))!;
  assert.match(decide.text, /writes "commit" for T1 to its log on disk/);
  assert.equal(at(TPC, "commit", 7).tone, "good");
  assert.match(at(TPC, "abort", 5).text, /votes yes \(1 of 3 so far\)/);
  assert.match(at(TPC, "recovery", 20).text, /reads "commit" for T1 from its log/);
});

test("2PC: broken scenarios say what went wrong and what it costs", () => {
  const busy = at(TPC, "blocked", 30);
  assert.equal(busy.tone, "bad");
  assert.match(busy.text, /blocking real sales/);
  const noLock = at(TPC, "broken: no locks", 4);
  assert.equal(noLock.tone, "bad");
  assert.match(noLock.text, /another customer buys the last lamp/);
  const twice = captions(TPC, "broken: no locks").find((c) => /sold to two customers/.test(c.text));
  assert.ok(twice && twice.tone === "bad");
  const forgot = at(TPC, "broken: decision not on disk", 20);
  assert.equal(forgot.tone, "bad");
  assert.match(forgot.text, /empty log/);
  const guess = at(TPC, "broken: a participant gives up", 33);
  assert.equal(guess.tone, "bad");
  assert.match(guess.text, /atomicity is lost.*gave the lamp away/);
  assert.equal(at(TPC, "broken: no prepare", 3).tone, "bad");
});

test("saga: an order runs step by step, and undo runs newest first", () => {
  assert.match(at(SAGA, "success", 1).text, /customer orders a book for \$30 \(o1\)/);
  const done = captions(SAGA, "success").find((c) => /every step of o1 is done/.test(c.text))!;
  assert.equal(done.tone, "good");
  assert.match(at(SAGA, "payment fails", 9).text, /failed \(card declined\).*put the book back on the shelf/);
  const undone = captions(SAGA, "payment fails").find((c) => /has been undone/.test(c.text))!;
  assert.equal(undone.tone, "good");
  const dup = at(SAGA, "retry", 17);
  assert.equal(dup.tone, "good");
  assert.match(dup.text, /not charged twice/);
  assert.match(at(SAGA, "no isolation", 6).text, /held by o1, an order that may still be cancelled/);
});

test("saga: broken scenarios name the harm to the customer", () => {
  const charged = at(SAGA, "broken: non-idempotent", 17);
  assert.equal(charged.tone, "bad");
  assert.match(charged.text, /pays \$60 for a \$30 book/);
  assert.match(at(SAGA, "broken: no compensation", 9).text, /stuck off the shelf for good/);
  assert.match(at(SAGA, "broken: log in memory", 12).text, /forgotten o1/);
  const stuck = captions(SAGA, "broken: no retry").at(-1)!;
  assert.equal(stuck.tone, "bad");
  assert.match(stuck.text, /stuck forever/);
  assert.match(at(SAGA, "broken: undo by", 11).text, /promises 3 books when it has 2/);
});

test("outbox: the order and its event commit together, and the repeat is skipped", () => {
  const commit = at(OUTBOX, "happy path", 2);
  assert.equal(commit.tone, "good");
  assert.match(commit.text, /commits order o1 and outbox row o1:placed together/);
  const skip = at(OUTBOX, "relay crash", 21);
  assert.equal(skip.tone, "good");
  assert.match(skip.text, /charged only once/);
  assert.ok(captions(OUTBOX, "relay crash").some((c) => /a second copy/.test(c.text)));
});

test("outbox: broken scenarios say the event is lost or the customer pays twice", () => {
  const twice = at(OUTBOX, "broken: consumer without dedupe", 21);
  assert.equal(twice.tone, "bad");
  assert.match(twice.text, /pays \$60 for one \$30 order/);
  assert.equal(at(OUTBOX, "broken: dual write", 2).tone, "bad");
  assert.match(captions(OUTBOX, "broken: dual write").at(-1)!.text, /nobody is ever charged/);
  assert.equal(at(OUTBOX, "broken: mark before publish", 6).tone, "bad");
  assert.ok(captions(OUTBOX, "broken: mark before publish").some((c) => /billing will never charge o1/.test(c.text)));
});

test("kafka: keys pick partitions, and a crash restarts from the committed bookmark", () => {
  assert.match(at(KAFKA, "ordering", 1).text, /key "alice" always hashes to p0/);
  assert.match(at(KAFKA, "ordering", 27).text, /p0 → 3/);
  assert.match(at(KAFKA, "rebalance on crash", 28).text, /no heartbeat for 10 ticks.*Rebalance/);
  assert.match(at(KAFKA, "rebalance on crash", 34).text, /restart from the last committed bookmark \(p0 at 0, p2 at 0\)/);
  assert.ok(captions(KAFKA, "idle").some((c) => /c4 gets no partition/.test(c.text)));
  assert.match(at(KAFKA, "scale out", 27).text, /ignores c1's commit from generation 1/);
});

test("kafka: broken scenarios show out-of-order, lost and repeated messages", () => {
  const order = at(KAFKA, "broken: no key", 19);
  assert.equal(order.tone, "bad");
  assert.match(order.text, /alice#2 processed after alice#3/);
  assert.ok(captions(KAFKA, "broken: no key").some((c) => c.tone === "bad" && /ignores the key "alice"/.test(c.text)));
  assert.ok(captions(KAFKA, "broken: commit before").some((c) => c.tone === "bad" && /commits offset 3 at once, before processing/.test(c.text)));
  assert.ok(captions(KAFKA, "broken: commit before").some((c) => c.tone === "bad" && /skipped for good/.test(c.text)));
  const unread = at(KAFKA, "broken: no heartbeat", 28);
  assert.equal(unread.tone, "bad");
  assert.match(unread.text, /nobody will ever process them/);
  const back = at(KAFKA, "broken: no generations", 35);
  assert.equal(back.tone, "bad");
  assert.match(back.text, /moves the bookmark backwards: p0 3 → 1/);
});
