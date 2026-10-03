// Explanations drawn on the canvas: rules over the last second of frames that say what is
// happening at a component and why, with this run's numbers.

import { replicaNames } from "./design.ts";
import type { Frame, StationFrame, TrafficRun } from "./types.ts";

export type Rule =
  | "down"
  | "rejecting"
  | "blocked"
  | "saturated"
  | "timeouts"
  | "loggedOut"
  | "queueing"
  | "slowed"
  | "misses"
  | "stale"
  | "staleOwn"
  | "retries"
  | "backlog"
  | "jobFailures"
  | "bandwidth"
  | "breakerOpen"
  | "poolFull"
  | "serviceRetries"
  | "regionDown";
export type Callout = { rule: Rule; at: string; severity: 1 | 2 | 3; text: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (x: number) => (x >= 100 ? String(Math.round(x / 10) * 10) : String(Math.round(x)));
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${Math.round(n) === 1 ? one : many}`;

/** Callouts for frame `i`, most serious first. */
export function callouts(run: TrafficRun, i: number): Callout[] {
  const win: Frame[] = run.frames.slice(Math.max(0, i - 9), i + 1);
  if (win.length === 0) return [];
  const secs = win.length / 10;
  const last = win[win.length - 1];
  const out: Callout[] = [];
  const comps = run.design.components;
  const sum = (get: (f: Frame) => number) => win.reduce((n, f) => n + get(f), 0);

  for (const c of comps) {
    if (c.type === "queue" && last.stations[c.id]) {
      const util = win.reduce((n, f) => n + (f.stations[c.id]?.util ?? 0), 0) / win.length;
      const b0 = win[0].stations[c.id].backlog ?? 0;
      const b1 = last.stations[c.id].backlog ?? 0;
      // Growing for real: at least 10 waiting, more than a second ago, and the consumers all busy.
      if (b1 > b0 && b1 >= 10 && util >= 0.9) {
        out.push({
          rule: "backlog",
          at: c.id,
          severity: 2,
          text: `${fmt(b1)} jobs are waiting, up from ${fmt(b0)} a second ago; the oldest has waited ${fmt((last.stations[c.id].oldestMs ?? 0) / 1000)} s. Jobs arrive faster than ${c.consumers} consumers can finish them. Users don't notice yet, but the jobs are later and later.`,
        });
      }
      const lost = win.reduce((n, f) => n + (f.stations[c.id]?.failed ?? 0), 0) / secs;
      if (lost > 0) {
        out.push({ rule: "jobFailures", at: c.id, severity: 3, text: `About ${plural(lost, "job", "jobs")} a second fail downstream. Each goes back on the queue and is tried again a second later, so nothing is lost, but every retry is more work and more delay.` });
      }
      continue;
    }
    if (c.type !== "station" || !last.stations[c.id]) continue;
    const fs: StationFrame[] = win.map((f) => f.stations[c.id]);
    const name = c.label;
    const names = replicaNames(c);
    const up = last.stations[c.id].up;
    const down = up.flatMap((u, k) => (u ? [] : [names[k] ?? c.id]));
    if (down.length) {
      const lb = comps.find((x) => x.type === "lb" && x.targets.includes(c.id));
      const hosted = comps.filter((x) => x.machine === c.id).map((x) => x.label.toLowerCase());
      const copies = c.shards ? c.replicas / c.shards : c.replicas;
      let why: string;
      if (lb && down.length < c.replicas) {
        why = `The load balancer only checks servers every ${lb.healthCheckMs} ms; until it notices, it keeps sending requests there and they fail.`;
      } else if (c.role === "database" && copies > 1) {
        // Copy 0 of each shard is its primary; the others only answer reads.
        const primaryDown = up.some((u, k) => !u && k % copies === 0);
        why = primaryDown
          ? "Writes to it fail, since only a primary takes writes; reads move to the other copies."
          : "Reads move to the other copies, which now carry its share.";
      } else if (c.role === "database" && c.shards && c.shards > 1) {
        why = "Requests for keys on that shard fail; the other shards carry on.";
      } else if (c.replicas > 1) {
        why = "The remaining copies take its share.";
      } else {
        why = "Nothing else can take its requests, so every one of them fails: a single point of failure.";
      }
      out.push({
        rule: "down",
        at: c.id,
        severity: 3,
        text: `${list(down)} ${down.length > 1 ? "are" : "is"} down` + (hosted.length ? `, and the ${list(hosted)} on the same machine with it` : "") + ". " + why,
      });
    }
    const slow = last.stations[c.id].slow;
    if (slow > 1) {
      out.push({ rule: "slowed", at: c.id, severity: 3, text: `${name} is running ${fmt(slow)} times slower than normal (a bad disk, a noisy neighbour, a long garbage-collection pause). Everything that waits on it waits longer.` });
    }
    const hits = fs.reduce((n, f) => n + (f.hits ?? 0), 0);
    const misses = fs.reduce((n, f) => n + (f.misses ?? 0), 0);
    if (hits + misses > 0 && hits / (hits + misses) < 0.5) {
      const target = comps.find((x) => x.role === "database")?.label.toLowerCase() ?? "the source";
      out.push({
        rule: "misses",
        at: c.id,
        severity: 2,
        text: `${name} finds only ${pct(hits / (hits + misses))} of keys it is asked for. ${c.role === "cdn" ? "Every miss is fetched from the origin servers." : `Every miss becomes a read on the ${target}.`} A cache that just started is empty ("cold") and fills as it misses.`,
      });
    }
    const rejected = fs.reduce((n, f) => n + f.rejected, 0) / secs;
    if (rejected > 0) {
      out.push({
        rule: "rejecting",
        at: c.id,
        severity: 3,
        text: `${name} is turning requests away: all ${c.threads} workers are busy and its queue of ${c.queue} is full, so about ${fmt(rejected)} a second get an error (503) at once.`,
      });
    }
    const util = fs.reduce((n, f) => n + f.util, 0) / fs.length;
    const threads = fs.reduce((n, f) => n + f.threads, 0) / fs.length;
    const nic = fs.reduce((n, f) => n + (f.nic ?? 0), 0) / fs.length;
    if (nic >= 0.9) {
      const mb = fs.reduce((n, f) => n + (f.bytesOut ?? 0), 0) / secs / 1e6;
      out.push({
        rule: "bandwidth",
        at: c.id,
        severity: 2,
        text: `${name}'s network card is ${pct(nic)} busy, sending about ${fmt(mb)} MB a second (${fmt(c.bandwidthMbps ?? 0)} Mbps is ${fmt((c.bandwidthMbps ?? 0) / 8)} MB a second${c.replicas > 1 ? " per machine" : ""}). Answers queue to go out, each holding a worker, while the CPUs are ${pct(util)} busy. More CPUs would not help; a faster card, more machines or a CDN in front would.`,
      });
    }
    for (const [t, l] of Object.entries(last.stations[c.id].links ?? {})) {
      const states = l.breaker ?? [];
      const open = states.filter((s) => s !== "closed").length;
      if (open > 0) {
        const of = states.length > 1 ? ` on ${open} of ${states.length} servers` : "";
        const trial = states.every((s) => s !== "open") ? " It is letting a few trial calls through to see whether it has recovered." : " Every few seconds it lets a few trial calls through to see whether it has recovered.";
        out.push({
          rule: "breakerOpen",
          at: c.id,
          severity: 2,
          text: `The circuit breaker on calls to ${t} is open${of}: too many recent calls failed, so calls now fail at once (or are skipped) instead of waiting on it. That keeps workers free and gives ${t} room to recover.${trial}`,
        });
      }
      const full = win.reduce((n, f) => n + (f.stations[c.id]?.links?.[t]?.poolFull ?? 0), 0) / secs;
      if (full > 0) {
        out.push({
          rule: "poolFull",
          at: c.id,
          severity: 2,
          text: `About ${plural(full, "call", "calls")} a second to ${t} are refused at once: the ${c.pools?.[t] ?? c.pools?.default ?? ""} workers set aside for it are all waiting on it. This bulkhead keeps the rest of ${name}'s workers free for everything else.`,
        });
      }
    }
    const retried = fs.reduce((n, f) => n + (f.retries ?? 0), 0) / secs;
    const arrived = fs.reduce((n, f) => n + f.arrivals, 0) / secs;
    if (retried >= Math.max(1, 0.01 * arrived)) {
      out.push({
        rule: "serviceRetries",
        at: c.id,
        severity: 2,
        text: `${name} is retrying its own calls about ${plural(retried, "time", "times")} a second. Each layer that retries multiplies the load on the one below it: 3 attempts here behind 3 at the clients is up to 9 calls for one user request, aimed at a component that is already failing.`,
      });
    }
    if (threads >= 0.95 && util < 0.85 && nic < 0.9 && c.targets.length) {
      out.push({
        rule: "blocked",
        at: c.id,
        severity: 2,
        text: `Every worker is busy, yet the CPUs are only ${pct(util)} used: the workers sit waiting for ${list(c.targets)} to answer. More CPUs here would not help.`,
      });
    } else if (util >= 0.9) {
      out.push({
        rule: "saturated",
        at: c.id,
        severity: 2,
        text: `${name}'s CPUs are ${pct(util)} busy. Near 100%, a new request almost always finds every core taken and waits behind the others, so waiting time grows much faster than traffic.`,
      });
    }
    const q0 = fs[0].queue;
    const q1 = fs[fs.length - 1].queue;
    if (q1 > q0 && q1 > 0 && rejected === 0) {
      out.push({
        rule: "queueing",
        at: c.id,
        severity: 1,
        text: `${name}'s queue is growing: ${fmt(q1)} requests are waiting for a worker, up from ${fmt(q0)} a second ago.`,
      });
    }
  }

  const users = comps.find((c) => c.type === "clients");
  for (const region of run.design.regions ?? []) {
    const here = comps.flatMap((c) => (c.regions ?? []).flatMap((r, k) => (r === region ? [last.stations[c.id]?.up[k] ?? true] : [])));
    if (users && here.length && here.every((u) => !u)) {
      const gap = run.design.interRegionMs ?? 0;
      out.push({
        rule: "regionDown",
        at: users.id,
        severity: 3,
        text: `Region ${region} is down: all ${here.length} of its machines. Load balancers send its users to another region once their health check notices; from there each request travels ${fmt(gap)} ms further each way, and whatever lived only in ${region} (a database primary) cannot be reached.`,
      });
    }
  }
  const timedOut = sum((f) => f.clients.timedOut) / secs;
  if (users && timedOut > 0) {
    out.push({
      rule: "timeouts",
      at: users.id,
      severity: 2,
      text: `About ${plural(timedOut, "request", "requests")} a second end in a timeout (over ${users.timeouts ? "their kind's deadline" : `${users.timeoutMs} ms`}, after any retries). Users give up on them, but the servers keep working on them anyway.`,
    });
  }
  const retries = sum((f) => f.clients.retries) / secs;
  const sent = sum((f) => f.clients.sent) / secs;
  if (users && retries >= Math.max(1, 0.01 * sent)) {
    out.push({
      rule: "retries",
      at: users.id,
      severity: 2,
      text: `Clients are retrying about ${plural(retries, "request", "requests")} a second. Each retry is more work for servers that are already failing.`,
    });
  }
  const db = comps.find((c) => c.role === "database") ?? comps.find((c) => c.role === "cache");
  const reads = sum((f) => f.clients.reads);
  const stale = sum((f) => f.clients.stale);
  const ownReads = sum((f) => f.clients.ownReads);
  const staleOwn = sum((f) => f.clients.staleOwn);
  if (db && ownReads > 0 && staleOwn > 0) {
    out.push({
      rule: "staleOwn",
      at: db.id,
      severity: 3,
      text: `${pct(staleOwn / ownReads)} of users who just saved something reloaded and did not see it: their read went to a copy that had not caught up yet.`,
    });
  } else if (db && reads > 0 && stale / reads >= 0.005) {
    out.push({
      rule: "stale",
      at: db.id,
      severity: 1,
      text: `${pct(stale / reads)} of reads return an older value than the latest write: they were answered from a copy (a cache entry or a replica) that had not caught up.`,
    });
  }
  const loggedOut = sum((f) => f.clients.loggedOut);
  const holder = comps.find((c) => c.sessions === "local");
  if (holder && loggedOut > 0) {
    out.push({
      rule: "loggedOut",
      at: holder.id,
      severity: 2,
      text: `${plural(loggedOut, "user was", "users were")} logged out in the last second: their session lived in the memory of one server, and this request reached another (that one died, or the load balancer sent them elsewhere), so they must sign in again.`,
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}
