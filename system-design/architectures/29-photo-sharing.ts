/**
 * 29. Photo Sharing
 * Level: Senior
 * Group: Architectures
 *
 * Problem: People upload photos and scroll through other people's. Every photo is viewed far
 *   more often than it is uploaded, and every view moves about 200 KB. Each upload needs smaller
 *   copies made (thumbnails). Keep uploads quick, photos fast to load, the bill sane, and pages
 *   up to date.
 *
 * Approach: Move the bytes out of the app, then out of our data centre
 *   1. App servers do everything: resize photos inside the upload, and stream every photo
 *   through their own network cards, which fill up. 2. Make thumbnails on a queue, and let users
 *   fetch photos straight from object storage: fast, but every byte is billed as internet egress.
 *   3. Photos from a CDN: most views are served at the edge, at a fraction of the price per GB;
 *   a short TTL sends views back to storage. 4. Feed reads from a cache; a TTL alone shows old
 *   pages, so uploads also clear the cached page.
 *
 * Cost: 3,000 requests a second, 2,670 of them photo views: ~530 MB a second. Through four app
 *   servers' 1 Gbps cards: full, photos take ~780 ms, ~$164 an hour of egress. Straight from
 *   storage: ~80 ms, ~$175 an hour. From a CDN: ~84% of views at the edge, ~20 ms, ~$49 an hour
 *   in all. A 1 s TTL drops the edge to ~34% and makes photos ~93 ms. A 30 s feed cache serves
 *   ~70% of feed reads, and ~19% of them are out of date until uploads clear it.
 *
 * Pattern: object storage + CDN for blobs, asynchronous processing (queue), cache-aside with TTL
 *   and invalidation
 * Key insight: Photos are big, many and never change once written. So do not move them through
 *   machines you run: store them in object storage, give each version its own URL, and let a CDN
 *   keep copies near users for a long time. The app only handles the small metadata.
 * Tradeoffs: A CDN copy outlives a delete until it expires or is purged. Thumbnails appear a
 *   moment after the upload. Long TTLs need versioned URLs; short TTLs cost speed and origin load.
 * Staff notes: Do the egress maths first: views a second x bytes per view x price per GB is
 *   usually the biggest line in the bill. Upload straight to object storage with a pre-signed URL,
 *   so the app never carries the photo. Never change a photo in place: a new version gets a new
 *   URL, so caches can keep the old one forever.
 * Interview signals: "design Instagram / Flickr", "image upload", "thumbnails", "CDN", "blob
 *   storage", "egress cost", "read-heavy".
 * Real world: Instagram and Pinterest store photos in object storage (S3 at various times) and
 *   serve them through CDNs. AWS does not charge for data sent from S3 to its CloudFront CDN, and
 *   charges $0.09 a GB (first tier) for data sent from S3 to the internet.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cache, cacheAside, cdn, clients, database, design, external, invalidate, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// 3,000 requests a second from 20,000 people at a time: 10% open a feed (the list of an account's
// latest photos, 20 KB), 1% change something (an upload, a caption, a delete) and 89% view one photo
// (200 KB). There are a million photos and accounts, popular ones Zipf-favoured.
const users = (photosFrom?: string) =>
  clients({
    to: "lb",
    ...(photosFrom ? { staticTo: photosFrom } : {}),
    qps: knob("qps", 3000, [10, 100_000]),
    mix: { read: 0.1, write: 0.01, static: 0.89 },
    users: 20_000,
    keys: 1_000_000,
    skew: 1,
    bytes: { read: 20_000, write: 500, static: 200_000 },
  });
// Photo metadata (who posted what, captions): a feed read costs the database 10 ms, a write 3 ms.
const db = () => database({ label: "Photo metadata", cores: 8, readMs: 10, writeMs: 3 });
// Object storage (like S3): any amount of data, ~20 ms to read or write a photo.
const storage = () => external({ label: "Object storage", latencyMs: 20 });
// Four app servers with 8 cores and a 1 Gbps network card each.
const app = (o: { resize: boolean; photos: boolean; feed?: "db" | "cache" | "cleared" }) =>
  server({
    replicas: 4,
    cores: 8,
    threads: 400,
    bandwidthMbps: 1000,
    // Resizing a photo into a few sizes costs ~200 ms of CPU.
    serviceMs: { read: 2, write: o.resize ? 200 : 5, static: 1 },
    calls: {
      read: o.feed === "cache" || o.feed === "cleared" ? [cacheAside("feeds", "db")] : ["db"],
      write: ["storage", "db", ...(o.feed === "cleared" ? [invalidate("feeds")] : []), ...(o.resize ? [] : ["thumbs"])],
      static: o.photos ? ["storage"] : [],
    },
  });
// Thumbnail workers: each takes a job, resizes in ~200 ms and writes the copies to storage.
const thumbs = () => queue({ label: "Thumbnail jobs", consumers: knob("workers", 20, [1, 200]), workMs: 200, to: "storage" });
// The CDN keeps the 100,000 most recently viewed photos at every edge, each for up to a day.
const photoCdn = () =>
  cdn({ to: "storage", capacity: knob("cdnPhotos", 100_000, [1000, 1_000_000]), ttlMs: knob("ttl", 86_400_000, [1000, 86_400_000]) });

// @why Stage 1: the app resizes each upload before answering, and serves every photo itself,
// @why reading it from storage and sending it through its own network card.
export const allInApp = design("1. App servers do everything", {
  users: users(),
  lb: loadBalancer({ to: "app" }),
  app: app({ resize: true, photos: true }),
  db: db(),
  storage: storage(),
});

// @why Stage 2: an upload is stored and answered; a queue job makes the thumbnails. Pages link
// @why photos straight to object storage, so photo bytes never touch the app.
export const fromStorage = design("2. Thumbnails on a queue, photos from storage", {
  users: users("storage"),
  lb: loadBalancer({ to: "app" }),
  app: app({ resize: false, photos: false }),
  thumbs: thumbs(),
  db: db(),
  storage: storage(),
});

// @why Stage 3: photo links point at the CDN. An edge that has the photo answers; one that does
// @why not fetches it from storage once and keeps it.
export const fromCdn = design("3. Photos from a CDN", {
  users: users("cdn"),
  lb: loadBalancer({ to: "app" }),
  app: app({ resize: false, photos: false }),
  thumbs: thumbs(),
  cdn: photoCdn(),
  db: db(),
  storage: storage(),
});

// @why Stage 4: feed reads go through a cache holding 100,000 feeds, each kept for up to 30 s.
const withFeedCache = (name: string, clear: boolean) =>
  design(name, {
    users: users("cdn"),
    lb: loadBalancer({ to: "app" }),
    app: app({ resize: false, photos: false, feed: clear ? "cleared" : "cache" }),
    thumbs: thumbs(),
    cdn: photoCdn(),
    feeds: cache({ label: "Feed cache", capacity: 100_000, ttlMs: knob("feedTtl", 30_000, [1000, 300_000]) }),
    db: db(),
    storage: storage(),
  });
export const feedTtl = withFeedCache("4. Feed reads from a cache with a TTL", false);
// @why The fix: an upload (or edit, or delete) also drops that account's cached feed.
export const feedCleared = withFeedCache("4. Feed cache cleared on every change", true);

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };

test("broken: app servers do everything — their network cards are full and photos crawl", () => {
  const s = summary(run(allInApp, S), 3);
  // 2,670 views x 200 KB = ~530 MB a second; four 1 Gbps cards carry 500.
  assert.ok(s.nicUtil.app > 0.99, `network cards ${s.nicUtil.app}`);
  assert.ok(s.util.app < 0.35, `cpu ${s.util.app}: CPU is not the limit`);
  assert.ok(s.threads.app > 0.95, `workers ${s.threads.app}`);
  const photos = s.byKind.static!;
  assert.ok(photos.p50 > 700 && photos.p50 < 850, `photo p50 ${photos.p50}`);
  // Uploads wait for their own resize, and behind the photo traffic.
  assert.ok(s.byKind.write!.p50 > 300, `upload p50 ${s.byKind.write!.p50}`);
  assert.ok(s.errorRate > 0.02, `errors ${s.errorRate}`);
  assert.ok(s.egressPerHour > 155 && s.egressPerHour < 175, `egress ${s.egressPerHour}`);
});

test("broken: photos straight from storage — fast, and a $175-an-hour egress bill", () => {
  const s = summary(run(fromStorage, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.byKind.static!.p50 > 70 && s.byKind.static!.p50 < 85, `photo p50 ${s.byKind.static!.p50}`);
  assert.ok(s.byKind.write!.p50 < 100, `upload p50 ${s.byKind.write!.p50}`);
  assert.ok(s.nicUtil.app < 0.02, `app cards ${s.nicUtil.app}`);
  assert.ok(s.egressBytes > 5e8, `bytes ${s.egressBytes}`);
  assert.ok(s.egressPerHour > 165 && s.egressPerHour < 180, `egress ${s.egressPerHour}`);
  assert.ok(s.egressPerHour / s.costPerHour > 0.99, "the bill is almost all egress");
});

test("broken: too few thumbnail workers — new photos wait longer and longer for thumbnails", () => {
  const r = run(fromStorage, { ...S, knobs: { workers: 5 } });
  // 5 workers make 25 sets of thumbnails a second; ~30 uploads arrive.
  assert.ok(summary(r, 3).util.thumbs > 0.98);
  const [mid, end] = [summary(r, 4.9, 5), summary(r, 9.9, 10)];
  assert.ok(end.backlog.thumbs > mid.backlog.thumbs && end.oldestMs.thumbs > 1000, `backlog ${mid.backlog.thumbs} -> ${end.backlog.thumbs}, oldest ${end.oldestMs.thumbs}`);
  assert.equal(summary(r, 3).errorRate, 0, "and nobody sees an error");
});

test("cdn: 84% of photo views served at the edge, ~20 ms, a quarter of the bill", () => {
  const s = summary(run(fromCdn, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.hitRate.cdn > 0.82 && s.hitRate.cdn < 0.86, `hit ${s.hitRate.cdn}`);
  assert.ok(s.byKind.static!.p50 < 25, `photo p50 ${s.byKind.static!.p50}`);
  assert.ok(s.calls.storage < 550, `storage ${s.calls.storage} a second`);
  assert.ok(s.costPerHour > 47 && s.costPerHour < 51, `cost ${s.costPerHour}`);
  assert.ok(s.egressPerHour > 38 && s.egressPerHour < 42, `egress ${s.egressPerHour}`);
});

test("broken: a 1-second TTL — the edge keeps little, photos slow down and storage works harder", () => {
  const s = summary(run(fromCdn, { ...S, knobs: { ttl: 1000 } }), 3);
  assert.ok(s.hitRate.cdn > 0.3 && s.hitRate.cdn < 0.38, `hit ${s.hitRate.cdn}`);
  assert.ok(s.byKind.static!.p50 > 85 && s.byKind.static!.p50 < 100, `photo p50 ${s.byKind.static!.p50}`);
  assert.ok(s.calls.storage > 1600, `storage ${s.calls.storage} a second`);
});

test("broken: a feed cache with only a TTL — about one feed read in five is out of date", () => {
  const s = summary(run(feedTtl, S), 3);
  assert.ok(s.hitRate.feeds > 0.66 && s.hitRate.feeds < 0.74, `hit ${s.hitRate.feeds}`);
  assert.ok(s.util.db < 0.15, `db ${s.util.db}`);
  assert.ok(s.staleRate > 0.15 && s.staleRate < 0.23, `stale ${s.staleRate}`);
});

test("feed cache cleared on every change: the same hits, nothing out of date", () => {
  const s = summary(run(feedCleared, S), 3);
  assert.ok(s.hitRate.feeds > 0.65, `hit ${s.hitRate.feeds}`);
  assert.ok(s.util.db < 0.15, `db ${s.util.db}`);
  assert.equal(s.staleRate, 0);
  assert.equal(s.errorRate, 0);
});
