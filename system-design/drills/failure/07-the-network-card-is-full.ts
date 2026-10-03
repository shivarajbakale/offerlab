/**
 * 07. The Network Card Is Full
 * Level: Senior
 * Group: Failure drills
 *
 * Symptom: about 14% of requests are refused and latency is in the hundreds of ms, while the app
 *   servers' CPUs are a third busy. Cause (hidden from the reader): product images of about 1.2 MB
 *   are served by the app servers themselves, and the images alone need more than their 1 Gbps
 *   network cards can send, so every answer queues to go out, holding a worker while it waits.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { failureDrill, playDrill } from "../index.ts";
import { cdn, clients, database, design, loadBalancer, run, server, summary } from "../../traffic/index.ts";

// 1,200 requests a second: 60% page reads (30 KB each), 10% saves, 30% product images (1.2 MB
// each). Images alone: 360 a second x 1.2 MB = about 430 MB a second. Three app servers, each with
// a 1 Gbps network card (125 MB a second): 375 MB a second in all.
const shop = (name: string, o: { cdn: boolean; cores?: number }) =>
  design(name, {
    users: clients({
      to: "lb",
      ...(o.cdn ? { staticTo: "cdn" } : {}),
      qps: 1200,
      mix: { read: 0.6, write: 0.1, static: 0.3 },
      bytes: { read: 30_000, write: 2_000, static: 1_200_000 },
    }),
    ...(o.cdn ? { cdn: cdn({ to: "lb", capacity: 20_000 }) } : {}),
    lb: loadBalancer({ to: "app" }),
    app: server({ replicas: 3, cores: o.cores ?? 4, serviceMs: { read: 5, write: 6, static: 1 }, bandwidthMbps: 1000, calls: { read: ["db"], write: ["db"] } }),
    db: database({ cores: 4, readMs: 2, writeMs: 4 }),
  });

export const drill = failureDrill({
  title: "Slow and refusing, at a third of CPU",
  context:
    "A shop: users → load balancer → **3 app servers** → a database. The app servers render pages and also serve the **product images** themselves (about 1.2 MB each). Traffic is a steady 1,200 requests a second, 30% of them images. About 14% of requests are refused with 503s, pages take 300 ms instead of 50, and images most of a second. The app servers' CPUs are about a third busy, yet every worker is taken. The database is fine.",
  design: shop("App servers send the images", { cdn: false }),
  faults: [],
  seconds: 15,
  seed: 1,
  question: "What is the bottleneck?",
  options: [
    {
      text: "The app servers' network cards: the images alone need more bandwidth than three 1 Gbps cards have, so answers queue to go out, each holding a worker while it waits.",
      correct: true,
      why: "Images need about 430 MB a second; three 1 Gbps cards can send 375 MB a second, and they run at 100%. An answer holds its worker until its last byte is sent, so workers fill up with answers waiting for the card; once all are taken, new requests queue, then are refused. Pages are small, but they share the same cards and wait behind the images. The CPU chart cannot show this: sending bytes costs almost no CPU.",
    },
    {
      text: "The app servers need more CPU.",
      why: "Their CPUs are about a third busy. Doubling the cores leaves the cards just as full, and requests are still refused.",
    },
    {
      text: "The database is slow.",
      why: "It is lightly loaded and answers in a few ms. Page latency is time spent waiting to be sent, not waiting for data.",
    },
    {
      text: "There are not enough workers per server.",
      why: "More workers would just hold more answers waiting for the same full cards. The cards' 375 MB a second is the limit, however many requests are in progress.",
    },
  ],
  fix: {
    design: shop("Images from a CDN", { cdn: true }),
    explain:
      "**Move big, cacheable bytes to a CDN.** Users fetch images from CDN edge servers near them; the edges keep copies and ask the app servers only on a miss (here about 13% of image requests), so the app servers' cards drop to about 20% busy and pages are fast again. It is also cheaper: data sent from a cloud region costs about $0.09 a GB, from a CDN at volume about $0.02, so the egress bill here drops from about $120 to about $40 an hour. Watch bandwidth like CPU: bytes per second = requests per second x answer size, and one large file type can saturate a card that handles thousands of small pages easily.",
  },
});

test("the drill's run shows the symptom the question describes", () => {
  const { broken } = playDrill(drill);
  const s = summary(broken, 2, 15);
  assert.ok(s.errorRate > 0.1 && s.errorRate < 0.2, `errors ${s.errorRate}`);
  assert.ok(s.nicUtil.app > 0.99, `card ${s.nicUtil.app}`);
  assert.ok(s.util.app < 0.4 && s.threads.app > 0.99, `cpu ${s.util.app}, workers ${s.threads.app}`);
  assert.ok(s.byKind.read!.p50 > 250, `page p50 ${s.byKind.read!.p50}`);
  assert.ok(s.byKind.static!.p50 > 600, `image p50 ${s.byKind.static!.p50}`);
  assert.ok(s.util.db < 0.5, `db ${s.util.db}`);
  assert.ok(s.egressPerHour > 115 && s.egressPerHour < 125, `egress $${s.egressPerHour}/h`);
});

test("more CPU does not help: twice the cores, the cards are still full", () => {
  const t = run(shop("App servers with 8 cores", { cdn: false, cores: 8 }), { seconds: 15, seed: 1 });
  const s = summary(t, 2, 15);
  assert.ok(s.errorRate > 0.1, `errors ${s.errorRate}`);
  assert.ok(s.nicUtil.app > 0.99, `card ${s.nicUtil.app}`);
});

test("the fix removes it: images from the CDN, cards at about 20%, egress about $40 an hour", () => {
  const { fixed } = playDrill(drill);
  const s = summary(fixed, 2, 15);
  assert.equal(s.errorRate, 0);
  assert.ok(s.nicUtil.app < 0.25, `card ${s.nicUtil.app}`);
  assert.ok(s.hitRate.cdn > 0.85 && s.hitRate.cdn < 0.9, `cdn hit ${s.hitRate.cdn}`);
  assert.ok(s.byKind.read!.p50 < 60, `page p50 ${s.byKind.read!.p50}`);
  assert.ok(s.egressPerHour > 35 && s.egressPerHour < 45, `egress $${s.egressPerHour}/h`);
});
