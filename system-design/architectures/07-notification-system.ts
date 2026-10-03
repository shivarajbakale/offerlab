/**
 * 07. Notification System
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Other services ask us to notify a user ("your order shipped"). We deliver it as a
 *   push notification, an email and a text message (SMS) through outside providers that are
 *   slow, and sometimes much slower. A slow provider must not break anything else.
 *
 * Approach: Take the providers out of the request, then keep them out of each other's way
 *   1. Send inside the request: the API calls all three providers before answering.
 *   2. One queue: the API stores the request, drops jobs on a queue and answers; consumers call
 *   the providers. 3. A queue per channel, so a slow SMS provider only delays SMS.
 *   4. Size each channel's consumers from rate x time per job, plus headroom to catch up.
 *
 * Cost: 300 notifications a second = 900 provider calls; each job holds a consumer ~125 ms, so
 *   ~38 consumers per channel are busy all the time. Inside the request, a 10x slower SMS
 *   provider fails ~65% of all requests, reads included; with one shared queue of 210 consumers
 *   every job (push included) waits ~2 s; with 70 consumers per channel push and email wait
 *   ~0 s while SMS waits ~3.7 s. After a 5 s slowdown, 40 SMS consumers (20 jobs a second spare)
 *   barely dent the ~1,400-job backlog and need a minute or more; 70 clear it 6 s after the
 *   provider recovers.
 *
 * Pattern: asynchronous work queues, bulkheads (one queue and consumer pool per dependency)
 * Key insight: A worker that waits on a slow dependency is a worker nobody else can use. Queues
 *   move the wait out of the request, and separate queues stop one slow dependency from using up
 *   the workers that other dependencies need.
 * Tradeoffs: Callers get "accepted", not "delivered". More queues mean more consumer pools to
 *   size and watch. Queues give at-least-once delivery, so duplicates must be removed on purpose.
 * Staff notes: Consumers needed = jobs a second x seconds per job (Little's law), plus headroom
 *   to drain a backlog after a slowdown. Alert on the oldest job's age per channel. Retry with
 *   backoff and a cap, then park the job in a dead-letter queue. Give each notification an id and
 *   remember sent ids, so a retried job is rarely sent twice (most providers take no idempotency key). Expire jobs that are too late to matter.
 * Interview signals: "design a notification service", "push, email and SMS", "third-party
 *   provider is down", "exactly once", "priority notifications".
 * Real world: Providers like Apple Push Notification service, Firebase Cloud Messaging, Amazon
 *   SES and Twilio are called from background workers fed by queues (Amazon SQS, RabbitMQ, Kafka).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same traffic: 1,000 requests a second from other services. 70% read a
// user's settings or inbox; 30% ask us to send a notification, which goes out on all three channels.
const callers = () => clients({ to: "lb", qps: knob("qps", 1000, [10, 100_000]), mix: { read: 0.7, write: 0.3 } });
const lb = () => loadBalancer({ to: "api" });
const api = (write: string[]) =>
  server({ label: "Notification API", replicas: 4, cores: 4, serviceMs: { read: 2, write: 3 }, calls: { read: ["db"], write } });
// Settings, inbox and a record of every notification asked for.
const db = () => database({ cores: 4, readMs: 1, writeMs: 2 });
// Each provider answers in about 100 ms, 10 ms away over the internet.
const provider = (label: string) => external({ label, latencyMs: 100 });
// A consumer spends 5 ms of its own (load the template, fill it in), then calls the provider.
const WORK_MS = 5;

// @why Stage 1: the API calls the push, email and SMS providers one after another, and only
// @why then answers the caller. Its worker is held for the whole time.
export const inRequest = design("1. Send inside the request", {
  callers: callers(),
  lb: lb(),
  api: api(["db", "push", "email", "sms"]),
  db: db(),
  push: provider("Push provider"),
  email: provider("Email provider"),
  sms: provider("SMS provider"),
});

// @why Stage 2: the API records the request, drops three jobs (one per channel) on one queue and
// @why answers at once. Shared consumers take jobs in order; the providers take turns (push, email, SMS).
export const oneQueue = design("2. One queue for every channel", {
  callers: callers(),
  lb: lb(),
  api: api(["db", "jobs"]),
  db: db(),
  jobs: queue({ label: "Notifications", consumers: knob("consumers", 210, [1, 1000]), workMs: WORK_MS, to: "providers", fanout: 3 }),
  providers: database({
    role: "external",
    label: "Providers: push, email, SMS",
    replicas: 3,
    cores: 1000,
    connections: 1000,
    hopMs: 10,
    readMs: 100,
    writeMs: 100,
    costPerHour: 0,
  }),
});

const perChannel = (name: string, sms: number, other = 70) =>
  design(name, {
    callers: callers(),
    lb: lb(),
    api: api(["db", "pushJobs", "emailJobs", "smsJobs"]),
    db: db(),
    pushJobs: queue({ label: "Push jobs", consumers: knob("pushConsumers", other, [1, 500]), workMs: WORK_MS, to: "push" }),
    emailJobs: queue({ label: "Email jobs", consumers: knob("emailConsumers", other, [1, 500]), workMs: WORK_MS, to: "email" }),
    smsJobs: queue({ label: "SMS jobs", consumers: knob("smsConsumers", sms, [1, 500]), workMs: WORK_MS, to: "sms" }),
    push: provider("Push provider"),
    email: provider("Email provider"),
    sms: provider("SMS provider"),
  });

// @why Stage 3: one queue and one pool of consumers per channel. A slow SMS provider can only
// @why hold the SMS consumers; push and email consumers keep working.
export const queuePerChannel = perChannel("3. A queue per channel", 70);
// @why The SMS pool given 25 consumers: fewer than the work needs even on a good day.
export const tooFewSms = perChannel("3. Too few SMS consumers", 25);

// @why Stage 4, broken: 40 SMS consumers, just above the 38 the arithmetic asks for. Fine on a
// @why good day; after a slowdown there is almost no spare capacity to catch up.
export const justEnough = perChannel("4. Just enough consumers", 40);
// @why Stage 4: 70 SMS consumers, about 1.8 times what a normal day needs: room to drain a backlog.
export const withHeadroom = perChannel("4. Consumers with headroom", 70);

// --- helpers for the scenarios ---

const S = { seed: 1, seconds: 15 };
// The SMS provider becomes 10 times slower (1 s a message instead of 100 ms) from 5 s to 10 s.
const slowSms = (target = "sms") => [{ at: 5000, kind: "slow" as const, target, factor: 10, durationMs: 5000 }];

test("send inside the request: fine while every provider is fast", () => {
  const s = summary(run(inRequest, S), 1);
  assert.equal(s.errorRate, 0);
  // Reads take ~46 ms; a notification request waits for three providers in a row, ~0.4 to 0.6 s.
  assert.ok(s.p50 < 60 && s.p99 > 350 && s.p99 < 700, `p50 ${s.p50}, p99 ${s.p99}`);
  assert.ok(s.threads.api > 0.4 && s.threads.api < 0.7, `workers ${s.threads.api}`);
});

test("broken: send inside the request — a slow SMS provider fails unrelated reads", () => {
  const r = run(inRequest, { ...S, faults: slowSms() });
  assert.equal(summary(r, 1, 5).errorRate, 0);
  const s = summary(r, 6, 10);
  // Only 30% of requests send anything, yet far more than 30% fail: reads fail too.
  assert.ok(s.errorRate > 0.55 && s.errorRate < 0.75, `errors ${s.errorRate}`);
  assert.ok(s.threads.api > 0.95 && s.util.api < 0.12, `workers ${s.threads.api}, cpu ${s.util.api}`);
});

test("one queue: with the same slow SMS provider, callers notice nothing", () => {
  const s = summary(run(oneQueue, { ...S, faults: slowSms("providers-3") }), 6, 10);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p99 < 60, `p99 ${s.p99}`);
  assert.ok(s.threads.api < 0.05, `workers ${s.threads.api}`);
});

test("broken: one queue — a slow SMS provider makes every push and email wait too", () => {
  const r = run(oneQueue, { ...S, faults: slowSms("providers-3") });
  assert.ok(summary(r, 1, 5).oldestMs.jobs < 50);
  const s = summary(r, 9, 10);
  assert.ok(s.util.jobs > 0.95, `consumers ${s.util.jobs}`);
  assert.ok(s.backlog.jobs > 1200 && s.oldestMs.jobs > 1500 && s.oldestMs.jobs < 2600, `backlog ${s.backlog.jobs}, oldest ${s.oldestMs.jobs}`);
  assert.ok(summary(r, 12, 13).backlog.jobs > 0 && summary(r, 13, 14).backlog.jobs < 100, "empty about 4 s after SMS recovers");
});

test("a queue per channel: push and email keep flowing while SMS backs up", () => {
  const r = run(queuePerChannel, { ...S, faults: slowSms() });
  const s = summary(r, 9, 10);
  assert.equal(summary(r, 1).errorRate, 0);
  assert.ok(s.oldestMs.pushJobs < 50 && s.oldestMs.emailJobs < 50, `push ${s.oldestMs.pushJobs}, email ${s.oldestMs.emailJobs}`);
  assert.ok(s.backlog.smsJobs > 900 && s.backlog.smsJobs < 1300 && s.oldestMs.smsJobs > 3300 && s.oldestMs.smsJobs < 4100, `sms backlog ${s.backlog.smsJobs}, oldest ${s.oldestMs.smsJobs}`);
});

test("broken: too few SMS consumers — the backlog grows on a good day", () => {
  const r = run(tooFewSms, S);
  const s = summary(r, 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.smsJobs > 0.95 && s.util.pushJobs < 0.65, `sms ${s.util.smsJobs}, push ${s.util.pushJobs}`);
  const early = summary(r, 4, 5).backlog.smsJobs;
  const late = summary(r, 14, 15);
  assert.ok(late.backlog.smsJobs > 1200 && late.backlog.smsJobs > 2 * early, `backlog ${early} -> ${late.backlog.smsJobs}`);
  assert.ok(late.oldestMs.smsJobs > 4000, `oldest ${late.oldestMs.smsJobs}`);
});

test("broken: just enough consumers — after a slowdown the SMS backlog barely drains", () => {
  const r = run(justEnough, { ...S, faults: slowSms() });
  const good = summary(r, 1, 5).util.smsJobs;
  assert.ok(good > 0.93, `37.5 of 40 needed: ${good} busy on a good day`);
  const at10 = summary(r, 9, 10).backlog.smsJobs;
  const at15 = summary(r, 14, 15);
  // Only 20 jobs a second to spare: five seconds after recovery the backlog is still ~1,300.
  assert.ok(at10 > 1000 && at15.backlog.smsJobs > 0.8 * at10, `backlog ${at10} -> ${at15.backlog.smsJobs}`);
  assert.ok(at15.oldestMs.smsJobs > 4000, `oldest ${at15.oldestMs.smsJobs}`);
});

test("consumers with headroom: the SMS backlog is gone 6 s after the slowdown ends", () => {
  const r = run(withHeadroom, { ...S, seconds: 18, faults: slowSms() });
  assert.ok(summary(r, 1, 5).util.smsJobs < 0.6, "about half busy on a good day");
  assert.ok(summary(r, 10, 11).backlog.smsJobs > 1000);
  // The 1 s jobs in progress finish first, then ~1,100 jobs / 260 spare a second ≈ 4.5 s.
  const end = summary(r, 15, 16);
  assert.ok(end.backlog.smsJobs < 20 && end.oldestMs.smsJobs < 100, `backlog ${end.backlog.smsJobs}, oldest ${end.oldestMs.smsJobs}`);
});
