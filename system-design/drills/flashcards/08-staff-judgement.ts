/**
 * 08. Staff-Level Judgement
 * Level: Staff
 * Group: Flashcards
 *
 * The questions after "draw the boxes": when not to use a tool, what it costs to run, how to
 * change a live system safely, and how to argue a tradeoff. Answers are rules of thumb, not
 * laws; the point is to know what each choice gives up.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const HOP = "sd-microservices/01-the-price-of-a-network-hop";
const WEB = "sd-architectures/01-scale-a-web-app";
const NOTIFY = "sd-architectures/07-notification-system";
const VIDEO = "sd-architectures/08-video-upload-and-streaming";
const AUTO = "sd-architectures/09-search-autocomplete";
const VIEWS = "sd-architectures/10-view-counter";
const SALE = "sd-architectures/11-flash-sale";
const RING = "sd-01-partitioning/001-consistent-hashing";
const LEADER = "sd-05-replication/017-leader-follower-replication";
const TWO_PC = "sd-06-transactions-messaging/024-two-phase-commit";
const OUTBOX = "sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer";
const RETRY = "sd-04-traffic/015-retry-backoff-jitter";
const BREAKER = "sd-04-traffic/016-circuit-breaker";

export const deck = flashcards("Staff-level judgement", [
  {
    front: "When should you not shard a database yet?",
    back: "While a bigger machine, read replicas, a cache or moving slow work to a queue can still carry the load. Sharding makes cross-shard queries, transactions, joins and rebalancing **permanently harder**. Shard when **writes or stored data** outgrow one primary.",
    link: WEB,
  },
  {
    front: "When is a cache the wrong answer?",
    back: "When reads rarely repeat (low hit rate), when data must never be stale, or when the load is mostly **writes**. A cache also adds invalidation bugs and a **cold-cache flood**: the database must survive the cache restarting.",
    link: AUTO,
  },
  {
    front: "When should a function not become its own microservice?",
    back: "When no **team or data boundary** needs it. Each hop adds a round trip, serialization, a worker held while waiting and a new way to fail, and a chain of calls succeeds only if every one does. Ask of each call: does the user's answer depend on it? If not, put it on a queue.",
    link: HOP,
  },
  {
    front: "When is a queue the wrong tool?",
    back: "When the caller needs the **result now**. A queue adds delay, duplicate deliveries to dedupe, another system to run, and a backlog that can quietly grow; it hides overload rather than removing it unless consumers can catch up.",
    link: NOTIFY,
  },
  {
    front: "When would you still choose two-phase commit?",
    back: "When the participants are **few, inside one system you control**, support it, and correctness needs atomic commit (for example inside a distributed database). Across independently owned services, prefer a saga or an outbox: locks held for someone else's coordinator are a shared outage.",
    link: TWO_PC,
  },
  {
    front: "\"Should these counts be exact?\" How do you decide?",
    back: "Ask what a **lost or doubled** event costs. Ad billing or money: exact, and pay for idempotency and reconciliation. A \"1.2M views\" label or a dashboard trend: approximate (batching, sketches) is far cheaper. Decide up front; changing later is a redesign.",
    link: VIEWS,
  },
  {
    front: "How do you change the shard key of a live table without downtime?",
    back: "**Expand and contract**: write to old and new layouts, backfill the new one, verify they match, move reads over, then stop writing the old one and delete it. Every step must be reversible until the last.",
    link: RING,
  },
  {
    front: "How do you rename or change a column under a running application?",
    back: "In **compatible steps**: add the new column, write both, backfill, switch reads, stop writing the old, then drop it. Old and new code run side by side during a deploy, so each step must work with both.",
  },
  {
    front: "What makes a change safe to roll out?",
    back: "It reaches a **small share of traffic first** (canary or feature flag), there are metrics that would show it failing, and there is a tested way back. Separate deploying code from turning it on.",
  },
  {
    front: "You are about to add a new kind of datastore. What is the hidden cost?",
    back: "**Operational burden**: backups and restore drills, upgrades, monitoring, capacity planning, security patches and someone on call who understands it. Prefer what the team already runs well unless the new store solves a problem the old ones can't.",
  },
  {
    front: "Managed service or self-hosted?",
    back: "Managed trades **money and some control** for less operational work: patching, failover and backups are someone else's job. Self-hosting can be cheaper at scale and more flexible, but needs people who run it well. Check limits, pricing per request and per byte, and how hard leaving would be.",
  },
  {
    front: "Adding a CDN made the median faster. What else must you check?",
    back: "The **bill** (CDNs charge per request and per byte), the tail (far users' misses still cross the ocean), and the origin's capacity for a **cold CDN** after a purge or in a new region.",
    link: VIDEO,
  },
  {
    front: "What usually dominates the cloud bill of a media or data-heavy service?",
    back: "**Bytes moved**, not requests: data leaving the cloud to users, and data crossing zones or regions, are typically billed per gigabyte. Count bytes per request in the estimate, not just requests a second.",
    link: VIDEO,
  },
  {
    front: "Active-passive or active-active across regions?",
    back: "**Active-passive** is simpler: one region takes writes, the other waits; failover takes time and, with asynchronous replication, can lose recent writes. **Active-active** serves users nearby and survives a region loss faster, but concurrent writes to the same data need conflict handling or a single home region per key.",
    link: LEADER,
  },
  {
    front: "Where should retries live in a multi-layer system?",
    back: "Retry at **one layer** only, with backoff, jitter and a retry budget, and only for idempotent operations. Lower layers should fail fast and say \"overloaded, don't retry\" rather than retrying themselves. Retries at every layer multiply into a storm exactly when the bottom layer is struggling.",
    link: RETRY,
  },
  {
    front: "What does blast radius mean, and how do you shrink it?",
    back: "How much breaks when one part fails. Shrink it with **bulkheads** (separate pools per dependency), separate queues per channel, timeouts and circuit breakers, and by keeping non-essential calls off the request path.",
    link: BREAKER,
  },
  {
    front: "What do you monitor first on a new service?",
    back: "The four **golden signals**: latency (including the tail), traffic, errors and saturation (how full the busiest resource is). For anything queue-fed, add the **age of the oldest message**.",
    link: NOTIFY,
  },
  {
    front: "A known traffic spike is coming (a sale, a launch). What do you do before it?",
    back: "**Load test** at the expected peak and beyond, find what breaks first, pre-scale or pre-warm caches, decide what to shed (rate limits, a waiting room, turning off non-essential features), and have someone watching.",
    link: SALE,
  },
  {
    front: "Someone says their pipeline is \"exactly once\". What do you ask?",
    back: "**Where is the deduplication?** Delivery is at-least-once; exactly-once effects come from an idempotent consumer whose dedupe record commits with the effect, or from idempotency keys at the outside system.",
    link: OUTBOX,
  },
  {
    front: "How should you present a design tradeoff in an interview?",
    back: "State the **requirement** that forces the choice, name two or three options, pick one and say **what it gives up**, and say what change in the requirements would make you switch.",
  },
  {
    front: "A hot key is overloading one machine. What are the options, in rough order?",
    back: "**Cache** it in front (reads), **batch** writes to it (counters), **split** it into several keys combined on read, or **queue** requests and feed it at the rate it can take. Adding shards alone does not help: one key lives in one place.",
    link: VIEWS,
  },
  {
    front: "When is simpler-but-less-scalable the right call?",
    back: "When the load estimate fits on it with headroom for growth you can foresee. A design that can change later is worth more than one that scales to traffic you will never see. Say the limit out loud and what you would change when you approach it.",
    link: WEB,
  },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
});
