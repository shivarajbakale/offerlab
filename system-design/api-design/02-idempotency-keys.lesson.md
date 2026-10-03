# Idempotency keys

## What it is

- **What it is:** A unique string the client makes up for one operation, such as one payment, and sends with every attempt of it. The server remembers each key and its result, so a repeat gets the first answer instead of doing the work again.
- **The problem it solves:** When a payment request times out, the client cannot tell whether it ran, so retrying may charge the card twice and not retrying may never charge it. With a key, the client can retry safely and the card is charged at most once.
- **Reach for it when:** A POST creates something or moves money, clients retry after timeouts, or answers can be lost between the server and the client.
- **Not the right tool when:** The request is already safe to repeat, such as a GET, or a PUT to a client-chosen id. A natural unique id (one payment per invoice) with a unique constraint can do the same job. Keys stop repeats, not two different edits racing: that needs [optimistic concurrency](#/sd-api-design/03-optimistic-concurrency).
- **Where you'll meet it:** Stripe's API, which accepts an `Idempotency-Key` header on POST requests; PayPal's REST APIs, which use a `PayPal-Request-Id` header for the same job; the IETF draft "The Idempotency-Key HTTP Header Field"; "Design a payment system" interviews.

## Words we'll use

- **Request / response** — the client sends a request (here `POST /payments` with an amount and a payee); the server sends back a response with a **status code**: 201 Created, 400 Bad Request, 409 Conflict, 422 Unprocessable Content.
- **Header** — a named value sent with a request, outside the body. `Idempotency-Key: k-1` is a header.
- **Idempotent** — doing it twice has the same effect on the server as doing it once. RFC 9110 defines GET, PUT and DELETE as idempotent and POST as not: two identical POSTs may create two things.
- **Timeout** — the client gave up waiting for an answer. It does not know whether the request arrived, or arrived, ran, and only the answer was lost.
- **Retry** — sending the same request again after a timeout or a failure.
- **Idempotency key** — a unique string the client makes up for one logical operation ("pay invoice 7") and sends on every attempt of it, so the server can recognise a copy.
- **Scope** — whose key it is. Here a key belongs to one authenticated user: alice's `order-1` and bob's `order-1` are different keys.
- **Fingerprint** — a summary of what a request asks for (method, path, body), stored with the key, so the server can tell a true retry from a different request reusing the key.
- **In flight** — a request the server has started but not finished.

## The world we're in

- A payments API. `POST /payments` charges a card and records the charge. Charging twice is the worst outcome; failing to charge is the second worst.
- Networks lose messages. A request can reach the server, run, and have its answer lost on the way back.
- Clients retry. That is the only way a client can recover from a timeout without asking a human.
- Copies can overlap: a client with a short timeout can send its retry while the server is still working on the first attempt.
- Here the server runs one request at a time and a "lost answer" is a flag on the client, so the runs are repeatable.

## The goal

However many times a client sends one payment, the card is charged at most once, and every attempt that gets an answer gets the same answer.

## The naive attempt

"Just retry. If the first attempt timed out, it probably failed."

The client sends the payment. The server charges the card, and the answer is lost on the way back.
[▶ Broken: the first attempt charges the card](play:broken: retrying a non-idempotent POST@at=chargeAgain#1)
The client times out. It cannot tell this from a request that never arrived, so it sends the same request again.
[▶ Broken: the client times out and retries](play:broken: retrying a non-idempotent POST@at=timeout#1)
To the server the retry is just another POST, and POST is not idempotent, so it charges again. One payment, two charges: `ch_1` and `ch_2`.
[▶ Broken: the retry is a second charge](play:broken: retrying a non-idempotent POST@at=chargeAgain#2)
Not retrying is no better: if the first request really did not arrive, the payment never happens.

## Building it up

**1. The client names the operation.** Before the first attempt, the client makes up one key for this payment and sends it in an `Idempotency-Key` header on every attempt. A new payment gets a new key; a retry reuses the old one.
[▶ Every attempt carries the same key](play:lost answer: the retry@at=send#2)

**2. The server claims the key before doing the work.** The first time it sees a key it stores a record for it, marked in flight, together with the request's fingerprint. Claiming must be one atomic step, such as an insert into a unique index on (user, key). If it were "check, then insert" in two steps, two copies arriving together could both pass the check and both charge.
[▶ The key is claimed, then the card is charged](play:first request@at=claim#1)

**3. Save the answer under the key.** When the work is done, the server stores its response with the key and marks it done. If the charge is a row in your own database, the charge and this save commit in one transaction, so a crash cannot leave one without the other. If it is a call to a card processor, see "What it costs".
[▶ The 201 is saved under the key](play:first request@at=store#1)

**4. A retry gets the saved answer.** The answer to the first attempt was lost. The retry carries the same key, the server finds it done, and returns the saved 201 without charging. One charge, and the client finally learns it succeeded.
[▶ The retry is answered from the key](play:lost answer: the retry@at=replay#1)

**5. A copy that overlaps the first gets 409.** If the retry arrives while the first copy is still in flight, there is no answer to replay yet. Running it would charge twice, so the server answers 409 Conflict ("in progress, try again later"). When the client asks again after the first copy finishes, it gets the saved 201.
[▶ The overlapping copy gets 409](play:in flight: a copy@at=inFlight#1)
[▶ Asked again later, it gets the saved 201](play:in flight: a copy@at=replay#1)

**6. The same key with a different request is rejected.** Alice's client reuses `k-1` for a payment of 70 instead of 50. That is a client bug: replaying "paid 50" would lie, and charging 70 would break the key's promise. The fingerprints differ, so the server answers 422 and charges nothing.
[▶ Different fingerprint: 422](play:fingerprint: the same key@at=mismatch#1)

**7. Scope keys to the caller.** Keys are only unique if every client makes good ones, and some do not. If keys were global, bob's `order-1` would find alice's record and bob would be handed alice's receipt, and never be charged.
[▶ Broken: a global key replays alice's payment to bob](play:broken: keys shared by all users@at=replay#1)
Scoped to the user, they are two keys and two payments.
[▶ Scoped keys: two payments](play:scoped: two users@at=scope#2)

**8. No key, no POST.** If the endpoint requires a key and the request has none, answer 400 before doing anything.
[▶ Missing key: 400](play:missing key@at=missing#1)

## Why it works now

The key turns "charge 50" into "do operation k-1", and the server remembers what happened to every operation. There are only three states a key can be in. Unknown: claim it and do the work. In flight: say 409 and do nothing. Done: replay the answer and do nothing. Only the first of those touches the card, and the claim lets only one copy into it.
[▶ Done: replay, no charge](play:lost answer: the retry@at=replay#1)
The client's half matters as much: it must reuse the key for every retry of one operation, and make a new one for a new operation.

## What it costs

- **Storage.** Every key and its saved response are kept until they expire, often for a day or more. A retry after the key expired is a new payment, so clients must not retry forever.
- **A lookup and an insert on every request**, on a unique index of (user, key).
- **Crash windows.** If the server dies after the claim but before saving the response, the key stays in flight. It needs a way out: commit work and save together, or record progress so a retry can resume, or let in-flight claims time out.
- **Side effects outside your database.** If "charge" is a call to another company's API, your transaction cannot cover it. Pass a key on to that API too, if it supports one, or the retry can still charge twice downstream.

## Staff notes

- Clients should generate keys randomly (a UUID v4), store the key with the pending operation, and retry with backoff and jitter. A key derived from the order id also works, if one order really is one payment.
- Decide what to save. Saving every final response (including errors from the work itself) makes retries fully predictable. A request rejected before work started, such as by validation, can be left unsaved so a corrected retry with the same key can run.
- Put the key check in one middleware layer, used by every mutating endpoint, rather than in each handler.
- PUT to a client-chosen id (`PUT /payments/{uuid}`) is idempotent by design and needs no header; idempotency keys are how you get the same safety from POST.
- An IETF draft (not yet a standard at the time of writing) defines the `Idempotency-Key` header and suggests 400 for a missing key, 409 for a retry while the first is in progress, and 422 for a reused key with a different payload. Individual APIs differ, so read their docs.

## Check yourself

- **Q:** The answer to alice's first attempt is lost and she retries with the same key. What does the server do, and how many charges are there?
  A: It finds the key done, returns the saved 201, and charges nothing. One charge. [▶ Show it](play:lost answer: the retry@at=replay#1)
- **Q:** The retry arrives while the first copy is still running. Why not just wait, or run it?
  A: Running it would charge twice. The server answers 409 at once; the client asks again later and gets the saved answer. [▶ Show it](play:in flight: a copy@at=inFlight#1)
- **Q:** Alice's client sends `k-1` again, but for 70 instead of 50. What happens?
  A: The fingerprint differs from the one stored with the key, so the server answers 422 and charges nothing. [▶ Show it](play:fingerprint: the same key@at=mismatch#1)
- **Q:** Why scope keys to the user?
  A: Otherwise a second user who picks the same key gets the first user's saved response, a data leak, and is never charged. [▶ Show it](play:broken: keys shared by all users@at=replay#1)
- **Q:** Without keys, why does a retry after a timeout charge twice?
  A: POST is not idempotent and the server cannot tell the retry from a new payment, so it charges again. [▶ Show it](play:broken: retrying a non-idempotent POST@at=chargeAgain#2)
