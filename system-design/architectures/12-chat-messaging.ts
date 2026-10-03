/**
 * 12. Chat Messaging
 * Level: Senior
 * Group: Architectures
 *
 * Problem: People send messages in one-to-one and group conversations. Each message must be
 *   stored, reach every other member within a fraction of a second if they are online, reach
 *   them later if they are not, and appear in the same order for everyone. A few groups have
 *   thousands of members.
 *
 * Approach: Store once, then push to open connections through a queue
 *   1. Phones poll the database every 2 seconds for new messages. 2. Phones keep a connection
 *   open to a gateway server; sending stores the message and puts one delivery job per
 *   recipient on a queue; consumers push each one down the recipient's open connection, or to
 *   the phone's push service if the recipient is offline. 3. A 2,000-member group joins the
 *   same delivery queue. 4. Big groups get their own queue, and fan out once per gateway, not
 *   once per member.
 *
 * Cost: polling makes ~5,000 database reads a second for 10,000 online people and fills an
 *   8-core database (sends fail 15% of the time and take ~120 ms); with push, a send is
 *   answered in ~10 ms and the database is under 40% busy. One big group raises the average
 *   fan-out from 1.5 to 21.5 jobs a message: the shared queue falls 5 s behind in 10 s, or with
 *   twice the consumers keeps up while the gateways go from 13% to ~70% busy. On its own
 *   queue, fanned out per gateway, it costs 4 jobs a message.
 *
 * Pattern: fan-out on write through a queue, persistent connections, store-and-forward
 * Key insight: Store each message once, in its conversation, with a sequence number; delivery
 *   is a separate, retryable step. Online delivery is a push down a connection that is already
 *   open, so the work per message is proportional to its recipients, and a few huge groups can
 *   be most of that work.
 * Tradeoffs: Gateways hold state (open connections), so losing one drops thousands of people
 *   at once and they must reconnect and catch up. Fan-out on write makes a big group's message
 *   cost thousands of jobs. Ordering is only promised within a conversation.
 * Staff notes: Order comes from a per-conversation sequence number assigned where the message
 *   is stored, not from arrival time at the phone; phones sort by it and ask for gaps. Keep a
 *   "last sequence seen" per device, so reconnecting is "give me everything after N". Separate
 *   big-group traffic from one-to-one traffic so one cannot delay the other.
 * Interview signals: "design WhatsApp / Messenger / Slack", "online presence", "delivered and
 *   read receipts", "group chat", "message ordering", "offline delivery", "WebSocket".
 * Real world: WhatsApp built its servers on Erlang and wrote in 2012 of passing 2 million open
 *   connections on one server. Slack has described gateway servers that hold clients'
 *   WebSocket connections, separate from channel servers that order and fan out each channel's
 *   messages. Phones that are not connected are woken through Apple's (APNs) or Google's (FCM)
 *   push services.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same people: 10,000 online, sending 1,000 messages a second between them.
// Users are measured from our edge, 1 ms away, so latencies are time spent in our systems.
// The conversation store: messages appended to their conversation, 2 ms to store one, 2 ms to
// read the latest 50 of a conversation. 8 cores: about 4,000 operations a second.
const messages = () => database({ label: "Messages", cores: 8, readMs: 2, writeMs: 2, connections: 100 });

// @why Stage 1: no open connections. Each phone asks "anything new since message N?" every
// @why 2 seconds: 10,000 phones make 5,000 polls a second, beside the 1,000 messages sent.
// @why A poll is an index lookup of about 1.5 ms; a send stores the message.
export const polling = design("1. Phones poll for new messages", {
  phones: clients({ to: "lb", qps: knob("qps", 6000, [100, 20_000]), mix: { read: 5, write: 1 }, hopMs: 1 }),
  lb: loadBalancer({ to: "app" }),
  app: server({ label: "Chat API", replicas: 4, cores: 4, serviceMs: { read: 0.5, write: 1 }, calls: ["db"] }),
  db: database({ label: "Messages", cores: 8, readMs: 1.5, writeMs: 2, connections: 100 }),
});

// Gateways hold every online phone's open connection (a WebSocket). A request from a phone costs
// 1 ms of gateway CPU; receiving one delivery request from a consumer (decode, find the socket,
// write) costs 0.5 ms. A per-gateway job's local loop over its members' sockets is not counted
// (far cheaper per member than a separate request, but not zero). The pushes come
// from the delivery queue, not from phones; the simulator sends them as a third kind of request
// ("static") so they can have their own cost and no further calls.
const gateways = (write: string[]) =>
  server({ label: "Connection gateways", replicas: 4, cores: 4, threads: 200, serviceMs: { read: 1, write: 1, static: 0.5 }, calls: { read: ["db"], write } });
// One delivery job: look up which gateway holds the recipient's connection (a presence registry
// in memory, 1 ms all told here), then hand it the message to push.
const deliveries = (fanout: number) =>
  queue({ label: "Deliveries", consumers: knob("consumers", 40, [10, 400]), workMs: 1, to: "gateways", kind: "static", fanout: knob("recipients", fanout, [0, 40]) });
// Recipients who are offline: a job asks Apple's or Google's push service to wake the phone.
const offline = () => queue({ label: "Offline pushes", consumers: 150, workMs: 1, to: "pushService", fanout: 0.5 });
const pushService = () => external({ label: "Phone push service (APNs, FCM)", latencyMs: 150 });

// After stage 1 the phones only send messages and, now and then, open a conversation and load
// its latest messages: 1,000 sends and 250 history loads a second.
const phones = () => clients({ to: "lb", qps: knob("qps", 1250, [100, 10_000]), mix: { read: 1, write: 4 }, hopMs: 1 });

// @why Stage 2: phones keep a connection open to a gateway. A send stores the message once, then
// @why queues one delivery job per online recipient (1.5 on average: most chats are one-to-one,
// @why some are small groups) and one push job per offline recipient (0.5 on average). It answers
// @why the sender as soon as the jobs are queued.
export const pushed = design("2. Open connections, fan-out through a queue", {
  phones: phones(),
  lb: loadBalancer({ to: "gateways" }),
  gateways: gateways(["db", "deliveries", "offline"]),
  db: messages(),
  deliveries: deliveries(1.5),
  offline: offline(),
  pushService: pushService(),
});

// @why Stage 3, broken: 1% of messages now go to one group of 2,000 members, all online. Each
// @why of those makes 2,000 delivery jobs on the same queue: on average a message now makes
// @why 0.99 x 1.5 + 0.01 x 2,000 = 21.5 jobs instead of 1.5.
export const hotGroup = design("3. A 2,000-member group shares the queue", {
  phones: phones(),
  lb: loadBalancer({ to: "gateways" }),
  gateways: gateways(["db", "deliveries", "offline"]),
  db: messages(),
  deliveries: deliveries(21.5),
  offline: offline(),
  pushService: pushService(),
});

// @why Stage 4: a big group's message goes on its own queue and makes one job per gateway (4),
// @why not one per member. Each gateway knows which of its own connections belong to the group
// @why and writes the message to each of them. One-to-one and small-group traffic keeps its queue.
export const perGateway = design("4. Big groups: own queue, one job per gateway", {
  phones: phones(),
  lb: loadBalancer({ to: "gateways" }),
  gateways: gateways(["db", "deliveries", "groupFanout", "offline"]),
  db: messages(),
  deliveries: deliveries(1.5),
  // 1% of messages x 4 gateways. Reading the group's members on that gateway takes 20 ms.
  groupFanout: queue({ label: "Big-group fan-out", consumers: 10, workMs: 20, to: "gateways", kind: "static", fanout: 0.04 }),
  offline: offline(),
  pushService: pushService(),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };

test("broken: polling — 5,000 polls a second fill the database, and sends fail with them", () => {
  const r = run(polling, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "db");
  assert.ok(s.util.db > 0.98, `db ${s.util.db}`);
  assert.ok(s.util.app < 0.25, `app ${s.util.app}`);
  // Sends wait in the same line as the polls.
  assert.ok(s.byKind.write!.errorRate > 0.1 && s.byKind.write!.errorRate < 0.2, `send errors ${s.byKind.write!.errorRate}`);
  assert.ok(s.byKind.write!.p50 > 100 && s.byKind.write!.p50 < 140, `send p50 ${s.byKind.write!.p50}`);
});

test("push: a send is stored and answered in about 10 ms, and no delivery waits", () => {
  const r = run(pushed, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.byKind.write!.p50 > 8 && s.byKind.write!.p50 < 12, `send p50 ${s.byKind.write!.p50}`);
  // 1,000 messages a second become 1,500 pushes and 500 phone notifications.
  assert.ok(Math.abs(s.calls.deliveries - 1500) < 100 && Math.abs(s.calls.offline - 500) < 60, `jobs ${s.calls.deliveries}, ${s.calls.offline}`);
  assert.ok(s.util.db < 0.4 && s.util.gateways > 0.1 && s.util.gateways < 0.16, `db ${s.util.db}, gateways ${s.util.gateways}`);
  assert.ok(s.util.deliveries < 0.15, `delivery consumers ${s.util.deliveries}`);
  const end = summary(r, 9.9, 10);
  assert.ok(end.oldestMs.deliveries < 5, `oldest ${end.oldestMs.deliveries}`);
});

test("broken: a 2,000-member group — every chat's deliveries wait behind it", () => {
  // Each simulated job stands for 10 real ones, to keep the run small.
  const r = run(hotGroup, { ...S, scale: 10 });
  const s = summary(r, 3);
  // The sender sees nothing wrong.
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.deliveries > 0.98, `consumers ${s.util.deliveries}`);
  const mid = summary(r, 4.9, 5);
  const end = summary(r, 9.9, 10);
  assert.ok(mid.oldestMs.deliveries > 2000 && mid.oldestMs.deliveries < 3000, `oldest at 5 s ${mid.oldestMs.deliveries}`);
  assert.ok(end.oldestMs.deliveries > 4000 && end.oldestMs.deliveries < 5500, `oldest at 10 s ${end.oldestMs.deliveries}`);
  assert.ok(end.backlog.deliveries > 80_000, `backlog ${end.backlog.deliveries}`);
});

test("broken: a 2,000-member group — 80 consumers keep up, but the gateways are 70% busy pushing", () => {
  const r = run(hotGroup, { ...S, scale: 10, knobs: { consumers: 80 } });
  const s = summary(r, 3);
  assert.ok(s.util.gateways > 0.65 && s.util.gateways < 0.78, `gateways ${s.util.gateways}`);
  assert.ok(s.util.deliveries > 0.9, `consumers ${s.util.deliveries}`);
  assert.ok(summary(r, 9.9, 10).oldestMs.deliveries < 200, `oldest ${summary(r, 9.9, 10).oldestMs.deliveries}`);
});

test("per gateway: the big group costs 4 jobs a message, and one-to-one chats never wait", () => {
  const r = run(perGateway, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  assert.ok(Math.abs(s.calls.groupFanout - 40) < 15, `group jobs ${s.calls.groupFanout}`);
  assert.ok(Math.abs(s.calls.deliveries - 1500) < 100, `pushes ${s.calls.deliveries}`);
  assert.ok(s.util.gateways < 0.2 && s.util.deliveries < 0.15, `gateways ${s.util.gateways}, consumers ${s.util.deliveries}`);
  const end = summary(r, 9.9, 10);
  assert.ok(end.oldestMs.deliveries < 5 && end.oldestMs.groupFanout < 5, `oldest ${end.oldestMs.deliveries}, ${end.oldestMs.groupFanout}`);
  assert.ok(s.costPerHour > 1.4 && s.costPerHour < 1.6, `cost ${s.costPerHour}`);
});
