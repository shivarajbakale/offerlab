/**
 * 19. File Sync
 * Level: Senior
 * Group: Architectures
 *
 * Problem: People keep folders in sync across their laptop, phone and desktop. An edit on one
 *   device must reach the others within seconds. Files are megabytes, devices are millions, and
 *   most of the time nothing has changed. Moving bytes is the main cost, in time and in money.
 *
 * Approach: Move only the bytes that changed, by the cheapest path, and only when told to
 *   1. Whole files streamed through the app servers: their network cards fill long before their
 *   CPUs. 2. Files split into 4 MB chunks named by their hash; devices fetch only the chunks they
 *   lack, straight from object storage. Devices still ask "anything new?" every few seconds,
 *   and at five times the devices those polls fill the metadata database. 3. A change sends a
 *   notification through a queue to the owner's other devices, which ask only then.
 *
 * Cost: four app servers with 1 Gbps cards carry ~20 whole-file downloads a second (20 MB each)
 *   at 75% of their bandwidth, and fail at 100; chunks from object storage cut egress per edit
 *   5x (~$130 an hour at 100 downloads a second); polling at 10,000 a second fills an 8-core
 *   metadata database, notifications drop it to ~1,500 requests a second, mostly idle.
 *
 * Pattern: content-addressed chunks (deduplication), direct-to-storage transfer (presigned
 *   URLs), push notification instead of polling
 * Key insight: Bytes and metadata are different problems. Bytes are big, immutable once named
 *   by their hash, and best moved by a storage service built for it, never through your own
 *   servers. Metadata is small and changes often, and is where consistency matters. Polling
 *   costs in proportion to devices; notifications cost in proportion to changes.
 * Tradeoffs: Chunking needs a client that splits, hashes and reassembles files, and a metadata
 *   model that maps file versions to chunk lists. Notifications need a long-lived connection per
 *   online device, and a fallback when a notification is lost.
 * Staff notes: Egress dominates the bill: price GB moved, not machines. Keep chunks immutable and
 *   garbage-collect unreferenced ones later, never inline. Conflicts (two devices edit the same
 *   file offline) are a product decision: keep both copies and tell the user.
 * Interview signals: "Dropbox", "Google Drive", "file sync", "large uploads", "resumable",
 *   "deduplication", "presigned URL", "bandwidth".
 * Real world: Dropbox split files into 4 MB blocks addressed by their SHA-256 hash and has
 *   written about moving block storage from Amazon S3 to its own system (Magic Pocket). S3
 *   presigned URLs and GCS signed URLs let a client upload or download one object directly with
 *   a short-lived signed link.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bottleneck, clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

const MB = 1_000_000;
// Three kinds of request from devices: a read asks the metadata service "what changed since my
// cursor?" (a poll); a write commits an edit (new file version, chunk list); a static request
// downloads file data to a device. Downloads may take many seconds, so devices wait up to 30 s.
type Mix = { read: number; write: number; static: number };
const devices = (o: { qps: number; mix: Mix; downloadMB: number; direct: boolean }) =>
  clients({
    to: "lb",
    ...(o.direct ? { staticTo: "store" } : {}),
    qps: knob("qps", o.qps, [10, 100_000]),
    mix: o.mix,
    users: 20_000,
    bytes: { static: o.downloadMB * MB, read: 2000, write: 500 },
    timeoutMs: { read: 2000, write: 2000, static: 30_000 },
  });
// Four app servers, each with a 1 Gbps network card. Proxying data costs little CPU; it is the
// card that fills. A worker is held until its answer has been sent.
const app = (calls: Partial<Record<"read" | "write" | "static", string[]>>) => ({
  lb: loadBalancer({ to: "app" }),
  app: server({ replicas: 4, cores: 4, serviceMs: { read: 1, write: 2, static: 2 }, bandwidthMbps: 1000, calls }),
});
// Metadata: which files exist, their versions and chunk lists, each device's cursor. 8 cores; a
// "what changed?" lookup costs 1 ms, committing an edit 3 ms.
const meta = () => database({ label: "Metadata", cores: 8, readMs: 1, writeMs: 3 });
// Object storage (S3, GCS): ~30 ms to the first byte, and for our purposes no limit on requests
// or total bandwidth (we give it 100 Gbps). Each transfer still runs at most at the device's
// 100 Mbps. Its servers are not ours, so they cost nothing per hour here; data it sends to
// devices costs $0.09 a GB.
const store = () => ({ ...external({ label: "Object storage", latencyMs: 30, concurrency: 10_000 }), bandwidthMbps: 100_000 });

// Today: 2,000 requests a second. 90% are polls, 5% edits, 5% downloads.
const TODAY: Mix = { read: 0.9, write: 0.05, static: 0.05 };

// @why Stage 1: every edit uploads the whole file through the app servers to storage, and every
// @why other device downloads the whole file (20 MB on average) through them again.
export const wholeFiles = design("1. Whole files through the app servers", {
  users: devices({ qps: 2000, mix: TODAY, downloadMB: 20, direct: false }),
  ...app({ read: ["meta"], write: ["meta", "store"], static: ["store"] }),
  meta: meta(),
  store: store(),
});

// @why Stage 2: files are 4 MB chunks named by their hash. A typical edit changes one chunk, and a
// @why device downloads only the chunks it lacks, straight from storage with a presigned URL.
// @why The app servers only answer metadata.
const chunks = (name: string, qps: number) =>
  design(name, {
    users: devices({ qps, mix: TODAY, downloadMB: 4, direct: true }),
    ...app({ read: ["meta"], write: ["meta"] }),
    meta: meta(),
    store: store(),
  });
export const chunked = chunks("2. Chunks, straight from storage", 2000);
// @why The same design with five times the devices: 10,000 requests a second, 9,000 of them polls.
export const chunkedGrowth = chunks("2. Five times the devices, still polling", 10_000);

// @why Stage 3: devices stop polling. A committed edit puts a notification on a queue for each of
// @why the owner's other online devices (one on average); a push gateway sends it over the
// @why connection the device keeps open, and only then does the device ask what changed.
// @why Same devices, edits and downloads as the 10,000 a second above: 500 of each a second.
export const notified = design("3. Notify devices instead of polling", {
  users: devices({ qps: 1500, mix: { read: 1, write: 1, static: 1 }, downloadMB: 4, direct: true }),
  ...app({ read: ["meta"], write: ["meta", "notify"] }),
  meta: meta(),
  notify: queue({ label: "Change notifications", consumers: 20, workMs: 2, to: "push", fanout: 1 }),
  push: server({ label: "Push gateway", replicas: 2, cores: 4, serviceMs: { read: 0.5, write: 0.5 } }),
  store: store(),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
const GB = 1e9;

test("whole files: 400 requests a second, the network cards 75% full, the CPUs 3% busy", () => {
  const s = summary(run(wholeFiles, { ...S, knobs: { qps: 400 } }), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.nicUtil.app > 0.7 && s.nicUtil.app < 0.8, `nic ${s.nicUtil.app}`);
  assert.ok(s.util.app < 0.05, `cpu ${s.util.app}`);
  // A 20 MB file at a device's 100 Mbps takes at least 1.6 s.
  assert.ok(s.byKind.static!.p50 > 1600 && s.byKind.static!.p50 < 1900, `download p50 ${s.byKind.static!.p50}`);
  // ~20 downloads a second of 20 MB: ~350 MB a second leaving our servers, ~$115 an hour.
  assert.ok(s.egressBytes > 0.3 * GB && s.egressBytes < 0.4 * GB, `egress ${s.egressBytes}`);
  assert.ok(s.egressPerHour > 105 && s.egressPerHour < 125, `egress $ ${s.egressPerHour}`);
});

test("broken: whole files at 2,000 a second — the cards are full, and polls fail behind the downloads", () => {
  const r = run(wholeFiles, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "app");
  assert.ok(s.nicUtil.app > 0.98, `nic ${s.nicUtil.app}`);
  assert.ok(s.util.app < 0.05, `cpu ${s.util.app}`);
  // Each worker is held while its download is sent, so the workers run out and every kind fails.
  assert.ok(s.threads.app > 0.98, `workers ${s.threads.app}`);
  assert.ok(s.errorRate > 0.7, `errors ${s.errorRate}`);
  assert.ok(s.byKind.read!.errorRate > 0.7, `polls ${s.byKind.read!.errorRate}`);
  assert.ok(s.byKind.static!.p50 > 7000, `download p50 ${s.byKind.static!.p50}`);
});

test("chunks: 2,000 a second, 100 chunk downloads straight from storage, the app servers idle", () => {
  const s = summary(run(chunked, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.nicUtil.app < 0.01, `app nic ${s.nicUtil.app}`);
  // 4 MB at 100 Mbps is 320 ms, plus the trip to storage.
  assert.ok(s.byKind.static!.p50 > 350 && s.byKind.static!.p50 < 450, `download p50 ${s.byKind.static!.p50}`);
  // 100 downloads x 4 MB = 400 MB a second: ~$130 an hour of egress, nearly the whole bill.
  assert.ok(s.egressBytes > 0.37 * GB && s.egressBytes < 0.43 * GB, `egress ${s.egressBytes}`);
  assert.ok(s.egressPerHour > 120 && s.egressPerHour < 140, `egress $ ${s.egressPerHour}`);
  assert.ok(s.costPerHour - s.egressPerHour < 1.2, `machines $ ${s.costPerHour - s.egressPerHour}`);
  assert.ok(s.util.meta > 0.2 && s.util.meta < 0.32, `meta ${s.util.meta}`);
});

test("broken: five times the devices, still polling — 9,000 polls a second fill the metadata database", () => {
  const r = run(chunkedGrowth, { seconds: 5, seed: 1 });
  const s = summary(r, 2);
  assert.equal(bottleneck(r, 2), "meta");
  assert.ok(s.util.meta > 0.98, `meta ${s.util.meta}`);
  assert.ok(s.byKind.read!.sent > 8500, `polls ${s.byKind.read!.sent}`);
  // Edits fail along with the polls; downloads go to storage and do not notice.
  assert.ok(s.byKind.write!.errorRate > 0.15, `edits ${s.byKind.write!.errorRate}`);
  assert.equal(s.byKind.static!.errorRate, 0);
});

test("notify: the same devices and edits, 1,500 requests a second, the metadata database 25% busy", () => {
  const s = summary(run(notified, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.sent > 1400 && s.sent < 1600, `requests ${s.sent}`);
  assert.ok(s.util.meta > 0.2 && s.util.meta < 0.3, `meta ${s.util.meta}`);
  assert.ok(s.calls.push > 450 && s.calls.push < 530, `notifications ${s.calls.push}`);
  assert.ok(s.backlog.notify < 10, `notify backlog ${s.backlog.notify}`);
  // 500 downloads a second of 4 MB: egress is now ~$640 an hour, nearly all of the bill.
  assert.ok(s.egressPerHour > 600 && s.egressPerHour < 680, `egress $ ${s.egressPerHour}`);
  assert.ok(s.egressPerHour / s.costPerHour > 0.99, `egress share ${s.egressPerHour / s.costPerHour}`);
});
