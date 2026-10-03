import type { Pattern } from "./types.ts";

export const searchPatterns: Pattern[] = [
  {
    id: "binary-search",
    name: "Binary Search",
    intuition:
      "If the data is sorted (or any yes/no question about it flips exactly once), one comparison at the middle tells you which half cannot contain the answer. Throwing away half the range per step turns an O(n) scan into O(log n). The hard part is not the loop but deciding what the invariant is: what is true of everything left of lo and right of hi.",
    signals: [
      "sorted array",
      "find the first / last position",
      "rotated sorted array",
      "must run in O(log n)",
      "search a sorted matrix",
      "lookup by timestamp",
    ],
    template: `function binarySearch(nums: number[], target: number): number {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) {
      lo = mid + 1; // answer is strictly right of mid
    } else {
      hi = mid - 1; // answer is strictly left of mid
    }
  }
  return -1; // lo is now the insertion point
}`,
    related: [
      { title: "Search Insert Position", slug: "search-insert-position", difficulty: "Easy" },
      { title: "First Bad Version", slug: "first-bad-version", difficulty: "Easy" },
      { title: "Sqrt(x)", slug: "sqrtx", difficulty: "Easy" },
      { title: "Valid Perfect Square", slug: "valid-perfect-square", difficulty: "Easy" },
      {
        title: "Find First and Last Position of Element in Sorted Array",
        slug: "find-first-and-last-position-of-element-in-sorted-array",
        difficulty: "Medium",
      },
      { title: "Find Peak Element", slug: "find-peak-element", difficulty: "Medium" },
      {
        title: "Search in Rotated Sorted Array II",
        slug: "search-in-rotated-sorted-array-ii",
        difficulty: "Medium",
      },
      {
        title: "Single Element in a Sorted Array",
        slug: "single-element-in-a-sorted-array",
        difficulty: "Medium",
      },
      { title: "Find K Closest Elements", slug: "find-k-closest-elements", difficulty: "Medium" },
      {
        title: "Find Minimum in Rotated Sorted Array II",
        slug: "find-minimum-in-rotated-sorted-array-ii",
        difficulty: "Hard",
      },
    ],
    realWorld: [
      {
        title: "Git bisect",
        text: "Given a known-good and a known-bad commit, git bisect checks out the middle commit and asks you to test it, finding the commit that introduced a bug in log2(n) builds.",
      },
      {
        title: "Database B-tree indexes",
        text: "Inside each B-tree page the keys are sorted, and the engine binary searches them to pick the child pointer, so a lookup touches only a handful of pages.",
      },
      {
        title: "Time-series lookups",
        text: "Metrics stores and log viewers keep points sorted by timestamp and binary search to the first point at or after the start of the requested window.",
      },
    ],
  },
  {
    id: "binary-search-on-answer",
    name: "Binary Search on the Answer",
    intuition:
      "When you cannot search the input directly, search the space of possible answers instead. If 'can it be done with value x?' is monotonic (once it is true for x it stays true for every larger x), binary search finds the smallest x that works. You replace guessing every candidate with about log(range) calls to a cheap greedy feasibility check.",
    signals: [
      "minimize the maximum / maximize the minimum",
      "smallest speed / capacity / time such that",
      "within D days / within h hours",
      "answer lies in a large numeric range",
      "checking a given value is easy, finding it is hard",
    ],
    template: `function minFeasible(lo: number, hi: number, canDo: (x: number) => boolean): number {
  // canDo is false ... false true ... true over [lo, hi]
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (canDo(mid)) {
      hi = mid; // mid works, maybe something smaller does too
    } else {
      lo = mid + 1; // mid fails, so everything below fails
    }
  }
  return lo;
}

// Example feasibility check: can we finish all piles at speed k within h hours?
const canFinish = (piles: number[], h: number) => (k: number) =>
  piles.reduce((hours, p) => hours + Math.ceil(p / k), 0) <= h;`,
    related: [
      {
        title: "Capacity To Ship Packages Within D Days",
        slug: "capacity-to-ship-packages-within-d-days",
        difficulty: "Medium",
      },
      {
        title: "Find the Smallest Divisor Given a Threshold",
        slug: "find-the-smallest-divisor-given-a-threshold",
        difficulty: "Medium",
      },
      {
        title: "Minimum Number of Days to Make m Bouquets",
        slug: "minimum-number-of-days-to-make-m-bouquets",
        difficulty: "Medium",
      },
      {
        title: "Magnetic Force Between Two Balls",
        slug: "magnetic-force-between-two-balls",
        difficulty: "Medium",
      },
      {
        title: "Minimum Limit of Balls in a Bag",
        slug: "minimum-limit-of-balls-in-a-bag",
        difficulty: "Medium",
      },
      {
        title: "Minimum Speed to Arrive on Time",
        slug: "minimum-speed-to-arrive-on-time",
        difficulty: "Medium",
      },
      {
        title: "Minimized Maximum of Products Distributed to Any Store",
        slug: "minimized-maximum-of-products-distributed-to-any-store",
        difficulty: "Medium",
      },
      {
        title: "Minimum Time to Complete Trips",
        slug: "minimum-time-to-complete-trips",
        difficulty: "Medium",
      },
      {
        title: "Maximum Candies Allocated to K Children",
        slug: "maximum-candies-allocated-to-k-children",
        difficulty: "Medium",
      },
      { title: "Split Array Largest Sum", slug: "split-array-largest-sum", difficulty: "Hard" },
      {
        title: "Kth Smallest Number in Multiplication Table",
        slug: "kth-smallest-number-in-multiplication-table",
        difficulty: "Hard",
      },
      {
        title: "Find K-th Smallest Pair Distance",
        slug: "find-k-th-smallest-pair-distance",
        difficulty: "Hard",
      },
    ],
    realWorld: [
      {
        title: "Capacity planning",
        text: "To find the fewest servers that keep p99 latency under a target, teams run a load simulation at a guessed count and halve the range each time, instead of trying every count.",
      },
      {
        title: "Video bitrate selection",
        text: "Encoders search for the lowest bitrate whose output still meets a quality score, because quality only rises as bitrate rises.",
      },
      {
        title: "Batch size tuning",
        text: "ML tooling finds the largest batch size that fits in GPU memory by trying a size, catching out-of-memory, and binary searching the boundary.",
      },
    ],
  },
  {
    id: "linked-list",
    name: "Linked List Manipulation",
    intuition:
      "Linked list problems are about rewiring next pointers without losing the rest of the list. Save the next node before you overwrite a pointer, and put a dummy node in front of the head so inserting or deleting the first node is no different from any other. Done carefully, you reorder, merge or reverse in place with O(1) extra memory.",
    signals: [
      "reverse the list / reverse in groups",
      "merge two sorted lists",
      "remove the nth node",
      "in place, O(1) extra space",
      "deep copy a list with extra pointers",
      "digits stored in reverse order",
    ],
    template: `class ListNode {
  constructor(public val = 0, public next: ListNode | null = null) {}
}

function reverse(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  let cur = head;
  while (cur) {
    const next = cur.next; // save before rewiring
    cur.next = prev;
    prev = cur;
    cur = next;
  }
  return prev;
}

// Dummy head: the "node before head" exists, so deleting head is not a special case.
const dummy = new ListNode(0, null);`,
    related: [
      { title: "Remove Linked List Elements", slug: "remove-linked-list-elements", difficulty: "Easy" },
      {
        title: "Intersection of Two Linked Lists",
        slug: "intersection-of-two-linked-lists",
        difficulty: "Easy",
      },
      { title: "Reverse Linked List II", slug: "reverse-linked-list-ii", difficulty: "Medium" },
      { title: "Swap Nodes in Pairs", slug: "swap-nodes-in-pairs", difficulty: "Medium" },
      { title: "Odd Even Linked List", slug: "odd-even-linked-list", difficulty: "Medium" },
      { title: "Partition List", slug: "partition-list", difficulty: "Medium" },
      {
        title: "Remove Duplicates from Sorted List II",
        slug: "remove-duplicates-from-sorted-list-ii",
        difficulty: "Medium",
      },
      { title: "Rotate List", slug: "rotate-list", difficulty: "Medium" },
    ],
    realWorld: [
      {
        title: "LRU caches",
        text: "Redis-style and OS page caches keep entries in a doubly linked list so a hit can be unlinked and moved to the front in O(1).",
      },
      {
        title: "Memory allocators",
        text: "malloc implementations keep free blocks in linked free lists and splice blocks in and out as memory is allocated and released.",
      },
      {
        title: "Text editor buffers",
        text: "Piece tables and rope-like editors link chunks of text so inserting in the middle of a large file only rewires a few pointers instead of copying everything after it.",
      },
    ],
  },
  {
    id: "fast-slow-pointers",
    name: "Fast and Slow Pointers",
    intuition:
      "Move one pointer one step and another two steps through a sequence. If there is a cycle the fast one must eventually land on the slow one, and if there is not, the fast one hits the end when the slow one is at the middle. This detects cycles and finds midpoints in O(1) space, where the obvious approach needs a visited set or a first pass to count the length.",
    signals: [
      "detect a cycle",
      "find the middle of the list",
      "constant extra space",
      "repeatedly apply f(x) until it repeats or reaches 1",
      "array values are indexes into the array",
    ],
    template: `function hasCycle(head: ListNode | null): boolean {
  let slow = head;
  let fast = head;
  while (fast && fast.next) {
    slow = slow!.next;
    fast = fast.next.next;
    if (slow === fast) return true; // fast lapped slow
  }
  return false; // fast fell off the end; slow is at the middle
}

// Cycle start (Floyd): after meeting, restart one pointer at head and
// move both one step at a time; they meet at the entrance of the cycle.`,
    related: [
      { title: "Middle of the Linked List", slug: "middle-of-the-linked-list", difficulty: "Easy" },
      { title: "Palindrome Linked List", slug: "palindrome-linked-list", difficulty: "Easy" },
      { title: "Linked List Cycle II", slug: "linked-list-cycle-ii", difficulty: "Medium" },
      { title: "Circular Array Loop", slug: "circular-array-loop", difficulty: "Medium" },
      {
        title: "Maximum Twin Sum of a Linked List",
        slug: "maximum-twin-sum-of-a-linked-list",
        difficulty: "Medium",
      },
      {
        title: "Delete the Middle Node of a Linked List",
        slug: "delete-the-middle-node-of-a-linked-list",
        difficulty: "Medium",
      },
      {
        title: "Convert Sorted List to Binary Search Tree",
        slug: "convert-sorted-list-to-binary-search-tree",
        difficulty: "Medium",
      },
    ],
    realWorld: [
      {
        title: "Pollard's rho factorization",
        text: "Integer factoring with Pollard's rho iterates a pseudo-random function and uses Floyd's tortoise-and-hare to detect when the sequence cycles modulo a hidden factor.",
      },
      {
        title: "PRNG period detection",
        text: "Testing a random number generator for short cycles uses the same two-speed walk to find when the state repeats without storing every state seen.",
      },
      {
        title: "Corrupted pointer chains",
        text: "Debuggers and filesystem checkers detect loops in on-disk or in-memory linked structures (for example a corrupted FAT chain) with constant memory.",
      },
    ],
  },
  {
    id: "tree-dfs",
    name: "Tree DFS (Recursion)",
    intuition:
      "Trust the recursion: assume the call on each child already returns the right answer for that subtree, then combine the two results at the current node. Most tree problems become 'what does a node need from its children, and what does it hand to its parent'. When the answer can bend through a node (diameter, max path sum), return one thing upward and update a global best with another.",
    signals: [
      "binary tree, any property of the whole tree",
      "depth / height / balanced",
      "path from root to leaf",
      "compare two trees",
      "build a tree from traversals",
      "serialize a tree",
    ],
    template: `class TreeNode {
  constructor(
    public val = 0,
    public left: TreeNode | null = null,
    public right: TreeNode | null = null,
  ) {}
}

function solve(root: TreeNode | null): number {
  let best = -Infinity; // answer that may bend through a node
  function dfs(node: TreeNode | null): number {
    if (!node) return 0; // base case for an empty subtree
    const left = dfs(node.left);
    const right = dfs(node.right);
    best = Math.max(best, left + right + node.val); // combine at this node
    return node.val + Math.max(left, right); // what the parent needs
  }
  dfs(root);
  return best;
}`,
    related: [
      { title: "Symmetric Tree", slug: "symmetric-tree", difficulty: "Easy" },
      { title: "Path Sum", slug: "path-sum", difficulty: "Easy" },
      { title: "Binary Tree Paths", slug: "binary-tree-paths", difficulty: "Easy" },
      { title: "Path Sum II", slug: "path-sum-ii", difficulty: "Medium" },
      { title: "Sum Root to Leaf Numbers", slug: "sum-root-to-leaf-numbers", difficulty: "Medium" },
      {
        title: "Lowest Common Ancestor of a Binary Tree",
        slug: "lowest-common-ancestor-of-a-binary-tree",
        difficulty: "Medium",
      },
      {
        title: "Flatten Binary Tree to Linked List",
        slug: "flatten-binary-tree-to-linked-list",
        difficulty: "Medium",
      },
      { title: "House Robber III", slug: "house-robber-iii", difficulty: "Medium" },
    ],
    realWorld: [
      {
        title: "Disk usage (du)",
        text: "du computes a directory's size by recursively summing the sizes its subdirectories return, exactly a post-order tree DFS.",
      },
      {
        title: "Compilers and ASTs",
        text: "Type checkers and constant folders walk the abstract syntax tree, computing each node's type or value from its children's results.",
      },
      {
        title: "React reconciliation",
        text: "React diffs the old and new component trees recursively, comparing a node and then descending into its children, much like Same Tree.",
      },
    ],
  },
  {
    id: "tree-bfs",
    name: "Tree BFS (Level Order)",
    intuition:
      "Process the tree one level at a time with a queue: snapshot the queue's length, pop exactly that many nodes, and push their children. Everything you need per level (first, last, sum, max, width) falls out of that loop. BFS reaches nodes in order of depth, so 'closest to the root' and 'what is visible per row' questions need no extra bookkeeping.",
    signals: [
      "level by level / level order",
      "right side view / each row",
      "minimum depth",
      "zigzag order",
      "nodes at the same depth",
      "width of the tree",
    ],
    template: `function levelOrder(root: TreeNode | null): number[][] {
  const levels: number[][] = [];
  if (!root) return levels;
  let queue: TreeNode[] = [root];
  while (queue.length) {
    const level: number[] = [];
    const next: TreeNode[] = [];
    for (const node of queue) {
      level.push(node.val);
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    levels.push(level); // per-level work goes here
    queue = next;
  }
  return levels;
}`,
    related: [
      { title: "Minimum Depth of Binary Tree", slug: "minimum-depth-of-binary-tree", difficulty: "Easy" },
      {
        title: "Average of Levels in Binary Tree",
        slug: "average-of-levels-in-binary-tree",
        difficulty: "Easy",
      },
      { title: "Cousins in Binary Tree", slug: "cousins-in-binary-tree", difficulty: "Easy" },
      {
        title: "Binary Tree Zigzag Level Order Traversal",
        slug: "binary-tree-zigzag-level-order-traversal",
        difficulty: "Medium",
      },
      {
        title: "Binary Tree Level Order Traversal II",
        slug: "binary-tree-level-order-traversal-ii",
        difficulty: "Medium",
      },
      {
        title: "Populating Next Right Pointers in Each Node",
        slug: "populating-next-right-pointers-in-each-node",
        difficulty: "Medium",
      },
      { title: "Maximum Width of Binary Tree", slug: "maximum-width-of-binary-tree", difficulty: "Medium" },
      {
        title: "Find Largest Value in Each Tree Row",
        slug: "find-largest-value-in-each-tree-row",
        difficulty: "Medium",
      },
      {
        title: "Maximum Level Sum of a Binary Tree",
        slug: "maximum-level-sum-of-a-binary-tree",
        difficulty: "Medium",
      },
      {
        title: "Check Completeness of a Binary Tree",
        slug: "check-completeness-of-a-binary-tree",
        difficulty: "Medium",
      },
      {
        title: "N-ary Tree Level Order Traversal",
        slug: "n-ary-tree-level-order-traversal",
        difficulty: "Medium",
      },
    ],
    realWorld: [
      {
        title: "Org charts",
        text: "Rendering an org chart row by row, or finding everyone N levels below a manager, is a level-order traversal of the reporting tree.",
      },
      {
        title: "Web crawlers",
        text: "Crawlers expand links breadth-first from a seed page so they cover pages close to the start before wandering deep, and can stop at a depth limit.",
      },
      {
        title: "UI tree search",
        text: "Test tools and browser devtools often search the DOM or view tree breadth-first to find the shallowest element matching a selector.",
      },
    ],
  },
  {
    id: "bst",
    name: "Binary Search Tree",
    intuition:
      "In a BST everything in the left subtree is smaller and everything in the right is larger, so every node is a binary search decision. You only walk one root-to-leaf path (O(h)) instead of the whole tree, and an in-order traversal visits the values in sorted order. Validity is a range constraint passed down, not just a comparison with the parent.",
    signals: [
      "binary search tree",
      "kth smallest / in sorted order",
      "validate the BST",
      "lowest common ancestor in a BST",
      "values in a range [low, high]",
    ],
    template: `function isValid(node: TreeNode | null, lo = -Infinity, hi = Infinity): boolean {
  if (!node) return true;
  if (node.val <= lo || node.val >= hi) return false; // outside allowed range
  return isValid(node.left, lo, node.val) && isValid(node.right, node.val, hi);
}

function search(root: TreeNode | null, target: number): TreeNode | null {
  let node = root;
  while (node && node.val !== target) {
    node = target < node.val ? node.left : node.right; // discard one side
  }
  return node;
}

// In-order (left, node, right) yields values in sorted order.`,
    related: [
      { title: "Search in a Binary Search Tree", slug: "search-in-a-binary-search-tree", difficulty: "Easy" },
      {
        title: "Convert Sorted Array to Binary Search Tree",
        slug: "convert-sorted-array-to-binary-search-tree",
        difficulty: "Easy",
      },
      { title: "Two Sum IV - Input is a BST", slug: "two-sum-iv-input-is-a-bst", difficulty: "Easy" },
      {
        title: "Minimum Absolute Difference in BST",
        slug: "minimum-absolute-difference-in-bst",
        difficulty: "Easy",
      },
      { title: "Range Sum of BST", slug: "range-sum-of-bst", difficulty: "Easy" },
      {
        title: "Insert into a Binary Search Tree",
        slug: "insert-into-a-binary-search-tree",
        difficulty: "Medium",
      },
      { title: "Delete Node in a BST", slug: "delete-node-in-a-bst", difficulty: "Medium" },
      { title: "Binary Search Tree Iterator", slug: "binary-search-tree-iterator", difficulty: "Medium" },
      { title: "Trim a Binary Search Tree", slug: "trim-a-binary-search-tree", difficulty: "Medium" },
      { title: "Recover Binary Search Tree", slug: "recover-binary-search-tree", difficulty: "Medium" },
    ],
    realWorld: [
      {
        title: "Ordered maps",
        text: "Java's TreeMap and C++ std::map are red-black trees, a balanced BST, giving O(log n) lookups plus sorted iteration and floor/ceiling queries.",
      },
      {
        title: "Linux CFS scheduler",
        text: "The Completely Fair Scheduler kept runnable tasks in a red-black tree keyed by virtual runtime and always picked the leftmost (smallest) node to run next.",
      },
      {
        title: "Range queries in indexes",
        text: "Database indexes answer 'all rows with price between 10 and 20' by descending to the lower bound and walking in-order until passing the upper bound.",
      },
    ],
  },
  {
    id: "trie",
    name: "Trie (Prefix Tree)",
    intuition:
      "Store words character by character in a tree so that words sharing a prefix share the same path. Checking a word or prefix then costs O(length of the word), regardless of how many words are stored, and you can walk many words at once instead of testing each one separately. That shared walk is what makes searching a whole dictionary inside a grid or stream feasible.",
    signals: [
      "prefix / starts with",
      "dictionary of words",
      "autocomplete / suggestions",
      "wildcard '.' matches any letter",
      "find all dictionary words in a board",
      "maximum XOR of two numbers",
    ],
    template: `class TrieNode {
  children = new Map<string, TrieNode>();
  isWord = false;
}

class Trie {
  root = new TrieNode();
  insert(word: string): void {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch)!;
    }
    node.isWord = true;
  }
  find(prefix: string): TrieNode | undefined {
    let node: TrieNode | undefined = this.root;
    for (const ch of prefix) node = node?.children.get(ch); // undefined = no such prefix
    return node;
  }
}`,
    related: [
      { title: "Replace Words", slug: "replace-words", difficulty: "Medium" },
      { title: "Longest Word in Dictionary", slug: "longest-word-in-dictionary", difficulty: "Medium" },
      { title: "Search Suggestions System", slug: "search-suggestions-system", difficulty: "Medium" },
      { title: "Map Sum Pairs", slug: "map-sum-pairs", difficulty: "Medium" },
      { title: "Implement Magic Dictionary", slug: "implement-magic-dictionary", difficulty: "Medium" },
      {
        title: "Maximum XOR of Two Numbers in an Array",
        slug: "maximum-xor-of-two-numbers-in-an-array",
        difficulty: "Medium",
      },
      { title: "Stream of Characters", slug: "stream-of-characters", difficulty: "Hard" },
      { title: "Prefix and Suffix Search", slug: "prefix-and-suffix-search", difficulty: "Hard" },
      { title: "Concatenated Words", slug: "concatenated-words", difficulty: "Hard" },
      { title: "Palindrome Pairs", slug: "palindrome-pairs", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Search box autocomplete",
        text: "Typeahead services walk a trie (often with top suggestions cached at each node) to the typed prefix and return completions in time proportional to the prefix length.",
      },
      {
        title: "IP routing tables",
        text: "Routers do longest-prefix matching on destination addresses with binary or compressed tries, following bits of the address down the tree.",
      },
      {
        title: "Spell checkers and word games",
        text: "Spell checkers and Boggle/crossword solvers prune the search the moment a letter sequence is not a prefix of any dictionary word.",
      },
    ],
  },
  {
    id: "heap-top-k",
    name: "Heap / Top K",
    intuition:
      "A heap gives you the smallest (or largest) item in O(1) and lets you insert or remove in O(log n), so you never sort everything just to look at the extremes. For the k largest items, keep a min-heap of size k: the root is the weakest of your current top k, and anything smaller than it can be ignored. That is O(n log k) instead of O(n log n), and it works on a stream.",
    signals: [
      "k largest / k smallest / kth largest",
      "k closest / k most frequent",
      "repeatedly take the largest or smallest",
      "data stream, answer after each insert",
      "schedule by priority",
    ],
    template: `// Assumes a MinHeap<T> with push, pop, peek, size and a comparator.
function topK(nums: number[], k: number): number[] {
  const heap = new MinHeap<number>((a, b) => a - b);
  for (const x of nums) {
    heap.push(x);
    if (heap.size() > k) heap.pop(); // evict the smallest; root = kth largest
  }
  const out: number[] = [];
  while (heap.size()) out.push(heap.pop()!);
  return out.reverse(); // largest first
}

// Simulation flavour: pop the best item, process it, push results back.
// while (heap.size()) { const cur = heap.pop(); ...; heap.push(next); }`,
    related: [
      { title: "Relative Ranks", slug: "relative-ranks", difficulty: "Easy" },
      { title: "Top K Frequent Words", slug: "top-k-frequent-words", difficulty: "Medium" },
      { title: "Sort Characters By Frequency", slug: "sort-characters-by-frequency", difficulty: "Medium" },
      { title: "Reorganize String", slug: "reorganize-string", difficulty: "Medium" },
      {
        title: "Furthest Building You Can Reach",
        slug: "furthest-building-you-can-reach",
        difficulty: "Medium",
      },
      { title: "Maximum Performance of a Team", slug: "maximum-performance-of-a-team", difficulty: "Hard" },
      { title: "Minimum Cost to Hire K Workers", slug: "minimum-cost-to-hire-k-workers", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Trending lists",
        text: "Trending hashtags or top queries dashboards keep a size-k heap over streaming counts so the leaderboard updates without sorting every item.",
      },
      {
        title: "OS and job schedulers",
        text: "Schedulers and job queues (for example Kubernetes priority queues or Sidekiq-style delayed jobs) pop the highest-priority or earliest-due task from a heap.",
      },
      {
        title: "Timers in event loops",
        text: "Node.js, Go and many networking libraries keep pending timers in a min-heap keyed by deadline so the next timer to fire is always at the root.",
      },
    ],
  },
  {
    id: "two-heaps",
    name: "Two Heaps",
    intuition:
      "Split the data into two heaps that face each other: a max-heap for the lower half and a min-heap for the upper half. Their tops are exactly the middle elements, so the median is always O(1) to read and O(log n) to maintain, with no re-sorting. The same idea, two heaps that items move between (available vs busy, buy vs sell), solves many simulation problems.",
    signals: [
      "median of a stream",
      "median of a sliding window",
      "balance a lower half and an upper half",
      "free resources vs busy resources",
      "match the best buyer with the best seller",
      "pick from two candidate pools",
    ],
    template: `// Assumes a Heap<T> with push, pop, peek, size and a comparator.
const small = new Heap<number>((a, b) => b - a); // max-heap: lower half
const large = new Heap<number>((a, b) => a - b); // min-heap: upper half

function add(num: number): void {
  small.push(num);
  large.push(small.pop()!); // keep every small <= every large
  if (large.size() > small.size()) small.push(large.pop()!); // small may hold one extra
}

function median(): number {
  if (small.size() > large.size()) return small.peek()!;
  return (small.peek()! + large.peek()!) / 2;
}`,
    related: [
      { title: "Sliding Window Median", slug: "sliding-window-median", difficulty: "Hard" },
      { title: "IPO", slug: "ipo", difficulty: "Hard" },
      {
        title: "Number of Orders in the Backlog",
        slug: "number-of-orders-in-the-backlog",
        difficulty: "Medium",
      },
      { title: "Total Cost to Hire K Workers", slug: "total-cost-to-hire-k-workers", difficulty: "Medium" },
      { title: "Process Tasks Using Servers", slug: "process-tasks-using-servers", difficulty: "Medium" },
      { title: "Single-Threaded CPU", slug: "single-threaded-cpu", difficulty: "Medium" },
      {
        title: "The Number of the Smallest Unoccupied Chair",
        slug: "the-number-of-the-smallest-unoccupied-chair",
        difficulty: "Medium",
      },
      { title: "Meeting Rooms III", slug: "meeting-rooms-iii", difficulty: "Hard" },
      {
        title: "Find Servers That Handled Most Number of Requests",
        slug: "find-servers-that-handled-most-number-of-requests",
        difficulty: "Hard",
      },
    ],
    realWorld: [
      {
        title: "Exchange order books",
        text: "A matching engine keeps bids in a max-ordered book and asks in a min-ordered book, and trades whenever the best bid meets or crosses the best ask.",
      },
      {
        title: "Streaming latency medians",
        text: "Monitoring agents can report a running median response time over a stream of requests without storing and sorting all of them.",
      },
      {
        title: "Server pools",
        text: "Connection pools and job runners move workers between an idle heap (ordered by id or weight) and a busy heap (ordered by finish time).",
      },
    ],
  },
  {
    id: "k-way-merge",
    name: "K-way Merge",
    intuition:
      "When you have k sorted sources, the next smallest overall item must be at the head of one of them. Keep just those k heads in a min-heap: pop the smallest, then push the next item from the same source. Each of the N items costs O(log k), which beats concatenating and sorting (O(N log N)) and never needs everything in memory at once.",
    signals: [
      "k sorted lists / arrays",
      "merge sorted streams",
      "kth smallest across sorted rows",
      "smallest pairs or sums from sorted inputs",
      "most recent items from many feeds",
    ],
    template: `// Assumes a MinHeap<T> with push, pop, size and a comparator.
type Entry = { val: number; src: number; idx: number };

function mergeK(lists: number[][]): number[] {
  const heap = new MinHeap<Entry>((a, b) => a.val - b.val);
  lists.forEach((l, src) => {
    if (l.length) heap.push({ val: l[0], src, idx: 0 }); // one head per source
  });
  const out: number[] = [];
  while (heap.size()) {
    const { val, src, idx } = heap.pop()!;
    out.push(val);
    const next = idx + 1;
    if (next < lists[src].length) heap.push({ val: lists[src][next], src, idx: next });
  }
  return out;
}`,
    related: [
      { title: "Merge Sorted Array", slug: "merge-sorted-array", difficulty: "Easy" },
      { title: "Squares of a Sorted Array", slug: "squares-of-a-sorted-array", difficulty: "Easy" },
      { title: "Sort List", slug: "sort-list", difficulty: "Medium" },
      { title: "Ugly Number II", slug: "ugly-number-ii", difficulty: "Medium" },
      { title: "Super Ugly Number", slug: "super-ugly-number", difficulty: "Medium" },
      { title: "Find K Pairs with Smallest Sums", slug: "find-k-pairs-with-smallest-sums", difficulty: "Medium" },
      {
        title: "Kth Smallest Element in a Sorted Matrix",
        slug: "kth-smallest-element-in-a-sorted-matrix",
        difficulty: "Medium",
      },
      { title: "K-th Smallest Prime Fraction", slug: "k-th-smallest-prime-fraction", difficulty: "Medium" },
      {
        title: "Smallest Range Covering Elements from K Lists",
        slug: "smallest-range-covering-elements-from-k-lists",
        difficulty: "Hard",
      },
      {
        title: "Find the Kth Smallest Sum of a Matrix With Sorted Rows",
        slug: "find-the-kth-smallest-sum-of-a-matrix-with-sorted-rows",
        difficulty: "Hard",
      },
    ],
    realWorld: [
      {
        title: "LSM-tree compaction",
        text: "LevelDB, RocksDB and Cassandra merge many sorted SSTable files into one by repeatedly taking the smallest key across file heads.",
      },
      {
        title: "External sorting",
        text: "Sorting data larger than RAM writes sorted chunks to disk, then streams them back through a k-way merge to produce the final order.",
      },
      {
        title: "Social feeds and log aggregation",
        text: "A timeline built from many followed users, or logs collected from many servers, is a merge of per-source streams already sorted by time.",
      },
    ],
  },
];
