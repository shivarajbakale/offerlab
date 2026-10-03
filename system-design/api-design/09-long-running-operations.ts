/**
 * 09. Long-Running Operations
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: A client asks the API to export a year of orders. The export takes 90 seconds.
 *   Between the client and the server sits a proxy (a load balancer or API gateway) that cuts
 *   off any request taking longer than 30 seconds. The client must get its export exactly
 *   once, find out if it failed, and never cause the work to run twice.
 *
 * Approach: 202 Accepted and an operation resource to poll (or a callback when done)
 *   POST /exports does not do the export. It records the job, starts it in the background,
 *   and answers at once: 202 Accepted, Location: /operations/{id}, Retry-After: 10. The
 *   operation is a resource of its own with a status (running, succeeded, failed), progress,
 *   and, when done, a link to the result or the error. The client polls it, each poll a quick
 *   GET, waiting Retry-After seconds between polls. An idempotency key on the POST makes a
 *   retried POST return the same operation instead of starting a second export. Optionally,
 *   the client registers a callback URL and the server calls it when the job ends.
 *
 * Cost: one quick POST plus one GET per poll interval (90 s / 10 s = 9 polls here); a store for
 *   operations and idempotency keys; a worker pool to run the jobs.
 *
 * Pattern: asynchronous request-reply, operation resource, polling with Retry-After, webhooks
 * Key insight: An HTTP request is a promise to answer within a timeout someone else chose (the
 *   proxy's). Work that can take longer must not live inside a request. Make the work a
 *   resource with its own id and status, and the request only creates it or reads it.
 * Tradeoffs: Polling is simple and works through any firewall, but wastes calls and adds up to
 *   one interval of delay; callbacks are immediate but need a public endpoint on the client,
 *   signatures, retries and still a poll as a fallback. Operations must be stored and expired.
 *   Short work (well under the proxy timeout) is simpler synchronous.
 * Staff notes: When a proxy times out, the server usually keeps working: the work runs on
 *   unless the handler watches for cancellation (Go's request context, Node's 'close' event),
 *   and most do not. So a timeout is not a failure, it is
 *   an unknown, and a blind retry duplicates the work. Bound the job queue and answer 429 or 503
 *   when it is full, rather than accepting work you cannot finish. Let clients cancel (DELETE or
 *   POST :cancel on the operation) and make jobs resumable or idempotent so a worker crash can
 *   rerun them safely.
 * Interview signals: "the request times out", "504 Gateway Timeout", "report generation",
 *   "video processing", "bulk import", "how does the client know it is done", "webhooks".
 * Real world: Google's API design guide (AIP-151) returns a long-running Operation resource the
 *   client polls; Azure's REST guidelines describe 202 with an Operation-Location header to
 *   poll. AWS API Gateway's default integration timeout is 29 seconds (REST APIs). An Idempotency-Key HTTP
 *   header is being standardized in an IETF draft.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export type Res = { status: number; headers: Record<string, string>; body: unknown };
export type Job = { id: number; startedAt: number; finishAt: number; fails: boolean; done: boolean; callbackUrl?: string };
export type Operation = { id: number; status: "running" | "succeeded" | "failed"; progress: number; result?: string; error?: string };

/** The export service: jobs run in the background on a simulated clock, in seconds. */
export class ExportService {
  // @viz values:s,waitS,id
  now = 0;
  // @why How long one export takes. Far longer than the proxy will wait.
  durationS = 90;
  // @why If set, exports fail after this many seconds (a broken input, a lost worker).
  failAfterS: number | null = null;
  jobs: Job[] = [];
  ops = new Map<number, Operation>();
  // @why Idempotency keys already seen, to the operation each one started.
  byKey = new Map<string, number>();
  // @why Exports actually produced. The client wanted exactly one.
  exportsWritten = 0;
  callbacks: string[] = [];

  start(callbackUrl?: string): Job {
    const id = this.jobs.length + 1;
    const fails = this.failAfterS !== null;
    const finishAt = this.now + (fails ? this.failAfterS! : this.durationS);
    const job: Job = { id, startedAt: this.now, finishAt, fails, done: false, callbackUrl };
    this.jobs.push(job); // @mark job-start
    this.ops.set(id, { id, status: "running", progress: 0 });
    return job;
  }

  /** Time passes; any job whose time is up finishes. */
  advance(s: number) {
    this.now += s;
    for (const job of this.jobs) {
      if (job.done || job.finishAt > this.now) continue;
      job.done = true;
      const op = this.ops.get(job.id)!;
      if (job.fails) {
        op.status = "failed";
        op.error = "export failed: worker lost"; // @mark job-failed
      } else {
        this.exportsWritten++;
        op.status = "succeeded";
        op.progress = 100;
        op.result = `/exports/${job.id}`; // @mark job-done
      }
      // @why A callback: the server tells the client, instead of the client asking.
      if (job.callbackUrl) this.callbacks.push(`POST ${job.callbackUrl} {"operation": ${op.id}, "status": "${op.status}"}`); // @mark callback
    }
  }

  /** POST /exports, the asynchronous way. */
  postExport(idempotencyKey?: string, callbackUrl?: string): Res {
    const seen = idempotencyKey !== undefined ? this.byKey.get(idempotencyKey) : undefined;
    // @why The same key again: a retry of a POST whose answer was lost. Return the operation it started; start nothing.
    if (seen !== undefined) return accepted(seen); // @mark same-op
    const job = this.start(callbackUrl);
    if (idempotencyKey !== undefined) this.byKey.set(idempotencyKey, job.id);
    // @why 202 Accepted: "I have it, it is not done". Location says where to watch it; Retry-After says how often.
    return accepted(job.id); // @mark accepted
  }

  /** GET /operations/{id}: a quick read, however long the job takes. */
  getOperation(id: number): Res {
    const op = this.ops.get(id);
    if (!op) return { status: 404, headers: {}, body: { error: "no such operation" } };
    const job = this.jobs[id - 1];
    if (op.status === "running") op.progress = Math.floor((100 * (this.now - job.startedAt)) / this.durationS);
    const headers: Record<string, string> = op.status === "running" ? { "Retry-After": "10" } : {};
    return { status: 200, headers, body: { ...op } }; // @mark op-status
  }
}

/** A proxy in front of the service that gives up on any request after `timeoutS`. */
export class Proxy {
  service: ExportService;
  // @why The proxy's limit, set by whoever runs it, not by the API.
  timeoutS = 30;

  constructor(service: ExportService) {
    this.service = service;
  }

  /** POST /exports, the synchronous way: the request stays open until the export is done. */
  syncExport(): Res {
    const job = this.service.start();
    const waitS = job.finishAt - this.service.now;
    if (waitS > this.timeoutS) {
      this.service.advance(this.timeoutS);
      // @why 504 Gateway Timeout. The proxy hangs up on the client. Nobody tells the service, and the export keeps running.
      return { status: 504, headers: {}, body: { error: "gateway timeout" } }; // @mark gateway-timeout
    }
    this.service.advance(waitS);
    return { status: 200, headers: {}, body: { result: `/exports/${job.id}` } }; // @mark sync-ok
  }
}

/** A client that starts an export, then polls the operation until it is done. */
export class PollingClient {
  service: ExportService;
  polls = 0;

  constructor(service: ExportService) {
    this.service = service;
  }

  exportOrders(idempotencyKey: string): Operation {
    let res = this.service.postExport(idempotencyKey);
    const id = Number(res.headers.Location.split("/").pop());
    for (;;) {
      // @why Wait as long as the server asked. It knows how busy it is; the client does not.
      this.service.advance(Number(res.headers["Retry-After"]));
      res = this.service.getOperation(id);
      this.polls++;
      const op = res.body as Operation;
      if (op.status !== "running") return op; // @mark poll-done
    }
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: a client that calls the synchronous endpoint and, like many scripts and
// SDK configurations, retries a 5xx a few times.
export class RetryingSyncClient {
  proxy: Proxy;
  attempts = 0;

  constructor(proxy: Proxy) {
    this.proxy = proxy;
  }

  exportOrders(): Res {
    let res: Res = { status: 0, headers: {}, body: null };
    for (let i = 0; i < 3; i++) {
      this.attempts++;
      // @why Each try is a brand-new POST. The service cannot tell it from a new request, so it starts another export.
      res = this.proxy.syncExport(); // @mark sync-try
      if (res.status !== 504) return res;
      this.proxy.service.advance(1);
    }
    return res; // @mark gave-up
  }
}

function accepted(id: number): Res {
  return { status: 202, headers: { Location: `/operations/${id}`, "Retry-After": "10" }, body: { id, status: "running" } };
}

test("async: POST /exports answers 202 at once, with a Location to poll", () => {
  const svc = new ExportService();
  const res = svc.postExport("exp-1");
  assert.equal(res.status, 202);
  assert.equal(res.headers.Location, "/operations/1");
  assert.equal(res.headers["Retry-After"], "10");
  assert.equal(svc.now, 0, "no time passed: the export runs in the background");
});

test("async: the client polls every 10 s and gets its one export after 9 polls", () => {
  const svc = new ExportService();
  const client = new PollingClient(svc);
  const op = client.exportOrders("exp-1");
  assert.equal(op.status, "succeeded");
  assert.equal(op.result, "/exports/1");
  assert.equal(client.polls, 9);
  assert.equal(svc.now, 90);
  assert.equal(svc.exportsWritten, 1);
});

test("async: a retried POST with the same idempotency key gets the same operation", () => {
  const svc = new ExportService();
  const first = svc.postExport("exp-1");
  // The 202 was lost on the way back; the client sends the same POST again.
  const again = svc.postExport("exp-1");
  assert.equal(again.headers.Location, first.headers.Location);
  assert.equal(svc.jobs.length, 1);
});

test("async: a failed export is reported on the operation, not lost", () => {
  const svc = new ExportService();
  svc.failAfterS = 40;
  const client = new PollingClient(svc);
  const op = client.exportOrders("exp-1");
  assert.equal(op.status, "failed");
  assert.equal(op.error, "export failed: worker lost");
  assert.equal(client.polls, 4);
});

test("callback: the server calls the client back when the export finishes", () => {
  const svc = new ExportService();
  svc.postExport("exp-1", "https://client.example/hooks/exports");
  svc.advance(60);
  assert.deepEqual(svc.callbacks, []);
  svc.advance(30);
  assert.deepEqual(svc.callbacks, ['POST https://client.example/hooks/exports {"operation": 1, "status": "succeeded"}']);
});

test("sync: a 20-second export fits under the 30-second proxy timeout", () => {
  const svc = new ExportService();
  svc.durationS = 20;
  const res = new Proxy(svc).syncExport();
  assert.equal(res.status, 200);
  assert.equal(svc.exportsWritten, 1);
});

test("broken: sync — the proxy gives up at 30 s, the export goes on, and each retry starts another", () => {
  const svc = new ExportService();
  const client = new RetryingSyncClient(new Proxy(svc));
  const res = client.exportOrders();
  // Three tries, three 504s, at 30, 61 and 92 seconds.
  assert.equal(res.status, 504);
  assert.equal(client.attempts, 3);
  assert.equal(svc.now, 93);
  assert.deepEqual(
    svc.jobs.map((j) => [j.startedAt, j.finishAt]),
    [
      [0, 90],
      [31, 121],
      [62, 152],
    ],
  );
  // All three exports were still running. They finish at 90, 121 and 152 seconds.
  svc.advance(60);
  assert.equal(svc.exportsWritten, 3, "three exports for a client that got none");
});
