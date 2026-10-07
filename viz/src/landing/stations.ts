// The landing page's route map: one line per sidebar tab, one station per topic it shows off.
// Every station opens a real topic; interchanges join stations that teach the same idea on two lines.

export type IllusKind =
  | "hashmap"
  | "pointers"
  | "window"
  | "tree"
  | "islands"
  | "dp"
  | "ring"
  | "bloom"
  | "bucket"
  | "raft"
  | "traffic"
  | "cache"
  | "fanout"
  | "lru"
  | "idempotency"
  | "estimate"
  | "retry"
  | "flashcard";

export type Station = {
  key: string;
  label: string;
  /** Problem id the station opens. */
  id: string;
  x: number;
  illus: IllusKind;
  /** One sentence: what you watch happen. */
  watch: string;
  /** Put the label under the line instead of over it (the line's own side otherwise). */
  below?: boolean;
};

export type Line = {
  key: string;
  name: string;
  /** What the count counts, from the README. */
  count: string;
  color: string;
  y: number;
  /** Where the line leaves the diagonal and runs flat. */
  flatFrom: number;
  overview: string;
  /** Which side of the line its station names sit on. */
  labels: "above" | "below";
  stations: Station[];
};

/** All lines leave from one hub: every lesson starts from first principles. */
export const HUB = { x: 64, y: 270 };

export const LINES: Line[] = [
  {
    key: "algorithms",
    name: "Algorithms",
    count: "150 problems",
    color: "var(--p0)",
    y: 70,
    flatFrom: 270,
    overview: "overview/algorithms",
    labels: "above",
    stations: [
      { key: "hashing", label: "Arrays & hashing", id: "01-arrays-hashing/003-two-sum", x: 360, illus: "hashmap", watch: "Two Sum: each number asks the map for its partner, one pass, no second loop." },
      { key: "pointers", label: "Two pointers", id: "02-two-pointers/011-two-sum-ii-input-array-is-sorted", x: 475, illus: "pointers", watch: "On a sorted array, the ends walk inward: too big, move right in; too small, move left in.", below: true },
      { key: "window", label: "Sliding window", id: "03-sliding-window/016-longest-substring-without-repeating-characters", x: 590, illus: "window", watch: "The window grows right and shrinks left the moment a letter repeats." },
      { key: "trees", label: "Trees", id: "07-trees/046-invert-binary-tree", x: 705, illus: "tree", watch: "Invert a tree: every node swaps its children, top to bottom.", below: true },
      { key: "graphs", label: "Graphs", id: "11-graphs/080-number-of-islands", x: 820, illus: "islands", watch: "Number of Islands: each new land cell floods its whole island before the count goes up." },
      { key: "dp", label: "1-D DP", id: "13-1d-dynamic-programming/099-climbing-stairs", x: 935, illus: "dp", watch: "Climbing Stairs: each step's ways are the two before it added together.", below: true },
    ],
  },
  {
    key: "blocks",
    name: "Building blocks",
    count: "27 primitives",
    color: "var(--p1)",
    y: 170,
    flatFrom: 200,
    overview: "overview/blocks",
    labels: "above",
    stations: [
      { key: "ring", label: "Consistent hashing", id: "sd-01-partitioning/001-consistent-hashing", x: 330, illus: "ring", watch: "Add a server to the ring and only the keys in its arc move." },
      { key: "bloom", label: "Bloom filter", id: "sd-02-probabilistic/005-bloom-filter", x: 465, illus: "bloom", watch: "Each word sets three bits; a lookup says 'maybe' only if all three are on." },
      { key: "bucket", label: "Rate limiting", id: "sd-04-traffic/012-token-and-leaky-bucket", x: 620, illus: "bucket", watch: "Requests spend tokens; when the bucket is empty they get a 429 until it refills." },
      { key: "raft", label: "Raft election", id: "sd-05-replication/020-raft-leader-election", x: 790, illus: "raft", watch: "The leader goes quiet, a follower times out, asks for votes and takes over." },
    ],
  },
  {
    key: "design",
    name: "System design",
    count: "31 case studies, 9 patterns",
    color: "var(--p2)",
    y: 270,
    flatFrom: 64,
    overview: "overview/design",
    labels: "below",
    stations: [
      { key: "scale", label: "Scale a web app", id: "sd-architectures/01-scale-a-web-app", x: 195, illus: "traffic", watch: "A server falls over and the load balancer routes around it." },
      { key: "cache", label: "Distributed cache", id: "sd-architectures/15-distributed-cache", x: 330, illus: "cache", watch: "Hits answer from memory; misses go to the database and fill the cache." },
      { key: "feed", label: "News feed", id: "sd-architectures/06-news-feed", x: 470, illus: "fanout", watch: "One post fans out into every follower's timeline." },
      { key: "limits", label: "Public API limits", id: "sd-architectures/04-public-api-rate-limits", x: 620, illus: "bucket", watch: "The same token bucket, now per API key, in front of the whole service." },
    ],
  },
  {
    key: "code",
    name: "Code design",
    count: "9 LLD, 9 API lessons",
    color: "var(--p3)",
    y: 370,
    flatFrom: 200,
    overview: "overview/code",
    labels: "above",
    stations: [
      { key: "lru", label: "LRU cache", id: "sd-low-level-design/02-lru-cache-with-ttl", x: 430, illus: "lru", watch: "Touching a key moves it to the front; a full cache drops the back." },
      { key: "limiter", label: "Rate limiter class", id: "sd-low-level-design/03-rate-limiter-class", x: 620, illus: "bucket", watch: "The token bucket as a class you would write in the interview." },
      { key: "idem", label: "Idempotency keys", id: "sd-api-design/02-idempotency-keys", x: 790, illus: "idempotency", watch: "The client retries the payment; the key makes the server answer once and charge once." },
    ],
  },
  {
    key: "practice",
    name: "Practice",
    count: "35 drills",
    color: "var(--p4)",
    y: 470,
    flatFrom: 270,
    overview: "overview/practice",
    labels: "above",
    stations: [
      { key: "estimate", label: "Estimation", id: "sd-drills-estimation/01-photo-storage-per-day", x: 430, illus: "estimate", watch: "500M users to about 1 PB a day, one multiplication at a time." },
      { key: "retry", label: "Failure drills", id: "sd-drills-failure/02-retry-storm", x: 620, illus: "retry", watch: "Every client retries at once and the load climbs; backoff with jitter spreads it out." },
      { key: "flash", label: "Flashcards", id: "sd-drills-flashcards/01-latency-numbers", x: 790, illus: "flashcard", watch: "Latency numbers worth knowing, one card at a time." },
    ],
  },
];

/** Stations on different lines that teach the same idea. */
export const INTERCHANGES: { x: number; lines: string[]; label: string }[] = [
  { x: 330, lines: ["blocks", "design"], label: "hashing to scale" },
  { x: 620, lines: ["blocks", "design", "code"], label: "rate limiting" },
];

/** The route the auto tour rides, until the visitor picks a station. */
export const TOUR = ["window", "ring", "scale", "hashing", "raft", "lru", "trees", "estimate", "bloom", "graphs", "idem", "feed"];

export const allStations = () => LINES.flatMap((l) => l.stations.map((s) => ({ ...s, line: l })));

/** Where a line leaves the hub: the five run side by side through it, 16 apart. */
export const hubY = (l: Line) => HUB.y + (LINES.indexOf(l) - 2) * 16;

/** SVG path for a line: out of the hub, a 45 degree diagonal, then flat to the right edge. */
export function linePath(l: Line, end = 975): string {
  const sy = hubY(l);
  const dy = l.y - sy;
  if (dy === 0) return `M ${HUB.x} ${sy} H ${end}`;
  return `M ${HUB.x} ${sy} H ${l.flatFrom - Math.abs(dy)} L ${l.flatFrom} ${l.y} H ${end}`;
}
