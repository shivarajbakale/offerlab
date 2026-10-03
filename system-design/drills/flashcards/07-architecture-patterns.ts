/**
 * 07. Architecture Patterns
 * Level: Senior
 * Group: Flashcards
 *
 * The one idea each case study turns on: what breaks first, the pattern that moves the limit,
 * and the number or rule worth remembering. Each card links to the case study that shows it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const A = "sd-architectures";
const WEB = `${A}/01-scale-a-web-app`;
const URL = `${A}/02-url-shortener`;
const PASTE = `${A}/03-pastebin`;
const RATE = `${A}/04-public-api-rate-limits`;
const PAY = `${A}/05-checkout-and-payments`;
const FEED = `${A}/06-news-feed`;
const NOTIFY = `${A}/07-notification-system`;
const VIDEO = `${A}/08-video-upload-and-streaming`;
const AUTO = `${A}/09-search-autocomplete`;
const VIEWS = `${A}/10-view-counter`;
const SALE = `${A}/11-flash-sale`;

export const deck = flashcards("Architecture patterns", [
  {
    front: "\"How would you scale this?\" Where do you start?",
    back: "Find the **busiest part**: a system is as fast as its bottleneck. Give it more capacity, then look for the next one. Typical order: separate the database, stateless app servers behind a load balancer, a cache, read replicas, a queue for slow work, a CDN; then the one primary fills with writes.",
    link: WEB,
  },
  {
    front: "A server is 80% busy. Why worry already?",
    back: "Waiting time explodes near 100%. In the simple queueing model (one core, random arrivals and work times), a request at 80% busy **waits about 4 times its work time** (ρ / (1 − ρ)). Alert well before 100%.",
    link: WEB,
  },
  {
    front: "Why keep app servers stateless from day one?",
    back: "A server that keeps nothing between requests can be **added or lost freely** behind a load balancer. Moving sessions into a shared store later often means logging everyone out once.",
    link: WEB,
  },
  {
    front: "Why does a URL shortener's redirect path cache so well?",
    back: "A redirect is a lookup of **one immutable key**, and a few links get most clicks, so a cache of the top links answers most redirects. Writes and stored rows don't cache, so they decide when to **shard**: by short code, so each lookup goes to exactly one shard.",
    link: URL,
  },
  {
    front: "301 or 302 for a short link?",
    back: "A **301** (permanent) is cached by browsers, so repeat clicks never reach you and **analytics are lost**. A **302** comes back every time. Choose on purpose.",
    link: URL,
  },
  {
    front: "How many 7-character base-62 short codes are there?",
    back: "62^7, about **3.5 trillion** (a-z, A-Z, 0-9).",
    link: URL,
  },
  {
    front: "Why plan many more logical shards than machines?",
    back: "Then growing is **moving whole logical shards** to new machines, a copy, rather than changing the hash and re-sharding every key.",
    link: URL,
  },
  {
    front: "Where do pastes, images or other large values go?",
    back: "The **bytes in object storage**, a small **metadata row in the database**, the popular bytes in a cache. A database is fast at small rows and slow at moving large ones; object storage is cheap but slower to answer.",
    link: PASTE,
  },
  {
    front: "An upload writes a blob and a metadata row. In which order?",
    back: "**Blob first, row last**, so a reader never sees a row whose blob is missing. A half-failed upload leaves an orphan blob, which a later sweep deletes.",
    link: PASTE,
  },
  {
    front: "Expired pastes are deleted by a background job that is falling behind. Can users still read them?",
    back: "Not if every read **checks the metadata row's expiry**, even for cached bodies. Then the backlog only delays physical deletion, which still costs storage and can break a retention promise. Watch the oldest job's age.",
    link: PASTE,
  },
  {
    front: "A queue in front of servers is longer than timeout × service rate. What is it holding?",
    back: "Requests that **will time out** before they are served. Keep queues short and reject at once, so clients back off instead of waiting for nothing.",
    link: RATE,
  },
  {
    front: "Checkout calls a payment provider that sometimes takes seconds. Why can that take the whole shop down?",
    back: "Each call **holds a worker** for as long as it takes; when the provider slows, checkouts hold every worker and page views fail too. Give checkout its own pool (a **bulkhead**), or accept the order and take payment **off the request on a queue**.",
    link: PAY,
  },
  {
    front: "How do you avoid charging a shopper twice when they click Pay again or a call is retried?",
    back: "Every attempt for one payment carries the **same idempotency key**, stored with the order **before** calling the provider, so a crash between \"charged\" and \"recorded\" can be resolved by asking the provider.",
    link: PAY,
  },
  {
    front: "News feed: fan-out on write or fan-out on read?",
    back: "**On write** (push) copies each post into every follower's timeline: reads are one lookup, writes cost × followers. **On read** (pull) gathers at read time: cost × accounts followed. Followers are wildly uneven, so the usual answer is a **hybrid**: push for normal accounts, pull celebrity posts at read time.",
    link: FEED,
  },
  {
    front: "What goes in a precomputed timeline?",
    back: "**Post ids only**, capped in length (say the newest 800), with bodies fetched from a cache at read time. Skip fan-out to inactive users and rebuild their timeline when they return.",
    link: FEED,
  },
  {
    front: "A notification service sends push, email and SMS. Why one queue per channel?",
    back: "With one shared queue, a slow SMS provider fills it and **delays push and email** too. Separate queues and consumer pools (bulkheads) confine a slow provider to its own channel.",
    link: NOTIFY,
  },
  {
    front: "300 jobs a second, each holding a consumer for 125 ms. How many consumers?",
    back: "Little's law: 300 × 0.125 s ≈ **38 busy at all times**, plus headroom to drain a backlog after a slowdown.",
    link: NOTIFY,
  },
  {
    front: "Video upload and playback have opposite shapes. What does each get?",
    back: "Transcoding is **rare, heavy and deferrable**: a queue and its own pool of machines, so it never starves the request path. Segments are **frequent, light and identical for everyone**: a CDN near viewers. Size the origin for a cold CDN.",
    link: VIDEO,
  },
  {
    front: "Autocomplete must answer every keystroke in under about 100 ms. How?",
    back: "**Precompute** top-k suggestions per prefix offline from query logs and serve them read-only, **cache by prefix** (a few thousand prefixes carry most keystrokes), cache the hottest at the edge, and **debounce** in the client. Measure hit rate per cache layer.",
    link: AUTO,
  },
  {
    front: "One viral video's view counter overloads its shard. Why doesn't more sharding help, and what does?",
    back: "Sharding spreads **different keys**; it cannot split one. **Batch**: put views on a queue, add them up, and write one update per many views. Counts then trail reality by the queue's delay.",
    link: VIEWS,
  },
  {
    front: "What single metric tells you how stale a queue-fed system's data is?",
    back: "The **age of the oldest message** (or job), per queue. Backlog size alone doesn't say how far behind you are.",
    link: VIEWS,
  },
  {
    front: "Flash sale: thousands of buyers, a few hundred units in one stock row. How do you avoid overselling and keep the site up?",
    back: "Prevent overselling **in the database**: a conditional atomic decrement (only if stock > 0), and an idempotent \"place order\". Keep the site up with a per-user rate limit, a **waiting room** queue that feeds the row at the rate it can take, and a CDN for the product page.",
    link: SALE,
  },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
  // Every case study 01 to 11 has at least one card.
  assert.deepEqual([...new Set(deck.cards.map((c) => c.link))].sort(), [WEB, URL, PASTE, RATE, PAY, FEED, NOTIFY, VIDEO, AUTO, VIEWS, SALE]);
});

test("the arithmetic on the cards", () => {
  const rho = 0.8;
  assert.ok(Math.abs(rho / (1 - rho) - 4) < 1e-9, "at 80% busy the wait is 4x the work time");
  assert.ok(Math.abs(62 ** 7 / 3.5e12 - 1) < 0.01, "62^7 is about 3.5 trillion");
  assert.equal(Math.ceil(300 * 0.125), 38, "Little's law: 37.5 consumers busy");
});
