// The Blocks tab's map: one request's trip through a typical system, with the building blocks that
// solve the problems at each stop, plus "which one when" for every group. Pure data.

export type Stop = { title: string; says: string; blocks: string[] };

const B = {
  ring: "sd-01-partitioning/001-consistent-hashing",
  rendezvous: "sd-01-partitioning/002-rendezvous-hashing",
  geohash: "sd-01-partitioning/003-geohash",
  quadtree: "sd-01-partitioning/004-quadtree",
  bloom: "sd-02-probabilistic/005-bloom-filter",
  cms: "sd-02-probabilistic/006-count-min-sketch",
  hll: "sd-02-probabilistic/007-hyperloglog",
  wal: "sd-03-storage/008-write-ahead-log",
  lsm: "sd-03-storage/009-lsm-tree",
  btree: "sd-03-storage/010-b-plus-tree",
  merkle: "sd-03-storage/011-merkle-tree",
  bucket: "sd-04-traffic/012-token-and-leaky-bucket",
  window: "sd-04-traffic/013-window-rate-limiters",
  lb: "sd-04-traffic/014-load-balancing",
  retry: "sd-04-traffic/015-retry-backoff-jitter",
  breaker: "sd-04-traffic/016-circuit-breaker",
  leader: "sd-05-replication/017-leader-follower-replication",
  quorum: "sd-05-replication/018-quorum-read-write",
  clocks: "sd-05-replication/019-vector-clocks",
  election: "sd-05-replication/020-raft-leader-election",
  raftLog: "sd-05-replication/021-raft-log-replication",
  gossip: "sd-05-replication/022-gossip-failure-detection",
  lease: "sd-05-replication/023-leases-and-fencing-tokens",
  twoPc: "sd-06-transactions-messaging/024-two-phase-commit",
  saga: "sd-06-transactions-messaging/025-saga-with-compensation",
  outbox: "sd-06-transactions-messaging/026-transactional-outbox-idempotent-consumer",
  kafka: "sd-06-transactions-messaging/027-kafka-partitions-consumer-groups",
};
export const BLOCK_IDS = B;

/** Words a beginner needs before any block makes sense. */
export const BASICS: { term: string; means: string }[] = [
  { term: "Server", means: "A computer in a data center that runs a program and waits for requests. A big app runs many of them." },
  { term: "Client", means: "Whatever sends the request: a phone app, a browser, or another server." },
  { term: "Request", means: "One message asking for one thing (\"show my feed\") and waiting for an answer, the response." },
  { term: "Latency", means: "How long one request takes, in milliseconds. Users notice anything above a few hundred." },
  { term: "Throughput", means: "How many requests per second a server or a whole system can handle." },
  { term: "Memory vs disk", means: "Memory is fast but is wiped when a machine restarts. Disk is slower but keeps data through a crash." },
  { term: "Copy (replica)", means: "The same data kept on another machine, so a crash loses nothing and reads can be shared." },
  { term: "Crash", means: "A machine stops suddenly: its memory is gone and requests to it get no answer." },
  { term: "Network partition", means: "Machines are fine, but some can't reach others, so each side thinks the other is dead." },
];

/** One request's trip, left to right, and the blocks that solve each stop's problems. */
export const STOPS: Stop[] = [
  { title: "Users", says: "Phones and browsers send requests: \"show my feed\", \"pay for this order\".", blocks: [] },
  { title: "Rate limiter", says: "Turns away a client that sends too much, so one noisy client can't slow everyone down.", blocks: [B.bucket, B.window] },
  { title: "Load balancer", says: "One address in front of many copies of the app. Picks which copy answers each request.", blocks: [B.lb] },
  { title: "App servers", says: "Run your code. Calls to other services can be slow or fail, and one order may touch several services.", blocks: [B.retry, B.breaker, B.twoPc, B.saga] },
  { title: "Cache", says: "Keeps popular answers in memory, spread over many machines by key, so the database isn't asked every time.", blocks: [B.ring, B.rendezvous, B.bloom] },
  { title: "Database", says: "Keeps data on disk so it survives crashes, with copies on other machines that take over if one dies.", blocks: [B.wal, B.lsm, B.btree, B.leader, B.quorum, B.election, B.raftLog, B.lease] },
  { title: "Queue", says: "Holds work for later, so a slow job (emails, video processing) doesn't keep the user waiting.", blocks: [B.outbox, B.kafka] },
  { title: "Workers", says: "Background machines that process the queue and crunch numbers: views, unique visitors, trending items.", blocks: [B.cms, B.hll] },
];

/** Things that happen across the whole system rather than at one stop. */
export const BEHIND: Stop[] = [
  { title: "Finding what's nearby", says: "Drivers near a rider, restaurants near you: split the map so you search only close-by cells.", blocks: [B.geohash, B.quadtree] },
  { title: "Keeping copies in sync", says: "Copies drift after crashes and concurrent edits; find what differs and which edit wins.", blocks: [B.merkle, B.clocks] },
  { title: "Noticing dead machines", says: "In a big cluster, machines watch each other instead of trusting one monitor.", blocks: [B.gossip] },
];

/** For each group: a need, and the block that meets it. */
export const CHOOSERS: Record<string, { need: string; pick: string }[]> = {
  "sd-01-partitioning": [
    { need: "Spread keys over servers that join and leave, moving as little as possible", pick: B.ring },
    { need: "Only a few servers, and you want a perfectly even split and easy replica choice", pick: B.rendezvous },
    { need: "Find things near a point with a simple grid of map cells", pick: B.geohash },
    { need: "Points are crowded in some places and sparse in others (cities vs countryside)", pick: B.quadtree },
  ],
  "sd-02-probabilistic": [
    { need: "Skip a slow lookup when an item is definitely new (\"is this username taken?\")", pick: B.bloom },
    { need: "Roughly how often each item shows up, for top-k or abuse detection", pick: B.cms },
    { need: "How many different visitors, in a few kilobytes", pick: B.hll },
  ],
  "sd-03-storage": [
    { need: "Never lose a write you already said \"done\" to, even if the power goes out", pick: B.wal },
    { need: "Lots of writes: logs, metrics, messages, time series", pick: B.lsm },
    { need: "Lots of reads and range queries, with updates in place", pick: B.btree },
    { need: "Find which parts of two huge copies differ without sending everything", pick: B.merkle },
  ],
  "sd-04-traffic": [
    { need: "Cap each client's rate but allow short bursts", pick: B.bucket },
    { need: "A simple \"N requests per minute\" quota", pick: B.window },
    { need: "Spread requests over many copies of a service", pick: B.lb },
    { need: "A call failed and may work if you try again later", pick: B.retry },
    { need: "A dependency is down: stop waiting on it and fail fast", pick: B.breaker },
  ],
  "sd-05-replication": [
    { need: "Scale reads and survive a dead server; a little lag is fine", pick: B.leader },
    { need: "Keep accepting writes while some copies are down", pick: B.quorum },
    { need: "Tell whether two edits happened at the same time", pick: B.clocks },
    { need: "Exactly one leader that everyone agrees on", pick: B.election },
    { need: "Every copy applies the same writes in the same order", pick: B.raftLog },
    { need: "Notice dead machines in a big cluster without a central monitor", pick: B.gossip },
    { need: "Stop an old leader that doesn't know it was replaced", pick: B.lease },
  ],
  "sd-06-transactions-messaging": [
    { need: "All or nothing across a few databases, and waiting a moment is fine", pick: B.twoPc },
    { need: "A long business flow across services (order, then payment, then shipping) with undo steps", pick: B.saga },
    { need: "Save to the database and publish an event without ever losing one of them", pick: B.outbox },
    { need: "A huge stream of events read by many consumers, in order per key", pick: B.kafka },
  ],
};
