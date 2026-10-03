/**
 * 01. Latency Numbers
 * Level: Senior
 * Group: Flashcards
 *
 * Orders of magnitude, not exact figures: hardware differs by generation and cloud. What
 * matters in an interview is the ratio between neighbours (memory is ~1,000x faster than an SSD
 * read, which is a few times faster than a same-zone round trip).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const HOP = "sd-microservices/01-the-price-of-a-network-hop";

export const deck = flashcards("Latency numbers", [
  { front: "Read from the CPU's L1 cache", back: "About **1 ns**. A main-memory read is about 100 times slower." },
  { front: "Read from main memory (a cache miss)", back: "About **100 ns**. Pointer-chasing data structures pay this on every hop." },
  { front: "Lock and unlock a mutex nobody else holds", back: "About **20 ns**. Contended, it can cost microseconds, because a waiting thread is put to sleep and woken again." },
  { front: "Compress 1 KB with a fast compressor (Snappy, LZ4)", back: "About **2 µs** of one CPU core. That is more than the 0.8 µs 1 KB takes on a 10 Gbit/s link, so compression pays when bandwidth or bytes cost money: across regions, over the internet, to disk, or when a link is saturated." },
  { front: "Send 1 KB over a 10 Gbit/s link", back: "About **1 µs** of wire time (8,000 bits / 10 Gbit/s = 0.8 µs). Propagation and software overheads dwarf it." },
  { front: "Random 4 KB read from an NVMe SSD", back: "Tens of µs; use **~100 µs** for estimates to cover queueing and cloud block storage. About 1,000x a memory read." },
  { front: "Read 1 MB sequentially from an NVMe SSD", back: "About **0.3-1 ms** (1-3 GB/s). Sequential beats random by a wide margin even on SSDs." },
  { front: "Commit a write durably (fsync) on cloud block storage", back: "About **0.5-2 ms**. This is why databases batch commits (group commit) and why a write costs more than a read." },
  { front: "Network round trip inside one availability zone", back: "About **0.1-0.5 ms**, before any work is done. Each extra service call on the request path pays it again.", link: HOP },
  { front: "Network round trip between two availability zones in a region", back: "About **1-2 ms**. Synchronous replication across zones adds this to every write.", link: HOP },
  { front: "A Redis or Memcached GET from an app server in the same zone", back: "About **0.2-0.5 ms**: almost all of it is the network round trip; the lookup itself takes microseconds." },
  { front: "A primary-key lookup in a warm relational database, over the network", back: "About **1 ms**: a round trip plus parsing, planning and a few page reads from memory." },
  { front: "Disk seek on a spinning hard drive", back: "About **10 ms**. One drive does only about 100 random reads a second, so random access on HDDs is a design constraint." },
  { front: "Read 1 MB sequentially from a hard drive", back: "About **5-10 ms** (100-200 MB/s). Hard drives are fine for big sequential scans and logs." },
  { front: "Round trip from the US west coast to the east coast", back: "About **70 ms**." },
  { front: "Round trip from California to Europe", back: "About **150 ms**. A user far from your servers pays this on every round trip, which is why CDNs and regional deployments exist." },
  { front: "How far does light travel in optical fibre in 1 ms?", back: "About **200 km** (two thirds of light's speed in a vacuum). So each 100 km of distance adds about 1 ms to a round trip." },
  { front: "How many round trips before the first byte of an HTTPS request on a new connection?", back: "**Two with TLS 1.3** (TCP handshake, then TLS), three with TLS 1.2, then the request itself. Connection reuse and pooling remove them all." },
  { front: "1 Gbit/s and 10 Gbit/s in bytes a second", back: "**125 MB/s** and **1.25 GB/s**. Divide bits by 8; network links are quoted in bits, disks in bytes." },
  { front: "Requests a day to requests a second", back: "A day has 86,400 s, about 1e5. **1 million a day ≈ 12 a second**; 1 billion a day ≈ 12,000 a second." },
  { front: "Put in order: SSD read, memory read, same-zone round trip, cross-continent round trip, disk seek", back: "Memory (100 ns) < SSD read (~100 µs) < same-zone round trip (~0.5 ms) < disk seek (~10 ms) < cross-continent (~150 ms). Each step is roughly 5 to 1,000 times the one before." },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
});

test("the arithmetic on the cards", () => {
  assert.equal((1000 * 8) / 10e9, 0.8e-6, "1 KB on a 10 Gbit/s link is 0.8 µs");
  assert.equal(1e9 / 8, 125e6, "1 Gbit/s is 125 MB/s");
  assert.ok(Math.abs(1e6 / 86_400 - 12) < 0.5, "1M a day is about 12 a second");
  // Light in fibre: about 2e8 m/s, so 200 km a millisecond; 100 km away is a 1 ms round trip.
  assert.equal(2e8 * 1e-3, 200e3);
  assert.equal((2 * 100e3) / 2e8, 1e-3);
});
