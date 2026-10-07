// Storage blocks (write-ahead log, LSM tree, B+ tree, Merkle tree): at each moment a lesson
// links to, the caption says in plain words what just happened, and the picture shows where
// data lives (memory, buffer, disk), which pages a read opened, and how two replicas differ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captionAt } from "../src/model/caption.ts";
import { parseHints } from "../src/model/hints.ts";
import { buildScene } from "../src/model/scene.ts";
import type { LevelsPanel } from "../src/model/systems/levels.ts";
import type { MerkleNodeBox, MerklePanel } from "../src/model/systems/merkle.ts";
import type { PagesPanel } from "../src/model/systems/pages.ts";
import { findRun, markStep, parseLesson } from "../src/sim/lesson.ts";
import { SYSTEMS_LIMITS } from "../src/tracer/recorder.ts";
import { traceSource } from "../src/tracer/trace.ts";

const root = join(import.meta.dirname, "../../system-design/primitives/03-storage");
const WAL = "008-write-ahead-log";
const LSM = "009-lsm-tree";
const BPT = "010-b-plus-tree";
const MERKLE = "011-merkle-tree";

const cache = new Map<string, { hints: ReturnType<typeof parseHints>; trace: ReturnType<typeof traceSource> }>();
function load(file: string) {
  if (!cache.has(file)) {
    const src = readFileSync(join(root, `${file}.ts`), "utf8");
    cache.set(file, { hints: parseHints(src), trace: traceSource(src, SYSTEMS_LIMITS, { scenarios: true }) });
  }
  return cache.get(file)!;
}

/** The step a play link `scenario@at=mark#nth` opens on. */
function at(file: string, scenario: string, mark: string, nth = 1) {
  const { hints, trace } = load(file);
  const run = trace.runs[findRun(trace.runs, scenario)];
  const k = markStep(run.steps, hints.marks[mark], nth);
  assert.ok(k >= 0, `${scenario}: ${mark}#${nth} not reached`);
  return { hints, run, k };
}

function caption(file: string, scenario: string, mark: string, nth = 1) {
  const { hints, run, k } = at(file, scenario, mark, nth);
  const c = captionAt(run.steps, k, hints);
  assert.ok(c, `${scenario}: no caption at ${mark}#${nth}`);
  assert.doesNotMatch(c.text, /\{[^}]+\}|undefined|NaN|''/, "every {expr} is filled");
  return c;
}

function panel<P>(file: string, kind: string, scenario: string, mark: string, nth = 1): P {
  const { hints, run, k } = at(file, scenario, mark, nth);
  const scene = buildScene(run.steps[k + 1] ?? run.steps[k], run.steps[k], hints);
  const p = scene.panels.find((x) => x.kind === kind);
  assert.ok(p, `no ${kind} panel`);
  return p as P;
}

test("every play link in the storage lessons lands on a step with a filled caption", () => {
  for (const file of [WAL, LSM, BPT, MERKLE]) {
    const lesson = parseLesson(readFileSync(join(root, `${file}.lesson.md`), "utf8"));
    const src = readFileSync(join(root, `${file}.lesson.md`), "utf8");
    const links = [...src.matchAll(/\(play:([^@)]+)@at=([\w-]+)(?:#(\d+))?\)/g)];
    assert.ok(links.length > 5 && lesson, file);
    for (const [, scenario, mark, nth] of links) caption(file, scenario, mark, nth ? Number(nth) : 1);
  }
});

test("storage lessons have both plain-words sections in the right places", () => {
  for (const file of [WAL, LSM, BPT, MERKLE]) {
    const heads = [...readFileSync(join(root, `${file}.lesson.md`), "utf8").matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(heads[heads.indexOf("What it is") + 1], "In plain words", file);
    assert.equal(heads[heads.indexOf("Deep dive") - 1], "When to use which", file);
  }
});

test("WAL: the memory-first store's early ack and the lost write are captioned as problems", () => {
  const ack = caption(WAL, "broken: memory first", "early-ack");
  assert.equal(ack.tone, "bad");
  assert.match(ack.text, /x=1 is still in the buffer/);
  const lost = caption(WAL, "broken: memory first", "restore");
  assert.equal(lost.tone, "bad");
  assert.match(lost.text, /finds nothing on disk/);
});

test("WAL: append, fsync, apply and ack each say what is on disk and what is not", () => {
  assert.match(caption(WAL, "write", "flush").text, /record #1.*buffer/);
  assert.match(caption(WAL, "write", "fsync").text, /fsync/);
  assert.match(caption(WAL, "write", "apply").text, /x=1 go into memory/);
  const ack = caption(WAL, "write", "ack");
  assert.equal(ack.tone, "good");
  assert.match(ack.text, /x=1 is in the log on disk/);
});

test("WAL: the crash, the replay and the torn record tell the recovery story", () => {
  assert.match(caption(WAL, "recover", "restore").text, /3 log records on disk will be replayed/);
  assert.match(caption(WAL, "recover", "replay", 3).text, /record #3: x=3/);
  const torn = caption(WAL, "torn write", "torn");
  assert.equal(torn.tone, "good");
  assert.match(torn.text, /#3 fails its checksum/);
});

test("WAL: the checkpoint's order is spelled out, and cutting the log early is a problem", () => {
  assert.match(caption(WAL, "checkpoint", "snapshot-sync").text, /step 1.*buffer/);
  assert.match(caption(WAL, "checkpoint", "truncate").text, /step 2.*safe on disk/);
  assert.match(caption(WAL, "checkpoint", "restore", 2).text, /snapshot \(6 keys\).*2 log records/);
  const early = caption(WAL, "broken: truncate before", "early-truncate");
  assert.equal(early.tone, "bad");
  assert.match(early.text, /no copy of these writes exists on disk/);
});

test("WAL picture: rows are grouped into memory, buffer and disk, and unsynced records are pending", () => {
  const p = panel<LevelsPanel>(WAL, "levels", "write", "flush");
  assert.deepEqual(
    p.rows.map((r) => [r.name, r.place]),
    [
      ["memory", "memory"],
      ["log", "disk"],
      ["snapshotInBuffer", "buffer"],
      ["snapshot", "disk"],
    ],
  );
  const log = p.rows[1];
  assert.equal(log.title, "Write-ahead log file");
  assert.equal(log.mark, 0);
  assert.deepEqual(
    log.blocks.map((b) => b.pending),
    [true],
  );
});

test("LSM: the sorted file's moves, the memtable write and the flush are captioned", () => {
  const shift = caption(LSM, "broken: one sorted file", "shift");
  assert.equal(shift.tone, "bad");
  assert.match(shift.text, /the entry l is moved/);
  assert.match(caption(LSM, "broken: one sorted file", "placed", 7).text, /5 entries after it/);
  assert.match(caption(LSM, "write", "insert", 2).text, /c=2 goes into the memtable/);
  assert.match(caption(LSM, "flush", "flush").text, /table T1 at the front of level 0/);
});

test("LSM: reads go newest first, and reading oldest first is stale", () => {
  assert.match(caption(LSM, "read path", "check-l0").text, /Open table T2/);
  const hit = caption(LSM, "read path", "hit-l0");
  assert.equal(hit.tone, "good");
  assert.match(hit.text, /T2 has a=new.*older tables are never opened/);
  const stale = caption(LSM, "broken: read oldest first", "stale-hit");
  assert.equal(stale.tone, "bad");
  assert.match(stale.text, /T1 has a=old.*stale/);
  assert.match(caption(LSM, "delete", "hit-mem").text, /tombstone for a/);
});

test("LSM: compaction drops the tombstone, and dropping it early brings a deleted value back", () => {
  assert.match(caption(LSM, "compaction", "drop-tombstones").text, /3 tables.*Compaction merges them/);
  assert.match(caption(LSM, "compaction", "compacted").text, /the tombstone was dropped/);
  assert.match(caption(LSM, "compaction", "search-l1").text, /d is not in T4.*not found/);
  const early = caption(LSM, "broken: drop tombstones", "early-drop");
  assert.equal(early.tone, "bad");
  assert.match(early.text, /tombstone for a/);
  const back = caption(LSM, "broken: drop tombstones", "search-l1");
  assert.equal(back.tone, "bad");
  assert.match(back.text, /a=1 in T4.*come back/);
});

test("LSM picture: memtable in memory, levels on disk with plain titles, checked tables numbered", () => {
  const p = panel<LevelsPanel>(LSM, "levels", "read path", "hit-l0");
  assert.deepEqual(
    p.rows.map((r) => [r.name, r.place, r.title]),
    [
      ["memtable", "memory", "Memtable (sorted)"],
      ["L0", "disk", "Level 0 (newest first; ranges overlap)"],
      ["L1", "disk", "Level 1 (merged; no overlaps)"],
    ],
  );
  assert.deepEqual(
    p.rows[1].blocks.map((b) => [b.label, b.hot, b.hotOrder]),
    [
      ["T2", true, 2],
      ["T1", false, undefined],
    ],
  );
});

test("B+ tree: one-key pages are captioned as too many reads; the B+ tree reads one page per level", () => {
  assert.match(caption(BPT, "broken: binary tree", "bst-read", 1).text, /Disk read 1: a page holding just one key, 1/);
  const tall = caption(BPT, "broken: binary tree", "bst-read", 12);
  assert.equal(tall.tone, "bad");
  assert.match(tall.text, /12 disk reads/);
  assert.match(caption(BPT, "search", "read-inner", 1).text, /p8, the root/);
  const found = caption(BPT, "search", "found");
  assert.equal(found.tone, "good");
  assert.match(found.text, /after 3 disk reads: exactly one per level/);
});

test("B+ tree: splits, push-ups and a new root are captioned with their pages", () => {
  assert.match(caption(BPT, "split", "leaf-insert", 4).text, /\[10, 20, 30, 40\].*must split/);
  assert.match(caption(BPT, "split", "split-leaf").text, /p2 takes \[30, 40\]/);
  assert.match(caption(BPT, "split", "new-root").text, /new root p3/);
  assert.match(caption(BPT, "root split", "push-up").text, /\[3, 5, 7, 9\].*split too/);
  assert.match(caption(BPT, "root split", "split-inner").text, /p7 takes \[9\].*7 moves up/);
  assert.match(caption(BPT, "root split", "new-root").text, /new root p8.*3 levels down/);
});

test("B+ tree: the range scan follows links, and without them it climbs back to the root", () => {
  assert.match(caption(BPT, "range scan", "next-leaf", 3).text, /next leaf, p2: disk read 6/);
  assert.match(caption(BPT, "range scan", "range-end", 11).text, /Disk reads: 6/);
  const again = caption(BPT, "broken: no leaf links", "re-descend", 2);
  assert.equal(again.tone, "bad");
  assert.match(again.text, /back to the root/);
});

test("B+ tree picture: the read counter and the order pages were read in", () => {
  const p = panel<PagesPanel>(BPT, "pages", "broken: no leaf links", "re-descend", 4);
  assert.equal(p.reads, 9);
  assert.deepEqual(p.levels[0][0].reads, [1, 4, 7]);
});

test("Merkle: the flat list is a problem, the tree finds bucket 7 in 7 comparisons", () => {
  const flat = caption(MERKLE, "broken: flat list", "flat-compare", 8);
  assert.equal(flat.tone, "bad");
  assert.match(flat.text, /all 8 buckets/);
  assert.match(caption(MERKLE, "build", "rehash-leaf").text, /Bucket 7's leaf/);
  assert.match(caption(MERKLE, "build", "rehash-parent", 3).text, /root's fingerprint.*4 fingerprints/);
  assert.equal(caption(MERKLE, "same", "same").tone, "good");
  assert.match(caption(MERKLE, "diff", "rehash-parent", 3).text, /to 0920/);
  assert.match(caption(MERKLE, "diff", "descend").text, /buckets 0 to 3.*skipped/);
  const found = caption(MERKLE, "diff", "found");
  assert.equal(found.tone, "good");
  assert.match(found.text, /bucket 7 .*after 7 comparisons/);
});

test("Merkle: hashing only the left child hides a real difference", () => {
  assert.equal(caption(MERKLE, "broken: parent hashes", "rehash-parent", 3).tone, "bad");
  const same = caption(MERKLE, "broken: parent hashes", "same");
  assert.equal(same.tone, "bad");
  assert.match(same.text, /nothing is repaired/);
});

test("Merkle picture: two replicas side by side, with the differing path marked down to bucket 7", () => {
  const p = panel<MerklePanel>(MERKLE, "merkle", "diff", "found");
  assert.deepEqual(
    p.replicas.map((r) => r.title),
    ["Replica A", "Replica B"],
  );
  const leaves = (b: MerkleNodeBox): MerkleNodeBox[] => (b.children ? b.children.flatMap(leaves) : [b]);
  const a = p.replicas[0].root!;
  assert.equal(a.differs, true);
  assert.deepEqual(
    leaves(a).filter((l) => l.differs).map((l) => l.bucket),
    [7],
  );
  assert.equal(p.replicas[0].compared, 7);
  const scene = (() => {
    const { hints, run, k } = at(MERKLE, "diff", "found");
    return buildScene(run.steps[k + 1], run.steps[k], hints);
  })();
  assert.deepEqual(
    scene.panels.map((x) => x.kind),
    ["merkle"],
  );
});
