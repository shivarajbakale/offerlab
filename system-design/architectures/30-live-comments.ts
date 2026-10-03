/**
 * 30. Live Comments
 * Level: Staff
 * Group: Architectures
 *
 * Problem: A live final is watched by a million people at once, and they comment: 500 comments a
 *   second, 2,500 when a goal goes in. Every viewer should see the comments scroll by within a
 *   second or two. Sending every comment to every viewer is a billion-message-a-second problem.
 *
 * Approach: Make the fan-out cost depend on viewers, not on comments
 *   1. Every comment to every viewer: each connection server writes each comment to each of its
 *   50,000 viewers, and their CPUs fill. 2. Batch: send each viewer one message every 200 ms; CPU
 *   is fine, but every comment is still sent, and the network cards fill. 3. Send a sample: at
 *   most 10 comments a second per viewer, which is more than anyone can read. 4. On a spike,
 *   sample before the room server too, so a goal cannot overload it.
 *
 * Cost: 1,000,000 viewers on 20 connection servers. Every comment to every viewer at 500 a
 *   second needs ~1,000 cores' worth of socket writes and 160 exist; deliveries fall seconds
 *   behind. Batching drops CPU to under 10%, but 100 KB a second per viewer fills every 10 Gbps card.
 *   Sampling to 10 a second: ~7% CPU, ~8% of the cards. A 2,500-a-second spike fills the room
 *   server and fails ~18% of posts; sampling 10% at intake fails none.
 *
 * Pattern: fan-out on write with batching, sampling (load shedding by design), pub/sub to
 *   connection servers
 * Key insight: Fan-out cost is messages x viewers. You cannot cut the viewers, so cut the
 *   messages: one batch per viewer per interval, holding only as many comments as a human can
 *   read. Then a room with ten times more comments costs the same to deliver.
 * Tradeoffs: Most comments in a huge room are never shown to anyone but their author. Viewers see
 *   comments up to a batch interval late, and per-viewer picks (friends first) show different viewers different samples.
 * Staff notes: Decide the display budget first (comments per second per viewer), then design
 *   backwards. Pick the sample with intent: verified accounts and the streamer's replies first,
 *   then random; for per-viewer picks (a viewer's friends), send each connection server a larger
 *   candidate batch and let it choose. Keep each viewer's connection on a connection server
 *   that subscribes to the room once, so the room server sends one copy per server, not per viewer.
 * Interview signals: "live comments", "Facebook Live / YouTube Live / Twitch chat", "millions of
 *   concurrent viewers", "WebSockets", "hot room", "fan-out".
 * Real world: Twitch and YouTube offer slow mode (one message per user every N seconds) for very
 *   busy chats, and YouTube's "Top chat" view shows a filtered subset. Connection servers holding
 *   many WebSockets each, subscribed to rooms through a pub/sub layer, are the common shape.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";
import type { CallStep, TrafficRun } from "../traffic/index.ts";

// People posting comments in the final's room: 500 a second on a normal minute.
const posters = (qps = 500) => clients({ to: "lb", qps: knob("qps", qps, [10, 20_000]), mix: { read: 0, write: 1 }, users: 100_000, keys: 1 });
// The comment API checks the comment (length, spam score) in 1 ms and passes it on.
const front = (calls: CallStep[]) => ({
  lb: loadBalancer({ to: "api" }),
  api: server({ label: "Comment API", replicas: 4, cores: 4, serviceMs: { read: 1, write: 1 }, calls }),
});
// The room server keeps the room's live state: it runs each comment through the room's filters
// and ranking (2 ms on 4 cores, at most ~2,000 a second) and hands comments to the deliveries.
const room = (deliveries = "deliver") => database({ label: "Room server", cores: 4, readMs: 2, writeMs: 2, connections: 50, calls: { write: [deliveries] } });
// A million viewers hold a connection (a WebSocket) to one of 20 connection servers: 50,000 each.
// Writing one message to one viewer's socket costs ~2 µs, so a message for all 50,000 costs ~100 ms
// of CPU; a 10 Gbps card per server. `bytes` is what one job sends to all of a server's viewers.
const connections = (ms: number, bytes: number) =>
  server({
    label: "Connection servers",
    replicas: 20,
    cores: 8,
    threads: 200,
    queue: 1000,
    serviceMs: { read: ms, write: ms },
    bandwidthMbps: 10_000,
    flowMbps: 10_000,
    bytes: { write: bytes },
  });
const VIEWERS_PER_SERVER = 50_000;
const COMMENT_BYTES = 200;
// One job per connection server, 20 per message. Consumers only hand the message over.
const deliver = (label: string, perComment: number) => queue({ label, consumers: 2000, workMs: 0.1, to: "connections", fanout: perComment });
// Every 200 ms the room sends one batch to each server: 5 x 20 = 100 jobs a second. The simulator
// makes jobs per comment, so with 500 comments a second reaching the room that is 0.2 per comment.
const BATCHES_PER_COMMENT = (5 * 20) / 500;

// @why Stage 1: the room server sends each comment to every connection server, which writes it
// @why to each of its 50,000 viewers.
export const everyComment = design("1. Every comment to every viewer", {
  posters: posters(),
  ...front(["room"]),
  room: room(),
  deliver: deliver("Deliveries", 20),
  connections: connections(100, VIEWERS_PER_SERVER * COMMENT_BYTES),
});

// @why Stage 2: the room collects comments for 200 ms and sends one batch per connection server;
// @why each viewer gets one message holding all ~100 comments of those 200 ms.
export const batched = design("2. Batch comments every 200 ms", {
  posters: posters(),
  ...front(["room"]),
  room: room(),
  deliver: deliver("Batches", BATCHES_PER_COMMENT),
  connections: connections(110, VIEWERS_PER_SERVER * COMMENT_BYTES * 100),
});

// @why Stage 3: a batch carries at most 2 comments (10 a second per viewer), picked by the room's
// @why ranking; the rest are kept but not broadcast.
export const sampled = design("3. Send a sample", {
  posters: posters(),
  ...front(["room"]),
  room: room(),
  deliver: deliver("Batches", BATCHES_PER_COMMENT),
  connections: connections(102, VIEWERS_PER_SERVER * COMMENT_BYTES * 2),
});

// Every comment is also saved (so its author and moderators can see it), in a store sharded by
// comment id: writes spread evenly over 8 machines whatever the room.
const store = () => server({ label: "Comment store", replicas: 8, cores: 4, serviceMs: { read: 2, write: 2 } });

// @why Stage 4, broken: a goal. 2,500 comments a second, all for the room server, which can rank ~2,000.
export const spike = design("4. A goal: five times the comments", {
  posters: posters(2500),
  ...front(["store", "room"]),
  store: store(),
  room: room(),
  deliver: deliver("Batches", (5 * 20) / 2000),
  connections: connections(102, VIEWERS_PER_SERVER * COMMENT_BYTES * 2),
});

// @why Stage 4: every comment is saved, but only a random 10% go on to the room as candidates
// @why for the broadcast: 250 a second to fill 10 slots a second.
export const sampleAtIntake = design("4. Sample before the room server", {
  posters: posters(2500),
  ...front(["store", "candidates"]),
  store: store(),
  candidates: queue({ label: "Candidates (10% sample)", consumers: 50, workMs: 0.1, to: "room", fanout: 0.1 }),
  room: room(),
  deliver: deliver("Batches", (5 * 20) / 250),
  connections: connections(102, VIEWERS_PER_SERVER * COMMENT_BYTES * 2),
});

// --- helpers for the scenarios ---

const S = { seconds: 8, seed: 1 };
const lateAt = (r: TrafficRun, t: number, q = "deliver") => summary(r, t - 0.1, t).oldestMs[q];

test("broken: every comment to every viewer — the connection servers' CPUs are full", () => {
  const r = run(everyComment, S);
  const s = summary(r, 3);
  // 500 comments x 20 servers x 100 ms = 1,000 cores' worth of work; there are 160.
  assert.ok(s.util.connections > 0.99, `cpu ${s.util.connections}`);
  assert.equal(s.errorRate, 0, "posting still works: the API only hands the comment on");
  assert.ok(lateAt(r, 5) > 2000 && lateAt(r, 8) > 5000, `deliveries ${lateAt(r, 5)} ms late at 5 s, ${lateAt(r, 8)} at 8 s`);
  assert.ok(summary(r, 7.9, 8).backlog.deliver > 50_000, `waiting ${summary(r, 7.9, 8).backlog.deliver}`);
});

test("broken: batches — the CPUs are idle and the network cards are full", () => {
  const r = run(batched, S);
  const s = summary(r, 3);
  assert.ok(s.util.connections < 0.1, `cpu ${s.util.connections}`);
  // 100 comments x 200 bytes x 5 a second = 100 KB a second per viewer; 50,000 viewers = 40 Gbps per server.
  assert.ok(s.nicUtil.connections > 0.99, `cards ${s.nicUtil.connections}`);
  // Batches pile up half-sent: ~360 in flight at once at 4 s, ~780 at 8 s, and still climbing.
  // 100 start a second, so each now takes several seconds to reach the viewers (Little's law).
  const inFlight = (t: number) => summary(r, t - 1, t).util.deliver * 2000;
  assert.ok(inFlight(4) > 300 && inFlight(4) < 420 && inFlight(8) > 700 && inFlight(8) < 850, `in flight ${inFlight(4)}, ${inFlight(8)}`);
});

test("sample: 10 comments a second per viewer, ~7% CPU and ~8% of the network cards", () => {
  const r = run(sampled, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.connections > 0.05 && s.util.connections < 0.09, `cpu ${s.util.connections}`);
  assert.ok(s.nicUtil.connections > 0.06 && s.nicUtil.connections < 0.1, `cards ${s.nicUtil.connections}`);
  assert.ok(lateAt(r, 8) < 50, `batches ${lateAt(r, 8)} ms late`);
  assert.ok(s.util.room > 0.2 && s.util.room < 0.3, `room ${s.util.room}`);
});

test("broken: a goal — the room server is full and posting fails", () => {
  const s = summary(run(spike, S), 3);
  assert.ok(s.util.room > 0.99, `room ${s.util.room}`);
  // The API's workers all wait on the room server.
  assert.ok(s.threads.api > 0.99, `api workers ${s.threads.api}`);
  assert.ok(s.errorRate > 0.15 && s.errorRate < 0.21, `errors ${s.errorRate}`);
  assert.ok(s.p50 > 300, `p50 ${s.p50}`);
  assert.ok(s.util.connections < 0.1, "delivery is not the problem");
});

test("sample at intake: the same goal, every comment saved, the room server 13% busy", () => {
  const s = summary(run(sampleAtIntake, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 < 55, `p50 ${s.p50}`);
  assert.ok(s.calls.store > 2300, `saved ${s.calls.store} a second`);
  assert.ok(s.calls.room > 200 && s.calls.room < 300, `candidates ${s.calls.room} a second`);
  assert.ok(s.util.room > 0.1 && s.util.room < 0.16, `room ${s.util.room}`);
  assert.ok(s.nicUtil.connections < 0.1, `cards ${s.nicUtil.connections}`);
});
