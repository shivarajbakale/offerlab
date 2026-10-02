import type { Pattern } from "./types.ts";

export const dpPatterns: Pattern[] = [
  {
    id: "dp-1d",
    name: "1-D Dynamic Programming",
    intuition:
      "The answer for position i depends only on answers for a few earlier positions, so you compute them left to right and store each one once. Brute force recursion re-solves the same suffix or prefix exponentially many times; a table (or two rolling variables) turns that into one pass. The real work is naming dp[i] precisely, e.g. 'best total using the first i items' or 'longest run ending at i'.",
    signals: [
      "number of ways to reach / decode / climb",
      "maximum total without taking adjacent items",
      "can the string be segmented into words",
      "longest increasing subsequence",
      "minimum cost to reach the end",
      "choice at each step depends only on the last one or two steps",
    ],
    template: `function solve(nums: number[]): number {
  const n = nums.length;
  // dp[i] = best answer considering the first i elements
  const dp = new Array(n + 1).fill(0);
  dp[0] = 0; // base case: empty prefix
  for (let i = 1; i <= n; i++) {
    // option A: skip element i-1
    const skip = dp[i - 1];
    // option B: take element i-1 (and whatever earlier state that allows)
    const take = nums[i - 1] + (i >= 2 ? dp[i - 2] : 0);
    dp[i] = Math.max(skip, take);
  }
  return dp[n];
  // When dp[i] only reads dp[i-1] and dp[i-2], keep two variables instead.
}`,
    related: [
      { title: "Fibonacci Number", slug: "fibonacci-number", difficulty: "Easy" },
      { title: "N-th Tribonacci Number", slug: "n-th-tribonacci-number", difficulty: "Easy" },
      { title: "Delete and Earn", slug: "delete-and-earn", difficulty: "Medium" },
      { title: "Solving Questions With Brainpower", slug: "solving-questions-with-brainpower", difficulty: "Medium" },
      { title: "Largest Divisible Subset", slug: "largest-divisible-subset", difficulty: "Medium" },
      { title: "Number of Longest Increasing Subsequence", slug: "number-of-longest-increasing-subsequence", difficulty: "Medium" },
      { title: "Russian Doll Envelopes", slug: "russian-doll-envelopes", difficulty: "Hard" },
      { title: "Word Break II", slug: "word-break-ii", difficulty: "Hard" },
      { title: "Decode Ways II", slug: "decode-ways-ii", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Text line breaking",
        text: "TeX's paragraph breaker computes the minimum 'badness' for laying out the first i words, reusing the best layout of every shorter prefix instead of trying every combination of breaks.",
      },
      {
        title: "Tokenizers and word segmentation",
        text: "Splitting text without spaces (Chinese, URLs, hashtags) into dictionary words uses the Word Break recurrence: prefix i is valid if some shorter valid prefix plus a dictionary word reaches it.",
      },
      {
        title: "Ad slot scheduling",
        text: "Choosing non-adjacent ad slots to maximise revenue when back-to-back ads are not allowed is House Robber: each slot is either taken (plus best up to i-2) or skipped.",
      },
    ],
  },
  {
    id: "knapsack",
    name: "Knapsack DP",
    intuition:
      "Instead of enumerating every subset of items (2^n), track which totals (capacities, sums, amounts) are reachable and the best value for each. Each item updates the table once, so the cost is items x capacity. Iterate capacity downward when each item can be used once (0/1), upward when items can be reused (unbounded); swap loop order to count combinations versus ordered sequences.",
    signals: [
      "pick a subset that sums to a target",
      "fewest coins / items to make an amount",
      "number of ways to make a total",
      "split the array into two equal-sum parts",
      "assign + or - to each number",
      "limited capacity, each item used once or unlimited times",
    ],
    template: `function knapsack(weights: number[], values: number[], cap: number): number {
  // dp[c] = best value achievable with total weight exactly / at most c
  const dp = new Array(cap + 1).fill(0);
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    // 0/1 knapsack: go DOWN so each item is used at most once.
    // Unbounded: go UP (c = w; c <= cap; c++) so an item can be reused.
    for (let c = cap; c >= w; c--) {
      dp[c] = Math.max(dp[c], dp[c - w] + values[i]);
    }
  }
  return dp[cap];
  // Counting ways: dp[0] = 1 and dp[c] += dp[c - w].
  // Min items: init Infinity, dp[0] = 0, dp[c] = min(dp[c], dp[c - w] + 1).
}`,
    related: [
      { title: "Last Stone Weight II", slug: "last-stone-weight-ii", difficulty: "Medium" },
      { title: "Ones and Zeroes", slug: "ones-and-zeroes", difficulty: "Medium" },
      { title: "Perfect Squares", slug: "perfect-squares", difficulty: "Medium" },
      { title: "Combination Sum IV", slug: "combination-sum-iv", difficulty: "Medium" },
      { title: "Number of Dice Rolls With Target Sum", slug: "number-of-dice-rolls-with-target-sum", difficulty: "Medium" },
      { title: "Minimum Cost For Tickets", slug: "minimum-cost-for-tickets", difficulty: "Medium" },
      { title: "Profitable Schemes", slug: "profitable-schemes", difficulty: "Hard" },
      { title: "Tallest Billboard", slug: "tallest-billboard", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Cloud cost / budget allocation",
        text: "Choosing which projects or instance types to fund under a fixed budget to maximise value is 0/1 knapsack over budget units.",
      },
      {
        title: "Making change at a vending machine",
        text: "Cash dispensers with arbitrary denominations compute the fewest coins for an amount with the unbounded Coin Change table, since greedy fails for some coin systems.",
      },
      {
        title: "Load balancing into two racks",
        text: "Splitting jobs between two machines so their total loads are as equal as possible is a subset-sum reachability table up to half the total (Partition Equal Subset Sum / Last Stone Weight II).",
      },
    ],
  },
  {
    id: "dp-two-strings",
    name: "DP on Two Sequences",
    intuition:
      "Let dp[i][j] be the answer for the first i characters of one string and the first j of the other. Each cell only looks at its left, top and top-left neighbours: match both characters, or drop one from either side. That collapses an exponential set of alignments into an (m+1) x (n+1) table, and a row-by-row fill means you can usually keep just two rows.",
    signals: [
      "two strings and a 'longest common' / 'minimum edits' question",
      "insert, delete or replace a character",
      "is s an interleaving / subsequence / match of p",
      "pattern with wildcards like . * ?",
      "count how many times t appears as a subsequence of s",
    ],
    template: `function twoStrings(a: string, b: string): number {
  const m = a.length, n = b.length;
  // dp[i][j] = answer for a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  // base cases: row 0 / column 0 (one string empty), e.g. dp[i][0] = i for edit distance
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1; // characters align
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); // drop one side
      }
    }
  }
  return dp[m][n];
}`,
    related: [
      { title: "Is Subsequence", slug: "is-subsequence", difficulty: "Easy" },
      { title: "Delete Operation for Two Strings", slug: "delete-operation-for-two-strings", difficulty: "Medium" },
      { title: "Minimum ASCII Delete Sum for Two Strings", slug: "minimum-ascii-delete-sum-for-two-strings", difficulty: "Medium" },
      { title: "Uncrossed Lines", slug: "uncrossed-lines", difficulty: "Medium" },
      { title: "Maximum Length of Repeated Subarray", slug: "maximum-length-of-repeated-subarray", difficulty: "Medium" },
      { title: "Longest Palindromic Subsequence", slug: "longest-palindromic-subsequence", difficulty: "Medium" },
      { title: "Wildcard Matching", slug: "wildcard-matching", difficulty: "Hard" },
      { title: "Shortest Common Supersequence", slug: "shortest-common-supersequence", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "diff and git merge",
        text: "Line-based diff tools find the longest common subsequence of two file versions; everything outside it is shown as an insertion or deletion.",
      },
      {
        title: "Spell checkers and fuzzy search",
        text: "Edit (Levenshtein) distance ranks suggestions by how few inserts, deletes and substitutions turn the typo into a dictionary word.",
      },
      {
        title: "DNA sequence alignment",
        text: "Needleman-Wunsch and Smith-Waterman fill the same two-sequence table with match/mismatch/gap scores to align genes.",
      },
      {
        title: "Glob and regex matching",
        text: "Shell globbing and simple regex engines decide whether a path matches a pattern with * and ? using a dp[i][j] table over text and pattern prefixes.",
      },
    ],
  },
  {
    id: "dp-grid",
    name: "Grid DP",
    intuition:
      "When you may only move in fixed directions (usually right/down), every cell is reached from a couple of already-computed neighbours, so dp[r][c] = combine(dp[r-1][c], dp[r][c-1]) + cell. That replaces enumerating every path (exponential) with one sweep over the grid. A single row array is usually enough because each row only reads the row above.",
    signals: [
      "robot can only move right or down",
      "number of unique paths in a grid",
      "minimum path sum from top-left to bottom-right",
      "largest square of 1s",
      "obstacles in the grid",
      "triangle / falling path, row by row",
    ],
    template: `function gridDp(grid: number[][]): number {
  const rows = grid.length, cols = grid[0].length;
  // dp[c] holds the answer for the current row; dp[c] before update = row above
  const dp = new Array(cols).fill(Infinity);
  dp[0] = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fromTop = dp[c];
      const fromLeft = c > 0 ? dp[c - 1] : Infinity;
      const best = r === 0 && c === 0 ? 0 : Math.min(fromTop, fromLeft);
      dp[c] = best + grid[r][c];
    }
  }
  return dp[cols - 1];
}`,
    related: [
      { title: "Unique Paths II", slug: "unique-paths-ii", difficulty: "Medium" },
      { title: "Minimum Path Sum", slug: "minimum-path-sum", difficulty: "Medium" },
      { title: "Triangle", slug: "triangle", difficulty: "Medium" },
      { title: "Maximal Square", slug: "maximal-square", difficulty: "Medium" },
      { title: "Minimum Falling Path Sum", slug: "minimum-falling-path-sum", difficulty: "Medium" },
      { title: "Count Square Submatrices with All Ones", slug: "count-square-submatrices-with-all-ones", difficulty: "Medium" },
      { title: "Out of Boundary Paths", slug: "out-of-boundary-paths", difficulty: "Medium" },
      { title: "Knight Probability in Chessboard", slug: "knight-probability-in-chessboard", difficulty: "Medium" },
      { title: "Dungeon Game", slug: "dungeon-game", difficulty: "Hard" },
      { title: "Cherry Pickup II", slug: "cherry-pickup-ii", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Seam carving",
        text: "Content-aware image resizing finds the lowest-energy vertical seam with a falling-path DP: each pixel's cost is its energy plus the cheapest of the three pixels above it.",
      },
      {
        title: "PCB and chip routing",
        text: "Routers on a grid with monotone moves compute the cheapest wire path cell by cell, reusing the best cost of the neighbouring cells.",
      },
      {
        title: "Image processing",
        text: "Finding the largest all-white square block in a binary image (e.g. free space for a watermark) uses the Maximal Square recurrence, min of three neighbours plus one.",
      },
    ],
  },
  {
    id: "dp-state-machine",
    name: "State Machine DP",
    intuition:
      "When what you may do today depends on a small 'mode' (holding a stock, in cooldown, last colour used), keep one best value per mode and write the transitions between modes. Each day updates a handful of numbers from yesterday's handful, so you get O(n x states) instead of exploring every sequence of actions. Drawing the states and arrows first makes the recurrence almost mechanical.",
    signals: [
      "buy and sell with cooldown / fee / at most k transactions",
      "you cannot do X on two consecutive days",
      "hold or not hold, rested or not",
      "adjacent houses cannot have the same colour",
      "count strings where a rule depends on the previous character",
    ],
    template: `function stateMachine(prices: number[]): number {
  // One variable per state: best profit if we end today in that state.
  let hold = -Infinity; // own a share
  let sold = 0;         // just sold today (cooldown tomorrow)
  let rest = 0;         // free to buy
  for (const p of prices) {
    const prevHold = hold, prevSold = sold, prevRest = rest;
    hold = Math.max(prevHold, prevRest - p); // keep holding, or buy
    sold = prevHold + p;                     // sell what we hold
    rest = Math.max(prevRest, prevSold);     // stay idle or finish cooldown
  }
  return Math.max(sold, rest);
}`,
    related: [
      { title: "Best Time to Buy and Sell Stock II", slug: "best-time-to-buy-and-sell-stock-ii", difficulty: "Medium" },
      { title: "Best Time to Buy and Sell Stock with Transaction Fee", slug: "best-time-to-buy-and-sell-stock-with-transaction-fee", difficulty: "Medium" },
      { title: "Best Time to Buy and Sell Stock III", slug: "best-time-to-buy-and-sell-stock-iii", difficulty: "Hard" },
      { title: "Best Time to Buy and Sell Stock IV", slug: "best-time-to-buy-and-sell-stock-iv", difficulty: "Hard" },
      { title: "Paint House", slug: "paint-house", difficulty: "Medium", premium: true },
      { title: "Flip String to Monotone Increasing", slug: "flip-string-to-monotone-increasing", difficulty: "Medium" },
      { title: "Minimum Swaps To Make Sequences Increasing", slug: "minimum-swaps-to-make-sequences-increasing", difficulty: "Hard" },
      { title: "Student Attendance Record II", slug: "student-attendance-record-ii", difficulty: "Hard" },
      { title: "Count Vowels Permutation", slug: "count-vowels-permutation", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Trading backtests",
        text: "Backtesting engines compute the best achievable P&L under position limits, fees and cooldown rules by tracking a value per position state (flat, long, cooling down) each tick.",
      },
      {
        title: "Viterbi decoding",
        text: "Speech recognition and modem decoders keep the most likely path ending in each hidden state at every time step, updating all states from the previous step's states.",
      },
      {
        title: "Power management",
        text: "Deciding when a device should sleep, idle or run, with wake-up costs between modes, is a min-cost DP over time with one value per power state.",
      },
    ],
  },
  {
    id: "dp-interval",
    name: "Interval DP",
    intuition:
      "Define dp[l][r] as the answer for the subarray l..r, and solve it by choosing the split point k that is handled last (or first). Small intervals are solved before large ones, so every split reuses finished answers, giving O(n^3) instead of trying every order of operations (n!). The trick in problems like Burst Balloons is picking which element is LAST, so the left and right sides stay independent.",
    signals: [
      "burst / remove / merge elements and neighbours change",
      "minimum cost to merge or cut a range",
      "the order of operations matters",
      "two players take from either end",
      "answer for a range built from answers of sub-ranges",
    ],
    template: `function intervalDp(nums: number[]): number {
  const n = nums.length;
  // dp[l][r] = best answer for the range l..r (inclusive)
  const dp: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let len = 1; len <= n; len++) {
    for (let l = 0; l + len - 1 < n; l++) {
      const r = l + len - 1;
      let best = 0;
      for (let k = l; k <= r; k++) {
        // k is the element handled LAST inside l..r
        const left = k > l ? dp[l][k - 1] : 0;
        const right = k < r ? dp[k + 1][r] : 0;
        best = Math.max(best, left + right + nums[k]); // + cost of k given boundaries
      }
      dp[l][r] = best;
    }
  }
  return dp[0][n - 1];
}`,
    related: [
      { title: "Stone Game", slug: "stone-game", difficulty: "Medium" },
      { title: "Predict the Winner", slug: "predict-the-winner", difficulty: "Medium" },
      { title: "Guess Number Higher or Lower II", slug: "guess-number-higher-or-lower-ii", difficulty: "Medium" },
      { title: "Minimum Score Triangulation of Polygon", slug: "minimum-score-triangulation-of-polygon", difficulty: "Medium" },
      { title: "Minimum Cost Tree From Leaf Values", slug: "minimum-cost-tree-from-leaf-values", difficulty: "Medium" },
      { title: "Minimum Cost to Cut a Stick", slug: "minimum-cost-to-cut-a-stick", difficulty: "Hard" },
      { title: "Strange Printer", slug: "strange-printer", difficulty: "Hard" },
      { title: "Minimum Cost to Merge Stones", slug: "minimum-cost-to-merge-stones", difficulty: "Hard" },
      { title: "Remove Boxes", slug: "remove-boxes", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Matrix chain multiplication",
        text: "Query planners and numeric libraries pick the cheapest parenthesisation of a chain of joins or matrix products by trying each last split over every sub-range.",
      },
      {
        title: "Optimal binary search trees",
        text: "Compilers and indexes that know key access frequencies build the cheapest lookup tree by choosing the best root for every key range.",
      },
      {
        title: "Parsing (CYK)",
        text: "The CYK parser decides whether a span of tokens forms a grammar symbol by combining parses of every split of that span into two smaller spans.",
      },
    ],
  },
  {
    id: "expand-around-center",
    name: "Expand Around Center",
    intuition:
      "Every palindrome is symmetric around a center, and there are only 2n-1 centers (each character and each gap). Grow outward from each center while both ends match; the moment they differ, no longer palindrome can share that center, so you stop. That gives O(n^2) time and O(1) space, versus O(n^3) for checking every substring.",
    signals: [
      "longest palindromic substring",
      "count palindromic substrings",
      "reads the same forwards and backwards",
      "contiguous substring that is a palindrome",
      "grow outward from a peak or middle",
    ],
    template: `function expandAroundCenter(s: string): number {
  let count = 0;
  const expand = (l: number, r: number) => {
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      count++; // s[l..r] is a palindrome; record length or bounds here
      l--;
      r++;
    }
  };
  for (let c = 0; c < s.length; c++) {
    expand(c, c);     // odd length, center on a character
    expand(c, c + 1); // even length, center between two characters
  }
  return count;
}`,
    related: [
      { title: "Valid Palindrome II", slug: "valid-palindrome-ii", difficulty: "Easy" },
      { title: "Longest Mountain in Array", slug: "longest-mountain-in-array", difficulty: "Medium" },
      { title: "Shortest Palindrome", slug: "shortest-palindrome", difficulty: "Hard" },
      { title: "Palindrome Partitioning II", slug: "palindrome-partitioning-ii", difficulty: "Hard" },
      { title: "Palindrome Partitioning III", slug: "palindrome-partitioning-iii", difficulty: "Hard" },
      { title: "Palindrome Partitioning IV", slug: "palindrome-partitioning-iv", difficulty: "Hard" },
      { title: "Maximum Number of Non-overlapping Palindrome Substrings", slug: "maximum-number-of-non-overlapping-palindrome-substrings", difficulty: "Hard" },
      { title: "Maximum Product of the Length of Two Palindromic Substrings", slug: "maximum-product-of-the-length-of-two-palindromic-substrings", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Genomics",
        text: "Restriction enzyme sites and hairpin structures in DNA are palindromic (reverse-complement) regions, found by expanding from each position.",
      },
      {
        title: "Signal peak detection",
        text: "Finding the extent of a peak in a time series, e.g. the longest mountain in a metrics graph, grows left and right from each local maximum while the slope holds.",
      },
    ],
  },
  {
    id: "memoized-dfs",
    name: "Memoized DFS",
    intuition:
      "Write the natural recursive DFS, then notice the same state (a cell, an index, a node) gets visited from many callers and always returns the same answer. Cache it the first time, and every later visit is O(1), so total work is states x transitions instead of exponential. It is DP without having to figure out a fill order: the recursion finds the dependency order for you, as long as the state graph has no cycles.",
    signals: [
      "longest path in a grid where moves must strictly increase",
      "recursive answer depends on the same sub-call many times",
      "fill order for a DP table is not obvious",
      "state is (position, some small extra parameter)",
      "game where each player plays optimally",
    ],
    template: `function memoDfs(start: number, n: number): number {
  const memo = new Map<number, number>();
  const dfs = (state: number): number => {
    if (memo.has(state)) return memo.get(state)!;
    let best = 1; // base answer for this state alone
    for (const next of neighbours(state)) {
      // only move along edges that cannot loop back (e.g. strictly increasing)
      best = Math.max(best, 1 + dfs(next));
    }
    memo.set(state, best);
    return best;
  };
  const neighbours = (s: number): number[] => (s + 1 < n ? [s + 1] : []);
  return dfs(start);
}`,
    related: [
      { title: "House Robber III", slug: "house-robber-iii", difficulty: "Medium" },
      { title: "Unique Binary Search Trees", slug: "unique-binary-search-trees", difficulty: "Medium" },
      { title: "Knight Dialer", slug: "knight-dialer", difficulty: "Medium" },
      { title: "Stone Game II", slug: "stone-game-ii", difficulty: "Medium" },
      { title: "Jump Game V", slug: "jump-game-v", difficulty: "Hard" },
      { title: "Number of Increasing Paths in a Grid", slug: "number-of-increasing-paths-in-a-grid", difficulty: "Hard" },
      { title: "Frog Jump", slug: "frog-jump", difficulty: "Hard" },
      { title: "Scramble String", slug: "scramble-string", difficulty: "Hard" },
      { title: "Concatenated Words", slug: "concatenated-words", difficulty: "Hard" },
      { title: "Minimum Number of Days to Eat N Oranges", slug: "minimum-number-of-days-to-eat-n-oranges", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Build systems",
        text: "Bazel, Make and Turborepo compute each target once and cache the result; every other target depending on it reuses the cached output instead of rebuilding.",
      },
      {
        title: "Critical path in a DAG",
        text: "Project schedulers find the longest chain of dependent tasks with a DFS that memoizes the longest path starting at each task.",
      },
      {
        title: "React memo and selectors",
        text: "useMemo and reselect cache a derived value keyed by its inputs, so the same computation reached from many components runs once.",
      },
    ],
  },
];
