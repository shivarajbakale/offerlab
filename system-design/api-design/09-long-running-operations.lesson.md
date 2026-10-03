# Long-running operations

## What it is

- **What it is:** A way to offer work that takes longer than a request can stay open. The API answers at once, often with 202 Accepted, and returns a link to an operation resource, and the client checks it, or is called back, until the work is done.
- **The problem it solves:** When work outlasts a proxy's timeout, the client gets an error while the work keeps running, and each retry starts the work again, so the service may do it several times while the client gets nothing. An operation resource gives the work an identity the client can come back to.
- **Reach for it when:** Exports, reports, video processing, bulk imports or machine provisioning: any request that may outlast the shortest timeout on its path, or may fail partway.
- **Not the right tool when:** The work always finishes well inside the shortest timeout: keep it synchronous. When the client must react the moment the work ends, add a [webhook](#/sd-api-design/05-webhook-delivery) callback, and keep polling as the fallback.
- **Where you'll meet it:** Google's AIP-151 and the `Operation` resources returned by many Google Cloud APIs; Azure's REST API guidelines; AWS APIs that return a job to poll, such as Amazon Transcribe's StartTranscriptionJob and GetTranscriptionJob; "Design a video upload service" interviews.

## Words we'll use

- **Proxy** — a server between the client and the API that forwards requests: a load balancer or an API gateway. It has its own **timeout**: how long it waits for the API before giving up on a request.
- **504 Gateway Timeout** — what the proxy answers when the API did not reply in time. It says nothing about whether the work happened.
- **Synchronous** — the request stays open until the work is done, and the response carries the result.
- **Asynchronous** — the request only starts the work; the result is fetched later.
- **202 Accepted** — "I have your request and will work on it; it is not done yet."
- **Operation resource** — a resource that represents one piece of background work, such as `/operations/1`, with a status (`running`, `succeeded`, `failed`), progress, and a link to the result or the error.
- **Polling** — the client asking the operation "done yet?" at intervals. **Retry-After** is the header in which the server says how many seconds to wait before asking again.
- **Callback** (webhook) — the server calling a URL the client gave it when the work ends, instead of waiting to be asked.
- **Idempotency key** — a unique id the client sends with a POST. The server remembers it, and a repeat of the same POST returns the first result instead of doing the work again.

## The world we're in

- An export of a year of orders takes 90 seconds.
- A proxy in front of the API cuts off any request after 30 seconds. Whoever runs the proxy chose that number; the API cannot change it per request.
- When the proxy gives up, nobody tells the API. The export keeps running unless the handler watches for cancellation (Go's request context, Node's `close` event), and most do not.
- Clients retry. Many scripts and SDK setups retry any 5xx a few times.
- Exports sometimes fail partway (a worker is lost).

## The goal

The client gets exactly one export (or a clear failure) however long it takes, through a proxy that will not wait, and its retries never start the work twice.

## The naive attempt

"`POST /exports` runs the export and returns it." The request stays open while the export runs.
[▶ Broken: the first try starts an export](play:broken: sync@at=job-start#1)
At 30 seconds the proxy gives up and answers 504. The export is a third done and still running.
[▶ Broken: 504 at 30 s; the export goes on](play:broken: sync@at=gateway-timeout#1)
The client sees a 5xx and retries. To the service a retry is a brand-new POST, so it starts a second export, then, after another 504, a third.
[▶ Broken: the retry starts export 2](play:broken: sync@at=job-start#2)
[▶ Broken: the third try, export 3](play:broken: sync@at=sync-try#3)
The first export finishes at 90 seconds, while the third try is still waiting. Its result goes nowhere: that client connection is long gone.
[▶ Broken: export 1 finishes with no one to receive it](play:broken: sync@at=job-done#1)
After three 504s the client gives up empty-handed, and by 152 seconds the service has produced three exports.
[▶ Broken: the client gives up](play:broken: sync@at=gave-up#1)
[▶ Broken: the third export is written](play:broken: sync@at=job-done#3)

## Building it up

**1. Short work can stay synchronous.** A 20-second export answers before the 30-second timeout. The trouble is only work that can outlast the proxy.
[▶ 20 s under a 30 s timeout: 200](play:sync: a 20-second export@at=sync-ok#1)

**2. Accept, don't do.** `POST /exports` records the job, starts it in the background and answers at once: 202 Accepted, `Location: /operations/1`, `Retry-After: 10` (on a 202 both headers are a convention, not defined by HTTP, so also put the operation URL in the body). No time passes for the client.
[▶ The job starts in the background](play:async: POST /exports answers 202@at=job-start#1)
[▶ 202 with Location and Retry-After](play:async: POST /exports answers 202@at=accepted#1)

**3. Make the work a resource.** `/operations/1` has its own status and progress. Reading it is a quick GET, nowhere near any timeout, however long the job runs.
[▶ Poll 1 at 10 s: running](play:async: the client polls@at=op-status#1)

**4. Poll at the server's pace.** The client waits the Retry-After seconds between polls. At 90 seconds the operation says `succeeded` and links to `/exports/1`: 9 polls, one export.
[▶ The export finishes](play:async: the client polls@at=job-done#1)
[▶ Poll 9: succeeded](play:async: the client polls@at=poll-done#9)

**5. Failures are part of the answer.** If the export fails at 40 seconds, the operation says `failed`, with the reason. The client learns it on its fourth poll, instead of guessing from a timeout.
[▶ The export fails](play:async: a failed export@at=job-failed#1)
[▶ Poll 4: failed, with the error](play:async: a failed export@at=poll-done#4)

**6. Make the POST safe to retry.** The 202 itself can be lost. The client sends the same POST again with the same idempotency key, and gets the same operation; nothing new starts.
[▶ The same key: the same operation](play:async: a retried POST@at=same-op#1)

**7. Or be called back.** If the client registered a callback URL, the server calls it when the job ends. No polls at all; the client should still be able to poll in case a callback is lost.
[▶ The callback at 90 s](play:callback: the server calls@at=callback#1)

## Why it works now

The proxy's timeout applies to requests, not to work. In the synchronous design the work lived inside a request, so a timeout cut the client off from work that went on without it, and every retry started more. Now each request is short: one creates the work (once, thanks to the key) and the others read its state. No request outlives the proxy, and the work has an identity the client can come back to.
[▶ Broken: work inside a request, cut off at 30 s](play:broken: sync@at=gateway-timeout#1)
[▶ Every poll is a quick read](play:async: the client polls@at=op-status#5)

## What it costs

- **More calls and some delay.** Nine polls for one export, and the client learns of completion up to one interval late. A shorter Retry-After is faster and costs more polls.
- **State to keep.** Operations and idempotency keys must be stored, and expired after a while (a day or a week), or they pile up.
- **A job system.** Background workers, a queue, and a plan for a worker dying mid-job: make jobs safe to rerun.
- **Callbacks are their own service.** A public endpoint on the client, signed payloads so it can trust them, retries when it is down, and a poll as the fallback anyway.
- **Simplified here.** Our jobs never queue: every one starts at once. A real service bounds its queue and answers 429 or 503 when it is full.

## Staff notes

- A timeout is an unknown, not a failure. Any client that retries a non-idempotent call after a timeout can duplicate work unless the server deduplicates (an idempotency key, or a natural unique key such as one export per user per day).
- Know your proxies' timeouts: load balancers, gateways and CDNs each have one (AWS API Gateway's default integration timeout is 29 seconds for REST APIs). The smallest one on the path is the real limit.
- Give the operation a cancel (`DELETE /operations/1` or `POST /operations/1:cancel`) and say what cancelling a half-done job means.
- Return the result as its own resource (`/exports/1`) with its own lifetime and access checks, not inlined in the operation forever.
- Google (AIP-151) and Azure's REST guidelines both standardize this shape; reuse one shape for every long-running endpoint in your API so clients write the polling loop once.

## Check yourself

- **Q:** The proxy answers 504 after 30 seconds. Was the export done, failed or still running?
  A: Still running: the proxy hung up on the client, and nobody told the service. A 504 says nothing about the work. [▶ Show it](play:broken: sync@at=gateway-timeout#1)
- **Q:** The client retried the synchronous POST twice. How many exports did the service write, and how many did the client get?
  A: Three written, none received: each retry was a new POST that started another export. [▶ Show it](play:broken: sync@at=job-done#3)
- **Q:** With 202 and polling every 10 seconds, how many polls does a 90-second export take?
  A: 9: the polls at 10 to 80 seconds say running, the one at 90 says succeeded. [▶ Show it](play:async: the client polls@at=poll-done#9)
- **Q:** The 202 response is lost and the client POSTs again. Why does a second export not start?
  A: The POST carries the same idempotency key, and the service returns the operation that key already started. [▶ Show it](play:async: a retried POST@at=same-op#1)
- **Q:** How does the client learn that an export failed at 40 seconds?
  A: Its fourth poll reads the operation's status, `failed`, with the error. [▶ Show it](play:async: a failed export@at=poll-done#4)
