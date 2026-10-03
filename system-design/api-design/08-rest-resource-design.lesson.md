# REST resource design

## What it is

- **What it is:** A style of HTTP API where URLs name things (an order, the list of orders), HTTP methods (GET, POST, PATCH, DELETE) say what to do with them, and status codes say how it went.
- **The problem it solves:** An API that answers every request with 200 and hides errors in the body fools every program that reads only the status: dashboards count no errors, and retry libraries never retry an overload. Putting the meaning in methods, status codes and headers lets generic HTTP tools behave correctly.
- **Reach for it when:** You are designing a public or partner HTTP API, generic clients, proxies, caches and monitoring sit in the path, or the data maps naturally to things that are created, read, changed and deleted.
- **Not the right tool when:** High-volume calls between your own services often suit gRPC with generated clients better. Clients that need flexible, nested data in one request may suit GraphQL. Actions that fit no resource can be a custom method, kept rare.
- **Where you'll meet it:** RFC 9110 (HTTP semantics) and RFC 9457 (Problem Details for errors); Google's API Improvement Proposals, which define resource-oriented design and custom methods such as `:cancel`; GitHub's and Stripe's REST APIs; "Design the API for..." interview rounds.

## Words we'll use

- **Resource** — a thing the API exposes, named by a URL: `/orders` (the **collection**) and `/orders/1` (one **member**). Resources are nouns.
- **Method** — the verb of an HTTP request: `GET` reads, `POST` creates (or runs an action), `PATCH` changes part of a resource, `PUT` replaces it, `DELETE` removes it.
- **Status code** — the three-digit number on the first line of every response. The first digit is its **class**: 2xx worked, 4xx the server will not do it as sent (fix it, or wait, before retrying), 5xx the server failed.
- **Header** — a named field outside the body, such as `Location`, `ETag` or `Retry-After`. Machines read headers and status codes without understanding the body.
- **Idempotent** — doing it twice leaves the server as doing it once. `GET`, `PUT` and `DELETE` are idempotent by definition; `POST` and `PATCH` are not.
- **Retry policy** — the rule a generic HTTP client follows to resend a failed request. The usual one: retry 503 and 429, for idempotent methods only, a few times.
- **ETag** — a version tag for a resource. Sent back in an `If-Match` header it means "only if it is still this version".
- **Merge patch** — a `PATCH` body (RFC 7396) where each field sent replaces the old value, `null` removes the field, and fields not sent stay as they are.
- **RPC style** — an API of actions instead of resources: `POST /cancelOrder`, `POST /getOrder`, usually answering 200 with `{"ok": false}` inside when something fails.

## The world we're in

- Orders belong to users. Ana creates, reads, changes, cancels and lists her orders. Bob must not see hers.
- Many callers know nothing about orders: an HTTP library with a retry policy, a load balancer that stops sending traffic to a backend returning 5xx, a dashboard that plots error rates by status class.
- Sometimes the server is overloaded for a moment and answers 503 to one request.
- Two clients can edit the same order at once.

## The goal

An API where any HTTP-speaking program can tell success from failure, and a retryable failure from a hopeless one, from the status line alone; and where clients find, change and list orders without guessing URLs.

## The naive attempt

"Make one endpoint per action, all `POST`, and always answer 200. Put `ok` and `error` in the body; our app reads it." Ana creates an order, asks for one that does not exist, and tries to cancel one already shipped. Two of three calls failed.
[▶ Broken: a missing order, answered 200](play:broken: RPC with 200 for errors — the dashboard@at=rpc-200#2)
[▶ Broken: a refused cancel, answered 200](play:broken: RPC with 200 for errors — the dashboard@at=rpc-200#3)
The dashboard counts three 2xx responses and no errors. An alert on the error rate never fires.
Worse, a moment of overload is reported the same way. The retry policy never sees a 503, and the call is a `POST`, so it would not retry anyway. One try, and the caller gets an error for an order that was there all along.
[▶ Broken: the overload, disguised as a success](play:broken: RPC with 200 for errors — an overload@at=rpc-busy#1)
[▶ Broken: the client gives up after one attempt](play:broken: RPC with 200 for errors — an overload@at=settle#1)

## Building it up

**1. Nouns in the URL, verbs in the method.** `/orders` is the collection, `/orders/{id}` one order. The router picks the operation from the method; a method the resource does not support is 405, with an `Allow` header listing the ones it does.
[▶ PUT on the collection: 405, Allow: GET, POST](play:create: an invalid order@at=not-allowed#1)

**2. Create: 201 and Location.** `POST /orders` answers 201 Created with `Location: /orders/1`, so the client learns the new order's URL instead of building one. A body that is understood but invalid (quantity 0) is 422: retrying it unchanged will never work.
[▶ 201 with a Location](play:create: POST /orders@at=created#1)
[▶ qty 0: 422](play:create: an invalid order@at=invalid#1)

**3. Read, and the 404-or-403 choice.** `GET /orders/1` answers 200 with an `ETag`. When Bob asks for Ana's order, the API answers 404, exactly as for an order that does not exist, so Bob cannot probe ids to learn which orders exist.
[▶ Bob asks for Ana's order: 404](play:read: someone else's order@at=not-yours#1)
With 403 instead, Bob learns order 1 exists (403) while order 99 does not (404).
[▶ 403 admits the order exists](play:read: with 403 instead@at=not-yours#1)

**4. Change part of it: PATCH with a merge patch.** `{"qty": 3, "note": null}` sets qty, removes the note and leaves the item alone. The version goes up, so the ETag changes. The merged result is checked like a new order: `{"qty": 0}` or `{"qty": null}` is 422, and the stored order is untouched.
[▶ qty 0 in a patch: 422](play:patch: a patch that would leave@at=invalid-patch#1)
[▶ Merging the fields sent](play:patch: a merge patch@at=merge#1)
[▶ 200 with ETag "v2"](play:patch: a merge patch@at=patched#1)

**5. Concurrency: If-Match and 412.** A client reads version 1 and sends its patch with `If-Match: "v1"`. Someone else changed the order in between, so it is version 2 now. The API answers 412 Precondition Failed instead of overwriting their change.
[▶ A stale If-Match: 412](play:patch: a stale If-Match@at=stale#1)

**6. State conflicts: 409.** Cancelling a shipped order is a valid request that conflicts with the order's current state. 409 Conflict says so; retrying will not help until the state changes. "Cancel" is a state change on the resource (`PATCH status`), not a new URL.
[▶ Cancel a shipped order: 409](play:conflict: cancelling a shipped order@at=conflict#1)

**7. Delete: 204, and a second DELETE.** `DELETE /orders/1` answers 204 No Content. A second one answers 404. That is still idempotent: the server's state (no order 1) is the same after one call or two; only the response differs.
[▶ 204 No Content](play:delete: 204@at=deleted#1)
[▶ Again: 404, nothing changed](play:delete: 204@at=not-found#1)

**8. Filters and sort are query parameters on the collection.** `GET /orders?status=open&sort=-created&limit=10` lists Ana's open orders, newest first. The collection only ever lists what the caller may see. An unknown parameter (`stauts`) is 400, not ignored: ignoring it would silently return every order. This is strict on purpose for filters, where ignoring a typo changes the answer. For optional request fields that only add behaviour, tolerance (lesson 04) is the usual rule. Whichever you pick, document it: a strict server makes adding a parameter breaking for old servers still running in a mixed deploy.
[▶ Open orders, newest first](play:list: filter and sort@at=listed#1)
[▶ A typo: 400](play:list: filter and sort@at=unknown-param#1)

**9. Overload: 503 with Retry-After.** The same overload, now reported honestly. The client sees a 503 on a `GET`, waits the one second Retry-After asks for, and the second try succeeds.
[▶ 503, Retry-After: 1](play:retry: a 503@at=busy#1)
[▶ The client retries](play:retry: a 503@at=retry#1)
[▶ The second try: 200](play:retry: a 503@at=settle#2)

## Why it works now

Every caller that is not your app reads only the method and the status line. The method tells a client whether a repeat is safe; the status class tells it whether the request worked, whether to fix it (4xx) or whether to try again later (503, 429). Put the meaning there and a retry library, a load balancer and a dashboard all do the right thing without knowing what an order is.
[▶ The REST API's counts: two 2xx, one 5xx](play:retry: a 503@at=settle#2)
[▶ Broken: the RPC API's counts: three 2xx](play:broken: RPC with 200 for errors — the dashboard@at=rpc-200#3)

## What it costs

- **Not everything is CRUD.** Refunds, approvals and resends need modelling: a state change (`PATCH status`) or a sub-resource (`POST /orders/1/refunds`). Sometimes a custom action (`POST /orders/1:cancel`, as in Google's API guidelines) is clearer; keep it rare.
- **404 for others' orders hurts debugging.** Support cannot tell "wrong id" from "no access" from the response. Log the real reason server-side.
- **Merge patch has limits.** It cannot set a field to `null` (null means remove) and replaces arrays whole. JSON Patch (RFC 6902) expresses both, with a more complex body.
- **PATCH is not retry-safe.** `{"qty": 3}` happens to be safe to repeat; `{"status": "cancelled"}` after someone reopened the order is not. Retries of `POST` and `PATCH` need an idempotency key or If-Match.
- **Without If-Match, the last writer wins.** An API can require it and answer 428 Precondition Required when it is missing.

## Staff notes

- Pick codes by what the caller should do next: 400/422 fix the request, 401 authenticate, 403/404 stop, 409 resolve the conflict, 412 re-read and retry, 429 and 503 wait and retry, 500 maybe retry.
- Errors still need a body: a machine-readable code and a message. RFC 9457 (Problem Details) defines a standard JSON shape for it.
- Never put a verb in a URL as the only way to read something; `GET` is what caches, crawlers and retry libraries treat as safe.
- Allow only the filters and sorts you have indexes for (see 07), cap `limit`, and page with cursors (see 01).
- Version breaking changes (a new path prefix or a version header), and never change what an existing status code means for an endpoint: clients have retry logic built on it.

## Check yourself

- **Q:** The RPC API answers every failure with 200. What does an error-rate dashboard show after one success and two failures?
  A: Three 2xx responses and an error rate of zero; the failures exist only inside the bodies. [▶ Show it](play:broken: RPC with 200 for errors — the dashboard@at=rpc-200#3)
- **Q:** Why did the retrying client give up on the overloaded RPC call after one attempt?
  A: It saw a 200, not a 503, and the call was a POST, which is not idempotent, so the policy forbids a blind retry. [▶ Show it](play:broken: RPC with 200 for errors — an overload@at=settle#1)
- **Q:** Bob asks for Ana's order 1. Why answer 404 rather than 403?
  A: 404 is what a missing order gets, so Bob cannot tell that order 1 exists; 403 would confirm it. [▶ Show it](play:read: someone else's order@at=not-yours#1)
- **Q:** A second `DELETE /orders/1` returns 404. Is DELETE still idempotent?
  A: Yes. Idempotent is about the server's state, which is "no order 1" after one call or two; the response may differ. [▶ Show it](play:delete: 204@at=not-found#1)
- **Q:** A client patches with `If-Match: "v1"` but the order is at v2. What happens, and why?
  A: 412 Precondition Failed: applying the patch would overwrite a change the client never saw. It should re-read and try again. [▶ Show it](play:patch: a stale If-Match@at=stale#1)
