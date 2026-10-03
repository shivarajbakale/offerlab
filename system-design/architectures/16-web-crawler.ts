/**
 * 16. Web Crawler
 * Level: Senior
 * Group: Architectures
 *
 * Problem: Download a large share of the web, find new links in every page, and come back
 *   to pages as they change. Every fetch waits on someone else's server, which may take a
 *   second or more to answer. The same links are found again and again. A few large sites hold
 *   a big share of all URLs, and fetching from them too fast overloads them.
 *
 * Approach: Separate deciding what to fetch from fetching it
 *   1. A server fetches each URL while its caller waits. 2. A frontier: links are checked
 *   against the set of URLs already seen, new ones go on a queue, and many fetches are in
 *   flight at once; one large host gets 30% of them and is overloaded. 3. Politeness: that
 *   host's URLs wait in their own queue with a fixed budget of connections. Pages five times
 *   bigger fill the internet link. 4. Every fetched page schedules its own recrawl as a
 *   delayed job; recrawling every page when due makes the fetch rate grow with every delay
 *   period. 5. A fixed recrawl budget: the fetch rate levels off and due recrawls wait.
 *
 * Cost: fetching inside requests: 100 workers held ~0.6 s each manage ~170 URLs a second,
 *   with the CPUs ~10% busy. The frontier fetches 400 new pages a second with up to 250 fetches
 *   in flight (~160 in use); its dedup check is 2,000 lookups a second, five for every page
 *   fetched. A host that can serve ~100 pages a second, asked for ~120, is pinned at 100%; with
 *   10 connections it is about a third busy and its URLs wait in our queue instead. The polite
 *   crawl's ~300 pages a second use ~25% of a 1 Gbps link at 100 KB; at 500 KB they need
 *   ~1.2 Gbps. Recrawling every page when due grows the rate every period (from ~340 to over
 *   1,050 a second in 14 s) until the link fills; a budget of ~100 recrawls a second levels it
 *   off at ~370-440 while the due recrawls pile up in their queue.
 *
 * Pattern: work queue (frontier), per-host queues (politeness), delayed jobs, dedup set
 * Key insight: A fetch is mostly waiting, so throughput is "fetches in flight / time per
 *   fetch", and the number in flight must not be capped by threads blocked on slow sites. What
 *   to fetch next is a scheduling decision made before the fetch: which URLs are new, which
 *   host may take another request now, and which pages are due again.
 * Tradeoffs: Per-host limits make big sites slow to crawl, by design. A Bloom filter for the
 *   seen set saves memory and lookups but now and then skips a new URL it wrongly believes it
 *   has seen. Recrawling often keeps the index fresh and costs fetches you could spend on new pages.
 * Staff notes: Respect robots.txt and back off on 429 and 503 answers. Budget fetches between
 *   new pages and recrawls explicitly. Normalize URLs before dedup (case, trailing slashes,
 *   tracking parameters) and dedup content by fingerprint too, because many URLs serve the
 *   same page. Cap page size and time per fetch so a few huge or slow pages cannot hold the
 *   fetchers.
 * Interview signals: "design a web crawler", "Googlebot", "frontier", "politeness",
 *   "robots.txt", "dedup billions of URLs", "recrawl schedule", "crawler traps".
 * Real world: The Mercator crawler (Heydon and Najork, 1999) split its frontier into per-host
 *   queues so that each host is fetched by only one thread at a time. Common Crawl regularly
 *   publishes crawls of billions of pages. robots.txt was standardized as RFC 9309 in 2022.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { clients, database, design, external, knob, loadBalancer, queue, run, server, summary } from "../traffic/index.ts";

// Other people's servers: a typical site answers in about 0.5 s. One large host (a big wiki,
// say) answers in 0.2 s but serves at most 20 requests at once: about 100 pages a second.
const web = () => external({ label: "Websites", latencyMs: 500, concurrency: 10_000 });
const bigHost = () => external({ label: "One large host", latencyMs: 200, concurrency: 20 });
// Every page comes in through our internet link, 1 Gbps. A page is 100 KB on average (a knob).
// The simulator limits a machine's outgoing bandwidth, so the link is a gateway machine whose
// answers to the fetchers carry the pages.
const gateway = () =>
  server({
    label: "Internet gateway (1 Gbps)",
    cores: 4,
    threads: 5000,
    queue: 5000,
    serviceMs: { read: 0.05, write: 0.05 },
    calls: { read: ["web"], write: ["bigHost"] },
    bandwidthMbps: knob("linkMbps", 1000, [100, 10_000]),
    bytes: { read: knob("pageBytes", 100_000, [10_000, 1_000_000]), write: knob("pageBytes", 100_000, [10_000, 1_000_000]) },
  });
// Pages are saved to object storage, about 20 ms a write.
const pageStore = () => external({ label: "Page store (object storage)", latencyMs: 20 });

// @why Stage 1: the scheduler sends 400 URLs a second to a crawler server, which fetches each
// @why one while the scheduler waits. A worker is held for the whole fetch.
export const inRequest = design("1. Fetch inside the request", {
  scheduler: clients({ to: "lb", qps: 400, mix: { read: 1, write: 0 }, hopMs: 1, timeoutMs: 5000 }),
  lb: loadBalancer({ to: "crawler" }),
  crawler: server({ label: "Crawler", replicas: 2, cores: 4, threads: 50, serviceMs: { read: 5, write: 5 }, calls: ["gateway", "store"] }),
  gateway: gateway(),
  web: web(),
  bigHost: bigHost(),
  store: pageStore(),
});

// From stage 2 on, the input is what the parsers find in fetched pages: 2,000 links a second.
// 80% of them were seen before, so 400 a second are new; 30% of the new ones are on the large host.
const links = () => clients({ to: "lb", qps: 2000, mix: { read: 0, write: 1 }, hopMs: 1 });
// The seen-URL set: "insert this URL unless it is there", 0.5 ms on a 4-core store.
const seen = () => database({ label: "Seen URLs", cores: 4, readMs: 0.5, writeMs: 0.5, connections: 100 });
// Fetchers do the I/O without a thread per fetch, so thousands can be in flight; parsing a page
// costs 5 ms of CPU. A frontier job is one fetch: the consumer waits for the fetcher's answer,
// so consumers count the fetches in flight. Fetches for the large host arrive as "write"
// requests, only so they can go their own way through the gateway.
const fetchers = (read: string[]) =>
  server({ label: "Fetchers", replicas: 2, cores: 8, threads: 2000, queue: 2000, serviceMs: { read: 5, write: 5 }, calls: { read, write: ["gateway", "store"] } });
// 20% of links are new, and 70% of those are not on the large host: 0.14 jobs per link.
const frontier = () => queue({ label: "Frontier", consumers: knob("fetches", 250, [10, 2000]), workMs: 1, to: "fetchers", kind: "read", fanout: 0.14 });
const hostQueue = (connections: number) =>
  queue({ label: "Large host's queue", consumers: knob("hostConnections", connections, [1, 500]), workMs: 1, to: "fetchers", kind: "write", fanout: 0.06 });
const frontierApi = () => server({ label: "Frontier API", replicas: 2, cores: 4, serviceMs: { read: 0.2, write: 0.2 }, calls: ["seen", "frontier", "hostQueue"] });

const crawl = (name: string, connections: number, fetchSteps: string[], extra = {}) =>
  design(name, {
    links: links(),
    lb: loadBalancer({ to: "api" }),
    api: frontierApi(),
    seen: seen(),
    frontier: frontier(),
    hostQueue: hostQueue(connections),
    fetchers: fetchers(fetchSteps),
    gateway: gateway(),
    web: web(),
    bigHost: bigHost(),
    store: pageStore(),
    ...extra,
  });

// @why Stage 2: the frontier API checks each link against the seen set and queues only new URLs.
// @why Up to 250 fetches are in flight for most sites, and up to 500 for the large host: nothing
// @why stops us sending it as many requests as its URLs call for.
export const frontierQueue = crawl("2. A frontier queue, many fetches in flight", 500, ["gateway", "store"]);

// @why Stage 3: politeness. The large host's URLs wait in our queue, and at most 10 connections
// @why to it are open at once, whatever its share of the URLs.
export const polite = crawl("3. Politeness: 10 connections to the large host", 10, ["gateway", "store"]);

// @why Stage 4: every page fetched from most sites schedules its own recrawl as a delayed job:
// @why the job becomes visible 3 s later (standing in for days) and fetches the page again,
// @why which schedules the next recrawl. Recrawls are fetched as soon as they are due.
// @why (The large host's pages are left out of recrawls, to keep its queue as in stage 3.)
const recrawling = (share: number, name: string) =>
  crawl(name, 10, ["gateway", "store", "recrawl"], {
    recrawl: queue({ label: "Recrawl schedule", consumers: 600, workMs: 1, to: "fetchers", kind: "read", delayMs: 3000, fanout: knob("recrawlShare", share, [0, 1]) }),
  });
export const recrawlAll = recrawling(1, "4. Recrawl every page");
// @why Stage 5: the same schedule, but recrawls get a fixed budget: 60 fetches in flight, at most
// @why about 100 recrawls a second. Due recrawls beyond that wait in the queue; choosing which go first
// @why (pages that change often, or matter most) is the real crawler's job.
export const recrawlBudget = crawl("5. Recrawl on a budget", 10, ["gateway", "store", "recrawl"], {
  recrawl: queue({ label: "Recrawl schedule", consumers: knob("recrawlFetches", 60, [0, 600]), workMs: 1, to: "fetchers", kind: "read", delayMs: 3000, fanout: 1 }),
});

// --- helpers for the scenarios ---

const S = { seconds: 10, seed: 1 };

test("broken: fetching inside requests — workers wait on slow sites, CPUs idle", () => {
  const s = summary(run(inRequest, S), 3);
  // 100 workers, each held ~0.6 s per fetch: about 170 fetches a second, whatever the CPUs could do.
  assert.ok(s.ok > 150 && s.ok < 190, `fetched ${s.ok}`);
  assert.ok(s.threads.crawler > 0.98, `workers ${s.threads.crawler}`);
  assert.ok(s.util.crawler < 0.15, `cpu ${s.util.crawler}`);
  assert.ok(s.errorRate > 0.5 && s.errorRate < 0.65, `errors ${s.errorRate}`);
});

test("broken: no politeness — the large host is pinned at 100%", () => {
  const r = run(frontierQueue, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  // 2,000 links a second, every one checked against the seen set; 400 new URLs fetched.
  assert.ok(Math.abs(s.calls.seen - 2000) < 100, `dedup lookups ${s.calls.seen}`);
  assert.ok(s.util.seen > 0.2 && s.util.seen < 0.3, `seen store ${s.util.seen}`);
  assert.ok(Math.abs(s.calls.fetchers - 400) < 30, `fetches ${s.calls.fetchers}`);
  // We ask the large host for ~120 pages a second; it can serve ~100.
  assert.ok(s.calls.bigHost > 110 && s.calls.bigHost < 125, `large host ${s.calls.bigHost}`);
  assert.ok(s.util.bigHost > 0.98, `large host busy ${s.util.bigHost}`);
  assert.ok(summary(r, 9.9, 10).queue.bigHost > 50, `waiting at the large host ${summary(r, 9.9, 10).queue.bigHost}`);
  // Most sites are unaffected: about 160 of the 250 fetch slots in use, the link under a third full.
  assert.ok(s.util.frontier > 0.55 && s.util.frontier < 0.7, `frontier consumers ${s.util.frontier}`);
  assert.ok(s.nicUtil.gateway > 0.25 && s.nicUtil.gateway < 0.35, `link ${s.nicUtil.gateway}`);
});

test("polite: the large host a third busy; its URLs wait in our queue", () => {
  const r = run(polite, S);
  const s = summary(r, 3);
  assert.equal(s.errorRate, 0);
  assert.ok(s.util.bigHost > 0.3 && s.util.bigHost < 0.45, `large host busy ${s.util.bigHost}`);
  assert.ok(s.calls.bigHost > 32 && s.calls.bigHost < 42, `large host fetches ${s.calls.bigHost}`);
  // About 300 pages a second in all; at 100 KB that is about a quarter of the link.
  assert.ok(s.calls.fetchers > 290 && s.calls.fetchers < 320, `fetches ${s.calls.fetchers}`);
  assert.ok(s.nicUtil.gateway > 0.2 && s.nicUtil.gateway < 0.3, `link ${s.nicUtil.gateway}`);
  const end = summary(r, 9.9, 10);
  assert.equal(end.queue.bigHost, 0);
  assert.ok(end.backlog.hostQueue > 600 && end.oldestMs.hostQueue > 5000, `our queue ${end.backlog.hostQueue}, ${end.oldestMs.hostQueue}`);
  assert.equal(end.backlog.frontier, 0);
});

test("broken: pages five times bigger — the internet link is full", () => {
  const r = run(polite, { ...S, knobs: { pageBytes: 500_000 } });
  const s = summary(r, 3);
  // ~300 pages a second x 500 KB = ~1.2 Gbps for a 1 Gbps link.
  assert.ok(s.nicUtil.gateway > 0.98, `link ${s.nicUtil.gateway}`);
  assert.ok(s.util.frontier > 0.98, `frontier consumers ${s.util.frontier}`);
  assert.ok(s.calls.fetchers < 280, `fetches ${s.calls.fetchers}`);
  const end = summary(r, 9.9, 10);
  assert.ok(end.backlog.frontier > 200 && end.oldestMs.frontier > 1000, `frontier ${end.backlog.frontier}, ${end.oldestMs.frontier}`);
});

// Fetches a second, the link's use and recrawls waiting, in windows of the run.
const windows: [number, number][] = [[1, 3], [4, 6], [7, 9], [10, 12], [13, 14]];

test("broken: recrawling every page — fetches grow every period, and the link fills", () => {
  const r = run(recrawlAll, { ...S, seconds: 14 });
  const rates = windows.map(([a, b]) => summary(r, a, b).calls.fetchers);
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] > rates[i - 1] * 1.1, `fetches ${rates}`);
  // The first delay period adds about the new-page rate again; later ones less, as the link fills.
  assert.ok(rates[1] - rates[0] > 240 && rates[1] - rates[0] < 330, `first period adds ${rates[1] - rates[0]}`);
  assert.ok(rates[4] > 1050, `fetches at the end ${rates}`);
  const end = summary(r, 13, 14);
  assert.ok(end.nicUtil.gateway > 0.85, `link ${end.nicUtil.gateway}`);
  assert.ok(end.scheduled.recrawl > 2800, `pending recrawls ${end.scheduled.recrawl}`);
});

test("recrawl on a budget: the fetch rate levels off, and due recrawls wait their turn", () => {
  const r = run(recrawlBudget, { ...S, seconds: 14 });
  const rates = windows.map(([a, b]) => summary(r, a, b).calls.fetchers);
  // Before recrawls come due: ~340 a second. After: about 100 more, and it stays there.
  assert.ok(rates[0] > 320 && rates[0] < 360, `${rates}`);
  assert.ok(rates.slice(1).every((x) => x > 370 && x < 440), `${rates}`);
  const mid = summary(r, 7, 8);
  const end = summary(r, 13, 14);
  assert.equal(end.errorRate, 0);
  assert.ok(end.nicUtil.gateway < 0.4, `link ${end.nicUtil.gateway}`);
  // Every fetch still schedules a recrawl; the budget fetches only some, so due ones pile up.
  assert.ok(mid.backlog.recrawl > 700 && mid.backlog.recrawl < 1200, `due recrawls at 8 s ${mid.backlog.recrawl}`);
  assert.ok(end.backlog.recrawl > 2300, `due recrawls at 14 s ${end.backlog.recrawl}`);
  assert.ok(end.oldestMs.recrawl > 5000, `oldest due recrawl ${end.oldestMs.recrawl}`);
});
