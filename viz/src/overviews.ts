// What each tab and each sidebar group is for, shown on the tab's overview page and as the
// group heading's tooltip. Each topic's own one-liner comes from its lesson (see sim/intro.ts).

import type { TabId } from "./sidebarTabs.ts";

export type TabIntro = { title: string; what: string; solves: string; howToUse: string };

export const TAB_INTROS: Record<TabId, TabIntro> = {
  algorithms: {
    title: "Algorithms",
    what: "The NeetCode 150: classic coding-interview problems, each solved once in its best-known way and played step by step so you can watch the data structure change.",
    solves: "Coding rounds test whether you can spot which technique a problem needs and write it without bugs under time pressure. The problems are grouped by technique, so each group trains one way of seeing a problem.",
    howToUse: "Work a group from top to bottom. Read the problem, guess the technique and its cost, then play the solution and check the Intuition tab for why it works.",
  },
  blocks: {
    title: "Building blocks",
    what: "The parts real systems are assembled from: ways to split data across machines, to count and test membership cheaply, to store data on disk, to control traffic, to copy data and agree on it, and to keep work consistent across services.",
    solves: "Every large design reduces to a handful of these. Knowing each one's job, its cost and the way it fails lets you pick the right one in a design and defend that choice.",
    howToUse: "Each lesson starts with what the block is and when to use it, shows the naive version breaking, then builds the real one. Play the scenarios and answer the questions at the end.",
  },
  design: {
    title: "System design",
    what: "Whole systems, simulated under real traffic: case studies such as a URL shortener, a chat app or a payments ledger, and the patterns that keep a set of microservices working when one of them is slow or down.",
    solves: "Design interviews and real architecture work both ask the same thing: given a load and a budget, which design survives, what does it cost, and what breaks first. Here you watch each design meet its traffic and fail before you fix it.",
    howToUse: "Each case study grows in stages. Read the opener for what makes the problem hard, play stage 1 to see it break, then step through the stages. Use the chaos bar to kill machines and see what the design survives.",
  },
  code: {
    title: "Code design",
    what: "Design at the level of classes and APIs: object-oriented interview problems such as a parking lot or an LRU cache, and the API and data-model decisions every backend makes, such as pagination, idempotency and schema design.",
    solves: "Low-level design rounds check whether you can turn a fuzzy spec into clean classes with clear state and rules. API design mistakes are the hardest to undo once clients depend on them, so knowing the standard answers saves real outages.",
    howToUse: "Each topic shows a naive version going wrong in a scenario, then the design that fixes it. Read the code panel alongside the lesson; play links jump to the line that matters.",
  },
  practice: {
    title: "Practice",
    what: "Exercises that test you instead of showing you: back-of-the-envelope estimates, failure diagnosis on a live simulation, and flashcards for the facts worth knowing by heart.",
    solves: "Reading a lesson feels like learning; recalling it under pressure is what an interview and an incident ask for. These turn what the other tabs teach into answers you can produce on the spot.",
    howToUse: "Estimation: type your number with a unit, then compare your steps with the worked ones. Failure drills: watch the symptoms, pick a cause, then see the fix play. Flashcards: mark each card; missed cards come back sooner.",
  },
};

export const GROUP_INTROS: Record<string, string> = {
  // Algorithms (NeetCode folders)
  "01-arrays-hashing": "Use a hash map or set to remember what you have seen, turning repeated searches into one pass. Reach for it when a problem asks about duplicates, counts, pairs or groups.",
  "02-two-pointers": "Two indexes walk a sorted array or a string from both ends (or at two speeds), so one pass replaces a nested loop. Reach for it on sorted input, pairs that must sum to a target, or palindromes.",
  "03-sliding-window": "Keep a window over a contiguous range and slide it, updating a running state instead of recomputing. Reach for it when the answer is the best substring or subarray under some limit.",
  "04-stack": "A stack keeps the items still waiting for their match. Reach for it on nested brackets, expression evaluation, and \"next greater element\" questions (a monotonic stack).",
  "05-binary-search": "Halve the search range each step, on a sorted array or on the answer itself. Reach for it when the input is sorted or when you can test \"is X big enough?\" and the answer flips once.",
  "06-linked-list": "Pointer surgery on nodes: reversing, merging, finding the middle or a cycle with fast and slow pointers. A dummy head node removes most edge cases.",
  "07-trees": "Recursion over binary trees: depth-first for paths and subtree facts, breadth-first for levels. Most answers combine what the two subtrees return.",
  "08-tries": "A tree of characters where shared prefixes share nodes. Reach for it on prefix search, autocomplete and word games over a dictionary.",
  "09-heap-priority-queue": "A heap hands back the smallest (or largest) item in O(log n). Reach for it on top-k, k-way merge, scheduling, and running medians with two heaps.",
  "10-backtracking": "Build a candidate one choice at a time and undo the choice when it cannot work. Reach for it when asked for all subsets, permutations or arrangements that satisfy rules.",
  "11-graphs": "Breadth-first or depth-first search over a grid or graph, plus union-find and topological sort. Reach for it on islands, connectivity, shortest unweighted paths and dependency order.",
  "12-advanced-graphs": "Weighted shortest paths (Dijkstra, Bellman-Ford), minimum spanning trees and Eulerian paths. Reach for it when edges have costs.",
  "13-1d-dynamic-programming": "Each answer is built from smaller answers along one index, stored so nothing is solved twice. Reach for it when a choice at each step depends on the best of earlier steps.",
  "14-2d-dynamic-programming": "Dynamic programming over two indexes, such as two strings or a grid. Reach for it on edit distance, common subsequences, paths in a grid and knapsack-style limits.",
  "15-greedy": "Take the best-looking choice now and never undo it, when you can argue no later choice beats it. Reach for it on jump games, intervals and scheduling.",
  "16-intervals": "Sort intervals by start (or end), then sweep once to merge, insert or count overlaps.",
  "17-math-geometry": "Matrix walks, digit tricks and fast power. Mostly careful index work rather than a big idea.",
  "18-bit-manipulation": "Use the bits of an integer directly: XOR to cancel pairs, masks to test and set bits, shifts to count.",

  // Building blocks
  "sd-01-partitioning": "Split keys or places across many machines so each holds a fair share, and move as little data as possible when machines come and go. Covers hash rings, rendezvous hashing, and geohashes and quadtrees for location data.",
  "sd-02-probabilistic": "Answer \"have we seen it?\", \"how often?\" and \"how many distinct?\" over huge streams in a few kilobytes, by accepting a small, bounded error.",
  "sd-03-storage": "How a database keeps data on disk without losing it in a crash, and the two main layouts: LSM trees, which are fast to write, and B+ trees, which are fast to read. Plus Merkle trees for finding which copies differ.",
  "sd-04-traffic": "Keep a service alive under too much traffic or a failing dependency: rate limiters, load balancing, retries with backoff and jitter, and circuit breakers.",
  "sd-05-replication": "Keep copies of data on several machines, and make them agree on order and on who is in charge: leaders and followers, quorums, vector clocks, Raft, gossip, and leases with fencing tokens.",
  "sd-06-transactions-messaging": "Make a change that spans services or a database plus a queue happen fully or not at all: two-phase commit, sagas, the outbox pattern with idempotent consumers, and Kafka's partitions and consumer groups.",

  // System design
  "sd-architectures#web": "Where every design starts: one web app grown to many machines, and small services (a link shortener, a paste site, a public API) that teach caching, ID generation and rate limits.",
  "sd-architectures#reads": "Systems where reads far outnumber writes and must be fast: feeds, search suggestions, counters, leaderboards, social graphs, nearby search and photo sharing. The work is deciding what to precompute and what to cache.",
  "sd-architectures#realtime": "Systems that push to users within seconds: notifications, chat, ride matching and live comments. The work is holding many open connections and fanning one event out to many people.",
  "sd-architectures#money": "Systems where a mistake costs money or oversells stock: checkout, flash sales, ledgers, ticket booking and an exchange's order book. The work is correctness under contention and retries.",
  "sd-architectures#pipelines": "Systems that move large volumes of work in the background: a web crawler, metrics and logs, ad-click counts, a job scheduler and email sending. The work is queues, batching, backpressure and exactly-once counting.",
  "sd-architectures#storage": "Systems built around storing data: video, file sync, a distributed cache, a key-value store, and running across regions. The work is placement, replication and surviving the loss of a whole site.",
  "sd-microservices": "What changes when one app becomes many services talking over a network: every call can be slow or fail, so latency adds up, failures spread, and retries can make an outage worse. Each lesson shows one failure and the pattern that contains it.",

  // Code design
  "sd-low-level-design": "Object-oriented design problems from interviews: turn a spec into classes with clear state and rules, then prove the rules hold. Covers parking lots, caches, rate limiters, elevators, transactions, event buses, schedulers, expense splitting and state machines.",
  "sd-api-design": "The decisions behind a backend API and its data: how resources are named, how lists page, how retries stay safe, how concurrent edits are caught, how an API changes without breaking clients, and how tables and indexes match the queries.",

  // Practice
  "sd-drills-estimation": "Back-of-the-envelope maths: storage, traffic, machines, shards and cost from a few assumptions. Graded as right when within a factor of 2 or 3 (each drill says which), which is the precision a design decision needs.",
  "sd-drills-failure": "A simulated system misbehaves and the real cause is hidden. Read the symptoms, pick the cause, then watch the fixed design run side by side.",
  "sd-drills-flashcards": "Short recall cards for the numbers and facts worth knowing cold: latencies, replication, storage engines, traffic control, messaging and staff-level judgement. Each card links to the lesson behind it.",
};

/** What the reader does on each practice screen, shown above the drill. */
export const DRILL_INTROS = {
  estimation: "Estimate the answer from the assumptions, type it with a unit (for example 40 TB or 3k), then compare your reasoning with the worked steps. Within the drill's stated factor (2x or 3x) counts as right.",
  failure: "This system has one problem. Watch the charts and callouts, decide what is causing it, then pick an answer to see the cause and the fix run side by side.",
  flashcards: "Say the answer before you flip. Mark each card honestly: missed cards come back sooner, known ones less often.",
} as const;
/** Phones have no simulation to watch, so the failure drill is read instead. */
export const FAILURE_INTRO_PHONE =
  "This system has one problem. Read the setup and the symptoms, decide what is causing it, then pick an answer to see the cause and the fix.";
