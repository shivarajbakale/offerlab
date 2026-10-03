/**
 * 25. Log Pipeline
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Thousands of services send their logs to one place where engineers can search them.
 *   The volume is huge (hundreds of megabytes a second), it jumps when someone turns on debug
 *   logging, and the logging must never take the services down with it.
 *
 * Approach: Put a buffer between the services and the index, then decide what to throw away
 *   1. Services send log batches straight to the indexers. 2. Collectors accept batches and put
 *   them on a durable queue; consumers feed the indexers at their own pace. 3. When the collectors'
 *   network is full, the services drop logs instead of waiting. 4. Sample debug logs and compress
 *   at the source, so far fewer bytes cross the network at all.
 *
 * Cost: 5,000 batches a second of 64 KB = 320 MB/s (2.6 Gbps), ~$100 an hour of internet egress.
 *   Straight to the index, a 3 s indexer slowdown leaves ~2,700 log calls stuck instead of ~250
 *   and ~46% of batches are lost. With collectors and a queue the same slowdown grows a backlog
 *   of ~10,000 batches (2 s behind) and loses nothing. Debug logging triples the bytes: 7.7 Gbps
 *   into 4 Gbps of network cards, so ~48% is lost however the callers behave; blocking callers
 *   keep ~2,000 calls stuck and send 2.4x the attempts; dropping callers are refused at once and
 *   no stored batch takes more than ~65 ms.
 *   Sampling and compressing at the source: ~0.4 Gbps, nothing lost, egress ~$16 an hour.
 *
 * Pattern: buffered ingestion (collectors + durable queue), load shedding, sampling, compression
 * Key insight: Logs are worth less than the service that writes them. A pipeline must absorb
 *   the index being slow (a buffer) and, when even the buffer cannot keep up, lose logs rather
 *   than block the caller. Then cut the volume at the source, where bytes are cheapest to remove.
 * Tradeoffs: A queue adds delay between a log line and when it can be searched; dropping and
 *   sampling lose exactly the lines you may need during an incident; compression costs CPU on
 *   every service.
 * Staff notes: Measure the pipeline in bytes, not requests. Alert on the queue's oldest message
 *   (search freshness) and on dropped bytes per service. Give each service a byte budget, so one
 *   noisy deploy cannot crowd out everyone else's logs.
 * Interview signals: "design a logging / observability pipeline", "ELK", "ingest TBs a day",
 *   "what if the log system is down", "backpressure".
 * Real world: Common stacks put an agent on each host (Fluent Bit, Vector, Filebeat), collectors
 *   in front of Kafka, and indexers such as Elasticsearch/OpenSearch or Loki behind it. Text logs
 *   often compress 5-10x or more with gzip or zstd.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { EGRESS_PER_GB, bottleneck, clients, design, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Every stage gets the same traffic: services send 5,000 log batches a second, each about
// 64 KB (some 400 lines): 320 MB a second. The services run in another network than the
// pipeline, so every byte shipped is internet egress, billed to them at $0.09 a GB.
// The simulator moves bytes in answers, not requests, so the collector's answer carries the
// batch's size: the same bytes through the same network card, counted the other way round.
type Policy = "block" | "drop";
const services = (o: { kbytes?: number; policy?: Policy; to?: string } = {}) =>
  clients({
    to: o.to ?? "lb",
    qps: knob("qps", 5000, [100, 50_000]),
    mix: { read: 0, write: 1 },
    users: 10_000,
    bytes: { write: knob("batchBytes", (o.kbytes ?? 64) * 1000, [1000, 1_000_000]) },
    // "block": the logging library waits up to 2 s and tries 3 times; "drop": it waits 100 ms once.
    ...(o.policy === "drop" ? { timeoutMs: 100, retry: "none" } : { timeoutMs: 2000, retry: "backoff", attempts: 3 }),
  });
// Indexing a 64 KB batch (parse, tokenize, add to the index) costs 8 ms of CPU. Six 8-core
// indexers: 48 cores for 40 cores of work.
const indexer = () => server({ label: "Indexer", replicas: 6, cores: 8, serviceMs: { read: 8, write: 8 }, costPerHour: 0.34 });
// A collector only receives a batch and appends it to the queue: 0.5 ms. Four of them, each
// with a 1 Gbps network card. When dropping, a collector takes at most 16 batches at once and
// turns the next one away at once (no waiting line), so a full collector answers "no" fast.
const collectors = (policy: Policy) =>
  server({
    label: "Collector",
    replicas: 4,
    cores: 4,
    serviceMs: { read: 0.5, write: 0.5 },
    calls: ["buffer"],
    bandwidthMbps: 1000,
    egressPerGB: EGRESS_PER_GB,
    ...(policy === "drop" ? { threads: 16, queue: 0 } : {}),
  });
const buffer = () => queue({ label: "Log buffer (Kafka)", consumers: 200, workMs: 1, to: "indexer" });

// @why Stage 1: each service's logging library sends its batch to an indexer and waits for the
// @why answer. The indexers have 20% spare CPU.
export const direct = design("1. Straight to the index", {
  services: services(),
  lb: loadBalancer({ to: "indexer" }),
  indexer: { ...indexer(), egressPerGB: EGRESS_PER_GB },
});

// @why Stage 2: collectors accept a batch, append it to a durable queue and answer at once.
// @why Consumers take batches off the queue and send them to the indexers.
const buffered = (name: string, o: { kbytes?: number; policy?: Policy } = {}) =>
  design(name, {
    services: services(o),
    lb: loadBalancer({ to: "collector" }),
    collector: collectors(o.policy ?? "block"),
    buffer: buffer(),
    indexer: indexer(),
  });
export const withBuffer = buffered("2. Collectors and a buffer");
// @why Someone turns on debug logging everywhere: each batch is now 192 KB, 7.7 Gbps in all,
// @why into 4 collectors with 1 Gbps each. The services' logging still blocks and retries.
export const debugBlocking = buffered("2. Debug logging, callers block", { kbytes: 192 });
// @why Stage 3: the same flood, but a full collector refuses a batch at once, and the logging
// @why library then drops it (and counts it) instead of retrying; it never waits more than 100 ms.
export const debugDropping = buffered("3. Debug logging, callers drop", { kbytes: 192, policy: "drop" });

// @why Stage 4: the agent on each host keeps 1 in 10 debug lines and compresses each batch
// @why (~8x for text logs): 64 KB of normal lines + 128 KB of debug lines becomes ~77 KB, then
// @why ~10 KB on the wire. Compressing costs CPU on the services' own hosts.
export const atSource = buffered("4. Sample and compress at the source", { kbytes: 10, policy: "drop" });

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };
// Segment merges make every indexer 4 times slower from 4 s to 7 s.
const slowIndex = Array.from({ length: 6 }, (_, i) => ({ at: 4000, kind: "slow" as const, target: `indexer-${i + 1}`, factor: 4, durationMs: 3000 }));
const GBPS = 8 / 1e9;

test("straight to the index: 5,000 batches a second, the indexers 82% busy", () => {
  const s = summary(run(direct, S), 1);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.indexer > 0.78 && s.util.indexer < 0.87, `indexers ${s.util.indexer}`);
  assert.ok(s.inSystem > 200 && s.inSystem < 300, `in flight ${s.inSystem}`);
  // 320 MB a second leave the services' network: about $100 an hour of egress.
  assert.ok(s.egressBytes * GBPS > 2.4 && s.egressBytes * GBPS < 2.7, `${s.egressBytes * GBPS} Gbps`);
  assert.ok(s.egressPerHour > 95 && s.egressPerHour < 110, `egress $${s.egressPerHour}`);
});

test("broken: straight to the index — a 3 s indexer slowdown blocks the services' log calls", () => {
  const r = run(direct, { ...S, faults: slowIndex });
  const before = summary(r, 1, 4);
  const during = summary(r, 6, 7);
  assert.ok(before.inSystem < 300 && during.inSystem > 2400 && during.inSystem < 3000, `in flight ${before.inSystem} -> ${during.inSystem}`);
  const s = summary(r, 4, 8);
  assert.ok(s.errorRate > 0.4 && s.errorRate < 0.52, `lost ${s.errorRate}`);
  assert.ok(s.retries > 1500, `retries ${s.retries}`);
  assert.ok(during.p50 > 600, `p50 ${during.p50}`);
});

test("collectors and a buffer: the same slowdown only grows a backlog, gone 10-11 s later", () => {
  const r = run(withBuffer, { ...S, seconds: 20, faults: slowIndex });
  assert.equal(summary(r, 1).errorRate, 0);
  assert.ok(summary(r, 1).p99 < 55, `p99 ${summary(r, 1).p99}`);
  const peak = summary(r, 6.9, 7);
  assert.ok(peak.backlog.buffer > 9000 && peak.backlog.buffer < 12_000, `backlog ${peak.backlog.buffer}`);
  assert.ok(peak.oldestMs.buffer > 1800 && peak.oldestMs.buffer < 2400, `oldest ${peak.oldestMs.buffer}`);
  assert.ok(summary(r, 17, 18).backlog.buffer > 0 && summary(r, 19, 20).backlog.buffer === 0, "drained by ~19 s");
  // ~1,000 spare batches a second drain it: ~10,400 at 7 s, about half left at 12.5 s.
  const mid = summary(r, 12.5, 12.6).backlog.buffer;
  assert.ok(mid > 4500 && mid < 6000, `backlog at 12.5 s ${mid}`);
  const calm = summary(r, 1, 4);
  assert.ok(calm.nicUtil.collector > 0.6 && calm.nicUtil.collector < 0.68, `collector NICs ${calm.nicUtil.collector}`);
  assert.ok(calm.util.collector > 0.13 && calm.util.collector < 0.19, `collector CPU ${calm.util.collector}`);
});

test("broken: debug logging, callers block — half the logs lost anyway, and 2,000 calls stuck", () => {
  const r = run(debugBlocking, S);
  const s = summary(r, 3);
  assert.equal(bottleneck(r, 3), "collector");
  assert.ok(s.nicUtil.collector > 0.98 && s.util.collector < 0.1, `NIC ${s.nicUtil.collector}, CPU ${s.util.collector}`);
  // 4 Gbps of network cards pass ~2,600 batches of 192 KB a second.
  assert.ok(s.ok > 2450 && s.ok < 2750, `stored ${s.ok}`);
  assert.ok(s.errorRate > 0.44 && s.errorRate < 0.52, `lost ${s.errorRate}`);
  assert.ok(s.inSystem > 1800 && s.inSystem < 2400, `in flight ${s.inSystem}`);
  assert.ok(s.calls.collector > 2.2 * s.sent && s.calls.collector < 2.6 * s.sent, `attempts ${s.calls.collector} for ${s.sent} batches`);
  assert.ok(s.p50 > 300, `p50 ${s.p50}`);
});

test("debug logging, callers drop: the same half lost, refused at once, nothing piles up", () => {
  const s = summary(run(debugDropping, S), 3);
  assert.ok(s.ok > 2450 && s.ok < 2750, `stored ${s.ok}`);
  assert.ok(s.errorRate > 0.44 && s.errorRate < 0.52, `dropped ${s.errorRate}`);
  assert.ok(s.rejectedRate > 0.44 && s.timeoutRate < 0.01, `refused ${s.rejectedRate}, timed out ${s.timeoutRate}`);
  assert.ok(s.inSystem > 230 && s.inSystem < 300 && s.retries === 0, `in flight ${s.inSystem}`);
  // Percentiles cover stored batches only (192 KB through a full card); a refusal comes back at once.
  assert.ok(s.p50 > 60 && s.p50 < 70 && s.p99 < 70, `p50 ${s.p50} p99 ${s.p99}`);
  assert.ok(s.egressBytes > 4.6e8 && s.egressBytes < 5.4e8, `egress ${s.egressBytes} B/s`);
  assert.ok(s.egressPerHour > 150 && s.egressPerHour < 170, `egress $${s.egressPerHour}`);
});

test("sample and compress at the source: nothing dropped, the network 10% busy", () => {
  const s = summary(run(atSource, S), 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.nicUtil.collector > 0.08 && s.nicUtil.collector < 0.12, `NIC ${s.nicUtil.collector}`);
  assert.ok(s.egressBytes * GBPS > 0.35 && s.egressBytes * GBPS < 0.45, `${s.egressBytes * GBPS} Gbps`);
  assert.ok(s.egressPerHour > 14 && s.egressPerHour < 18, `egress $${s.egressPerHour}`);
});
