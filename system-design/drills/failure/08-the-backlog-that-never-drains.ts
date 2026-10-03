/**
 * 08. The Backlog That Never Drains
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: the email provider was down from 3 s to 7 s; it has been healthy since, users see no
 *   errors, yet at 30 s the email queue still holds hundreds of jobs and emails go out seconds
 *   late. Cause (hidden from the reader): the consumers are sized for normal traffic (about 90%
 *   busy), so only about a tenth of their capacity is left to work off the backlog.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { clients, database, design, external, loadBalancer, queue, server, summary } from "../../traffic/index.ts";

// 800 requests a second, half of them sign-ups or orders that each queue one email: 400 jobs a
// second. A consumer takes about 100 ms per email, so it does about 10 a second: 40 consumers
// would just keep up. The email provider is outside our control.
const mail = (name: string, consumers: number) =>
  design(name, {
    users: clients({ to: "lb", qps: 800, mix: { read: 0.5, write: 0.5 } }),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 3, cores: 4, serviceMs: { read: 4, write: 5 }, calls: { read: ["db"], write: ["db", "emails"] } }),
    db: database({ cores: 4, readMs: 2, writeMs: 4 }),
    emails: queue({ label: "Email jobs", consumers, workMs: 100, via: "mailer" }),
    mailer: external({ label: "Email provider", latencyMs: 100 }),
  });

// The provider is down for 4 seconds, then back, healthy.
const outage = [
  { at: 3000, kind: "kill" as const, target: "mailer" },
  { at: 7000, kind: "restart" as const, target: "mailer" },
];

export const drill = failureDrill({
  title: "The provider is back, the emails are not",
  context:
    "Sign-ups and orders: users → load balancer → **3 app servers** → a database, and each sign-up or order puts one **email job** on a queue (about 400 a second). **44 consumers** take jobs off the queue and send them through an outside **email provider**. The provider had an outage from 3 s to 7 s; a job that fails goes back on the queue and is tried again a second later, so nothing was lost. The provider has been healthy since 7 s and users see no errors. But at 30 s the queue still holds about 650 jobs and emails arrive seconds late. The consumers are 100% busy and none of their jobs are failing.",
  design: mail("44 consumers", 44),
  faults: outage,
  seconds: 30,
  seed: 1,
  question: "Why is the backlog still there 23 seconds after the provider came back?",
  options: [
    {
      text: "The consumers are sized for normal traffic: about 90% busy, so only about 40 jobs a second of spare capacity are left to work off a backlog of about 1,500.",
      correct: true,
      why: "44 consumers at about 10 jobs a second each can send about 440 a second; new jobs keep arriving at about 400 a second. The backlog shrinks only by the difference, so 1,500 jobs at about 40 a second take most of a minute. Every new email waits behind the backlog: that is the delay users see. The outage lasted 4 seconds; its tail lasts ten times as long, because recovery speed is set by **spare** capacity, not total capacity.",
    },
    {
      text: "The email provider is still slow after the outage.",
      why: "The provider answers at normal speed after 7 s and no job fails. The consumers are busy sending, at their full rate; there just are not enough of them to get ahead.",
    },
    {
      text: "Jobs are being lost or sent twice, so the queue never empties.",
      why: "Failed jobs went back on the queue and were sent later; after 7 s nothing fails. The backlog is shrinking steadily, about 40 jobs a second, just slowly.",
    },
    {
      text: "The queue is full, so the app cannot add new jobs.",
      why: "Users see no errors: the queue accepts every job at once. That is the point of putting a queue there; the cost is the delay, which is what is growing.",
    },
  ],
  fix: {
    design: mail("100 consumers", 100),
    explain:
      "**Size consumers for catching up, not just for keeping up.** With 100 consumers (about 40% busy normally) there are about 600 jobs a second of spare capacity, and the backlog is gone within 3 seconds of the provider returning. Consumers mostly wait on the provider, so they are cheap to run with headroom, or to scale on the queue's backlog or the age of its oldest job rather than on CPU. Before adding them, check that the provider can take the faster catch-up rate; a burst of retries can trip its rate limits. Redelivery is what made the outage lossless: the queue keeps a job until a consumer confirms it, and gives it out again after a visibility timeout if not.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  assert.equal(summary(broken, 0, 30).errorRate, 0);
  assert.ok(summary(broken, 1, 3).util.emails > 0.85, `consumers busy before ${summary(broken, 1, 3).util.emails}`);
  // The backlog peaks around 1,500 just after the provider returns...
  const peak = summary(broken, 7, 8).backlog.emails;
  assert.ok(peak > 1400 && peak < 1600, `backlog at 8 s ${peak}`);
  // ...and shrinks only by the spare ~40 a second (440 sent, 400 arriving): about 650 still wait at 30 s.
  const end = summary(broken, 29, 30).backlog.emails;
  assert.ok(end > 550 && end < 750, `backlog at 30 s ${end}`);
  const rate = (peak - end) / 22;
  assert.ok(rate > 33 && rate < 50, `drain ${rate} a second`);
  // Consumers flat out, emails seconds late.
  const after = summary(broken, 10, 30);
  assert.ok(after.util.emails > 0.99, `consumers ${after.util.emails}`);
  assert.ok(summary(broken, 29, 30).oldestMs.emails > 1500, `oldest ${summary(broken, 29, 30).oldestMs.emails}`);
});

test("the fix removes it: the backlog is gone within 3 seconds of the provider returning", () => {
  const { fixed } = playDrill(drill);
  assert.equal(summary(fixed, 0, 30).errorRate, 0);
  assert.equal(summary(fixed, 9, 10).backlog.emails, 0);
  assert.equal(summary(fixed, 29, 30).backlog.emails, 0);
  const normal = summary(fixed, 12, 30).util.emails;
  assert.ok(normal > 0.35 && normal < 0.45, `consumers busy ${normal}`);
});
