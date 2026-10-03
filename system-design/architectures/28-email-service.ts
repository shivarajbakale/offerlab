/**
 * 28. Email Service
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Other services ask us to send email: password resets, receipts, sign-in codes. We do
 *   not deliver mail ourselves; we hand each message to an outside email provider over its API,
 *   which takes about 200 ms. Providers have bad minutes: they hang, or stop answering. Keep
 *   email flowing, do not bury a sick provider, and do not send the same email twice.
 *
 * Approach: Queue the sends, then decide what a consumer does when the provider is sick
 *   1. A queue and one provider: the API answers at once; consumers hand mail to the provider.
 *   A 5 s hang stops all email. 2. Timeouts and retries: consumers stop waiting, but the provider
 *   keeps working on every send we gave up on, and each of those may arrive twice; a retry
 *   budget cuts retries and changes nothing else. 3. A circuit breaker: after a burst of
 *   timeouts, stop calling; failed jobs return to the queue a second later. 4. A second provider:
 *   sends go to whichever provider has fewer in flight, and a dead one is dropped at the next
 *   health check.
 *
 * Cost: 500 emails a second, ~100 sends in flight; ~$1.78 an hour. During a 5 s hang: one
 *   provider and no timeout leaves 2,100 emails waiting, the oldest 4.3 s; timeouts with retries
 *   make it 3,800 waiting, the oldest almost 10 s, and ~2,800 sends the provider finished after we
 *   gave up; the breaker cuts those to under 800 and empties the queue a second sooner, though the
 *   oldest still waits ~9.5 s (it holds the mail while open); two providers keep the oldest
 *   wait under 0.4 s for $0.03 an hour more (plus the second provider's own bill).
 *
 * Pattern: queue-based load leveling, timeouts, circuit breaker, provider failover
 * Key insight: A timeout does not cancel work: the provider keeps sending what we gave up on, and
 *   a retry of it can deliver the email twice. Behind a queue, the load on a provider is set by
 *   how many consumers call it, not by the retry count, so the tool that takes load off a sick
 *   provider is a breaker, and the tool that keeps mail flowing is a second provider.
 * Tradeoffs: A second provider means two integrations, two sets of sending domains to
 *   authenticate (SPF, DKIM) and two reputations to keep warm. A breaker turns a slow provider
 *   into a delayed queue: email arrives late rather than never.
 * Staff notes: Alert on the oldest email's age, per type of email: a sign-in code that is 2
 *   minutes late is useless. Keep sign-in codes and password resets on their own queue ahead of
 *   newsletters. Give every message an id and record it once accepted; a retry that finds the id
 *   skips the send. Most email APIs take no idempotency key, so a timeout is the one place a
 *   duplicate can still slip through.
 * Interview signals: "design an email service", "third-party provider is down", "SendGrid / SES
 *   outage", "do not send twice", "retry storm", "failover".
 * Real world: Amazon SES, SendGrid, Mailgun and Postmark are called from background workers.
 *   Large senders often contract two providers and shift traffic between them; SES, for one,
 *   also caps how many emails a second an account may send.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { breaker, call, clients, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";
import type { CallStep, TrafficRun } from "../traffic/index.ts";

// Every stage gets the same traffic: 500 "send this email" requests a second from other services.
const callers = () => clients({ to: "lb", qps: knob("qps", 500, [10, 5000]), mix: { read: 0, write: 1 } });
// The API checks the request, drops the email on the outbox queue and answers "accepted".
const api = () => ({
  lb: loadBalancer({ to: "api" }),
  api: server({ label: "Email API", replicas: 2, cores: 4, serviceMs: { read: 2, write: 2 }, calls: ["outbox"] }),
});
// 400 consumers. Each spends 5 ms rendering the template, then asks the sender to hand it over,
// and waits for the answer. 500 emails x ~0.2 s = ~100 consumers busy on a normal day.
const outbox = () => queue({ label: "Outbox", consumers: knob("consumers", 400, [10, 5000]), workMs: 5, to: "sender" });
// The sender is the consumers' connection to the provider: it makes the API call, with whatever
// timeout, retries and breaker the stage gives it.
const sender = (step: CallStep) =>
  server({ label: "Sender", replicas: 4, cores: 4, threads: 500, queue: 0, serviceMs: { read: 1, write: 1 }, calls: [step] });
// The provider takes ~200 ms to accept a message and lets us have 400 sends in flight.
const provider = (label = "Email provider") => external({ label, latencyMs: 200, concurrency: 400 });
// Give up on one attempt after 1 s (five times the normal 200 ms); try up to 3 times, 100 ms apart, then 200.
const TIMEOUT = { timeoutMs: 1000, retry: { attempts: 3, backoffMs: 100 } };

// @why Stage 1: the API only queues the email; consumers call the provider and wait for its
// @why answer, however long it takes.
export const oneProvider = design("1. A queue and one provider", {
  callers: callers(),
  ...api(),
  outbox: outbox(),
  sender: sender("provider"),
  provider: provider(),
});

// @why Stage 2: give up on a send after 1 s and try again, up to 3 attempts. A job whose attempts
// @why all fail goes back on the queue and is taken again a second later.
export const withTimeouts = design("2. Timeouts and retries", {
  callers: callers(),
  ...api(),
  outbox: outbox(),
  sender: sender(call("provider", TIMEOUT)),
  provider: provider(),
});

// @why The same, with a retry budget: retries may be at most 10% of first attempts over 10 s.
export const withBudget = design("2. Retries with a budget", {
  callers: callers(),
  ...api(),
  outbox: outbox(),
  sender: sender(call("provider", { ...TIMEOUT, retryBudget: 0.1 })),
  provider: provider(),
});

// @why Stage 3: a circuit breaker on each sender machine. Once half of the last 2 s of sends (at
// @why least 20) failed or timed out, it opens: for 2 s every send fails at once without calling
// @why the provider, and the job goes back on the queue. Then 5 trial sends decide whether to close.
export const withBreaker = design("3. A circuit breaker", {
  callers: callers(),
  ...api(),
  outbox: outbox(),
  sender: sender(breaker("provider", { ...TIMEOUT, retryBudget: 0.1, windowMs: 2000, minCalls: 20, openMs: 2000 })),
  provider: provider(),
});

// @why Stage 4: two providers behind a switch that sends each email to the one with fewer sends
// @why in flight, and checks every second that each is up. The breaker stays as the last guard.
export const twoProviders = design("4. A second provider", {
  callers: callers(),
  ...api(),
  outbox: outbox(),
  sender: sender(breaker("providers", { timeoutMs: 1000, retry: { attempts: 2 }, retryBudget: 0.1, windowMs: 2000, minCalls: 20, openMs: 2000 })),
  providers: loadBalancer({ to: "mailers", strategy: "least-connections" }),
  mailers: { ...provider("Email providers A and B"), replicas: 2 },
});

// --- helpers for the scenarios ---

const S = { seconds: 20, seed: 1 };
// The provider hangs from 5 s to 10 s: every send takes 25 times as long (5 s instead of 200 ms).
const hang = (target = "provider") => [{ at: 5000, kind: "slow" as const, target, factor: 25, durationMs: 5000 }];

/** The worst moments of a run: most emails waiting, oldest wait, most sends queued at the provider. */
function worst(r: TrafficRun, provider = "provider") {
  let waiting = 0;
  let oldest = 0;
  let atProvider = 0;
  for (let t = 1; t <= r.frames.length; t++) {
    const s = summary(r, (t - 1) / 10, t / 10);
    waiting = Math.max(waiting, s.backlog.outbox);
    oldest = Math.max(oldest, s.oldestMs.outbox);
    atProvider = Math.max(atProvider, s.queue[provider]);
  }
  return { waiting, oldest, atProvider };
}
const emptyAt = (r: TrafficRun, t: number) => summary(r, t - 0.1, t).backlog.outbox === 0;
/** Job attempts that failed and went back on the queue, a second, between two times. */
const bounced = (r: TrafficRun, from: number, to: number) =>
  r.frames.filter((f) => f.t > from * 1000 && f.t <= to * 1000).reduce((n, f) => n + f.stations.outbox.failed, 0) / (to - from);

test("one provider: 500 emails a second, about 100 consumers busy", () => {
  const r = run(oneProvider, S);
  const s = summary(r, 2);
  assert.equal(s.errorRate, 0);
  assert.ok(s.p50 > 40 && s.p50 < 50, `the API answers in ${s.p50} ms`);
  assert.ok(s.util.outbox > 0.22 && s.util.outbox < 0.32, `consumers busy ${s.util.outbox}`);
  assert.ok(worst(r).waiting < 20, `waiting ${worst(r).waiting}`);
  assert.ok(Math.abs(s.costPerHour - 1.78) < 0.02, `cost ${s.costPerHour}`);
});

test("broken: one provider hangs — every consumer waits on it and email stops", () => {
  const r = run(oneProvider, { ...S, faults: hang() });
  const w = worst(r);
  // Callers notice nothing: the API only queues.
  assert.equal(summary(r, 2).errorRate, 0);
  assert.ok(summary(r, 7, 10).util.outbox > 0.98, "all 400 consumers waiting");
  assert.ok(w.waiting > 2000 && w.waiting < 2200, `waiting ${w.waiting}`);
  assert.ok(w.oldest > 4000 && w.oldest < 4500, `oldest ${w.oldest}`);
  assert.equal(summary(r).wasted, 0, "nothing given up on, so nothing sent twice");
  assert.ok(!emptyAt(r, 15) && emptyAt(r, 16), "caught up about 5 s after the provider recovers");
});

test("broken: timeouts and retries — the provider is buried under sends we gave up on", () => {
  const r = run(withTimeouts, { ...S, faults: hang() });
  const w = worst(r);
  // Consumers stop waiting after 1 s and start the next send, so ~400 calls a second keep coming.
  const during = summary(r, 6, 10).links["sender>provider"];
  assert.ok(during.calls > 350 && during.timedOut > 350 && during.retries > 250 && during.retries < 320, JSON.stringify(during));
  assert.ok(w.atProvider > 1200 && w.atProvider < 1450, `queued at the provider ${w.atProvider}`);
  // Sends the provider finished after we stopped waiting: each one may reach the inbox twice.
  const twice = summary(r).wasted;
  assert.ok(twice > 2600 && twice < 3000, `finished after we gave up ${twice}`);
  assert.ok(w.waiting > 3600 && w.waiting < 4000, `waiting ${w.waiting}`);
  // An email queued early in the hang fails every try and keeps coming back; a retry does not
  // reset its age, so by the time it is sent it has waited almost 10 s.
  assert.ok(w.oldest > 9200 && w.oldest < 10_200, `oldest ${w.oldest}`);
  assert.ok(!emptyAt(r, 16) && emptyAt(r, 18), "caught up later than with no timeout at all");
});

test("broken: a retry budget alone — fewer retries, the same pile-up", () => {
  const r = run(withBudget, { ...S, faults: hang() });
  const during = summary(r, 6, 10).links["sender>provider"];
  // Retries fall to ~100 a second (from ~290), yet the calls do not: consumers take new jobs instead.
  assert.ok(during.retries > 80 && during.retries < 120 && during.calls > 350, JSON.stringify(during));
  assert.ok(worst(r).atProvider > 1400, `queued at the provider ${worst(r).atProvider}`);
  assert.ok(summary(r).wasted > 2800, `finished after we gave up ${summary(r).wasted}`);
});

test("breaker: within 2 s calls stop, the provider recovers, and jobs wait on the queue", () => {
  const r = run(withBreaker, { ...S, faults: hang() });
  const w = worst(r);
  const during = summary(r, 8, 11);
  assert.ok(during.links["sender>provider"].openShare > 0.95, `open ${during.links["sender>provider"].openShare}`);
  assert.ok(during.calls.provider < 20, `calls reaching the provider ${during.calls.provider} a second`);
  // Jobs fail at once and come back a second later: ~1,000-2,600 cheap bounces a second, not calls.
  assert.ok(bounced(r, 8, 11) > 1000, `bounced ${bounced(r, 8, 11)}`);
  assert.ok(during.util.outbox < 0.1, `consumers busy ${during.util.outbox}`);
  assert.ok(w.atProvider < 300, `queued at the provider ${w.atProvider}`);
  assert.ok(summary(r).wasted < 800, `finished after we gave up ${summary(r).wasted}`);
  // The breaker turns "slow" into "late": an email queued as the hang began bounces until it closes
  // and keeps its age through every bounce, so the oldest still waits ~9.5 s.
  assert.ok(w.oldest > 9000 && w.oldest < 10_000, `oldest ${w.oldest}`);
  assert.ok(emptyAt(r, 16), "caught up by 16 s");
});

test("two providers: provider A hangs and B takes the mail", () => {
  const r = run(twoProviders, { ...S, faults: hang("mailers-1") });
  const w = worst(r, "mailers");
  assert.ok(w.oldest < 400, `oldest ${w.oldest}`);
  assert.ok([12, 14, 16, 18, 20].every((t) => emptyAt(r, t)), "nothing waiting once A recovers");
  assert.ok(summary(r).wasted < 350, `finished after we gave up ${summary(r).wasted}`);
  assert.equal(summary(r, 6, 10).links["sender>providers"].openShare, 0, "the breaker never needs to open");
  assert.ok(Math.abs(summary(r, 2).costPerHour - 1.81) < 0.02, `cost ${summary(r, 2).costPerHour}`);
});

test("two providers: provider A goes down for 5 s and no email waits", () => {
  const down = [
    { at: 5000, kind: "kill" as const, target: "mailers-1" },
    { at: 10_000, kind: "restart" as const, target: "mailers-1" },
  ];
  const r = run(twoProviders, { ...S, faults: down });
  const link = summary(r, 5, 6).links["sender>providers"];
  // Until the next health check, sends to A fail at once; each is retried, and lands on B.
  assert.ok(link.failed > 20 && link.retries >= link.failed, JSON.stringify(link));
  assert.ok(worst(r, "mailers").waiting < 10, `waiting ${worst(r, "mailers").waiting}`);
  assert.equal(bounced(r, 5, 10), 0, "no job had to go back on the queue");
  assert.ok(summary(r, 7, 10).replicaUtil.mailers[0] === 0, "A is out of the rotation");
});
