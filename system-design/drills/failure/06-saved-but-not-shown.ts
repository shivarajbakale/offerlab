/**
 * 06. Saved, But Not Shown
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: no errors and normal latency, but users report that after saving, the page they reload
 *   still shows the old value; a later reload shows the new one. Cause (hidden from the reader):
 *   reads go to read replicas that trail the primary by 1.5 s, and the reload comes 0.3 s after
 *   the save, so it reads from a replica that has not received the write yet.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { clients, database, design, loadBalancer, server, summary } from "../../traffic/index.ts";

// 1,500 requests a second, 15% saves. The database has a primary (every write) and two read
// replicas (every read) that trail it by 1.5 s. Half of the users who save reload the page 300 ms later.
const profiles = (name: string, readYourWrites: boolean) =>
  design(name, {
    users: clients({ to: "lb", qps: 1500, mix: { read: 0.85, write: 0.15 }, rereadMs: 300, rereadShare: 0.5 }),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 4, cores: 4, serviceMs: { read: 4, write: 6 }, calls: ["db"] }),
    db: database({ cores: 4, readMs: 3, writeMs: 6, replicas: 3, lagMs: 1500, readYourWrites }),
  });

export const drill = failureDrill({
  title: "Saved, but the page shows the old value",
  context:
    "A profile service: users → load balancer → **4 app servers** → a database with a **primary and two read replicas**. Writes go to the primary; reads are spread over the replicas. Every dashboard is green: no errors, p99 about 60 ms. But support has a pile of tickets: \"I changed my display name, the page still showed the old one, I refreshed again and it was fine.\" A bug report says it happens on almost every save.",
  design: profiles("Every read goes to a replica", false),
  faults: [],
  seconds: 15,
  seed: 1,
  question: "What is happening?",
  options: [
    {
      text: "The replicas trail the primary by about 1.5 s; the reload 0.3 s after a save reads from a replica that has not applied the write yet.",
      correct: true,
      why: "Replication here is **asynchronous**: the primary confirms a write before the replicas have it, and they apply it later (here 1.5 s later). Every reload that comes within that gap and goes to a replica shows the old value; in this run that is every one. Users see their own change vanish, then reappear. Nothing failed, so no error dashboard shows it; it shows in the share of reads that returned old data.",
    },
    {
      text: "The write was lost and a retry saved it later.",
      why: "Every write succeeded the first time; clients here never retry. The primary has the new value from the moment it answers. The replicas just have not caught up.",
    },
    {
      text: "A cache is serving the old value.",
      why: "There is no cache in this design: every read goes to a database replica. The old value comes from a replica that is behind.",
    },
    {
      text: "The database is overloaded and slow to commit.",
      why: "The primary is about a third busy and latency is normal. The write is committed when the user gets the \"saved\" answer; only the copies are late.",
    },
  ],
  fix: {
    design: profiles("Read your own writes from the primary", true),
    explain:
      "**Read your own writes.** For a few seconds after a user writes (here twice the replica lag, 3 s), send that user's reads to the primary, which always has their write. Everyone else keeps reading from replicas. The primary does a little more reading (in this run it goes from about a third to about half busy). This guarantees only that you see **your own** writes: other users can still read old data from a replica for up to the lag, which is the deal asynchronous replication offers. Other ways to get the same guarantee: remember the write's position in the log and read from a replica that has reached it, or show the saved value from the write's own answer.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const s = summary(broken, 2, 15);
  // Green dashboards: no errors, normal latency.
  assert.equal(s.errorRate, 0);
  assert.ok(s.p99 < 70, `p99 ${s.p99}`);
  // Every reload right after a save shows the old value.
  assert.equal(s.staleOwnRate, 1);
  assert.ok(s.replicaUtil.db[0] < 0.4, `primary ${s.replicaUtil.db[0]}`);
});

test("the fix removes it: users always see their own writes; others may still read old data", () => {
  const { broken, fixed } = playDrill(drill);
  const s = summary(fixed, 2, 15);
  assert.equal(s.errorRate, 0);
  assert.equal(s.staleOwnRate, 0);
  // Other users' reads from replicas can still be behind: the guarantee is about your own writes.
  assert.ok(s.staleRate > 0.2, `stale ${s.staleRate}`);
  // The primary does more reads: from about a third to about half busy.
  const before = summary(broken, 2, 15).replicaUtil.db[0];
  assert.ok(before > 0.3 && before < 0.4 && s.replicaUtil.db[0] > 0.45 && s.replicaUtil.db[0] < 0.6, `primary ${before} -> ${s.replicaUtil.db[0]}`);
});
