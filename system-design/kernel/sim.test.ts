import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIENT, MAX_EVENTS, SimNode, hooks, simulate, type Ctx } from "./sim.ts";

class Pinger extends SimNode {
  pongs = 0;
  state() {
    return { pongs: this.pongs };
  }
  onStart(ctx: Ctx) {
    if (ctx.id === "a") ctx.send("b", "Ping", { n: 1 });
  }
  onPing(ctx: Ctx, body: { n: number }, from: string) {
    ctx.say(`ping ${body.n}`);
    ctx.send(from, "Pong", body);
  }
  onPong(_ctx: Ctx) {
    this.pongs++;
  }
}
const pair = () => ({ a: () => new Pinger(), b: () => new Pinger() });

test("delivers messages to on<Type> handlers and records one step per event", () => {
  const { run, nodes } = simulate({ nodes: pair(), seed: 1, until: 100 });
  assert.equal(run.error, undefined);
  assert.deepEqual(
    run.steps.map((s) => `${s.kind}:${s.node}:${s.handler}`),
    ["start:a:onStart", "start:b:onStart", "deliver:b:onPing", "deliver:a:onPong"],
  );
  assert.equal((nodes.a as Pinger).pongs, 1);
  assert.equal(run.steps[2].note, "ping 1");
  assert.equal(run.steps[0].inFlight.length, 1); // the Ping is on the wire after a starts
  assert.equal(run.steps[3].inFlight.length, 0);
});

test("same seed gives an identical run; latency stays in range", () => {
  const one = simulate({ nodes: pair(), seed: 7, until: 100, latency: [2, 5] });
  const two = simulate({ nodes: pair(), seed: 7, until: 100, latency: [2, 5] });
  assert.deepEqual(one.run, two.run);
  for (const s of one.run.steps) {
    if (!s.msg) continue;
    const latency = s.msg.deliverAt - s.msg.sentAt;
    assert.ok(latency >= 2 && latency <= 5, `latency ${latency}`);
  }
});

class Ticker extends SimNode {
  fired: number[] = [];
  state() {
    return { fired: [...this.fired] };
  }
  onStart(ctx: Ctx) {
    ctx.setTimer("Tick", 5);
    ctx.setTimer("Tick", 10);
    ctx.setTimer("Other", 3);
    ctx.cancelTimer("Other");
  }
  onTick(ctx: Ctx) {
    this.fired.push(ctx.now);
  }
}

test("setting a timer again replaces it; cancelled timers never fire", () => {
  const { run, nodes } = simulate({ nodes: { a: () => new Ticker() }, seed: 1, until: 100 });
  assert.deepEqual((nodes.a as Ticker).fired, [10]);
  assert.deepEqual(run.steps.map((s) => s.kind), ["start", "timer"]);
  assert.equal(run.steps[1].timer, "Tick");
});

class Forever extends SimNode {
  state() {
    return {};
  }
  onStart(ctx: Ctx) {
    ctx.setTimer("Tick", 1);
  }
  onTick(ctx: Ctx) {
    ctx.setTimer("Tick", 1);
  }
}

test("stops at `until`, and truncates runaway runs at MAX_EVENTS", () => {
  const short = simulate({ nodes: { a: () => new Forever() }, seed: 1, until: 10 });
  assert.equal(short.run.steps.at(-1)!.t, 10);
  assert.equal(short.run.truncated, false);
  const long = simulate({ nodes: { a: () => new Forever() }, seed: 1, until: 1e9 });
  assert.equal(long.run.truncated, true);
  assert.equal(long.run.steps.length, MAX_EVENTS);
});

class Echo extends SimNode {
  state() {
    return {};
  }
  onHello(ctx: Ctx, body: string, from: string) {
    ctx.send(from, "Hi", body.toUpperCase());
  }
  onBoom() {
    throw new Error("kaboom");
  }
}

test("client requests arrive at their time; replies land in the inbox", () => {
  const { run, inbox } = simulate({
    nodes: { a: () => new Echo() },
    seed: 1,
    until: 50,
    clients: [{ at: 4, to: "a", type: "Hello", body: "hey" }],
  });
  const hello = run.steps.find((s) => s.handler === "onHello")!;
  assert.equal(hello.t, 4);
  assert.equal(hello.msg!.from, CLIENT);
  assert.equal(inbox.length, 1);
  assert.deepEqual([inbox[0].type, inbox[0].body], ["Hi", "HEY"]);
  assert.equal(run.steps.at(-1)!.node, CLIENT);
});

test("a missing or throwing handler stops the run with an error", () => {
  const missing = simulate({ nodes: { a: () => new Echo() }, seed: 1, until: 50, clients: [{ at: 1, to: "a", type: "Nope" }] });
  assert.match(missing.run.error!, /no handler onNope/);
  const thrown = simulate({ nodes: { a: () => new Echo() }, seed: 1, until: 50, clients: [{ at: 1, to: "a", type: "Boom" }] });
  assert.match(thrown.run.error!, /kaboom/);
  assert.equal(thrown.run.steps.at(-1)!.error, "kaboom");
});

class Lister extends SimNode {
  items: number[] = [];
  state() {
    return { items: this.items };
  }
  onStart(ctx: Ctx) {
    ctx.setTimer("Add", 1);
  }
  onAdd(ctx: Ctx) {
    this.items.push(ctx.now);
    if (this.items.length < 3) ctx.setTimer("Add", 1);
  }
}

test("snapshots are deep copies, so later mutation does not rewrite history", () => {
  const { run } = simulate({ nodes: { a: () => new Lister() }, seed: 1, until: 10 });
  assert.deepEqual(run.steps.map((s) => s.nodes.a.state.items), [[], [1], [1, 2], [1, 2, 3]]);
});

class Lost extends SimNode {
  state() {
    return {};
  }
  onStart(ctx: Ctx) {
    ctx.send("zz", "Hello");
  }
}

test("unknown node ids in sends, faults or client ops stop the run with a clear error", () => {
  assert.match(simulate({ nodes: { a: () => new Lost() }, seed: 1, until: 5 }).run.error!, /unknown node "zz"/);
  assert.match(
    simulate({ nodes: pair(), seed: 1, until: 5, faults: [{ at: 1, kind: "crash", node: "zz" }] }).run.error!,
    /unknown node "zz"/,
  );
  assert.match(
    simulate({ nodes: pair(), seed: 1, until: 5, clients: [{ at: 1, to: "zz", type: "Ping" }] }).run.error!,
    /unknown node "zz"/,
  );
});

// Node "a" ticks every 5 and sends its tick time to every peer.
class Counter extends SimNode {
  static durable = ["saved"];
  saved = 0;
  scratch = 0;
  heard: number[] = [];
  state() {
    return { saved: this.saved, scratch: this.scratch, heard: [...this.heard] };
  }
  onStart(ctx: Ctx) {
    if (ctx.id === "a") ctx.setTimer("Tick", 5);
  }
  onTick(ctx: Ctx) {
    this.saved++;
    this.scratch++;
    for (const p of ctx.peers) ctx.send(p, "Note", ctx.now);
    ctx.setTimer("Tick", 5);
  }
  onNote(_ctx: Ctx, sentAt: number) {
    this.heard.push(sentAt);
  }
}
const counters = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, () => new Counter()]));

test("crash: messages to the node are dropped and its timers stop", () => {
  const { run, nodes } = simulate({
    nodes: counters("a", "b"),
    seed: 1,
    until: 30,
    latency: [1, 1],
    faults: [
      { at: 7, kind: "crash", node: "b" },
      { at: 12, kind: "crash", node: "a" },
    ],
  });
  assert.deepEqual((nodes.b as Counter).heard, [5]);
  assert.ok(run.steps.some((s) => s.kind === "drop" && s.dropReason === "crashed" && s.msg!.sentAt === 10));
  assert.ok(!run.steps.some((s) => s.kind === "timer" && s.t > 12));
});

test("recover: durable fields survive, the rest resets, and onStart runs again", () => {
  const { run, nodes } = simulate({
    nodes: counters("a", "b"),
    seed: 1,
    until: 26,
    latency: [1, 1],
    faults: [
      { at: 12, kind: "crash", node: "a" },
      { at: 20, kind: "recover", node: "a" },
    ],
  });
  const rec = run.steps.find((s) => s.kind === "recover")!;
  assert.equal(rec.t, 20);
  assert.equal(rec.handler, "onStart");
  assert.deepEqual(rec.nodes.a.state, { saved: 2, scratch: 0, heard: [] });
  assert.equal((nodes.a as Counter).saved, 3); // ticked again at 25
});

test("crashing a down node or recovering an up node does nothing", () => {
  const { run } = simulate({
    nodes: counters("a", "b"),
    seed: 1,
    until: 30,
    faults: [
      { at: 1, kind: "recover", node: "b" },
      { at: 2, kind: "crash", node: "b" },
      { at: 3, kind: "crash", node: "b" },
    ],
  });
  assert.equal(run.error, undefined);
  assert.deepEqual(
    run.steps.filter((s) => s.kind === "crash" || s.kind === "recover").map((s) => `${s.kind}@${s.t}`),
    ["crash@2"],
  );
});

test("partition drops messages between groups until heal", () => {
  const { run, nodes } = simulate({
    nodes: counters("a", "b", "c"),
    seed: 1,
    until: 17,
    latency: [1, 1],
    faults: [
      { at: 3, kind: "partition", groups: [["a"], ["b", "c"]] },
      { at: 12, kind: "heal" },
    ],
  });
  assert.equal(run.steps.filter((s) => s.dropReason === "partition").length, 4);
  assert.deepEqual((nodes.b as Counter).heard, [15]);
  assert.deepEqual(
    run.steps.filter((s) => s.kind === "partition" || s.kind === "heal").map((s) => s.partitions.length),
    [2, 0],
  );
});

test("a drop fault loses the next matching message", () => {
  const { run, nodes } = simulate({
    nodes: counters("a", "b"),
    seed: 1,
    until: 30,
    latency: [1, 1],
    faults: [{ at: 0, kind: "drop", to: "b", count: 1 }],
  });
  assert.deepEqual((nodes.b as Counter).heard, [10, 15, 20, 25]);
  assert.equal(run.steps.filter((s) => s.dropReason === "fault").length, 1);
});

test("a delay fault slows messages sent while it lasts, so they can arrive out of order", () => {
  const { nodes } = simulate({
    nodes: counters("a", "b"),
    seed: 1,
    until: 30,
    latency: [1, 1],
    faults: [{ at: 0, kind: "delay", extra: 10, until: 8 }],
  });
  assert.deepEqual((nodes.b as Counter).heard, [10, 5, 15, 20, 25]);
});

test("invariant violations are recorded and the run continues", () => {
  const { run } = simulate({
    nodes: counters("a", "b"),
    seed: 1,
    until: 20,
    invariant: (nodes) => ((nodes.a as Counter).saved >= 2 ? "a ticked twice" : null),
  });
  const flagged = run.steps.filter((s) => s.violation);
  assert.equal(flagged[0].t, 10);
  assert.equal(flagged[0].violation, "a ticked twice");
  assert.equal(run.steps.at(-1)!.t, 20);
});

test("hooks: runs are reported and chaos faults are added to the chosen run only", () => {
  const seen: number[] = [];
  hooks.count = 0;
  hooks.onRun = (r) => seen.push(r.steps.length);
  hooks.extraFaults = (i) => (i === 1 ? [{ at: 7, kind: "crash", node: "b" }] : []);
  try {
    const first = simulate({ nodes: counters("a", "b"), seed: 1, until: 12 });
    const second = simulate({ nodes: counters("a", "b"), seed: 1, until: 12 });
    assert.equal(seen.length, 2);
    assert.ok(!first.run.steps.some((s) => s.kind === "crash"));
    assert.ok(second.run.steps.some((s) => s.kind === "crash" && s.node === "b"));
  } finally {
    hooks.count = 0;
    hooks.onRun = null;
    hooks.extraFaults = null;
  }
});

class Sharer extends SimNode {
  log = [1];
  state() {
    return { log: [...this.log] };
  }
  onStart(ctx: Ctx) {
    if (ctx.id !== "a") return;
    ctx.send("b", "Log", { log: this.log });
    this.log.push(2);
  }
  onLog(_ctx: Ctx, body: { log: number[] }) {
    this.log = body.log;
  }
}

test("a sent message is a copy: later changes by the sender do not travel with it", () => {
  const { run, nodes } = simulate({ nodes: { a: () => new Sharer(), b: () => new Sharer() }, seed: 1, until: 10 });
  assert.deepEqual(run.steps[0].inFlight[0].body, { log: [1] });
  assert.deepEqual((nodes.b as Sharer).log, [1]);
});

test("unknown node ids in partition and drop faults stop the run with a clear error", () => {
  const groups = simulate({ nodes: pair(), seed: 1, until: 5, faults: [{ at: 1, kind: "partition", groups: [["a"], ["bb"]] }] });
  assert.match(groups.run.error!, /unknown node "bb"/);
  const drop = simulate({ nodes: pair(), seed: 1, until: 5, faults: [{ at: 1, kind: "drop", from: "zz", count: 1 }] });
  assert.match(drop.run.error!, /unknown node "zz"/);
});

class BadState extends SimNode {
  state() {
    return { f: () => 1 };
  }
}

test("an error thrown inside simulate() is recorded on its run, which is still reported", () => {
  const seen: string[] = [];
  hooks.onRun = (r) => seen.push(r.error ?? "ok");
  try {
    const { run } = simulate({ nodes: { a: () => new BadState() }, seed: 1, until: 5 });
    assert.match(run.error!, /could not be cloned|DataCloneError|clone/i);
    assert.equal(seen.length, 1);
  } finally {
    hooks.count = 0;
    hooks.onRun = null;
  }
});

class BadTimer extends SimNode {
  state() {
    return {};
  }
  onStart(ctx: Ctx) {
    ctx.setTimer("Tick", -5);
  }
}

class TypoDurable extends SimNode {
  static durable = ["savd"];
  saved = 0;
  state() {
    return { saved: this.saved };
  }
}

test("a negative or non-finite timer delay is a handler error", () => {
  const { run } = simulate({ nodes: { a: () => new BadTimer() }, seed: 1, until: 10 });
  assert.match(run.error!, /timer delay must be a finite number ≥ 0/);
  assert.ok(!run.steps.some((s) => s.t < 0));
});

test("a durable field that does not exist stops the run before it starts", () => {
  const { run } = simulate({ nodes: { a: () => new TypoDurable() }, seed: 1, until: 10 });
  assert.match(run.error!, /durable field "savd" does not exist on TypoDurable/);
  assert.equal(run.steps.length, 0);
});

test("each handler step records the class of the node that ran it", () => {
  const { run } = simulate({ nodes: pair(), seed: 1, until: 100 });
  assert.deepEqual([...new Set(run.steps.map((s) => s.className))], ["Pinger"]);
});
