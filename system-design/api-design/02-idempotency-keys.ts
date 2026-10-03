/**
 * 02. Idempotency Keys
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: A client sends POST /payments and the connection drops before the answer comes back.
 *   The client cannot tell "the request never arrived" from "the card was charged and the
 *   answer got lost". If it retries, it may charge the card twice; if it gives up, it may never
 *   charge it. POST is not idempotent, so the server treats every copy as a new payment.
 *
 * Approach: The client names the operation; the server remembers the name
 *   The client makes up one unique key per logical operation and sends it in an
 *   Idempotency-Key header on every attempt of that operation. The server claims the key
 *   (scoped to the caller) before doing any work, does the work once, and saves the response
 *   under the key. A retry with the same key gets the saved response back, not a new charge.
 *   A copy that arrives while the first is still running is told to try again later. The same
 *   key with a different request body is a client bug and is rejected.
 *
 * Cost: one lookup and one insert per request on a unique index of (caller, key), plus storage
 *   for every key's saved response until it expires.
 *
 * Pattern: idempotency keys, request deduplication
 * Key insight: Retries are the only way a client can survive a lost answer, and retries are only
 *   safe when the server can recognise a copy. The key turns "do this" into "do operation
 *   k-123", and the server can answer "k-123 is already done, here is what happened".
 * Tradeoffs: Keys expire, so a retry after the expiry is a new operation. The server must
 *   store responses, and must make the claim atomic (two copies racing past a check-then-insert
 *   both run). A crash between the work and saving its response needs care: commit them in one
 *   transaction, or pass the same key on to the downstream system that does the work.
 * Staff notes: Clients should use random keys (a UUID v4), one per operation, reused for every
 *   retry of it, and should retry with backoff. Scope keys to the authenticated caller. Compare a
 *   fingerprint of the request, not just the key. Only save a result once the work has
 *   started; a request rejected by validation can be retried with the same key. The key makes
 *   the effect happen at most once; client retries on top make it happen once, as long as
 *   they finish before the key expires.
 * Interview signals: "double charge", "retry a payment", "network timeout", "exactly once",
 *   "the client retried and we created two orders".
 * Real world: Stripe and many other payment APIs accept an idempotency key on POST requests.
 *   An IETF draft (not yet a standard at the time of writing) defines the Idempotency-Key
 *   header and suggests 400 when a required key is missing, 409 for a retry while the first
 *   request is still being processed, and 422 for a key reused with a different payload.
 *   RFC 9110 defines PUT and DELETE as idempotent and POST as not.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Body = { amount: number; to: string };
/** An HTTP request after auth: `user` is who the bearer token belongs to. */
export type Request = { method: "POST"; path: string; user: string; headers: Record<string, string>; body: Body };
export type Response = { status: number; body: string; replayed: boolean };
type KeyRecord = { fingerprint: string; state: "in-flight" | "done"; response: Response | null };
type Charge = { id: string; user: string; amount: number; to: string };
/** A request that has claimed its key and may now do the work. */
export type Work = { scoped: string; req: Request };

export class PaymentsApi {
  // @why The money that actually moved. Every entry is one real charge to someone's card.
  charges: Charge[] = [];
  // @why One record per (caller, key): the request's fingerprint, whether it is still running, and the response it got.
  keys = new Map<string, KeyRecord>();

  /** POST /payments, start to finish. */
  post(req: Request): Response {
    const started = this.begin(req);
    if ("status" in started) return started;
    return this.finish(started);
  }

  /** Step 1: claim the key, or answer from what the key already holds. */
  begin(req: Request): Response | Work {
    // Quiet: HTTP header names are case-insensitive (HTTP/2 lowercases them); real servers normalise names before looking one up.
    const key = req.headers["Idempotency-Key"];
    if (key === undefined) return reply(400, "Idempotency-Key header is required"); // @mark missing
    const scoped = this.scope(req.user, key);
    const fp = fingerprint(req);
    const seen = this.keys.get(scoped);
    if (seen === undefined) {
      // @why Claim before doing any work, in one step. In a database: an insert into a unique index on (user, key).
      this.keys.set(scoped, { fingerprint: fp, state: "in-flight", response: null }); // @mark claim
      return { scoped, req };
    }
    // @why Same key, different request: a client bug. Replaying the old answer or charging again would both be wrong.
    if (seen.fingerprint !== fp) return reply(422, "Idempotency-Key reused with a different request"); // @mark mismatch
    // @why The first copy is still running. Say "try again later" instead of starting a second charge.
    if (seen.state === "in-flight") return reply(409, "a request with this key is in progress"); // @mark inFlight
    // @why Done before: send back exactly what the first copy got. Nothing is charged.
    return { ...seen.response!, replayed: true }; // @mark replay
  }

  /** Step 2: do the work once, then save its response under the key. */
  finish(work: Work): Response {
    const { amount, to } = work.req.body;
    const id = `ch_${this.charges.length + 1}`;
    this.charges.push({ id, user: work.req.user, amount, to }); // @mark charge
    const res = reply(201, `${work.req.user} paid ${amount} to ${to} (${id})`);
    // @why If the charge is a row in your own database, commit it and this save in one transaction. A card processor call cannot join it (see the costs).
    const record = this.keys.get(work.scoped)!;
    record.state = "done";
    record.response = res; // @mark store
    return res;
  }

  // @why Keys belong to the caller. Two users who happen to pick the same key are two different operations.
  scope(user: string, key: string): string {
    return `${user}:${key}`; // @mark scope
  }
}

/** A client that retries until it hears back, sending one key for every attempt of one payment. */
export class Client {
  user: string;
  api: PaymentsApi;
  // @why Attempts whose answer the network loses on the way back: the server did the work, the client never hears.
  lost: number[];
  attempts = 0;

  constructor(user: string, api: PaymentsApi, lost: number[] = []) {
    this.user = user;
    this.api = api;
    this.lost = lost;
  }

  pay(key: string, amount: number, to: string): Response | null {
    const headers = { "Idempotency-Key": key };
    for (let attempt = 1; attempt <= 3; attempt++) {
      this.attempts++;
      const res = this.api.post({ method: "POST", path: "/payments", user: this.user, headers, body: { amount, to } }); // @mark send
      // @why A timeout. The client cannot tell "never arrived" from "done, answer lost", so it sends the same request again.
      if (this.lost.includes(attempt)) continue; // @mark timeout
      // @why 409: the first copy is still running. Ask again later, with the same key.
      if (res.status === 409) continue;
      return res;
    }
    return null;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: no idempotency at all. Every POST that arrives is a new payment.
export class NoKeyPaymentsApi extends PaymentsApi {
  post(req: Request): Response {
    const { amount, to } = req.body;
    const id = `ch_${this.charges.length + 1}`;
    // @why The retry looks like a brand-new payment, so the card is charged again.
    this.charges.push({ id, user: req.user, amount, to }); // @mark chargeAgain
    return reply(201, `${req.user} paid ${amount} to ${to} (${id})`);
  }
}

// Broken on purpose: keys are global, not per caller. A second user who picks the same key gets the first user's answer.
export class GlobalKeyPaymentsApi extends PaymentsApi {
  scope(_user: string, key: string): string {
    return key; // @mark globalScope
  }
}

function reply(status: number, body: string): Response {
  return { status, body, replayed: false };
}

// Quiet: what makes two requests "the same": method, path and body. Real servers hash this.
function fingerprint(req: Request): string {
  return `${req.method} ${req.path} amount=${req.body.amount}&to=${req.body.to}`;
}

function request(user: string, key: string | null, amount: number, to = "acme"): Request {
  const headers: Record<string, string> = key === null ? {} : { "Idempotency-Key": key };
  return { method: "POST", path: "/payments", user, headers, body: { amount, to } };
}

test("first request: claims the key, charges once, saves the 201", () => {
  const api = new PaymentsApi();
  const res = new Client("alice", api).pay("k-1", 50, "acme")!;
  assert.equal(res.status, 201);
  assert.equal(res.body, "alice paid 50 to acme (ch_1)");
  assert.equal(api.charges.length, 1);
  assert.equal(api.keys.get("alice:k-1")?.state, "done");
});

test("lost answer: the retry with the same key gets the saved 201 back, and one charge", () => {
  const api = new PaymentsApi();
  const client = new Client("alice", api, [1]);
  const res = client.pay("k-1", 50, "acme")!;
  assert.equal(client.attempts, 2);
  assert.equal(res.status, 201);
  assert.equal(res.replayed, true);
  assert.equal(res.body, "alice paid 50 to acme (ch_1)", "the same answer the first attempt got");
  assert.equal(api.charges.length, 1);
});

test("in flight: a copy that arrives while the first is running gets 409, and nothing is charged twice", () => {
  const api = new PaymentsApi();
  const work = api.begin(request("alice", "k-1", 50)) as Work;
  const copy = api.begin(request("alice", "k-1", 50)) as Response;
  assert.equal(copy.status, 409);
  assert.equal(api.charges.length, 0, "the first copy has not charged yet either");
  api.finish(work);
  const later = api.begin(request("alice", "k-1", 50)) as Response;
  assert.equal(later.status, 201);
  assert.equal(later.replayed, true);
  assert.equal(api.charges.length, 1);
});

test("fingerprint: the same key with a different amount gets 422 and charges nothing", () => {
  const api = new PaymentsApi();
  api.post(request("alice", "k-1", 50));
  const res = api.post(request("alice", "k-1", 70));
  assert.equal(res.status, 422);
  assert.equal(api.charges.length, 1);
  assert.equal(api.charges[0].amount, 50);
});

test("scoped: two users who pick the same key are two payments", () => {
  const api = new PaymentsApi();
  const a = api.post(request("alice", "order-1", 50));
  const b = api.post(request("bob", "order-1", 50));
  assert.equal(a.body, "alice paid 50 to acme (ch_1)");
  assert.equal(b.body, "bob paid 50 to acme (ch_2)");
  assert.equal(b.replayed, false);
  assert.equal(api.charges.length, 2);
});

test("missing key: 400, and nothing is charged", () => {
  const api = new PaymentsApi();
  const res = api.post(request("alice", null, 50));
  assert.equal(res.status, 400);
  assert.equal(api.charges.length, 0);
});

test("broken: retrying a non-idempotent POST charges the card twice", () => {
  const api = new NoKeyPaymentsApi();
  const client = new Client("alice", api, [1]);
  const res = client.pay("k-1", 50, "acme")!;
  assert.equal(client.attempts, 2);
  assert.equal(res.body, "alice paid 50 to acme (ch_2)");
  assert.deepEqual(
    api.charges.map((c) => c.id),
    ["ch_1", "ch_2"],
    "one payment, two charges",
  );
});

test("broken: keys shared by all users hand bob alice's receipt", () => {
  const api = new GlobalKeyPaymentsApi();
  api.post(request("alice", "order-1", 50));
  const b = api.post(request("bob", "order-1", 50));
  assert.equal(b.status, 201);
  assert.equal(b.replayed, true);
  assert.equal(b.body, "alice paid 50 to acme (ch_1)", "bob sees alice's payment");
  assert.equal(api.charges.length, 1, "and bob was never charged");
});
