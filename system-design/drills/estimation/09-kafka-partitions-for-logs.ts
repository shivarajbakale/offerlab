/**
 * 09. Kafka Partitions for Logs
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Kafka partitions for a log pipeline",
  prompt:
    "**10,000 servers** ship their application logs into one Kafka topic, and a consumer group indexes them. How many partitions does the topic need to carry the **peak** without consumers falling behind?",
  assumptions: [
    { name: "hosts", value: 10_000, unit: "servers", note: "Servers shipping logs" },
    { name: "linesPerHost", value: 100, unit: "lines/s", note: "Average log lines a second per server (an assumption; noisy services log far more)" },
    { name: "lineBytes", value: 500, unit: "bytes", note: "One structured log line, before compression" },
    { name: "peakToMean", value: 2, unit: "x", note: "Peak traffic and error bursts against the average" },
    { name: "perPartition", value: 10e6, unit: "bytes/s", note: "What one consumer can index from one partition. An assumption: measure your consumer; partitions themselves can take more" },
  ],
  steps: [
    { label: "Average bytes a second", value: 10_000 * 100 * 500, unit: "bytes", how: "10,000 servers × 100 lines × 500 bytes = 500 MB a second." },
    { label: "Peak bytes a second", value: 10_000 * 100 * 500 * 2, unit: "bytes", how: "500 MB × 2 = 1 GB a second." },
    { label: "Partitions", value: (10_000 * 100 * 500 * 2) / 10e6, unit: "partitions", how: "1 GB/s / 10 MB/s per partition = **100 partitions**." },
  ],
  answer: { value: (10_000 * 100 * 500 * 2) / 10e6, unit: "partitions" },
  tolerance: 2,
  takeaways: [
    "**Partitions = peak throughput / the slower of what one partition's producer or one consumer can handle.** Consumers usually set the limit, because they do the real work.",
    "Partitions cap parallelism: in a classic consumer group, at most one consumer reads each partition (Kafka 4's share groups relax this). 100 partitions means at most 100 indexers.",
    "Replication multiplies broker load: at replication factor 3, brokers write 3 GB a second at the peak, and replicas pull it over the network.",
    "Retention sets the disk: 500 MB/s average × 3 days × 3 replicas ≈ **390 TB**. Compression (logs often shrink several-fold) is the cheapest lever.",
    "Adding partitions later changes which partition a key hashes to, breaking per-key order. Logs rarely need it, but pick a count with room to grow up front.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const mean = a.hosts * a.linesPerHost * a.lineBytes;
  const peak = mean * a.peakToMean;
  assert.deepEqual(
    checkSteps(drill, { "Average bytes a second": mean, "Peak bytes a second": peak, Partitions: peak / a.perPartition }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const a = given(drill);
  const mean = a.hosts * a.linesPerHost * a.lineBytes;
  assert.equal(mean * a.peakToMean * 3, 3e9, "3 GB/s of broker writes");
  const retained = mean * 86_400 * 3 * 3;
  assert.ok(retained > 385e12 && retained < 395e12, `${retained / 1e12} TB`);
});
