// Replication blocks explain themselves: at the moments their lessons link to, the caption over
// the cluster picture says in plain words what happened, and each node is labelled in words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRun, lessonProblems, parseLesson, stepAt } from "../src/sim/lesson.ts";
import { nodeLabel } from "../src/sim/layout.ts";
import { simCaption } from "../src/sim/narrate.ts";
import { runSimSource } from "../src/sim/run.ts";
import type { SimTrace } from "../../system-design/kernel/types.ts";

const dir = join(import.meta.dirname, "../../system-design/primitives/05-replication");
const BLOCKS = [
  "017-leader-follower-replication",
  "018-quorum-read-write",
  "019-vector-clocks",
  "020-raft-leader-election",
  "021-raft-log-replication",
  "022-gossip-failure-detection",
  "023-leases-and-fencing-tokens",
];

const traces = new Map<string, SimTrace>();
function trace(block: string) {
  if (!traces.has(block)) traces.set(block, runSimSource(readFileSync(join(dir, `${block}.ts`), "utf8")));
  return traces.get(block)!;
}

/** The caption and the step shown when a play link jumps to `scenario@t=t`. */
function at(block: string, scenario: string, t: number) {
  const { runs } = trace(block);
  const r = findRun(runs, scenario);
  assert.ok(r >= 0, `no single scenario "${scenario}" in ${block}`);
  const k = stepAt(runs[r], t);
  assert.ok(k >= 0, `${scenario} has no step at t=${t}`);
  return { caption: simCaption(runs[r].steps, k)!, step: runs[r].steps[k] };
}

test("replication blocks: every scenario passes and every lesson has both plain-words sections", () => {
  for (const block of BLOCKS) {
    const { runs, error } = trace(block);
    assert.equal(error, undefined, block);
    for (const run of runs) assert.equal(run.passed, true, `${block}: ${run.label}`);
    const md = readFileSync(join(dir, `${block}.lesson.md`), "utf8");
    const sections = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const i = sections.indexOf("In plain words");
    assert.equal(sections[i - 1], "What it is", `${block}: "In plain words" follows "What it is"`);
    assert.equal(sections[sections.indexOf("Deep dive") - 1], "When to use which", `${block}: "When to use which" precedes "Deep dive"`);
    assert.match(md, /In the picture on the right/, block);
    assert.deepEqual(lessonProblems(parseLesson(md), runs), [], block);
  }
});

test("replication blocks: most handler steps carry a note, and every node is described in words", () => {
  for (const block of BLOCKS) {
    for (const run of trace(block).runs) {
      const handled = run.steps.filter((s) => s.handler && s.kind !== "start" && s.node !== "client");
      const noted = handled.filter((s) => s.note);
      assert.ok(noted.length >= handled.length * 0.8, `${block}: ${run.label} has notes on ${noted.length}/${handled.length} handler steps`);
      const last = run.steps.at(-1)!;
      for (const [id, v] of Object.entries(last.nodes)) {
        assert.equal(typeof v.state.summary, "string", `${block}: ${id} has no summary`);
      }
    }
  }
});

test("node labels: roles in plain words, a down node says so, summary cut to two short lines", () => {
  assert.deepEqual(nodeLabel({ role: "leader", summary: "has writes #1-#3 · x=2" }, true), { role: "leader (main server)", lines: ["has writes #1-#3", "x=2"] });
  assert.equal(nodeLabel({ role: "follower" }, false).role, "down (was follower)");
  assert.equal(nodeLabel({}, false).role, "down (crashed)");
  assert.equal(nodeLabel({ role: "lock service" }, true).role, "lock service");
  const long = nodeLabel({ summary: "a · b · c" }, true);
  assert.deepEqual(long.lines, ["a", "b"]);
  assert.ok(nodeLabel({ summary: "x".repeat(40) }, true).lines[0].length <= 26);
});

// --- 017 leader-follower ---
const LF = "017-leader-follower-replication";

test("leader-follower: the leader answers 'done' before any copy exists", () => {
  const { caption } = at(LF, "async replication", 1);
  assert.match(caption.text, /saves it as write #1 and answers "done" at once, before any copy has it/);
});

test("leader-follower: a stale read is called out as one", () => {
  const { caption } = at(LF, "stale read", 2);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /stale read/);
});

test("leader-follower: read-your-writes holds the read instead of answering with old data", () => {
  const { caption } = at(LF, "read-your-writes", 2);
  assert.equal(caption.tone, "good");
  assert.match(caption.text, /holds the read until the copy catches up/);
});

test("leader-follower: a restarted follower with its log on disk resumes, one without comes back empty", () => {
  assert.match(at(LF, "follower restarts", 20).caption.text, /restarts with its copy on disk \(writes up to #2\)/);
  const empty = at(LF, "broken: data only in memory", 12);
  assert.equal(empty.caption.tone, "bad");
  assert.match(empty.caption.text, /restarts empty/);
  assert.match(at(LF, "broken: data only in memory", 19).caption.text, /never resend #1-#2, and n2 stays empty/);
});

test("leader-follower: ship-once leaves n2 stuck behind a gap", () => {
  const { caption } = at(LF, "broken: ship each write once", 18);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /n2 got #4 but is missing #3/);
});

test("leader-follower: applying on arrival rolls x back, and the caption says what it costs", () => {
  const { caption, step } = at(LF, "broken: apply as it arrives", 15);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /x goes back to 1/);
  assert.match(caption.text, /Readers of n2 now get old data/);
  assert.equal(step.nodes.n2.state.summary, "has writes #1-#2 · x=1");
});

/** The caption one step after the play-link moment (the next event at the same time). */
function after(block: string, scenario: string, t: number) {
  const { runs } = trace(block);
  const r = findRun(runs, scenario);
  return simCaption(runs[r].steps, stepAt(runs[r], t) + 1)!;
}

// --- 022 gossip ---
const GOSSIP = "022-gossip-failure-detection";

test("gossip: pinging directly only throws out a healthy server, and the caption says so", () => {
  const { caption } = at(GOSSIP, "broken: direct pings only", 7);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /n1 lists n3 as dead, but n3 is running/);
});

test("gossip: a bad link sends the check through helpers; a crash leads to suspicion with a grace period", () => {
  assert.match(at(GOSSIP, "bad link", 7).caption.text, /Maybe only the wire between them is bad, so it asks n5 and n4 to try/);
  assert.match(at(GOSSIP, "crash", 52).caption.text, /n3 now suspects n4 is dead, but gives it 60 ticks/);
});

test("gossip: a suspected node refutes the rumour, and the news spreads", () => {
  const refute = after(GOSSIP, "refute", 56);
  assert.equal(refute.tone, "good");
  assert.match(refute.text, /new number \(#1\) that beats the rumour/);
  const spread = at(GOSSIP, "refute", 79).caption;
  assert.equal(spread.tone, "good");
  assert.match(spread.text, /n2 hears by gossip that n3 proved it is alive/);
});

// --- 023 leases and fencing tokens ---
const LEASE = "023-leases-and-fencing-tokens";

test("leases: the pause, the expiry and the new holder are each explained", () => {
  assert.match(at(LEASE, "fencing", 18).caption.text, /lease \(token 1\) runs out and the lock is free/);
  const wake = at(LEASE, "fencing", 40).caption;
  assert.equal(wake.tone, "bad");
  assert.match(wake.text, /w1 wakes at t=40 and carries on as if no time had passed/);
  assert.match(at(LEASE, "expiry", 31).caption.text, /gives w2 the lock with token 2/);
});

test("leases: at t=41 the lock service warns only storage can stop w1; storage checks the token, or doesn't", () => {
  assert.match(at(LEASE, "fencing", 41).caption.text, /only the storage can catch it/);
  const kept = after(LEASE, "fencing", 41);
  assert.equal(kept.tone, "good");
  assert.match(kept.text, /storage turns away w1's w1:2: token 1 is older than token 2/);
  const lost = after(LEASE, "broken: lease without a fencing token", 41);
  assert.equal(lost.tone, "bad");
  assert.match(lost.text, /a stale holder overwrote newer data/);
});

test("leases: a lock that never expires blocks everyone if its holder dies", () => {
  const { caption } = at(LEASE, "broken: lock without a lease", 22);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /nobody can ever do the job again/);
});

// --- 018 quorum ---
const QUORUM = "018-quorum-read-write";

test("quorum: too-small quorums return old data, and the caption says what the user loses", () => {
  const { caption } = at(QUORUM, "broken: R + W", 19);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /answers x=old \(version 1\)/);
  assert.match(caption.text, /change looks lost/);
});

test("quorum: waiting for all copies fails a write that two copies saved", () => {
  const { caption } = at(QUORUM, "broken: wait for all", 12);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /write FAILED/);
  assert.match(caption.text, /r1 and r2 already saved it/);
});

test("quorum: a late old write is ignored by version, unless the copy skips the check", () => {
  const ok = at(QUORUM, "late write", 8).caption;
  assert.equal(ok.tone, "good");
  assert.match(ok.text, /ignores the old one/);
  const broken = at(QUORUM, "broken: no version check", 8).caption;
  assert.equal(broken.tone, "bad");
  assert.match(broken.text, /overwrites x=new \(version 2\) with x=old/);
});

test("quorum: with one copy down, 2 of 3 is enough to save a write", () => {
  assert.match(at(QUORUM, "replica down", 6).caption.text, /1 of the 2/);
  const done = after(QUORUM, "replica down", 6);
  assert.equal(done.tone, "good");
  assert.match(done.text, /2 of 3 copies of x=1 are saved/);
});

// --- 019 vector clocks ---
const VC = "019-vector-clocks";

test("vector clocks: concurrent writes are kept side by side; last-write-wins drops one", () => {
  const kept = at(VC, "concurrent", 4).caption;
  assert.equal(kept.tone, "good");
  assert.match(kept.text, /Nothing is lost/);
  const lost = at(VC, "broken: last write wins by arrival", 4).caption;
  assert.equal(lost.tone, "bad");
  assert.match(lost.text, /overwrites eggs with milk/);
  assert.match(lost.text, /silently gone/);
});

test("vector clocks: a server-stamped clock claims the client saw writes it never saw", () => {
  const { caption } = at(VC, "broken: server's clock", 6);
  assert.equal(caption.tone, "bad");
  assert.match(caption.text, /though the client had seen only \{\}/);
});

// --- 020 Raft leader election ---
const ELECT = "020-raft-leader-election";

test("raft election: a timeout starts an election; skipping the vote makes a second leader", () => {
  assert.match(at(ELECT, "calm start", 5).caption.text, /starts an election: it becomes a candidate for term 1/);
  const rogue = at(ELECT, "broken: leader on timeout", 5).caption;
  assert.equal(rogue.tone, "bad");
  assert.match(rogue.text, /simply declares itself leader of term 1/);
});

test("raft election: fixed timeouts and missing heartbeats are called out", () => {
  const fixed = at(ELECT, "broken: fixed timeouts", 15).caption;
  assert.equal(fixed.tone, "bad");
  assert.match(fixed.text, /all run at once/);
  const silent = at(ELECT, "broken: no heartbeats", 30).caption;
  assert.equal(silent.tone, "bad");
  assert.match(silent.text, /can't tell that the leader is alive/);
});

// --- 021 Raft log replication ---
const LOG = "021-raft-log-replication";

test("raft log: a write is done only once a majority has a copy", () => {
  assert.match(at(LOG, "commit", 20).caption.text, /adds it to its log as #1.*not "done" until a majority/);
  const done = at(LOG, "commit", 23).caption;
  assert.equal(done.tone, "good");
  assert.match(done.text, /n1, n2 store #1: 2 of 3, a majority/);
  const alone = at(LOG, "broken: commit on the leader alone", 20).caption;
  assert.equal(alone.tone, "bad");
  assert.match(alone.text, /counts it as committed on its own/);
});

test("raft log: votes check the log; without that, a committed write is lost", () => {
  assert.match(at(LOG, "leader change", 43).caption.text, /n2 refuses n3: n3's log .* is behind its own/);
  const lost = at(LOG, "broken: votes ignore the log", 83).caption;
  assert.equal(lost.tone, "bad");
  assert.match(lost.text, /It had #1 x=1 marked committed/);
  assert.match(at(LOG, "minority leader", 124).caption.text, /dropped b=2 .*never committed/);
});
