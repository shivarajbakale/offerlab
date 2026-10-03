// RingView data: tokens and keys become positions on a ring, keys that changed owner count as moved,
// and the key being looked up gets a pointer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHints } from "../src/model/hints.ts";
import { buildScene, type Panel } from "../src/model/scene.ts";
import type { RingPanel } from "../src/model/systems/ring.ts";
import { traceSource } from "../src/tracer/trace.ts";

const SRC = `
import { test } from "node:test";
type Token = { hash: number; node: string };
type Tracked = { key: string; hash: number; owner: string; before?: string };
const H: Record<string, number> = { a: 2 ** 30, b: 2 ** 31, z: 2 ** 31 + 2 ** 30 + 2 ** 29 };
export class Ring {
  // @viz ring:tokens,keys
  tokens: Token[] = [{ hash: 0, node: "A" }, { hash: 2 ** 31 + 2 ** 30, node: "B" }];
  keys: Tracked[] = [];
  lookup(key: string): string {
    const hash = H[key];
    const t = this.tokens.find((x) => x.hash >= hash) ?? this.tokens[0];
    return t.node; // @mark owner
  }
  track(names: string[]) {
    for (const key of names) this.keys.push({ key, hash: H[key], owner: this.lookup(key) });
  }
  moveB() {
    this.tokens[1].hash = 2 ** 29;
    for (const k of this.keys) {
      k.before = k.owner;
      k.owner = this.lookup(k.key);
    }
  }
}
test("one: track then move", () => {
  const r = new Ring();
  r.track(["a", "b", "z"]);
  r.moveB();
});
`;

const hints = parseHints(SRC);
const steps = () => traceSource(SRC, undefined, { scenarios: true }).runs[0].steps;
const ringOf = (panels: Panel[]) => panels.find((p): p is RingPanel => p.kind === "ring");

test("ring: tokens become fractions of the ring, sorted, in their server's name", () => {
  const all = steps();
  const ring = ringOf(buildScene(all[1], all[0], hints).panels)!;
  assert.deepEqual(ring.tokens, [
    { pos: 0, node: "A" },
    { pos: 0.75, node: "B" },
  ]);
  assert.equal(ring.name, "tokens");
  assert.deepEqual(ring.shares, [
    { node: "A", share: 0.25 },
    { node: "B", share: 0.75 },
  ]);
});

test("ring: keys are placed by hash, coloured by owner, and moved ones are counted", () => {
  const all = steps();
  const last = all.at(-1)!;
  const ring = ringOf(buildScene(last, all.at(-2), hints).panels)!;
  assert.deepEqual(
    ring.keys.map((k) => [k.label, k.pos, k.owner, k.moved]),
    [
      ["a", 0.25, "A", true],
      ["b", 0.5, "A", true],
      ["z", 0.875, "A", false],
    ],
  );
  assert.equal(ring.moved, 2);
  assert.equal(ring.total, 3);
});

test("ring: the key being looked up gets a pointer", () => {
  const all = steps();
  const s = all.find((x) => x.stack.at(-1)!.fn === "Ring.lookup" && x.stack.at(-1)!.vars.some(([n]) => n === "hash"))!;
  const ring = ringOf(buildScene(s, undefined, hints).panels)!;
  assert.deepEqual(ring.pointer, { pos: 0.25, label: "a" });
});

test("ring: what the ring draws is not drawn again as arrays", () => {
  const all = steps();
  const scene = buildScene(all.at(-1)!, all.at(-2), hints);
  assert.equal(scene.panels.filter((p) => p.kind === "ring").length, 1);
  assert.deepEqual(scene.panels.filter((p) => p.kind === "array" || p.kind === "object").map((p) => p.name), []);
});
