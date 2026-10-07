/**
 * 015. Retry with Exponential Backoff and Jitter
 * Level: Senior
 * Group: Traffic
 *
 * Problem: Requests sometimes fail for reasons that pass on their own: a server restarting, a
 *   brief overload, a dropped connection. Retrying hides those failures from users. But when
 *   the failure is overload, every retry is more load, and many clients retrying at once can
 *   keep the server overloaded long after the original cause is gone.
 *
 * Approach: Exponential backoff with full jitter, and a retry cap
 *   After each failure a client waits before retrying, and the wait doubles each time (2, 4,
 *   8 ticks...), up to a maximum. With full jitter the client waits a random time between 1
 *   and that doubled ceiling, so clients that failed together retry at different moments.
 *   After a fixed number of attempts the client gives up and reports the failure.
 *
 * Cost: O(1) per retry decision; extra latency for the caller while it waits; a random
 *   number per retry.
 *
 * Pattern: resilience
 * Key insight: Backoff lowers the average load from retries, but clients that failed at the
 *   same moment still retry at the same moments, in synchronized waves. Randomizing the wait
 *   spreads them out, so each tick sees only what the server can handle.
 * Tradeoffs: Longer waits protect the server but delay the user. Jitter makes individual
 *   retries less predictable. Retrying at all is only safe when repeating the request is
 *   harmless (idempotent); otherwise a retry after a lost response can apply it twice.
 * Staff notes: Retry at one layer only: if each of three layers retries 3 times, one user
 *   request can become 27 calls to the bottom service. Use a retry budget (for example,
 *   retries may be at most 10% of requests) so retries cannot multiply load during an
 *   outage. Respect Retry-After from the server. Never retry errors that will not change
 *   (bad request, permission denied).
 * Interview signals: "retry storm", "thundering herd", "transient failure", "cascading
 *   failure", "idempotency", "exponential backoff".
 * Real world: The AWS Architecture Blog post "Exponential Backoff And Jitter" (Marc Brooker,
 *   2015) compares these strategies and recommends adding jitter; AWS SDKs and many gRPC and
 *   HTTP client libraries retry with exponential backoff.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Policy = "immediate" | "exponential" | "full-jitter";
type Request = { t: number; ok: boolean; row?: string; label?: string };
type Point = { t: number; v: number };

// @why The longest a client ever waits between attempts, so a long outage doesn't push retries out forever.
const MAX_BACKOFF = 32;

export class Server {
  // @why Requests the server can finish in one tick.
  capacity: number;
  // @why The server is down (restarting) before this tick: every request fails.
  downUntil: number;

  constructor(capacityPerTick: number, downUntil = 0) {
    this.capacity = capacityPerTick;
    this.downUntil = downUntil;
  }

  /** Whether the `n` requests that arrive at tick t succeed. */
  handle(t: number, n: number): boolean {
    // @caption {t < downUntil ? "bad: At t=" + t + ", " + n + (n === 1 ? " request reaches" : " requests reach") + " the server, but it is still restarting until t=" + downUntil + ", so " + (n === 1 ? "it fails" : "they all fail") + ". Nothing the client does can help before then." : "At t=" + t + ", " + n + (n === 1 ? " request reaches" : " requests reach") + " the server."}
    if (t < this.downUntil) return false; // @mark down
    // @why Overload: the server splits its time among all n requests, none gets enough, and all of them time out.
    // @caption {n > capacity ? "bad: " + (t === 0 ? n + " clients send a request at the same moment, say all reconnecting after a network blip. Every client follows the same rule: " + (clients[0].policy === "immediate" ? "retry on the very next tick" : clients[0].policy === "exponential" ? "wait 2, 4, 8, ... ticks, doubling after each failure" : "wait a random time, up to a limit that doubles after each failure") + ". " : "") + "At t=" + t + ", " + n + " requests arrive at once, but the server can handle only " + capacity + " per tick. Overloaded, it splits its time among all of them, none finishes in time, and all " + n + " fail." + (t > 0 && clients[0].policy === "immediate" ? " Every one of them is a retry: the load keeping the server down is now nothing but retries." : t > 0 && clients[0].policy === "exponential" && n === clients.length ? " They all failed together and waited exactly as long, so they all came back in the same tick. Backoff alone keeps them in step." : "") : "good: At t=" + t + ", " + n + (n === 1 ? " request arrives" : " requests arrive") + ", no more than the " + capacity + " the server can handle per tick, so " + (n === 1 ? "it is" : "every one is") + " served." + (downUntil > 0 ? " The restart finished at t=" + downUntil + ", so the server is up again." : "")}
    const ok = n <= this.capacity; // @mark overload
    return ok;
  }
}

export class Client {
  name: string;
  policy: Policy;
  // @why Failed attempts so far. The backoff ceiling doubles with each one.
  failures = 0;
  // @why The tick of the next attempt.
  nextTry = 0;
  done = false;
  gaveUp = false;
  // @why Each client has its own random sequence, so jittered clients pick different waits.
  seed: number;

  constructor(id: string, rule: Policy, seed: number, startAt = 0) {
    this.name = id;
    this.policy = rule;
    this.seed = seed;
    this.nextTry = startAt;
  }

  /** After a failed attempt at tick t: schedule the next attempt, or give up. */
  failed(t: number, maxAttempts: number) {
    this.failures++;
    // @why The cap. Without it a client keeps retrying a server that may be down for good, and keeps adding load.
    if (this.failures >= maxAttempts) {
      // @caption bad: {name} has now failed {failures} times, and {maxAttempts} attempts is its limit. It gives up and reports the error to its user, instead of adding load forever. {clients.every((x) => x.gaveUp) ? (clients.length === 1 ? "The outage outlasted its patience." : "Every client has now given up, and " + (clients.some((x) => x.done) ? "only some were" : "not one was") + " served, though the server could have handled all of them in " + Math.ceil(clients.length / capacity) + " ticks.") : clients.filter((x) => x.gaveUp).length + " of " + clients.length + " clients have given up so far."}
      this.gaveUp = true; // @mark giveUp
      return;
    }
    const wait = this.backoff();
    this.nextTry = t + wait;
  }

  backoff(): number {
    if (this.policy === "immediate") return 1;
    // @why Doubles after each failure (2, 4, 8, ...), so the longer the trouble lasts, the less often this client adds to it.
    // @caption {policy === "exponential" ? name + " has failed " + failures + (failures === 1 ? " time" : " times") + ", so it waits 2^" + failures + " = " + ceiling + " ticks before its next attempt. Each failure doubles the wait." : name + " has failed " + failures + (failures === 1 ? " time" : " times") + ", so its backoff is now " + ceiling + " ticks: it will wait somewhere from 1 to " + ceiling + "."}
    const ceiling = Math.min(MAX_BACKOFF, 2 ** this.failures); // @mark ceiling
    if (this.policy === "exponential") return ceiling;
    // @why Full jitter: a random wait from 1 up to the ceiling, so clients that failed together retry apart.
    // @caption {name} rolls a random wait from 1 to {ceiling} ticks and gets {wait}, so it will retry at t={t + wait}. Clients that failed together pick different waits and come back at different ticks.
    const wait = 1 + randomBelow(this, ceiling); // @mark jitter
    return wait;
  }

}

export class RetrySim {
  // @viz gate:history,title=Retry_rule,from=Clients,clients=lanes,load=load,cap=capacity,failAt=server,state=clients.0.policy,down=server.downUntil timeline:history,load,capacity,lanes,ok=served,bad=failed hide:due,c,server,clients,maxAttempts,history,load,capacity,lanes,ok,attempt,why,next,t,n,downUntil,name,policy,failures,nextTry,done,gaveUp,seed,ceiling,wait,id,rule,startAt,capacityPerTick
  server: Server;
  clients: Client[];
  // @why Attempts per request, counting the first. After that the client gives up and reports the failure.
  maxAttempts: number;
  history: Request[] = [];
  // @why For the picture only: requests arriving per tick, the server's capacity, and one row per client.
  load: Point[] = [];
  capacity: number;
  lanes: string[];

  constructor(server: Server, clients: Client[], maxAttempts: number) {
    this.server = server;
    this.clients = clients;
    this.maxAttempts = maxAttempts;
    this.capacity = server.capacity;
    // @caption {clients.length === 1 ? "One client and one server that can handle " + capacity + " requests per tick." + (server.downUntil > 0 ? " The server is restarting until t=" + server.downUntil + ", so every request before then fails." : "") : clients.length + " clients send a request at the same moment, say all reconnecting after a network blip. The server can handle " + capacity + " per tick, so " + clients.length + " at once is too many."} {(clients.length === 1 ? "The client's rule: " : "Every client follows the same rule: ") + (clients[0].policy === "immediate" ? "retry on the very next tick" : clients[0].policy === "exponential" ? "wait 2, 4, 8, ... ticks, doubling after each failure" : "wait a random time, up to a limit that doubles after each failure") + ", and give up after " + maxAttempts + " attempts."}
    this.lanes = clients.map((c) => c.name);
  }

  tick(t: number) {
    const due = this.clients.filter((c) => !c.done && !c.gaveUp && c.nextTry === t);
    this.load.push({ t, v: due.length });
    if (due.length === 0) return;
    const ok = this.server.handle(t, due.length);
    for (const c of due) {
      const attempt = c.failures + 1;
      if (ok) {
        c.done = true;
        // @caption good: {c.name} is served on attempt {attempt}{attempt > 1 ? ": the retry hid the failure from its user" : ""}. {clients.filter((x) => x.done).length === clients.length ? (clients.length === 1 ? "Its user gets an answer, late but without an error." : "All " + clients.length + " clients have now been served.") : clients.filter((x) => x.done).length + " of " + clients.length + " clients served so far."}
        this.history.push({ t, ok: true, row: c.name, label: `attempt ${attempt} succeeds` }); // @mark served
        continue;
      }
      c.failed(t, this.maxAttempts);
      const why = t < this.server.downUntil ? "server down" : `overloaded: ${due.length} requests`;
      const next = c.gaveUp ? "gives up" : `retries at t=${c.nextTry}`;
      // @caption {c.gaveUp ? "bad: " + c.name + "'s attempt " + attempt + " failed (" + why + "), and it has given up." : "bad: " + c.name + "'s attempt " + attempt + " failed (" + why + "). It will try again at t=" + c.nextTry + (c.nextTry - t === 1 ? ", the very next tick." : ", " + (c.nextTry - t) + " ticks from now.")}
      this.history.push({ t, ok: false, row: c.name, label: `attempt ${attempt} fails (${why}), ${next}` });
    }
  }
}

// --- helpers for the scenarios ---

// Quiet: a random whole number from 0 to n - 1, from the owner's seeded generator (mulberry32).
function randomBelow(owner: { seed: number }, n: number): number {
  owner.seed = advance(owner.seed);
  return Math.floor(unit(owner.seed) * n);
}

// mulberry32, split in two: the state steps forward by a constant, and the output is a hash of the state.
function advance(state: number): number {
  return (state + 0x6d2b79f5) | 0;
}

function unit(state: number): number {
  let x = Math.imul(state ^ (state >>> 15), state | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

// Eight clients send at the same moment (say, all reconnecting after a network blip). The
// server handles 4 per tick; 8 at once overload it.
function crowd(policy: Policy, seed = 1): RetrySim {
  const clients = Array.from({ length: 8 }, (_, i) => new Client(`c${i}`, policy, seed * 100 + i));
  return new RetrySim(new Server(4), clients, 6);
}

// Quiet: runs a simulation to the end without tracing it, for comparisons.
function runQuietly(sim: RetrySim, ticks: number): RetrySim {
  for (let t = 0; t < ticks; t++) sim.tick(t);
  return sim;
}

// Quiet: the tick at which the last client was served, or Infinity if some client never was.
function recoveredAt(sim: RetrySim): number {
  if (sim.clients.some((c) => !c.done)) return Infinity;
  return Math.max(...sim.history.filter((r) => r.ok).map((r) => r.t));
}

// Quiet: the most requests that arrived in a single tick after the first one.
function peakRetries(sim: RetrySim): number {
  return Math.max(...sim.load.filter((p) => p.t > 0).map((p) => p.v));
}

function attemptTimes(sim: RetrySim, name: string): number[] {
  return sim.history.filter((r) => r.row === name).map((r) => r.t);
}

test("backoff: the wait doubles after each failure", () => {
  // One client; the server is restarting until t=20.
  const sim = new RetrySim(new Server(4, 20), [new Client("c0", "exponential", 1)], 8);
  for (let t = 0; t <= 30; t++) sim.tick(t);
  const times = attemptTimes(sim, "c0");
  assert.deepEqual(times, [0, 2, 6, 14, 30]);
  assert.deepEqual(times.slice(1).map((t, i) => t - times[i]), [2, 4, 8, 16]);
  assert.equal(sim.clients[0].done, true, "the retry after the restart succeeds");
});

test("full jitter: retries spread out and the server recovers sooner", () => {
  const sim = crowd("full-jitter", 7);
  for (let t = 0; t < 8; t++) sim.tick(t);
  assert.ok(sim.clients.every((c) => c.done), "every client is served");
  // The first retries still collide (6 at t=1), but the waits spread wider each time.
  assert.deepEqual(sim.load.map((p) => p.v), [8, 6, 3, 1, 3, 1, 0, 0]);
  assert.equal(recoveredAt(sim), 5);
  const exponential = runQuietly(crowd("exponential"), 64);
  assert.ok(recoveredAt(sim) < recoveredAt(exponential));
});

test("retry cap: give up after max attempts", () => {
  // The server is down for a long time; the client stops after 4 attempts.
  const sim = new RetrySim(new Server(4, 100), [new Client("c0", "exponential", 1)], 4);
  for (let t = 0; t <= 20; t++) sim.tick(t);
  assert.deepEqual(attemptTimes(sim, "c0"), [0, 2, 6, 14]);
  assert.equal(sim.clients[0].gaveUp, true);
});

test("broken: immediate retries — a retry storm keeps the server overloaded", () => {
  const sim = crowd("immediate");
  for (let t = 0; t < 7; t++) sim.tick(t);
  // All 8 retry every tick, so every tick is overloaded, until all of them give up.
  assert.deepEqual(sim.load.slice(0, 6).map((p) => p.v), [8, 8, 8, 8, 8, 8]);
  assert.equal(sim.history.filter((r) => r.ok).length, 0, "nobody is ever served");
  assert.ok(sim.clients.every((c) => c.gaveUp));
});

test("broken: backoff without jitter — clients retry in synchronized waves", () => {
  const sim = crowd("exponential");
  for (let t = 0; t <= 30; t++) sim.tick(t);
  // They all failed together, so they all wait 2, 4, 8, 16 together: every retry tick gets all 8.
  assert.equal(peakRetries(sim), 8);
  assert.deepEqual(
    sim.load.filter((p) => p.v > 0).map((p) => p.t),
    [0, 2, 6, 14, 30],
  );
  assert.equal(sim.history.filter((r) => r.ok).length, 0, "every wave overloads the server again");
});
