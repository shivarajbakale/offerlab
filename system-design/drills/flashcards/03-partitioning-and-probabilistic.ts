/**
 * 03. Partitioning and Probabilistic Structures
 * Level: Senior
 * Group: Flashcards
 *
 * How keys find their server (consistent and rendezvous hashing), how places find their
 * neighbours (geohash, quadtree), and how to answer "seen it?", "how often?" and "how many
 * distinct?" in a fixed amount of memory (Bloom filter, count-min sketch, HyperLogLog).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const RING = "sd-01-partitioning/001-consistent-hashing";
const HRW = "sd-01-partitioning/002-rendezvous-hashing";
const GEO = "sd-01-partitioning/003-geohash";
const QUAD = "sd-01-partitioning/004-quadtree";
const BLOOM = "sd-02-probabilistic/005-bloom-filter";
const CMS = "sd-02-probabilistic/006-count-min-sketch";
const HLL = "sd-02-probabilistic/007-hyperloglog";

export const deck = flashcards("Partitioning and probabilistic structures", [
  {
    front: "Keys are placed on servers by hash(key) mod N. What happens when you go from 3 servers to 4?",
    back: "About **three quarters** of the keys move: a key stays only if its hash gives the same remainder mod 3 and mod 4. Every move is a copy over the network.",
    link: RING,
  },
  {
    front: "With consistent hashing, a fourth server joins three. Which keys move, and where?",
    back: "About **a quarter** of them, and **all go to the new server**. New tokens can only take keys from their neighbours; keys never shuffle between the old servers.",
    link: RING,
  },
  {
    front: "Why give each server many tokens (virtual nodes) on the ring?",
    back: "A few random points cut the ring into very unequal arcs, so one server can own most keys. With v tokens a server's share wobbles by roughly **1/√v** of its fair share, so systems use tens to hundreds of tokens per server.",
    link: RING,
  },
  {
    front: "Does consistent hashing fix a hot key?",
    back: "No. It evens out **keys, not traffic**. A key read millions of times a second still lands on one server. Fix it with a cache in front, or split the key (`counter#1` to `counter#8`) and combine on read.",
    link: RING,
  },
  {
    front: "The ring now says a new server owns a range of keys. What still has to happen?",
    back: "A **migration**: the data must be copied from the old owners. Until it finishes the new owner does not have it, so systems stream it in the background and send reads to the old owner, or check both, meanwhile.",
    link: RING,
  },
  {
    front: "How does rendezvous (highest random weight) hashing pick a key's owner?",
    back: "Every client scores each server with **hash(server, key)** and the highest score wins. Removing a server moves only the keys it won; adding one moves only the keys it now wins.",
    link: HRW,
  },
  {
    front: "Rendezvous hashing or a ring: what does each cost per lookup?",
    back: "Rendezvous computes **n hashes** (one per server) and stores nothing but the server list. A ring does a **binary search** over its tokens but must store and ship the token list. Rendezvous suits small sets of targets; very large sets are often grouped and hashed level by level.",
    link: HRW,
  },
  {
    front: "How does rendezvous hashing choose replicas?",
    back: "Take the **top 2 or 3 scores** instead of only the top one. When the first server fails, every client already agrees on the next.",
    link: HRW,
  },
  {
    front: "What does each extra geohash character do, and why does a shared prefix matter?",
    back: "Each character is **5 bits**, each bit halves the box, so the cell gets **32 times smaller**. A prefix is a cell, so a sorted store finds everything in a cell with one range scan.",
    link: GEO,
  },
  {
    front: "Two cafes are 42 m apart. Must their geohashes share a prefix?",
    back: "No. If a cell edge runs between them they can differ from the first character. That is why a nearby search scans **9 cells** (your own and its 8 neighbours), then filters candidates by real distance.",
    link: GEO,
  },
  {
    front: "When is a quadtree a better spatial index than a geohash?",
    back: "When density is very uneven and the points fit in **one machine's memory**: cells split where points crowd, so a search checks a few points either way. When points live in a shared database or are too many for memory, store a geohash or S2 cell id as a key and use range scans.",
    link: QUAD,
  },
  {
    front: "How do you keep a quadtree of moving drivers up to date?",
    back: "Often you don't update it point by point: you **rebuild it every few seconds** from a fresh list. Building is fast and leaves no stale, emptied cells behind.",
    link: QUAD,
  },
  {
    front: "What can a Bloom filter answer, and what can it never get wrong?",
    back: "\"**Definitely not present**\" or \"**maybe present**\". It never says no for an item that was added (no false negatives), because bits are only ever set. False positives happen when all of an item's bits were set by others.",
    link: BLOOM,
  },
  {
    front: "Roughly how much memory does a Bloom filter need for a 1% false positive rate?",
    back: "About **9.6 bits per item**; each extra 4.8 bits per item divides the rate by about 10. A billion items at 1% is about **1.2 GB**, however big the items are.",
    link: BLOOM,
  },
  {
    front: "Why can't you delete from a plain Bloom filter, and what do you use instead?",
    back: "Items share bits, so clearing one item's bits can clear another's and create **false negatives**. A counting Bloom filter (counters instead of bits, several times the memory) or a cuckoo filter supports deletes.",
    link: BLOOM,
  },
  {
    front: "A Bloom filter was sized for 10 million items and now holds 50 million. What happens, and what is the fix?",
    back: "The bits fill up and the false positive rate climbs toward 100%. A filter cannot be resized because it does not know its items: **rebuild** a bigger one from the source data, or add a new filter beside the full one and check both.",
    link: BLOOM,
  },
  {
    front: "What does a count-min sketch promise about an item's estimated count?",
    back: "It is **never too low**, and too high by more than ε·N (N = total of all counts) with probability at most δ, using w = e/ε counters per row and d = ln(1/δ) rows. The estimate is the **minimum** of the item's counters, one per row.",
    link: CMS,
  },
  {
    front: "Which items does a count-min sketch estimate badly?",
    back: "**Light** ones. The error grows with the whole stream, not with the item, so an item seen once can be estimated at many times its count. Heavy hitters are estimated well, which is what it is used for.",
    link: CMS,
  },
  {
    front: "How do you get \"top items in the last hour\" from count-min sketches?",
    back: "Keep **one sketch per few minutes**, answer from the sum of the recent ones, and drop the oldest. Sketches with the same width, depth and hashes merge by adding counters, so shards can also count separately.",
    link: CMS,
  },
  {
    front: "How much memory does HyperLogLog need, and how accurate is it?",
    back: "m registers of about 6 bits; standard error about **1.04/√m**. 16,384 registers is about **12 KB** for about **0.8%**, whether the stream has a thousand distinct items or billions (with a 64-bit hash). Halving the error takes 4 times the registers.",
    link: HLL,
  },
  {
    front: "Why is HyperLogLog the usual answer for daily and weekly unique users?",
    back: "It is **mergeable**: taking the larger value of each register gives exactly the sketch of the union. Weekly uniques is the merge of seven daily sketches; exact sets would need every id. Intersections are weak, since their error is relative to the union.",
    link: HLL,
  },
  {
    front: "Bloom filter, count-min sketch or HyperLogLog: which answers which question?",
    back: "Bloom: \"**was this item seen?**\". Count-min: \"**how often was this item seen?**\" and heavy hitters. HyperLogLog: \"**how many distinct items?**\". None can list the items.",
    link: BLOOM,
  },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
  assert.deepEqual([...new Set(deck.cards.map((c) => c.link))].sort(), [RING, HRW, GEO, QUAD, BLOOM, CMS, HLL].sort());
});

test("the arithmetic on the cards", () => {
  // mod 3 vs mod 4: a key stays only if both remainders agree; over 12 consecutive hashes, 3 do.
  const stay = Array.from({ length: 12 }, (_, h) => h % 3 === h % 4).filter(Boolean).length;
  assert.equal(stay / 12, 1 / 4, "three quarters move");
  // 1/sqrt(v): 32 tokens is about 18%.
  assert.ok(Math.abs(1 / Math.sqrt(32) - 0.18) < 0.01);
  // Geohash: 5 bits a character, each halving: 32x.
  assert.equal(2 ** 5, 32);
  // Bloom: optimal bits per item = -ln(p) / ln(2)^2.
  const bitsPerItem = (p: number) => -Math.log(p) / Math.LN2 ** 2;
  assert.ok(Math.abs(bitsPerItem(0.01) - 9.6) < 0.05);
  assert.ok(Math.abs(bitsPerItem(0.001) - bitsPerItem(0.01) - 4.8) < 0.05);
  assert.ok(Math.abs((1e9 * 9.6) / 8 / 1e9 - 1.2) < 1e-9, "a billion items at 1% is about 1.2 GB");
  // HyperLogLog: 16,384 six-bit registers, error 1.04 / sqrt(m).
  assert.equal((16_384 * 6) / 8, 12_288);
  assert.ok(Math.abs(1.04 / Math.sqrt(16_384) - 0.008) < 0.0005);
  assert.equal(1.04 / Math.sqrt(4 * 16_384), 1.04 / Math.sqrt(16_384) / 2, "4x registers halves the error");
});
