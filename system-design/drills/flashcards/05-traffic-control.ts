/**
 * 05. Traffic Control
 * Level: Senior
 * Group: Flashcards
 *
 * Rate limiters, load balancing, retries and circuit breakers: the tools that decide which
 * requests get in, where they go, and what a caller does when the answer is "no" or nothing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const P = "sd-04-traffic";
const BUCKET = `${P}/012-token-and-leaky-bucket`;
const WINDOW = `${P}/013-window-rate-limiters`;
const LB = `${P}/014-load-balancing`;
const RETRY = `${P}/015-retry-backoff-jitter`;
const BREAKER = `${P}/016-circuit-breaker`;
const API = "sd-architectures/04-public-api-rate-limits";

export const deck = flashcards("Traffic control", [
  {
    front: "A token bucket has capacity C and refills at rate r. What is the most a client can send in T seconds?",
    back: "**C + r × T**: what was in the bucket plus what was earned. The long-run average is r and the biggest instant burst is C. The cap on the bucket keeps that true however long the client was idle.",
    link: BUCKET,
  },
  {
    front: "Token bucket or leaky bucket?",
    back: "A **token bucket** lets a burst of up to its capacity through at once. A **leaky bucket** queues requests and releases them evenly spaced, so the server sees a smooth rate, but requests wait and a full queue still rejects.",
    link: BUCKET,
  },
  {
    front: "A client's requests are spread over many API servers. How do you enforce one limit for it?",
    back: "Either keep the counter in a **shared store** and update it atomically (Redis INCR or a script), paying a round trip per request; or give each of N servers **limit / N**, which is fast but too strict when one server gets most of that client's traffic.",
    link: BUCKET,
  },
  {
    front: "What should a rate-limited HTTP request get back?",
    back: "Status **429 Too Many Requests** with a **Retry-After** header, so well-behaved clients wait instead of retrying at once. Reject at the edge (gateway or load balancer) so the server never does the work.",
    link: BUCKET,
  },
  {
    front: "What is wrong with a fixed-window rate limiter?",
    back: "The count resets at the window boundary, so a client can send the limit just before it and the limit again just after: up to **twice the limit** in under one window.",
    link: WINDOW,
  },
  {
    front: "Sliding log or sliding counter?",
    back: "A **sliding log** keeps a timestamp per accepted request: exact, but up to `limit` entries per client, fine for 5 logins a minute, heavy for 10,000 an hour. A **sliding counter** keeps two counters and weights the previous window by its overlap: tiny and close to exact for smooth traffic.",
    link: WINDOW,
  },
  {
    front: "Two API servers check a shared counter, see 99 of 100, and both accept. What went wrong?",
    back: "The read, check and increment were **separate steps**. They must be one atomic operation in the store, or two servers can both take the last slot. Give each key an expiry of about two windows so idle clients cost nothing.",
    link: WINDOW,
  },
  {
    front: "Is a per-client rate limit a capacity plan?",
    back: "No. It is a **fairness** tool: it stops one client taking everyone's share. The total it allows is clients × limit, which can be far more than the servers can do; the fleet must still be sized for the sum.",
    link: API,
  },
  {
    front: "Round robin over three servers, one of them three times slower. What happens?",
    back: "The slow server gets the same share as the fast ones, finishes fewer, and, once its third of the traffic is more than it can serve, **its queue grows without bound** while the others have spare capacity. Round robin ignores how busy a server is.",
    link: LB,
  },
  {
    front: "Several load balancers all use least connections on counts refreshed every few seconds. What goes wrong?",
    back: "They all see the same stale counts and **send everything to the same \"idle\" server** (a herd). Sampling two servers at random and picking the less busy one (power of two choices) breaks the herd and stays safe with stale counts.",
    link: LB,
  },
  {
    front: "What is \"power of two choices\" load balancing?",
    back: "Pick **two servers at random** and send the request to the less loaded. It never feeds the busier of its samples, so long queues stay rare, and it needs only a count per server and two random numbers per request.",
    link: LB,
  },
  {
    front: "L4 or L7 load balancer, and why does it matter for gRPC or WebSockets?",
    back: "**L4** balances network connections without reading them; **L7** reads each HTTP request and can balance per request and route by path or header. With long-lived connections carrying many requests, L4 balancing can leave load very uneven.",
    link: LB,
  },
  {
    front: "Least connections plus a server that fails every request instantly. What happens?",
    back: "The broken server always looks idle, so it gets **more** traffic. **Health checks** must take it out. Its mirror image is a new server with cold caches that least connections floods; **slow start** ramps its share up.",
    link: LB,
  },
  {
    front: "Why add jitter to exponential backoff?",
    back: "Clients that failed together back off by the same amounts and **come back together**, overloading the server again each time. Random waits spread their retries out so each moment's load fits under capacity.",
    link: RETRY,
  },
  {
    front: "The web tier, the service it calls and the database client each make up to 3 attempts. What can one user request become?",
    back: "**3 × 3 × 3 = 27** attempts at the bottom layer, exactly when it is already struggling. Retry at **one layer** only, with backoff, jitter and a retry budget, and only for idempotent operations. Lower layers should fail fast and say \"overloaded, don't retry\" rather than retrying themselves.",
    link: RETRY,
  },
  {
    front: "What is a retry budget?",
    back: "A cap on retries as a **share of normal traffic** (say 10%). During a widespread outage the budget runs out and callers fail fast instead of multiplying the load.",
    link: RETRY,
  },
  {
    front: "Which failures should a client never retry?",
    back: "**Permanent** ones, such as a malformed request or a permission error: they fail the same way every time. And never retry an operation that is not **idempotent**, or a lost response becomes a duplicate action.",
    link: RETRY,
  },
  {
    front: "Walk through a circuit breaker's states.",
    back: "**Closed**: calls go through and failures are counted. Too many failures: **open**, calls fail fast and the dependency gets no traffic. After a cooldown: **half-open**, a trial call goes through; success closes the breaker, failure opens it again.",
    link: BREAKER,
  },
  {
    front: "Which errors should count toward opening a circuit breaker?",
    back: "**Timeouts, refused connections and 5xx** errors. Caller errors such as 400 or 404 mean the service is working and must not open it. Many breakers use a failure **rate** over a window with a minimum number of calls, so three unlucky calls don't trip a busy service.",
    link: BREAKER,
  },
  {
    front: "A breaker is open. What should the caller do with the fast \"no\"?",
    back: "Use a **fallback**: cached data, a default, or a clear error. Failing fast only helps if there is something better to do. Retries must also stop while the breaker is open, or each fast failure is retried at once.",
    link: BREAKER,
  },
  {
    front: "What is a bulkhead, and what does it protect?",
    back: "A **separate, limited pool** of workers or connections per dependency. One slow dependency can then use up only its own pool, not the workers every other request needs.",
    link: BREAKER,
  },
  {
    front: "Why does a circuit breaker need a timeout on the call?",
    back: "A **hung call never fails** on its own; it just holds a worker. The timeout turns it into a failure the breaker can count, and bounds how long each caller waits before the breaker opens.",
    link: BREAKER,
  },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
  assert.deepEqual([...new Set(deck.cards.map((c) => c.link))].sort(), [BUCKET, WINDOW, LB, RETRY, BREAKER, API].sort());
});

test("the arithmetic on the cards", () => {
  const maxSent = (capacity: number, rate: number, seconds: number) => capacity + rate * seconds;
  assert.equal(maxSent(5, 1, 10), 15);
  assert.equal(3 ** 3, 27, "three layers of three tries");
});
