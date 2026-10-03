/**
 * 08. REST Resource Design
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: Design the HTTP API for orders: create one, read one, change one, cancel one, list
 *   a user's orders with filters. The clients are apps, partner scripts, retrying HTTP
 *   libraries, load balancers and dashboards, most of which know nothing about orders. They
 *   must all be able to tell success from failure, and a retryable failure from a hopeless one,
 *   without reading the body.
 *
 * Approach: Resources as nouns, HTTP methods as verbs, status codes that mean what they say
 *   /orders is the collection and /orders/{id} one order. POST to the collection creates (201
 *   with a Location header naming the new order); GET reads (200, with an ETag version); PATCH
 *   applies a merge patch (only the fields sent change, null removes one); DELETE removes (204,
 *   no body). Errors use the status line: 404 when the order does not exist (or is someone
 *   else's, to avoid admitting it exists), 409 when the change conflicts with the order's
 *   state, 412 when an If-Match version is stale, 422 when the body is invalid, 503 with
 *   Retry-After when overloaded. Filters, sort and page size are query parameters on the
 *   collection.
 *
 * Cost: nothing at runtime; the cost is discipline. Every operation needs a resource and a
 *   method that fit, and every error needs the right code.
 *
 * Pattern: resource-oriented API design, HTTP semantics (RFC 9110), merge patch (RFC 7396)
 * Key insight: The status line is read by machines that never parse your body. A retry
 *   library retries on 503, not on {"ok": false}; a load balancer ejects a backend on 5xx; a
 *   dashboard plots error rates from status classes. Return 200 for an error and every one of
 *   them sees a success.
 * Tradeoffs: 404 for another user's order hides that it exists but makes "wrong id" and "no
 *   access" look the same when debugging; 403 is clearer and leaks existence. Some operations
 *   are not CRUD (cancel, refund): model them as a state change (PATCH status) or as a
 *   sub-resource (POST /orders/1/refunds), not as a verb in the URL. Merge patch cannot express
 *   "set this field to null" or edit one item of an array; JSON Patch (RFC 6902) can, at more
 *   complexity.
 * Staff notes: GET, PUT and DELETE are idempotent by definition, so generic clients retry
 *   them; POST and PATCH are not, so they retry only with an idempotency key. A second DELETE
 *   answering 404 is fine: idempotent is about the server's state, not the response. Reject
 *   unknown query parameters instead of ignoring them, or a typo silently returns everything.
 *   Every filter and sort you allow is a promise of an index (07).
 * Interview signals: "design the API for...", "what status code", "PUT vs PATCH", "should this
 *   be a verb", "how do clients know to retry", "403 or 404".
 * Real world: GitHub's REST API answers 404, not 403, for a private repository you cannot see,
 *   so it does not confirm the repository exists. RFC 9110 requires a 405 response to carry an
 *   Allow header. Python's urllib3 by default retries only idempotent methods.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Method = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
export type Req = { method: Method; path: string; user: string; body?: Record<string, unknown>; headers?: Record<string, string> };
export type Res = { status: number; headers: Record<string, string>; body: unknown };
export type Order = {
  id: number;
  owner: string;
  item: string;
  qty: number;
  status: "open" | "shipped" | "cancelled";
  note?: string;
  version: number;
  created: number;
};

// @why Methods whose repeat leaves the server as one call would. Only these may be retried blindly.
const IDEMPOTENT: Method[] = ["GET", "PUT", "DELETE"];
const PATCHABLE = ["item", "qty", "note", "status"];

export class OrdersApi {
  // @viz hide:IDEMPOTENT,PATCHABLE,parts values:id,limit
  orders = new Map<number, Order>();
  nextId = 1;
  clock = 0;
  // @why Requests left that will be refused with 503 (an overload), for the retry scenarios.
  busyFor = 0;
  // @why What a load balancer or a dashboard sees: responses counted by status class, without reading a body.
  statusCounts: Record<string, number> = {};
  // @why Another user's order: 404 hides that it exists, 403 admits it does.
  hideOthers = true;

  handle(req: Req): Res {
    this.clock++;
    const res = this.route(req);
    const cls = `${Math.floor(res.status / 100)}xx`;
    this.statusCounts[cls] = (this.statusCounts[cls] ?? 0) + 1;
    return res;
  }

  route(req: Req): Res {
    if (this.busyFor > 0) {
      this.busyFor--;
      // @why 503 says "not now, and it is not your fault". Retry-After says when to come back.
      return reply(503, { error: "overloaded" }, { "Retry-After": "1" }); // @mark busy
    }
    const [path, query = ""] = req.path.split("?");
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "orders" || parts.length > 2) return reply(404, { error: "no such resource" });
    // @why The collection, /orders: list it or add to it.
    if (parts.length === 1) {
      if (req.method === "GET") return this.list(req, query);
      if (req.method === "POST") return this.create(req);
      return reply(405, { error: "method not allowed" }, { Allow: "GET, POST" }); // @mark not-allowed
    }
    // @why One member, /orders/{id}: read it, change it, remove it.
    const id = Number(parts[1]);
    if (req.method === "GET") return this.read(req, id);
    if (req.method === "PATCH") return this.patch(req, id);
    if (req.method === "DELETE") return this.remove(req, id);
    return reply(405, { error: "method not allowed" }, { Allow: "GET, PATCH, DELETE" });
  }

  create(req: Req): Res {
    const { item, qty, note } = req.body ?? {};
    // @why 422: the request was understood, but this order is invalid. Retrying it unchanged will never work.
    if (typeof item !== "string" || typeof qty !== "number" || qty < 1) return reply(422, { error: "item and a qty of 1 or more are required" }); // @mark invalid
    const order: Order = { id: this.nextId++, owner: req.user, item, qty, status: "open", version: 1, created: this.clock };
    if (typeof note === "string") order.note = note;
    this.orders.set(order.id, order);
    // @why 201 Created, and Location names the new resource, so the client knows its URL without building one.
    return reply(201, order, { Location: `/orders/${order.id}`, ETag: etag(order) }); // @mark created
  }

  read(req: Req, id: number): Res {
    const found = this.lookup(req, id);
    if ("status" in found) return found;
    // @why The ETag names this version. A client sends it back in If-Match to say "change it only if it is still this one".
    return reply(200, found.order, { ETag: etag(found.order) }); // @mark read
  }

  patch(req: Req, id: number): Res {
    const found = this.lookup(req, id);
    if ("status" in found) return found;
    const order = found.order;
    const ifMatch = req.headers?.["If-Match"];
    // @why 412: someone changed the order since this client read it. Applying the patch would overwrite their change.
    if (ifMatch !== undefined && ifMatch !== etag(order)) return reply(412, { error: "order changed since you read it" }); // @mark stale
    const body = req.body ?? {};
    for (const field of Object.keys(body)) {
      if (!PATCHABLE.includes(field)) return reply(422, { error: `${field} cannot be changed` });
    }
    // @why 409: the request is valid, but conflicts with the order's current state. It may work after the state changes, not by retrying now.
    if (body.status === "cancelled" && order.status === "shipped") return reply(409, { error: "order already shipped" }); // @mark conflict
    // @why Merge patch, onto a copy: a field sent replaces the old value, null removes it, a field not sent is left alone.
    const merged: Record<string, unknown> = { ...order };
    for (const [field, value] of Object.entries(body)) {
      if (value === null) delete merged[field];
      else merged[field] = value; // @mark merge
    }
    // @why The result must pass the same checks as a new order: {"qty": 0} or {"qty": null} is 422, and the stored order is untouched.
    if (typeof merged.item !== "string" || typeof merged.qty !== "number" || merged.qty < 1 || typeof merged.status !== "string") {
      return reply(422, { error: "item and a qty of 1 or more are required" }); // @mark invalid-patch
    }
    const updated = merged as Order;
    updated.version++;
    this.orders.set(id, updated);
    return reply(200, updated, { ETag: etag(updated) }); // @mark patched
  }

  remove(req: Req, id: number): Res {
    const found = this.lookup(req, id);
    if ("status" in found) return found;
    this.orders.delete(id);
    // @why 204 No Content: it worked, and there is nothing to send back.
    return reply(204, null); // @mark deleted
  }

  list(req: Req, query: string): Res {
    const params: Record<string, string> = {};
    for (const pair of query.split("&").filter(Boolean)) {
      const [k, v = ""] = pair.split("=");
      params[k] = v;
    }
    // @why Reject a parameter you do not know. Ignoring "stauts=open" would silently return every order.
    for (const k of Object.keys(params)) {
      if (!["status", "sort", "limit"].includes(k)) return reply(400, { error: `unknown parameter ${k}` }); // @mark unknown-param
    }
    const out: Order[] = [];
    for (const o of this.orders.values()) {
      // @why A collection lists only what the caller may see. Filters narrow it further.
      if (o.owner === req.user && (!params.status || o.status === params.status)) out.push(o);
    }
    // @why sort=-created means newest first: the field to sort by, and a minus for descending.
    const desc = params.sort === "-created";
    out.sort((a, b) => (desc ? b.created - a.created : a.created - b.created));
    const limit = Math.min(Number(params.limit ?? 20), 100);
    return reply(200, { items: out.slice(0, limit) }); // @mark listed
  }

  lookup(req: Req, id: number): { order: Order } | Res {
    const order = this.orders.get(id);
    if (!order) return reply(404, { error: "no such order" }); // @mark not-found
    // @why Someone else's order. 404 makes it look like it does not exist, so ids cannot be probed.
    if (order.owner !== req.user) return this.hideOthers ? reply(404, { error: "no such order" }) : reply(403, { error: "not your order" }); // @mark not-yours
    return { order };
  }
}

/** A generic HTTP client with the usual retry rule: retry 503 and 429, for idempotent methods only, up to 3 tries. */
export class Client {
  api: OrdersApi;
  attempts = 0;
  waitedS = 0;

  constructor(api: OrdersApi) {
    this.api = api;
  }

  send(req: Req): Res {
    for (let attempt = 1; ; attempt++) {
      this.attempts++;
      const res = this.api.handle(req);
      // @why The client decides from the status line and the method alone. It knows nothing about orders.
      const retryable = (res.status === 503 || res.status === 429) && IDEMPOTENT.includes(req.method);
      if (!retryable || attempt === 3) return res; // @mark settle
      this.waitedS += Number(res.headers["Retry-After"] ?? 1); // @mark retry
    }
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: an RPC-style API. One URL per action, every call a POST, every answer a 200,
// with success or failure written inside the body.
export class RpcOrdersApi extends OrdersApi {
  route(req: Req): Res {
    const action = req.path.slice(1);
    const id = Number(req.body?.id);
    if (this.busyFor > 0) {
      this.busyFor--;
      // @why An overload, reported as a success with an error inside. Nothing outside this API can tell.
      return reply(200, { ok: false, error: "overloaded, try again" }); // @mark rpc-busy
    }
    let inner: Res;
    if (action === "createOrder") inner = this.create(req);
    else if (action === "getOrder") inner = this.read(req, id);
    else if (action === "cancelOrder") inner = this.patch({ ...req, body: { status: "cancelled" } }, id);
    else inner = reply(404, { error: `no action ${action}` });
    // @why Whatever happened, the status line says 200 OK.
    const failed = inner.status >= 400;
    return reply(200, failed ? { ok: false, error: (inner.body as { error: string }).error } : { ok: true, data: inner.body }); // @mark rpc-200
  }
}

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Res {
  return { status, headers, body };
}

function etag(o: Order): string {
  return `"v${o.version}"`;
}

const post = (path: string, body: Record<string, unknown>, user = "ana"): Req => ({ method: "POST", path, user, body });
const get = (path: string, user = "ana"): Req => ({ method: "GET", path, user });

test("create: POST /orders answers 201 with a Location naming the new order", () => {
  const api = new OrdersApi();
  const res = api.handle(post("/orders", { item: "lamp", qty: 2 }));
  assert.equal(res.status, 201);
  assert.equal(res.headers.Location, "/orders/1");
  assert.equal(api.handle(get("/orders/1")).status, 200);
});

test("create: an invalid order is 422, and a wrong method is 405 with Allow", () => {
  const api = new OrdersApi();
  assert.equal(api.handle(post("/orders", { item: "lamp", qty: 0 })).status, 422);
  const res = api.handle({ method: "PUT", path: "/orders", user: "ana" });
  assert.equal(res.status, 405);
  assert.equal(res.headers.Allow, "GET, POST");
});

test("read: someone else's order is 404, exactly like one that does not exist", () => {
  const api = new OrdersApi();
  api.handle(post("/orders", { item: "lamp", qty: 1 }, "ana"));
  const theirs = api.handle(get("/orders/1", "bob"));
  const missing = api.handle(get("/orders/99", "bob"));
  assert.equal(theirs.status, 404);
  assert.deepEqual(theirs.body, missing.body);
});

test("read: with 403 instead, bob learns that order 1 exists", () => {
  const api = new OrdersApi();
  api.hideOthers = false;
  api.handle(post("/orders", { item: "lamp", qty: 1 }, "ana"));
  assert.equal(api.handle(get("/orders/1", "bob")).status, 403);
  assert.equal(api.handle(get("/orders/99", "bob")).status, 404);
});

test("patch: a merge patch changes only the fields sent, and null removes one", () => {
  const api = new OrdersApi();
  api.handle(post("/orders", { item: "lamp", qty: 1, note: "gift wrap" }));
  const res = api.handle({ method: "PATCH", path: "/orders/1", user: "ana", body: { qty: 3, note: null } });
  assert.equal(res.status, 200);
  const order = res.body as Order;
  assert.equal(order.qty, 3);
  assert.equal(order.item, "lamp", "not sent, so unchanged");
  assert.equal(order.note, undefined);
  assert.equal(res.headers.ETag, '"v2"');
});

test("patch: a patch that would leave the order invalid is 422, and the order is unchanged", () => {
  const api = new OrdersApi();
  api.handle(post("/orders", { item: "lamp", qty: 2 }));
  const zero = api.handle({ method: "PATCH", path: "/orders/1", user: "ana", body: { qty: 0 } });
  const removed = api.handle({ method: "PATCH", path: "/orders/1", user: "ana", body: { qty: null } });
  assert.equal(zero.status, 422);
  assert.equal(removed.status, 422);
  assert.equal(api.orders.get(1)!.qty, 2);
  assert.equal(api.orders.get(1)!.version, 1);
});

test("patch: a stale If-Match is refused with 412, so a concurrent change is not overwritten", () => {
  const api = new OrdersApi();
  api.handle(post("/orders", { item: "lamp", qty: 1 }));
  const seen = api.handle(get("/orders/1")).headers.ETag;
  // Someone else changes the order first.
  api.handle({ method: "PATCH", path: "/orders/1", user: "ana", body: { qty: 5 } });
  const res = api.handle({ method: "PATCH", path: "/orders/1", user: "ana", body: { qty: 2 }, headers: { "If-Match": seen } });
  assert.equal(res.status, 412);
  assert.equal(api.orders.get(1)!.qty, 5);
});

test("conflict: cancelling a shipped order is 409", () => {
  const api = new OrdersApi();
  api.handle(post("/orders", { item: "lamp", qty: 1 }));
  api.orders.get(1)!.status = "shipped";
  const res = api.handle({ method: "PATCH", path: "/orders/1", user: "ana", body: { status: "cancelled" } });
  assert.equal(res.status, 409);
});

test("delete: 204 with no body, and a second DELETE is 404 with the state unchanged", () => {
  const api = new OrdersApi();
  api.handle(post("/orders", { item: "lamp", qty: 1 }));
  const first = api.handle({ method: "DELETE", path: "/orders/1", user: "ana" });
  assert.equal(first.status, 204);
  assert.equal(first.body, null);
  const second = api.handle({ method: "DELETE", path: "/orders/1", user: "ana" });
  assert.equal(second.status, 404);
  assert.equal(api.orders.size, 0);
});

test("list: filter and sort are query parameters on the collection, and a typo is 400", () => {
  const api = new OrdersApi();
  for (const item of ["lamp", "desk", "chair"]) api.handle(post("/orders", { item, qty: 1 }));
  api.handle(post("/orders", { item: "rug", qty: 1 }, "bob"));
  api.orders.get(2)!.status = "shipped";
  const res = api.handle(get("/orders?status=open&sort=-created&limit=10"));
  assert.deepEqual(
    (res.body as { items: Order[] }).items.map((o) => o.item),
    ["chair", "lamp"],
  );
  assert.equal(api.handle(get("/orders?stauts=open")).status, 400);
});

test("retry: a 503 with Retry-After on a GET is retried, and the second try succeeds", () => {
  const api = new OrdersApi();
  api.handle(post("/orders", { item: "lamp", qty: 1 }));
  api.busyFor = 1;
  const client = new Client(api);
  const res = client.send(get("/orders/1"));
  assert.equal(res.status, 200);
  assert.equal(client.attempts, 2);
  assert.equal(client.waitedS, 1);
  assert.deepEqual(api.statusCounts, { "2xx": 2, "5xx": 1 });
});

test("broken: RPC with 200 for errors — the dashboard counts two failures as successes", () => {
  const api = new RpcOrdersApi();
  const made = api.handle(post("/createOrder", { item: "lamp", qty: 1 }));
  api.orders.get(1)!.status = "shipped";
  const missing = api.handle(post("/getOrder", { id: 99 }));
  const cancel = api.handle(post("/cancelOrder", { id: 1 }));
  assert.deepEqual(made.body, { ok: true, data: api.orders.get(1) });
  assert.deepEqual(missing.body, { ok: false, error: "no such order" });
  assert.deepEqual(cancel.body, { ok: false, error: "order already shipped" });
  // Every response was 200: no 4xx, no 5xx, an error rate of zero.
  assert.deepEqual(api.statusCounts, { "2xx": 3 });
});

test("broken: RPC with 200 for errors — an overload is not retried and the caller gets the error", () => {
  const api = new RpcOrdersApi();
  api.handle(post("/createOrder", { item: "lamp", qty: 1 }));
  api.busyFor = 1;
  const client = new Client(api);
  const res = client.send(post("/getOrder", { id: 1 }));
  // A 200, and a POST: the client has two reasons not to retry, and the order was there all along.
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: false, error: "overloaded, try again" });
  assert.equal(client.attempts, 1);
});
