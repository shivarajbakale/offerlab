// Plain words for the architecture canvas: what each box is for, what would go wrong without it,
// what it resembles in frontend work, and what its numbers mean right now. Pure, so tests can use it.

import type { ComponentView, DesignView, Frame, Journey, StationFrame } from "../../../system-design/traffic/index.ts";

export type Guide = {
  /** A few words drawn on the box. */
  tagline: string;
  /** One or two sentences: what it does in this design. */
  job: string;
  /** What breaks or gets worse without it. */
  without: string;
  /** The nearest idea from frontend work. */
  frontend: string;
};

export type Tone = "ok" | "warn" | "bad" | "info";
export type MetricLine = { name: string; value: string; says: string; tone: Tone };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (x: number) => (x >= 10_000 ? `${+(x / 1000).toFixed(1)}k` : String(Math.round(x)));
const callers = (c: ComponentView, d: DesignView) => d.components.filter((x) => x.targets.includes(c.id)).map((x) => x.label);
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** What a component is for, in this design. */
export function guideFor(c: ComponentView, d: DesignView): Guide {
  const from = callers(c, d);
  const by = from.length ? from.join(" and ") : "the servers in front of it";
  /** A verb agreeing with `by`: "App server adds", "App server and Worker add". */
  const verb = (one: string, many: string) => (from.length === 1 ? one : many);
  if (c.type === "clients") {
    return {
      tagline: "people using the app",
      job: `Phones and browsers sending requests: mostly page reads, some writes. Each one waits up to ${c.timeoutMs ?? "?"} ms for an answer, then gives up.`,
      without: "Nothing to serve. This box is the traffic the rest of the design must keep up with.",
      frontend: "Your users' browsers calling fetch(). The timeout is like an AbortController that fires after that many ms.",
    };
  }
  if (c.type === "lb") {
    const how =
      c.strategy === "least-connections"
        ? "sends each request to the server with the fewest unfinished requests"
        : c.strategy === "two-choices"
          ? "picks two servers at random and sends each request to the less busy one"
          : "hands requests to the servers in turn";
    const extra = [
      c.sticky ? "It sends each user back to the same server every time (sticky sessions)." : "",
      c.healthCheckMs ? `Every ${c.healthCheckMs / 1000} s it checks each server and stops sending to one that doesn't answer.` : "",
      c.rateLimit ? `It also turns away a user who sends more than ${c.rateLimit.perSecond} requests a second (HTTP 429).` : "",
    ].filter(Boolean);
    return {
      tagline: "spreads requests",
      job: `One public address in front of several identical servers. It ${how}. ${extra.join(" ")}`.trim(),
      without: "Users would need to know each server's address, one busy server couldn't share its load, and a dead server would keep getting requests.",
      frontend: "Like a CDN or DNS picking which edge server answers your fetch: you call one URL, many machines stand behind it.",
    };
  }
  if (c.type === "queue") {
    return {
      tagline: "holds slow work for later",
      job: `A to-do list of jobs. ${by} ${verb("adds", "add")} a job and ${verb("answers", "answer")} the user at once; ${plural(c.consumers ?? 1, "worker")} take jobs off the list and do them in the background.`,
      without: "The slow work would happen inside the request, so every user would wait for it, and a slow downstream would make the whole site slow.",
      frontend: "Like handing heavy work to a Web Worker or a background sync instead of blocking the UI thread: the click returns now, the work finishes later.",
    };
  }
  switch (c.role) {
    case "app":
      return {
        tagline: c.replicas > 1 ? "runs your code, many copies" : "runs your code",
        job: `Runs the application code: reads the request, calls the stores behind it, and builds the answer.${
          c.replicas > 1 ? ` There are ${c.replicas} identical copies, so any of them can answer anyone.` : ""
        }${c.sessions === "local" ? " Each copy keeps logged-in users in its own memory." : c.sessions === "shared" ? " It keeps nothing between requests: logins live in the session store." : ""}`,
        without: "Nothing would turn a request into a page. With too few copies, requests queue for a free worker and everyone waits.",
        frontend: "Your API route handlers (a Next.js or Express server), running on several machines at once.",
      };
    case "store":
      return {
        tagline: "remembers who is logged in",
        job: `A small, fast store of logged-in sessions. ${by} ${verb("looks", "look")} up the user here on every request, so it doesn't matter which app server answers.`,
        without: "Each app server would have to remember its own users, so losing or adding a server would log people out.",
        frontend: "Like a server-side cookie jar: the browser sends a session id, and any server can look up who you are.",
      };
    case "cache":
      return {
        tagline: "answers popular reads from memory",
        job: `Keeps recent answers in memory${c.capacity ? ` (up to ${n(c.capacity)} items)` : ""}. ${by} ${verb("asks", "ask")} here first; only a miss goes on to the database.${
          c.ttlMs ? ` An entry is thrown away after ${c.ttlMs / 1000} s.` : ""
        }`,
        without: "Every read would hit the database, which is slower and fills up first.",
        frontend: "Like React Query or SWR caching a response: repeat requests are answered instantly, and an old entry can show stale data until it is refreshed.",
      };
    case "cdn":
      return {
        tagline: "serves files near users",
        job: "Copies of static files (images, scripts, styles) on servers close to users, so those files don't cross the world or load the app servers.",
        without: "Every image and script would come from the app servers far away: slower pages and more load.",
        frontend: "Exactly the CDN in front of your bundle and images.",
      };
    case "external":
      return {
        tagline: "an outside service",
        job: `${c.label}: a service run by someone else that this design calls. You can't make it faster; you can only wait for it, limit how many calls you make, or call it from the background.`,
        without: "The feature it provides (for example sending email) wouldn't happen.",
        frontend: "A third-party API you fetch, like Stripe or SendGrid: its speed and outages are out of your hands.",
      };
    case "database": {
      const copies = c.shards && c.shards > 1 ? 0 : c.replicas - 1;
      return {
        tagline: c.shards && c.shards > 1 ? "stores the data, split up" : copies > 0 ? "stores the data, with copies" : "stores the data",
        job: `Keeps the data on disk so it survives restarts.${
          c.shards && c.shards > 1
            ? ` The data is split into ${c.shards} shards, each holding a slice of the keys, so writes are shared out.`
            : copies > 0
              ? ` One primary takes every write and ${plural(copies, "read copy", "read copies")} take reads. Copies trail the primary by about ${c.lagMs ?? 0} ms, so a read can be a little out of date.`
              : ""
        }${c.machine ? ` It shares a machine with ${c.machine}, so they take turns on the same CPU.` : ""}`,
        without: "Nothing would be saved: every restart would lose everyone's data.",
        frontend: "The source of truth behind your API, like the server's copy of state that the client only caches.",
      };
    }
  }
  return { tagline: c.label, job: c.label, without: "", frontend: "" };
}

/** What flows along a link, in words, for its label. */
export function linkNoun(to: ComponentView): string {
  if (to.type === "lb") return "requests";
  if (to.type === "queue") return "jobs";
  switch (to.role) {
    case "store":
      return "session lookups";
    case "cache":
      return "cache lookups";
    case "database":
      return "queries";
    case "external":
      return "calls";
    case "cdn":
      return "file requests";
    default:
      return "requests";
  }
}

const busy = (x: number): Tone => (x >= 0.9 ? "bad" : x >= 0.7 ? "warn" : "ok");

/** Each of a box's numbers right now, said as a sentence with a reason for its colour. */
export function metricWords(c: ComponentView, frame: Frame): MetricLine[] {
  if (c.type === "clients") {
    const f = frame.clients;
    const errors = f.rejected + f.failed + f.timedOut;
    const lines: MetricLine[] = [
      { name: "Requests", value: `${n(f.sent * 10)}/s`, says: `Users are sending about ${n(f.sent * 10)} requests every second.`, tone: "info" },
    ];
    if (f.p50 >= 0) {
      const slow = f.p99 > 1000 ? "bad" : f.p99 > 300 ? "warn" : "ok";
      lines.push({
        name: "Wait (p50 / p99)",
        value: `${Math.round(f.p50)} / ${Math.round(f.p99)} ms`,
        says: `Half of users get their answer within ${Math.round(f.p50)} ms; the slowest 1 in 100 wait ${Math.round(f.p99)} ms. ${
          slow === "ok" ? "That feels instant." : slow === "warn" ? "The slowest users notice the delay." : "The slowest users wait over a second."
        }`,
        tone: slow,
      });
    } else lines.push({ name: "Wait", value: "none answered", says: "No request succeeded in this tenth of a second.", tone: "bad" });
    lines.push({
      name: "Errors",
      value: `${n(errors * 10)}/s`,
      says: errors ? `About ${n(errors * 10)} requests a second end in an error or a timeout: those users see a failure.` : "Every request is answered.",
      tone: errors ? "bad" : "ok",
    });
    if (f.stale > 0) lines.push({ name: "Old data", value: `${n(f.stale * 10)}/s`, says: `About ${n(f.stale * 10)} reads a second show an older value than the latest write.`, tone: "warn" });
    return lines;
  }
  if (c.type === "lb") {
    return [
      { name: "Strategy", value: c.strategy ?? "round-robin", says: guideFor(c, { name: "", components: [c], knobs: [] }).job, tone: "info" },
      ...(c.rateLimit
        ? [{ name: "Turned away (429)", value: `${n(frame.clients.throttled * 10)}/s`, says: `Requests refused because a user went over ${c.rateLimit.perSecond}/s.`, tone: (frame.clients.throttled ? "warn" : "ok") as Tone }]
        : []),
    ];
  }
  const s: StationFrame | undefined = frame.stations[c.id];
  if (!s) return [];
  const lines: MetricLine[] = [];
  const down = s.up.filter((u) => !u).length;
  if (s.up.length > 1 || down) {
    lines.push({
      name: "Machines up",
      value: `${s.up.length - down} of ${s.up.length}`,
      says: down ? `${plural(down, "machine is", "machines are")} down. Requests sent to ${down === 1 ? "it" : "them"} fail until the load balancer or the callers notice.` : "Every machine is running.",
      tone: down ? "bad" : "ok",
    });
  }
  if (c.type === "queue") {
    lines.push({
      name: "Workers busy",
      value: pct(s.util),
      says: `${pct(s.util)} of the ${c.consumers} workers are busy. ${s.util >= 0.9 ? "All of them are working, so new jobs have to wait." : "There is spare capacity."}`,
      tone: busy(s.util),
    });
    const backlog = s.backlog ?? 0;
    lines.push({
      name: "Waiting jobs",
      value: n(backlog),
      says: backlog ? `${n(backlog)} jobs are waiting; the oldest has waited ${((s.oldestMs ?? 0) / 1000).toFixed(1)} s. Users don't wait for them, but the work (an email, a thumbnail) arrives later.` : "No job is waiting.",
      tone: backlog > 100 ? "warn" : "ok",
    });
    return lines;
  }
  const what = c.role === "external" ? "calls in progress, out of what it allows" : "CPU in use";
  lines.push({
    name: c.role === "external" ? "In use" : "CPU",
    value: pct(s.util),
    says: `${pct(s.util)} ${what}. ${
      s.util >= 0.9 ? "Nearly full: requests start queueing, and waiting time shoots up." : s.util >= 0.7 ? "Getting busy: waits grow faster from here." : "Plenty of room."
    }`,
    tone: busy(s.util),
  });
  if (c.role !== "external") {
    lines.push({
      name: "Workers",
      value: pct(s.threads),
      says: `${pct(s.threads)} of its ${c.threads * c.replicas} request slots (threads or connections) are taken. ${
        s.threads >= 0.95 ? "All taken: new requests wait in line or are refused." : "Requests get a slot right away."
      }`,
      tone: busy(s.threads),
    });
  }
  if (s.queue > 0) lines.push({ name: "In line", value: n(s.queue), says: `${n(s.queue)} requests are waiting for a free slot.`, tone: s.queue > 50 ? "bad" : "warn" });
  if (s.hits !== undefined) {
    const total = s.hits + (s.misses ?? 0);
    const rate = total ? s.hits / total : 0;
    lines.push({
      name: "Hit rate",
      value: pct(rate),
      says: total ? `${pct(rate)} of lookups are answered from memory. The other ${pct(1 - rate)} go on to the database.` : "No lookups right now.",
      tone: rate >= 0.8 ? "ok" : rate >= 0.5 ? "warn" : "bad",
    });
  }
  if (c.role === "database" && s.replicaUtil.length > 1 && !(c.shards && c.shards > 1)) {
    lines.push({
      name: "Primary",
      value: pct(s.replicaUtil[0]),
      says: `The primary, which takes every write, is ${pct(s.replicaUtil[0])} busy. Adding read copies doesn't help it: only fewer or cheaper writes do.`,
      tone: busy(s.replicaUtil[0]),
    });
  }
  if (c.shards && c.shards > 1) {
    const hot = Math.max(...s.replicaUtil);
    lines.push({ name: "Hottest shard", value: pct(hot), says: `The busiest shard is ${pct(hot)} busy; if one shard gets most of the traffic, it fills while the others idle.`, tone: busy(hot) });
  }
  if (s.rejected + s.failed > 0) {
    lines.push({ name: "Refused or failed", value: `${n((s.rejected + s.failed) * 10)}/s`, says: "Requests it refused because it was full, or that failed here.", tone: "bad" });
  }
  return lines;
}

// ---------- one request as a waterfall ----------

export const ms = (x: number) => (x >= 10 ? `${Math.round(x)} ms` : `${Math.round(x * 10) / 10} ms`);

export type Segment = { from: number; to: number; kind: "line" | "cpu" | "work" | "downstream" | "net" };
export type WaterRow = { label: string; at: string; start: number; end: number; segments: Segment[]; outcome: string; words: string };

/** The rows of a request's waterfall, times in ms from when it was sent. */
export function waterfall(j: Journey, d: DesignView): WaterRow[] {
  const label = (id: string) => d.components.find((c) => c.id === id)?.label ?? id;
  const rows = j.hops.map((h) => {
    const rel = (t: number) => t - j.sent;
    const segments: Segment[] = [];
    const add = (a: number, b: number, kind: Segment["kind"]) => {
      if (a >= 0 && b > a) segments.push({ from: rel(a), to: rel(b), kind });
    };
    add(h.arrive, h.start, "line");
    add(h.start, h.cpuStart, "cpu");
    add(h.cpuStart, h.cpuEnd, "work");
    add(h.cpuEnd, h.end, "downstream");
    const parts: string[] = [];
    if (h.start < 0) parts.push(h.end < 0 ? "still waiting for a free slot" : h.outcome === "rejected" ? "full, so it refused the request at once" : "down, so the connection failed");
    else {
      if (h.start - h.arrive > 0.05) parts.push(`waited ${ms(h.start - h.arrive)} in line for a free slot`);
      if (h.cpuStart >= 0 && h.cpuStart - h.start > 0.05) parts.push(`${ms(h.cpuStart - h.start)} for a CPU core`);
      if (h.cpuEnd >= 0) parts.push(`worked ${ms(h.cpuEnd - h.cpuStart)}`);
      if (h.end >= 0 && h.cpuEnd >= 0 && h.end - h.cpuEnd > 0.05) parts.push(`then waited ${ms(h.end - h.cpuEnd)} for the stops after it`);
    }
    const end = h.end >= 0 ? rel(h.end) : rel(j.end >= 0 ? j.end : h.arrive);
    return { label: label(h.station), at: h.at, start: rel(h.arrive), end, segments, outcome: h.outcome, words: parts.join(", ") };
  });
  // The trip over the internet, before the first stop and after the last: often most of the time.
  const net = (from: number, to: number, words: string): WaterRow => ({ label: "Internet", at: "network", start: from, end: to, segments: [{ from, to, kind: "net" }], outcome: "ok", words });
  const first = rows.length ? Math.min(...rows.map((r) => r.start)) : 0;
  const last = rows.length ? Math.max(...rows.map((r) => r.end)) : 0;
  const total = j.end >= 0 ? j.end - j.sent : last;
  const out: WaterRow[] = [];
  if (first > 0.5) out.push(net(0, first, `${ms(first)} for the request to travel from the user's device to the data center`));
  out.push(...rows);
  if (total - last > 0.5) out.push(net(last, total, `${ms(total - last)} for the answer to travel back to the user`));
  return out;
}

