/**
 * 08. Video Upload and Streaming
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Users upload videos and watch them. Uploads are rare, but each needs seconds of heavy
 *   CPU work (transcoding) before anyone can watch it. Viewing is constant: a player fetches a
 *   small video file (a segment) every few seconds, popular videos get most of the views, and
 *   many viewers are on another continent. Keep both working as each grows.
 *
 * Approach: Separate the heavy work, then move the bytes close to viewers
 *   1. The app server transcodes inside the upload request. 2. The upload only stores the file
 *   and queues a transcode job; a separate pool of transcoding machines works through the queue.
 *   3. Video segments still come from the app servers, across the ocean for far viewers.
 *   4. A CDN keeps copies of popular segments near every viewer.
 *
 * Cost: transcoding inside the request: 16 app cores; at 2 uploads a second (2 s of CPU each)
 *   several transcodes now and then fill one server's cores and the segment p99 jumps to ~1 s
 *   for seconds; at 9 a second 1 request in 5 fails. Queue + 12-core transcoding pool: viewers
 *   untouched; the pool keeps up to about 6 uploads a second and beyond that the backlog grows.
 *   Four app servers serve about 5,000 requests a second in total (about 4,500 of them
 *   segments); with a CDN (20,000 segments, 86% hits) the same four sit near 30% at 6,000 and
 *   the median segment takes 20 ms instead of 59, but far viewers' misses still cross the ocean
 *   (segment p99 ~280 ms), and the bill goes from about $1.30 to $16 an hour.
 *
 * Pattern: async processing + edge caching
 * Key insight: Two flows with opposite shapes need opposite designs. Rare, heavy, deferrable
 *   work (transcoding) goes on a queue with its own machines, so it can never starve the request
 *   path. Frequent, light, identical-for-everyone reads (segments) go to a cache near the user,
 *   and Zipf popularity means a cache holding a fifth of the segments answers most requests.
 * Tradeoffs: A queued upload is not watchable at once ("processing..."). A CDN costs per request
 *   and per byte, and the origin must survive the CDN being cold.
 * Staff notes: Size the origin for a cold CDN, not a warm one: a purge or a new region sends most
 *   traffic back to it. Alert on the age of the oldest transcode job, not only on errors. Real
 *   video cost is egress bytes, not requests; this simulator counts requests only.
 * Interview signals: "design YouTube", "design Netflix", "video upload pipeline", "transcoding",
 *   "adaptive bitrate", "CDN offload", "hot videos".
 * Real world: HLS (Apple) and MPEG-DASH both cut video into segments a few seconds long, listed
 *   in a manifest, at several bitrates; players switch bitrate as bandwidth changes. Netflix
 *   serves video from its own CDN appliances (Open Connect) placed inside ISPs. YouTube and
 *   Netflix transcode each upload into many renditions in background pipelines.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, cdn, clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// The traffic: 90% of requests are segment fetches by players (static files), 10% are page and
// metadata reads (titles, the list of segments), and a tiny share are uploads. 30% of viewers are
// on another continent. A user waits up to 5 s, so an upload that transcodes in 2 s can succeed.
const viewers = (o: { qps: number; uploads: number; staticTo?: string }) =>
  clients({
    to: "lb",
    ...(o.staticTo ? { staticTo: o.staticTo } : {}),
    qps: knob("qps", o.qps, [10, 1_000_000]),
    mix: { read: 0.1, write: knob("uploads", o.uploads, [0, 0.05]), static: 0.9 },
    farShare: 0.3,
    timeoutMs: 5000,
  });
const lb = () => loadBalancer({ to: "app", healthCheckMs: 1000 });
const db = () => database({ cores: 4, readMs: 2, writeMs: 5 });
// Videos live in object storage (like Amazon S3): the app reads a segment from it, then sends it on.
const storage = () => external({ label: "Object storage", latencyMs: 10, hopMs: 1, concurrency: 1200 });
// App CPU per request: 4 ms for a page, 5 ms to accept an upload, 3 ms to send one segment.
const APP = { read: 4, write: 5, static: 3 };
// Transcoding one upload: 2 s of one core (shrunk from real minutes so it fits in a run).
const TRANSCODE_MS = 2000;

// @why Stage 1: the upload request stores the original, then transcodes it on the app server's
// @why own CPU before answering. The same cores also serve every viewer.
export const transcodeInRequest = design("1. Transcode inside the upload request", {
  users: viewers({ qps: 600, uploads: 0.003 }),
  lb: lb(),
  app: server({
    replicas: knob("apps", 4, [1, 30]),
    cores: 4,
    serviceMs: { ...APP, write: TRANSCODE_MS },
    calls: { read: ["db"], write: ["storage", "db"], static: ["storage"] },
  }),
  db: db(),
  storage: storage(),
});

// One knob sets both the transcoding pool's cores and the consumers feeding it: one job per core.
const transcoders = (n: number) => knob("transcoders", n, [2, 200]);
const queued = (o: { name: string; qps: number; uploads: number; staticTo?: string }) =>
  design(o.name, {
    users: viewers(o),
    // @why Stage 4: a CDN in front. Players fetch segments from an edge server nearby; a miss is
    // @why fetched once from the app servers (the origin) and kept for the next viewer.
    ...(o.staticTo ? { cdn: cdn({ to: "lb", capacity: knob("cdnKeys", 20_000, [0, 100_000]) }) } : {}),
    lb: lb(),
    app: server({
      replicas: knob("apps", 4, [1, 30]),
      cores: 4,
      serviceMs: APP,
      calls: { read: ["db"], write: ["storage", "db", "jobs"], static: ["storage"] },
    }),
    db: db(),
    storage: storage(),
    // @why Stage 2: the upload only stores the file, records it, and drops a job on a queue. A
    // @why separate pool of machines takes jobs off the queue and transcodes them.
    jobs: queue({ label: "Transcode jobs", consumers: transcoders(12), workMs: 50, to: "transcoder" }),
    transcoder: server({ label: "Transcoding pool", cores: transcoders(12), threads: 400, serviceMs: { read: TRANSCODE_MS, write: TRANSCODE_MS } }),
  });
export const transcodeQueue = queued({ name: "2. Queue the transcode", qps: 600, uploads: 0.003 });
// @why Stage 3: viewing grows to thousands of segment requests a second. Every one still comes from
// @why the app servers, and a far viewer's request crosses the ocean and back.
export const fromOrigin = queued({ name: "3. Segments from the app servers", qps: 3000, uploads: 0.0005 });
export const withCdn = queued({ name: "4. Segments from a CDN", qps: 3000, uploads: 0.0005, staticTo: "cdn" });

// --- helpers for the scenarios ---

const S = { seed: 1, seconds: 15 };
// 6,000 requests a second for 8 s: the engine runs 1 simulated request for 2 real ones.
const BIG = { seed: 1, seconds: 8, knobs: { qps: 6000 } };
const SPIKE = 0.015;
const purgeCdn = [
  { at: 3500, kind: "kill" as const, target: "cdn" },
  { at: 3500, kind: "restart" as const, target: "cdn" },
];

test("transcode in request: at 2 uploads a second nothing fails, but now and then transcodes stall viewers for seconds", () => {
  const r = run(transcodeInRequest, S);
  const s = summary(r, 5);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.app > 0.3 && s.util.app < 0.55, `app ${s.util.app}`);
  // Seconds 3-6: several transcodes land on one server at once and fill its 4 cores.
  const episode = summary(r, 3, 6).staticP99;
  assert.ok(episode > 800 && episode < 1200, `segment p99 during the episode ${episode}`);
  // Outside it, the tail is the far viewers' ocean trip.
  const calm = summary(r, 7).staticP99;
  assert.ok(calm > 250 && calm < 300, `segment p99 after it ${calm}`);
});

test("broken: transcode in request — an upload spike starves every viewer", () => {
  const r = run(transcodeInRequest, { ...S, knobs: { uploads: SPIKE } });
  const s = summary(r, 5);
  assert.equal(bottleneck(r, 5), "app");
  assert.ok(s.util.app > 0.9 && s.threads.app > 0.6, `cpu ${s.util.app}, workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.15 && s.staticP50 > 500, `errors ${s.errorRate}, segment p50 ${s.staticP50}`);
});

test("queue: the transcode leaves the request and no second's segment tail goes past the ocean trip", () => {
  const r = run(transcodeQueue, S);
  const s = summary(r, 5);
  assert.equal(s.errorRate, 0);
  for (let t = 0; t < 15; t++) {
    const p99 = summary(r, t, t + 1).staticP99;
    assert.ok(p99 < 300, `segment p99 in second ${t + 1}: ${p99}`);
  }
  assert.ok(s.util.app < 0.15 && s.util.transcoder < 0.5, `app ${s.util.app}, pool ${s.util.transcoder}`);
});

test("broken: queue — the same upload spike, viewers fine, the transcode backlog grows", () => {
  const r = run(transcodeQueue, { ...S, knobs: { uploads: SPIKE } });
  const s = summary(r, 5);
  assert.ok(s.errorRate === 0 && s.staticP99 < 300, `errors ${s.errorRate}, segment p99 ${s.staticP99}`);
  assert.ok(s.util.transcoder > 0.95, `pool ${s.util.transcoder}`);
  assert.ok(s.backlog.jobs > 2 * summary(r, 0, 5).backlog.jobs && s.oldestMs.jobs > 4000, `backlog ${s.backlog.jobs}, oldest ${s.oldestMs.jobs}`);
});

test("queue: twice the transcoding cores absorb the spike", () => {
  const s = summary(run(transcodeQueue, { ...S, knobs: { uploads: SPIKE, transcoders: 24 } }), 5);
  assert.ok(s.backlog.jobs < 5 && s.util.transcoder > 0.7 && s.util.transcoder < 0.9, `backlog ${s.backlog.jobs}, pool ${s.util.transcoder}`);
});

test("segments from the app servers: 3,000 requests a second pass, far viewers wait 270 ms", () => {
  const s = summary(run(fromOrigin, { seed: 1, seconds: 10 }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.staticP50 < 65 && s.staticP99 > 250, `segment p50 ${s.staticP50}, p99 ${s.staticP99}`);
  assert.ok(s.util.app > 0.5 && s.util.app < 0.65, `app ${s.util.app}`);
});

test("broken: segments from the app servers — at 6,000 a second the origin is full", () => {
  const r = run(fromOrigin, BIG);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "app");
  assert.ok(s.util.app > 0.97 && s.errorRate > 0.08, `app ${s.util.app}, errors ${s.errorRate}`);
  assert.ok(s.staticP50 > 120 && s.errorRate < 0.2, `segment p50 ${s.staticP50}, errors ${s.errorRate}`);
});

test("CDN: 6,000 a second, segments from nearby, the origin a third busy", () => {
  const before = summary(run(fromOrigin, BIG), 3);
  const after = summary(run(withCdn, BIG), 3);
  assert.equal(after.errorRate, 0);
  assert.ok(after.hitRate.cdn > 0.82, `hit ${after.hitRate.cdn}`);
  assert.ok(before.staticP99 > 300, `segment p99 before ${before.staticP99}`);
  // Hits take ~20 ms for everyone. 30% far viewers x 14% misses ≈ 4% of segments still cross the
  // ocean to the origin and back, so they set the p99: lower than before, but not near.
  assert.ok(after.staticP50 < 25, `segment p50 ${after.staticP50}`);
  assert.ok(after.staticP99 > 250 && after.staticP99 < 300 && after.staticP99 < before.staticP99 - 60, `segment p99 ${before.staticP99} -> ${after.staticP99}`);
  assert.ok(after.p99 > 200, "far viewers' page reads still cross the ocean");
  assert.ok(after.util.app < 0.4, `app ${after.util.app}`);
  assert.ok(after.costPerHour > 8 * before.costPerHour, `$${before.costPerHour} -> $${after.costPerHour} an hour`);
  assert.ok(after.costPerMillion > 0.6 && before.costPerMillion < 0.1, `per million ${before.costPerMillion} -> ${after.costPerMillion}`);
});

test("CDN: holding 2,000 segments, a bit over half the requests hit", () => {
  const s = summary(run(withCdn, { seed: 1, seconds: 10, knobs: { cdnKeys: 2000 } }), 3);
  assert.ok(s.hitRate.cdn > 0.5 && s.hitRate.cdn < 0.65, `hit ${s.hitRate.cdn}`);
});

test("CDN: holding 50,000 segments, 94% hit", () => {
  const s = summary(run(withCdn, { seed: 1, seconds: 10, knobs: { cdnKeys: 50_000 } }), 3);
  assert.ok(s.hitRate.cdn > 0.9, `hit ${s.hitRate.cdn}`);
});

test("broken: CDN — purged, with the origin shrunk to 2 app servers, the origin floods", () => {
  const r = run(withCdn, { ...BIG, knobs: { qps: 6000, apps: 2 }, faults: purgeCdn });
  const before = summary(r, 1, 3.5);
  assert.ok(before.errorRate === 0 && before.util.app < 0.65, `before: app ${before.util.app}`);
  const after = summary(r, 3.5, 4.5);
  assert.ok(after.hitRate.cdn < 0.45 && after.util.app > 0.95, `hit ${after.hitRate.cdn}, app ${after.util.app}`);
  assert.ok(after.errorRate > 0.15, `errors ${after.errorRate}`);
  assert.ok(summary(r, 6.5).errorRate > 0.01 && summary(r, 6.5).hitRate.cdn < 0.7, "still failing 3 s later: the long tail refills slowly");
});
