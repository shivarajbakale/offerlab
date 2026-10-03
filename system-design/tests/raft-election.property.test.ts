// Election safety under random crashes, restarts and partitions: never two leaders in one term.
// Importing the primitive also registers its scenario tests, so they appear twice in this run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRng, simulate, type Fault } from "../kernel/sim.ts";
import { RaftNode, oneLeaderPerTerm } from "../primitives/05-replication/020-raft-leader-election.ts";

const IDS = ["n1", "n2", "n3", "n4", "n5"];

function randomFaults(seed: number): Fault[] {
  const rand = makeRng(seed * 7919 + 1);
  const pick = () => IDS[Math.floor(rand() * IDS.length)];
  return Array.from({ length: 8 }, (): Fault => {
    const at = Math.floor(rand() * 400);
    const r = rand();
    if (r < 0.3) return { at, kind: "crash", node: pick() };
    if (r < 0.6) return { at, kind: "recover", node: pick() };
    if (r < 0.85) {
      const shuffled = [...IDS].sort(() => rand() - 0.5);
      const cut = 1 + Math.floor(rand() * 4);
      return { at, kind: "partition", groups: [shuffled.slice(0, cut), shuffled.slice(cut)] };
    }
    return { at, kind: "heal" };
  });
}

test("election safety: never two leaders in one term, across 200 seeds with random faults", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = simulate({
      nodes: Object.fromEntries(IDS.map((id) => [id, () => new RaftNode()])),
      seed,
      until: 500,
      faults: randomFaults(seed),
      invariant: oneLeaderPerTerm,
    });
    assert.equal(r.run.error, undefined, `seed ${seed}: ${r.run.error}`);
    const leaderOf = new Map<number, string>();
    for (const s of r.run.steps) {
      assert.equal(s.violation, undefined, `seed ${seed}, t=${s.t}: ${s.violation}`);
      for (const [id, v] of Object.entries(s.nodes)) {
        if (v.state.role !== "leader") continue;
        const term = v.state.term as number;
        const prev = leaderOf.get(term);
        assert.ok(!prev || prev === id, `seed ${seed}: ${prev} and ${id} both led term ${term}`);
        leaderOf.set(term, id);
      }
    }
  }
});
