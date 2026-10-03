import type { Pattern } from "./types.ts";

export const arraysPatterns: Pattern[] = [
  {
    id: "hashing",
    name: "Hashing",
    intuition:
      "Trade memory for time: store what you have already seen in a hash map or set so that \"have I seen X?\" or \"how many X?\" is an O(1) lookup instead of a rescan. Most O(n^2) pair-searching or grouping problems collapse to one O(n) pass once you pick the right key (the value, its complement, a sorted signature, a count tuple).",
    signals: [
      "contains duplicate / seen before",
      "find two elements that sum to a target",
      "group items that are equivalent (anagrams, same pattern)",
      "count frequencies",
      "O(n) time, unsorted input",
      "check membership quickly",
    ],
    template: `function solve(nums: number[], target: number): number[] {
  const seen = new Map<number, number>(); // key -> index (or count)
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i]; // the key you are looking for
    if (seen.has(need)) return [seen.get(need)!, i];
    seen.set(nums[i], i); // record after checking
  }
  return [];
}

// Grouping: build a canonical key per item
function group(words: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const w of words) {
    const key = [...w].sort().join("");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }
  return [...groups.values()];
}`,
    related: [
      { title: "Isomorphic Strings", slug: "isomorphic-strings", difficulty: "Easy" },
      { title: "Word Pattern", slug: "word-pattern", difficulty: "Easy" },
      { title: "Ransom Note", slug: "ransom-note", difficulty: "Easy" },
      { title: "First Unique Character in a String", slug: "first-unique-character-in-a-string", difficulty: "Easy" },
      { title: "Intersection of Two Arrays", slug: "intersection-of-two-arrays", difficulty: "Easy" },
      { title: "Contains Duplicate II", slug: "contains-duplicate-ii", difficulty: "Easy" },
      { title: "Jewels and Stones", slug: "jewels-and-stones", difficulty: "Easy" },
      { title: "Longest Palindrome", slug: "longest-palindrome", difficulty: "Easy" },
      { title: "Sort Characters By Frequency", slug: "sort-characters-by-frequency", difficulty: "Medium" },
    ],
    realWorld: [
      { title: "Database hash join", text: "A query engine builds a hash table on the smaller table's join key, then streams the larger table and probes it, turning a nested-loop join into a linear pass." },
      { title: "Deduplication in storage", text: "Backup tools and Git hash file chunks and keep a set of seen hashes, so a chunk already stored is skipped instead of compared byte by byte." },
      { title: "Caches and session lookup", text: "Web servers keep session IDs in a hash map so each request finds its user state in constant time no matter how many users are online." },
    ],
  },
  {
    id: "prefix-sum",
    name: "Prefix Sum",
    intuition:
      "Precompute running totals once so any range sum becomes a subtraction: sum(i..j) = prefix[j+1] - prefix[i]. The same idea works with products, counts, or XOR, and run from both ends it gives \"everything left of i\" and \"everything right of i\" without recomputing for each i. Pairing prefix sums with a hash map finds subarrays with a target sum in O(n) instead of checking every pair of endpoints.",
    signals: [
      "sum of a range / subarray many times",
      "product or total of everything except i",
      "number of subarrays summing to k",
      "pivot / balance point",
      "many range-update operations then read",
    ],
    template: `function buildPrefix(nums: number[]): number[] {
  const pre = new Array(nums.length + 1).fill(0);
  for (let i = 0; i < nums.length; i++) pre[i + 1] = pre[i] + nums[i];
  return pre; // sum(l..r) = pre[r + 1] - pre[l]
}

// Count subarrays with sum k: prefix sums + hash map of earlier prefixes
function countSubarrays(nums: number[], k: number): number {
  const counts = new Map<number, number>([[0, 1]]);
  let sum = 0, total = 0;
  for (const x of nums) {
    sum += x;
    total += counts.get(sum - k) ?? 0;
    counts.set(sum, (counts.get(sum) ?? 0) + 1);
  }
  return total;
}`,
    related: [
      { title: "Running Sum of 1d Array", slug: "running-sum-of-1d-array", difficulty: "Easy" },
      { title: "Range Sum Query - Immutable", slug: "range-sum-query-immutable", difficulty: "Easy" },
      { title: "Find Pivot Index", slug: "find-pivot-index", difficulty: "Easy" },
      { title: "Range Sum Query 2D - Immutable", slug: "range-sum-query-2d-immutable", difficulty: "Medium" },
      { title: "Subarray Sum Equals K", slug: "subarray-sum-equals-k", difficulty: "Medium" },
      { title: "Continuous Subarray Sum", slug: "continuous-subarray-sum", difficulty: "Medium" },
      { title: "Subarray Sums Divisible by K", slug: "subarray-sums-divisible-by-k", difficulty: "Medium" },
      { title: "Contiguous Array", slug: "contiguous-array", difficulty: "Medium" },
      { title: "Corporate Flight Bookings", slug: "corporate-flight-bookings", difficulty: "Medium" },
      { title: "Car Pooling", slug: "car-pooling", difficulty: "Medium" },
    ],
    realWorld: [
      { title: "Summed-area tables in graphics", text: "Image filters and face detectors (Viola-Jones) precompute a 2-D prefix sum so the sum of any rectangle of pixels costs four lookups." },
      { title: "Analytics dashboards", text: "Time-series stores keep cumulative counters so \"events between 10:00 and 14:00\" is one subtraction instead of scanning every row in the range." },
      { title: "Difference arrays for bookings", text: "Reservation systems record +seats at a start and -seats after the end, then one prefix pass gives occupancy at every moment." },
    ],
  },
  {
    id: "two-pointers",
    name: "Two Pointers",
    intuition:
      "Place one pointer at each end (or two at the start) and move them toward each other based on a comparison, so each step permanently rules out a whole row of candidate pairs. On sorted or symmetric input this replaces the O(n^2) check of every pair with a single O(n) sweep, and it needs no extra memory.",
    signals: [
      "sorted array, find a pair / triplet",
      "palindrome check",
      "in-place, O(1) extra space",
      "pick two lines / walls to maximize area",
      "remove or partition elements in place",
    ],
    template: `function pairWithSum(nums: number[], target: number): [number, number] | null {
  let l = 0, r = nums.length - 1; // nums is sorted
  while (l < r) {
    const sum = nums[l] + nums[r];
    if (sum === target) return [l, r];
    if (sum < target) l++; // need bigger: nothing smaller than nums[l] can pair with r
    else r--;              // need smaller
  }
  return null;
}

// Same-direction variant: slow writes, fast reads
function compact(nums: number[]): number {
  let write = 0;
  for (let read = 0; read < nums.length; read++) {
    if (nums[read] !== 0) nums[write++] = nums[read];
  }
  return write;
}`,
    related: [
      { title: "Reverse String", slug: "reverse-string", difficulty: "Easy" },
      { title: "Move Zeroes", slug: "move-zeroes", difficulty: "Easy" },
      { title: "Remove Duplicates from Sorted Array", slug: "remove-duplicates-from-sorted-array", difficulty: "Easy" },
      { title: "Merge Sorted Array", slug: "merge-sorted-array", difficulty: "Easy" },
      { title: "Squares of a Sorted Array", slug: "squares-of-a-sorted-array", difficulty: "Easy" },
      { title: "Valid Palindrome II", slug: "valid-palindrome-ii", difficulty: "Easy" },
      { title: "Sort Colors", slug: "sort-colors", difficulty: "Medium" },
      { title: "3Sum Closest", slug: "3sum-closest", difficulty: "Medium" },
      { title: "4Sum", slug: "4sum", difficulty: "Medium" },
    ],
    realWorld: [
      { title: "Merge step of sort-merge join", text: "Databases join two sorted inputs by advancing a cursor on each side, emitting matches without ever comparing every pair." },
      { title: "Diff and sync tools", text: "rsync-style and set-reconciliation tools walk two sorted file lists side by side to find additions and deletions in one pass." },
      { title: "In-place compaction", text: "Garbage collectors and log compactors use a read pointer and a write pointer to slide live entries down over dead ones without extra memory." },
    ],
  },
  {
    id: "sliding-window",
    name: "Sliding Window",
    intuition:
      "Keep a contiguous window [l, r] and its summary (counts, sum, distinct set). Grow r to add an element, and shrink l only when the window breaks the rule; each index enters and leaves once, so the work is O(n) instead of re-scanning every substring. The trick is choosing a window summary you can update in O(1) as elements enter and leave.",
    signals: [
      "longest / shortest substring or subarray",
      "contiguous",
      "at most k distinct / k replacements",
      "contains all characters of t",
      "permutation or anagram of p inside s",
      "maximum in every window of size k",
    ],
    template: `function longestValid(s: string, k: number): number {
  const count = new Map<string, number>(); // window summary
  let l = 0, best = 0;
  for (let r = 0; r < s.length; r++) {
    count.set(s[r], (count.get(s[r]) ?? 0) + 1); // expand
    while (count.size > k) {                     // window invalid: shrink
      const c = s[l++];
      count.set(c, count.get(c)! - 1);
      if (count.get(c) === 0) count.delete(c);
    }
    best = Math.max(best, r - l + 1);            // window valid here
  }
  return best;
}`,
    related: [
      { title: "Maximum Average Subarray I", slug: "maximum-average-subarray-i", difficulty: "Easy" },
      { title: "Find All Anagrams in a String", slug: "find-all-anagrams-in-a-string", difficulty: "Medium" },
      { title: "Minimum Size Subarray Sum", slug: "minimum-size-subarray-sum", difficulty: "Medium" },
      { title: "Max Consecutive Ones III", slug: "max-consecutive-ones-iii", difficulty: "Medium" },
      { title: "Fruit Into Baskets", slug: "fruit-into-baskets", difficulty: "Medium" },
      { title: "Longest Subarray of 1's After Deleting One Element", slug: "longest-subarray-of-1s-after-deleting-one-element", difficulty: "Medium" },
      { title: "Maximum Points You Can Obtain from Cards", slug: "maximum-points-you-can-obtain-from-cards", difficulty: "Medium" },
      { title: "Number of Substrings Containing All Three Characters", slug: "number-of-substrings-containing-all-three-characters", difficulty: "Medium" },
      { title: "Subarrays with K Different Integers", slug: "subarrays-with-k-different-integers", difficulty: "Hard" },
      { title: "Substring with Concatenation of All Words", slug: "substring-with-concatenation-of-all-words", difficulty: "Hard" },
    ],
    realWorld: [
      { title: "TCP sliding window", text: "TCP tracks the range of bytes sent but not yet acknowledged; the window slides forward as ACKs arrive, bounding in-flight data without resending everything." },
      { title: "Rate limiter", text: "An API gateway counts requests in the last N seconds per client, dropping old timestamps from the left as new ones arrive on the right." },
      { title: "Streaming metrics", text: "Monitoring systems compute moving averages and rolling max over the last few minutes of data, updating the summary as points enter and expire." },
    ],
  },
  {
    id: "best-so-far",
    name: "Best So Far (Running Best)",
    intuition:
      "Scan once and carry a small amount of state about the prefix you have already seen: the lowest price so far, the best subarray ending here, the max and min product ending here. At each step the answer that ends at i depends only on that state, so you never need to look back, turning an O(n^2) pair or subarray search into O(n) with O(1) memory.",
    signals: [
      "maximum subarray sum / product",
      "buy once, sell later",
      "best pair where i < j",
      "single pass, O(1) space",
      "restart when the running value goes bad",
    ],
    template: `function maxSubarray(nums: number[]): number {
  let bestEndingHere = nums[0]; // best answer that must end at i
  let best = nums[0];           // best answer seen anywhere
  for (let i = 1; i < nums.length; i++) {
    // extend the previous run, or start fresh at i
    bestEndingHere = Math.max(nums[i], bestEndingHere + nums[i]);
    best = Math.max(best, bestEndingHere);
  }
  return best;
}

function maxProfit(prices: number[]): number {
  let minSoFar = Infinity, best = 0;
  for (const p of prices) {
    minSoFar = Math.min(minSoFar, p);
    best = Math.max(best, p - minSoFar);
  }
  return best;
}`,
    related: [
      { title: "Max Consecutive Ones", slug: "max-consecutive-ones", difficulty: "Easy" },
      { title: "Third Maximum Number", slug: "third-maximum-number", difficulty: "Easy" },
      { title: "Maximum Difference Between Increasing Elements", slug: "maximum-difference-between-increasing-elements", difficulty: "Easy" },
      { title: "Best Time to Buy and Sell Stock II", slug: "best-time-to-buy-and-sell-stock-ii", difficulty: "Medium" },
      { title: "Maximum Sum Circular Subarray", slug: "maximum-sum-circular-subarray", difficulty: "Medium" },
      { title: "Best Sightseeing Pair", slug: "best-sightseeing-pair", difficulty: "Medium" },
      { title: "Increasing Triplet Subsequence", slug: "increasing-triplet-subsequence", difficulty: "Medium" },
      { title: "Maximum Absolute Sum of Any Subarray", slug: "maximum-absolute-sum-of-any-subarray", difficulty: "Medium" },
      { title: "Maximum Subarray Sum with One Deletion", slug: "maximum-subarray-sum-with-one-deletion", difficulty: "Medium" },
    ],
    realWorld: [
      { title: "Trading analytics", text: "Backtesting tools compute maximum drawdown and best single trade by carrying the running peak or trough through one pass over the price history." },
      { title: "Anomaly detection", text: "Kadane-style scans over a metric's deviation from baseline find the stretch of time with the largest cumulative excess, such as the worst latency incident." },
      { title: "Streaming high-water marks", text: "Monitoring agents keep the running max and min of a stream (memory, queue depth) in O(1) state instead of storing all samples." },
    ],
  },
  {
    id: "stack",
    name: "Stack",
    intuition:
      "When the most recent unfinished thing must be resolved first (an open bracket, an operand, a directory), push it and pop it when its partner arrives. Last-in-first-out matches nesting exactly, so one pass with a stack replaces repeated searching backward for the matching item.",
    signals: [
      "valid parentheses / matching brackets",
      "nested structure (decode, path, expression)",
      "evaluate an expression (postfix, calculator)",
      "undo / backspace",
      "process the most recent item first",
    ],
    template: `function isBalanced(s: string): boolean {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  for (const ch of s) {
    if (ch in pairs) {
      if (stack.pop() !== pairs[ch]) return false; // must close the latest open
    } else {
      stack.push(ch);
    }
  }
  return stack.length === 0;
}

function evalRPN(tokens: string[]): number {
  const st: number[] = [];
  for (const t of tokens) {
    if (!"+-*/".includes(t) || t.length > 1) { st.push(Number(t)); continue; }
    const b = st.pop()!, a = st.pop()!;
    st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : Math.trunc(a / b));
  }
  return st[0];
}`,
    related: [
      { title: "Backspace String Compare", slug: "backspace-string-compare", difficulty: "Easy" },
      { title: "Remove All Adjacent Duplicates In String", slug: "remove-all-adjacent-duplicates-in-string", difficulty: "Easy" },
      { title: "Implement Queue using Stacks", slug: "implement-queue-using-stacks", difficulty: "Easy" },
      { title: "Simplify Path", slug: "simplify-path", difficulty: "Medium" },
      { title: "Decode String", slug: "decode-string", difficulty: "Medium" },
      { title: "Asteroid Collision", slug: "asteroid-collision", difficulty: "Medium" },
      { title: "Basic Calculator II", slug: "basic-calculator-ii", difficulty: "Medium" },
      { title: "Minimum Remove to Make Valid Parentheses", slug: "minimum-remove-to-make-valid-parentheses", difficulty: "Medium" },
      { title: "Basic Calculator", slug: "basic-calculator", difficulty: "Hard" },
    ],
    realWorld: [
      { title: "Parsers and linters", text: "Compilers, JSON parsers and HTML validators push opening tokens and pop on closing ones to check nesting and report the exact unmatched position." },
      { title: "Call stack", text: "Every function call pushes a frame with its locals and return address; returning pops it, which is why recursion depth is limited by stack size." },
      { title: "Undo in editors", text: "Text editors push each edit onto an undo stack so the latest change is reverted first, with a second stack for redo." },
    ],
  },
  {
    id: "monotonic-stack",
    name: "Monotonic Stack / Deque",
    intuition:
      "Keep a stack whose values are always increasing (or decreasing). When a new element breaks the order, every element it pops has just found its answer: its next greater or smaller element is the newcomer. Each index is pushed and popped once, so \"next greater for every element\" or \"how far can each bar extend\" costs O(n) instead of O(n^2); a deque version also drops expired indices to give sliding-window max/min.",
    signals: [
      "next greater / next smaller element",
      "how many days until a warmer day",
      "largest rectangle / span extending left and right",
      "max or min of every window",
      "remove digits to make the smallest number",
    ],
    template: `function nextGreater(nums: number[]): number[] {
  const res = new Array(nums.length).fill(-1);
  const stack: number[] = []; // indices; values decreasing from bottom to top
  for (let i = 0; i < nums.length; i++) {
    while (stack.length && nums[stack[stack.length - 1]] < nums[i]) {
      const j = stack.pop()!;
      res[j] = nums[i]; // nums[i] is the first greater value to the right of j
    }
    stack.push(i);
  }
  return res; // indices left on the stack have no greater element
}

// Deque variant for window max: drop smaller values from the back,
// drop indices that fell out of the window from the front.`,
    related: [
      { title: "Next Greater Element I", slug: "next-greater-element-i", difficulty: "Easy" },
      { title: "Final Prices With a Special Discount in a Shop", slug: "final-prices-with-a-special-discount-in-a-shop", difficulty: "Easy" },
      { title: "Next Greater Element II", slug: "next-greater-element-ii", difficulty: "Medium" },
      { title: "Online Stock Span", slug: "online-stock-span", difficulty: "Medium" },
      { title: "Remove K Digits", slug: "remove-k-digits", difficulty: "Medium" },
      { title: "Remove Duplicate Letters", slug: "remove-duplicate-letters", difficulty: "Medium" },
      { title: "132 Pattern", slug: "132-pattern", difficulty: "Medium" },
      { title: "Sum of Subarray Minimums", slug: "sum-of-subarray-minimums", difficulty: "Medium" },
      { title: "Shortest Unsorted Continuous Subarray", slug: "shortest-unsorted-continuous-subarray", difficulty: "Medium" },
      { title: "Maximal Rectangle", slug: "maximal-rectangle", difficulty: "Hard" },
    ],
    realWorld: [
      { title: "Stock span indicators", text: "Trading platforms compute for each day how many previous days had a lower price, using a monotonic stack so the whole series is processed in linear time." },
      { title: "Streaming window max", text: "Monitoring systems report the peak CPU or latency over the last N samples with a monotonic deque, keeping O(1) amortized work per sample." },
      { title: "Skyline and layout", text: "Rendering and UI layout code find, for each bar or block, the nearest taller neighbour on each side to compute visible area or occlusion." },
    ],
  },
  {
    id: "design",
    name: "Data Structure Design",
    intuition:
      "No single structure supports every operation fast, so combine two that cover each other's weaknesses: a hash map for O(1) lookup plus a linked list for O(1) ordering (LRU), a stack plus a parallel min-stack, a map of keys to sorted timestamp lists for binary search. Start from the required complexity of each operation and pick the pieces that give it; keep them consistent on every update.",
    signals: [
      "design a class with operations ...",
      "each operation in O(1) / O(log n)",
      "get and put with eviction (least recently used)",
      "retrieve min / latest / value at a timestamp",
      "serialize and deserialize / encode and decode",
    ],
    template: `class LRU<K, V> {
  private map = new Map<K, V>(); // Map keeps insertion order: oldest first
  constructor(private capacity: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key)!;
    this.map.delete(key); // move to most-recent end
    this.map.set(key, v);
    return v;
  }

  put(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value as K); // evict oldest
    }
  }
}`,
    related: [
      { title: "Design HashSet", slug: "design-hashset", difficulty: "Easy" },
      { title: "Design HashMap", slug: "design-hashmap", difficulty: "Easy" },
      { title: "Design Circular Queue", slug: "design-circular-queue", difficulty: "Medium" },
      { title: "Insert Delete GetRandom O(1)", slug: "insert-delete-getrandom-o1", difficulty: "Medium" },
      { title: "Design Browser History", slug: "design-browser-history", difficulty: "Medium" },
      { title: "Design Underground System", slug: "design-underground-system", difficulty: "Medium" },
      { title: "Snapshot Array", slug: "snapshot-array", difficulty: "Medium" },
      { title: "Encode and Decode TinyURL", slug: "encode-and-decode-tinyurl", difficulty: "Medium" },
      { title: "LFU Cache", slug: "lfu-cache", difficulty: "Hard" },
    ],
    realWorld: [
      { title: "Redis and CDN caches", text: "Caches pair a hash table with a recency list so lookups and evictions of the least recently used entry are both O(1)." },
      { title: "Versioned key-value stores", text: "etcd and multi-version databases keep each key's values in timestamp order, so a read \"as of time t\" is a binary search." },
      { title: "Wire protocols", text: "Length-prefixed framing (HTTP/2, Protobuf, Redis RESP) encodes each string as its length plus bytes, so decoding never confuses data with delimiters." },
    ],
  },
  {
    id: "intervals",
    name: "Intervals",
    intuition:
      "Sort intervals by start time; then any interval can only overlap the ones just before it, so one sweep merges, counts or picks them instead of comparing every pair. For \"how many overlap at once\" separate starts and ends (or keep a min-heap of end times) and sweep through the events in time order.",
    signals: [
      "merge overlapping intervals",
      "insert a new interval",
      "minimum rooms / resources at once",
      "remove fewest intervals so none overlap",
      "meetings, bookings, time ranges",
    ],
    template: `function merge(intervals: number[][]): number[][] {
  intervals.sort((a, b) => a[0] - b[0]); // sort by start
  const out: number[][] = [];
  for (const [s, e] of intervals) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); // overlaps: extend
    else out.push([s, e]);                                   // gap: start new
  }
  return out;
}

// Max overlap: sweep sorted starts and ends
function maxConcurrent(iv: number[][]): number {
  const starts = iv.map((x) => x[0]).sort((a, b) => a - b);
  const ends = iv.map((x) => x[1]).sort((a, b) => a - b);
  let best = 0, active = 0, j = 0;
  for (const s of starts) {
    while (ends[j] <= s) { active--; j++; }
    best = Math.max(best, ++active);
  }
  return best;
}`,
    related: [
      { title: "Summary Ranges", slug: "summary-ranges", difficulty: "Easy" },
      { title: "Teemo Attacking", slug: "teemo-attacking", difficulty: "Easy" },
      { title: "Interval List Intersections", slug: "interval-list-intersections", difficulty: "Medium" },
      { title: "Minimum Number of Arrows to Burst Balloons", slug: "minimum-number-of-arrows-to-burst-balloons", difficulty: "Medium" },
      { title: "Remove Covered Intervals", slug: "remove-covered-intervals", difficulty: "Medium" },
      { title: "My Calendar I", slug: "my-calendar-i", difficulty: "Medium" },
      { title: "Video Stitching", slug: "video-stitching", difficulty: "Medium" },
      { title: "Maximum Number of Events That Can Be Attended", slug: "maximum-number-of-events-that-can-be-attended", difficulty: "Medium" },
      { title: "Data Stream as Disjoint Intervals", slug: "data-stream-as-disjoint-intervals", difficulty: "Hard" },
    ],
    realWorld: [
      { title: "Calendar scheduling", text: "Calendar apps merge each attendee's busy blocks sorted by start time to find free slots, and count overlapping bookings to size room demand." },
      { title: "Memory and disk allocators", text: "Allocators keep free regions as sorted address ranges and coalesce neighbours when a block is freed, avoiding fragmentation." },
      { title: "Range-based downloads", text: "Download managers and video players track which byte ranges have arrived and merge them to know what is still missing." },
    ],
  },
  {
    id: "greedy",
    name: "Greedy",
    intuition:
      "Make the locally best choice at each step (farthest reach, earliest finish, cheapest option) and never revisit it, because you can argue that some optimal answer starts with that choice. When the exchange argument holds, a sort plus one pass replaces exploring every combination; when it does not, you need DP instead.",
    signals: [
      "minimum number of jumps / steps / groups",
      "can you reach the end",
      "choose an order to maximize or minimize",
      "partition into as many parts as possible",
      "a local rule seems to never hurt",
    ],
    template: `function canReachEnd(nums: number[]): boolean {
  let farthest = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > farthest) return false;       // stuck before i
    farthest = Math.max(farthest, i + nums[i]); // best reach so far
  }
  return true;
}

// Typical shape: sort by the key that makes the local choice safe, then sweep
function maxNonOverlapping(iv: number[][]): number {
  iv.sort((a, b) => a[1] - b[1]); // earliest finish first
  let count = 0, end = -Infinity;
  for (const [s, e] of iv) if (s >= end) { count++; end = e; }
  return count;
}`,
    related: [
      { title: "Assign Cookies", slug: "assign-cookies", difficulty: "Easy" },
      { title: "Lemonade Change", slug: "lemonade-change", difficulty: "Easy" },
      { title: "Boats to Save People", slug: "boats-to-save-people", difficulty: "Medium" },
      { title: "Two City Scheduling", slug: "two-city-scheduling", difficulty: "Medium" },
      { title: "Queue Reconstruction by Height", slug: "queue-reconstruction-by-height", difficulty: "Medium" },
      { title: "Largest Number", slug: "largest-number", difficulty: "Medium" },
      { title: "Broken Calculator", slug: "broken-calculator", difficulty: "Medium" },
      { title: "Candy", slug: "candy", difficulty: "Hard" },
      { title: "Minimum Number of Taps to Open to Water a Garden", slug: "minimum-number-of-taps-to-open-to-water-a-garden", difficulty: "Hard" },
    ],
    realWorld: [
      { title: "CPU and job scheduling", text: "Schedulers pick earliest-deadline-first or shortest-job-first at each decision point, a greedy rule with provable bounds on lateness or wait time." },
      { title: "Huffman coding", text: "Compression formats like DEFLATE build codes by repeatedly merging the two least frequent symbols, a greedy choice proven optimal." },
      { title: "Making change and bin packing", text: "Vending machines and cash systems hand out the largest coin that fits; with standard denominations this greedy rule is optimal." },
    ],
  },
  {
    id: "matrix-simulation",
    name: "Matrix Simulation",
    intuition:
      "Treat the grid as layers or index transforms rather than simulating cell by cell with extra copies. Rotation is transpose plus reverse, spiral order is four shrinking boundaries, and in-place marking reuses the first row and column as flags. Getting the index arithmetic right is the whole problem, and it saves the O(m*n) extra memory of a copy.",
    signals: [
      "rotate the image in place",
      "spiral / diagonal / zigzag order",
      "set rows and columns to zero",
      "update every cell based on neighbours",
      "O(1) extra space on a 2-D matrix",
    ],
    template: `function spiral(m: number[][]): number[] {
  const out: number[] = [];
  let top = 0, bottom = m.length - 1, left = 0, right = m[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) out.push(m[top][c]);
    top++;
    for (let r = top; r <= bottom; r++) out.push(m[r][right]);
    right--;
    if (top <= bottom) { for (let c = right; c >= left; c--) out.push(m[bottom][c]); bottom--; }
    if (left <= right) { for (let r = bottom; r >= top; r--) out.push(m[r][left]); left++; }
  }
  return out;
}

// Rotate 90 degrees clockwise in place: transpose, then reverse each row
function rotate(m: number[][]): void {
  for (let i = 0; i < m.length; i++)
    for (let j = i + 1; j < m.length; j++) [m[i][j], m[j][i]] = [m[j][i], m[i][j]];
  for (const row of m) row.reverse();
}`,
    related: [
      { title: "Transpose Matrix", slug: "transpose-matrix", difficulty: "Easy" },
      { title: "Reshape the Matrix", slug: "reshape-the-matrix", difficulty: "Easy" },
      { title: "Toeplitz Matrix", slug: "toeplitz-matrix", difficulty: "Easy" },
      { title: "Flipping an Image", slug: "flipping-an-image", difficulty: "Easy" },
      { title: "Matrix Diagonal Sum", slug: "matrix-diagonal-sum", difficulty: "Easy" },
      { title: "Determine Whether Matrix Can Be Obtained By Rotation", slug: "determine-whether-matrix-can-be-obtained-by-rotation", difficulty: "Easy" },
      { title: "Spiral Matrix II", slug: "spiral-matrix-ii", difficulty: "Medium" },
      { title: "Spiral Matrix III", slug: "spiral-matrix-iii", difficulty: "Medium" },
      { title: "Diagonal Traverse", slug: "diagonal-traverse", difficulty: "Medium" },
      { title: "Game of Life", slug: "game-of-life", difficulty: "Medium" },
    ],
    realWorld: [
      { title: "Image rotation", text: "Photo apps rotate bitmaps by remapping pixel indices (transpose plus flip) instead of re-sampling, often in place to save memory on phones." },
      { title: "Spreadsheet operations", text: "Spreadsheets implement transpose, fill and clear-row/column as index transforms over a 2-D cell store." },
      { title: "Cellular automata and games", text: "Board games and simulations (Game of Life, Minesweeper) update each cell from its neighbours, encoding old and new state in the same cell to avoid a second grid." },
    ],
  },
  {
    id: "math",
    name: "Math and Number Manipulation",
    intuition:
      "Look for the arithmetic identity that removes the brute-force work: digit-by-digit carry for big numbers, repeated squaring for powers (x^n in O(log n) multiplications), place-value products for string multiplication, and overflow checks before the multiply. Most of these replace a loop over the value itself with a loop over its digits or bits.",
    signals: [
      "digits of a number / reverse an integer",
      "add or multiply numbers stored as strings or arrays",
      "compute x to the power n",
      "32-bit overflow",
      "sequence that eventually repeats",
    ],
    template: `function pow(x: number, n: number): number {
  if (n < 0) { x = 1 / x; n = -n; }
  let result = 1;
  while (n > 0) {
    if (n & 1) result *= x; // this bit of n is set
    x *= x;                 // square for the next bit
    n = Math.floor(n / 2);
  }
  return result;
}

// Grade-school addition with carry on digit arrays (least significant last)
function addDigits(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = a.length - 1, j = b.length - 1, carry = 0;
  while (i >= 0 || j >= 0 || carry) {
    const s = (a[i--] ?? 0) + (b[j--] ?? 0) + carry;
    out.push(s % 10);
    carry = Math.floor(s / 10);
  }
  return out.reverse();
}`,
    related: [
      { title: "Palindrome Number", slug: "palindrome-number", difficulty: "Easy" },
      { title: "Add Binary", slug: "add-binary", difficulty: "Easy" },
      { title: "Add Strings", slug: "add-strings", difficulty: "Easy" },
      { title: "Sqrt(x)", slug: "sqrtx", difficulty: "Easy" },
      { title: "Excel Sheet Column Number", slug: "excel-sheet-column-number", difficulty: "Easy" },
      { title: "Add Digits", slug: "add-digits", difficulty: "Easy" },
      { title: "Ugly Number", slug: "ugly-number", difficulty: "Easy" },
      { title: "Count Primes", slug: "count-primes", difficulty: "Medium" },
      { title: "Factorial Trailing Zeroes", slug: "factorial-trailing-zeroes", difficulty: "Medium" },
      { title: "Fraction to Recurring Decimal", slug: "fraction-to-recurring-decimal", difficulty: "Medium" },
    ],
    realWorld: [
      { title: "RSA and modular exponentiation", text: "TLS key exchange and RSA compute huge powers modulo n with square-and-multiply, needing only about log2(n) multiplications." },
      { title: "Arbitrary-precision libraries", text: "BigInt and decimal libraries for finance store numbers as digit arrays and implement carry-based addition and multiplication." },
      { title: "Overflow-safe parsing", text: "Language runtimes parsing integers check before each multiply-by-10 that the result stays in range, the same guard used in reverse-integer." },
    ],
  },
  {
    id: "bit-manipulation",
    name: "Bit Manipulation",
    intuition:
      "Work on the binary representation directly. XOR cancels equal values (a ^ a = 0), so pairs disappear and the odd one out remains; n & (n - 1) clears the lowest set bit; shifting and masking reads or writes one bit at a time. These turn counting, finding and adding into O(1)-space operations without hash maps or arithmetic operators.",
    signals: [
      "every element appears twice except one",
      "count set bits / Hamming weight",
      "without using + or -",
      "reverse the bits of a 32-bit integer",
      "power of two",
      "O(1) extra space with integers",
    ],
    template: `function singleNumber(nums: number[]): number {
  let x = 0;
  for (const n of nums) x ^= n; // pairs cancel, the single one remains
  return x;
}

function popcount(n: number): number {
  let count = 0;
  while (n !== 0) {
    n &= n - 1; // drop the lowest set bit
    count++;
  }
  return count;
}

function add(a: number, b: number): number {
  while (b !== 0) {
    const carry = (a & b) << 1; // where both bits are 1
    a = a ^ b;                  // sum without carry
    b = carry;
  }
  return a;
}`,
    related: [
      { title: "Power of Two", slug: "power-of-two", difficulty: "Easy" },
      { title: "Power of Four", slug: "power-of-four", difficulty: "Easy" },
      { title: "Hamming Distance", slug: "hamming-distance", difficulty: "Easy" },
      { title: "Find the Difference", slug: "find-the-difference", difficulty: "Easy" },
      { title: "Number Complement", slug: "number-complement", difficulty: "Easy" },
      { title: "Single Number II", slug: "single-number-ii", difficulty: "Medium" },
      { title: "Single Number III", slug: "single-number-iii", difficulty: "Medium" },
      { title: "Bitwise AND of Numbers Range", slug: "bitwise-and-of-numbers-range", difficulty: "Medium" },
      { title: "Total Hamming Distance", slug: "total-hamming-distance", difficulty: "Medium" },
      { title: "Maximum XOR of Two Numbers in an Array", slug: "maximum-xor-of-two-numbers-in-an-array", difficulty: "Medium" },
    ],
    realWorld: [
      { title: "RAID parity", text: "RAID 5 stores the XOR of the data blocks; if one disk fails, XOR of the survivors and the parity rebuilds the lost block." },
      { title: "Permission flags and bitsets", text: "Unix file modes, feature flags and Bloom filters pack many booleans into one integer and test them with masks." },
      { title: "Hardware adders and checksums", text: "CPUs add with XOR for the sum bit and AND-shift for the carry; checksums and hash functions use popcount and bit reversal heavily." },
    ],
  },
];
