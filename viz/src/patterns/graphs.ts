import type { Pattern } from "./types.ts";

export const graphsPatterns: Pattern[] = [
  {
    id: "backtracking",
    name: "Backtracking",
    intuition:
      "Build a candidate one choice at a time, recurse, then undo the choice and try the next one. Because you check constraints as you go, a bad partial choice gets dropped before any of its completions are built. That pruning is what makes it much faster than generating every full candidate and filtering afterwards.",
    signals: [
      "generate all combinations / subsets / permutations",
      "return every valid arrangement",
      "place items so that no two conflict (N-Queens, Sudoku)",
      "partition a string into valid pieces",
      "find a path in a grid that spells a word",
    ],
    template: `function backtrack(input: number[]): number[][] {
  const result: number[][] = [];
  const path: number[] = [];
  function dfs(start: number): void {
    if (isComplete(path)) {
      result.push([...path]); // copy, path keeps mutating
      return;
    }
    for (let i = start; i < input.length; i++) {
      if (!isValid(path, input[i])) continue; // prune early
      path.push(input[i]); // choose
      dfs(i + 1); // explore
      path.pop(); // un-choose
    }
  }
  dfs(0);
  return result;
}`,
    related: [
      { title: "Permutations II", slug: "permutations-ii", difficulty: "Medium" },
      { title: "Combinations", slug: "combinations", difficulty: "Medium" },
      { title: "Combination Sum III", slug: "combination-sum-iii", difficulty: "Medium" },
      { title: "Restore IP Addresses", slug: "restore-ip-addresses", difficulty: "Medium" },
      { title: "Sudoku Solver", slug: "sudoku-solver", difficulty: "Hard" },
      { title: "N-Queens II", slug: "n-queens-ii", difficulty: "Hard" },
      { title: "Word Break II", slug: "word-break-ii", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "SAT and constraint solvers",
        text: "DPLL-style SAT solvers assign one variable at a time, propagate constraints, and backtrack on conflict. Tools like package-version resolvers use the same loop.",
      },
      {
        title: "Regex engines",
        text: "Backtracking regex engines (PCRE, JavaScript RegExp) try one alternative, and when the rest of the pattern fails to match they rewind and try the next alternative.",
      },
      {
        title: "Scheduling and timetabling",
        text: "Exam or meeting schedulers place one event at a time into a slot and undo the placement when a later event has no legal slot left.",
      },
    ],
  },
  {
    id: "grid-dfs",
    name: "Grid DFS (Flood Fill)",
    intuition:
      "Treat each cell as a node with edges to its 4 neighbors, and flood out from a cell to visit its whole connected region once. Marking cells as visited (often by overwriting them in place) guarantees every cell is processed O(1) times, so counting or measuring all regions is O(rows * cols) instead of re-scanning per region.",
    signals: [
      "count the islands / regions / connected areas",
      "2-D grid of 0/1 or characters",
      "cells connected horizontally or vertically",
      "capture or fill regions surrounded by something",
      "which cells can reach the border",
    ],
    template: `function countRegions(grid: string[][]): number {
  const rows = grid.length, cols = grid[0].length;
  function dfs(r: number, c: number): void {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    if (grid[r][c] !== "1") return; // water or already visited
    grid[r][c] = "#"; // mark visited
    dfs(r + 1, c); dfs(r - 1, c);
    dfs(r, c + 1); dfs(r, c - 1);
  }
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === "1") { count++; dfs(r, c); }
    }
  }
  return count;
}`,
    related: [
      { title: "Flood Fill", slug: "flood-fill", difficulty: "Easy" },
      { title: "Island Perimeter", slug: "island-perimeter", difficulty: "Easy" },
      { title: "Number of Closed Islands", slug: "number-of-closed-islands", difficulty: "Medium" },
      { title: "Number of Enclaves", slug: "number-of-enclaves", difficulty: "Medium" },
      { title: "Count Sub Islands", slug: "count-sub-islands", difficulty: "Medium" },
      { title: "Coloring A Border", slug: "coloring-a-border", difficulty: "Medium" },
      { title: "Find All Groups of Farmland", slug: "find-all-groups-of-farmland", difficulty: "Medium" },
      { title: "Number of Distinct Islands", slug: "number-of-distinct-islands", difficulty: "Medium", premium: true },
      { title: "Making A Large Island", slug: "making-a-large-island", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Paint bucket tool",
        text: "The bucket fill in image editors floods outward from the clicked pixel to every connected pixel of the same color.",
      },
      {
        title: "Connected-component labeling",
        text: "Computer vision pipelines label blobs in a binary image (cells under a microscope, text in a scanned page) by flooding each unlabeled foreground pixel's region.",
      },
      {
        title: "Minesweeper and Go",
        text: "Clicking an empty Minesweeper cell reveals its whole zero region; Go engines flood a group of stones to count its liberties.",
      },
    ],
  },
  {
    id: "graph-dfs",
    name: "Graph DFS",
    intuition:
      "Build an adjacency list, then walk as deep as possible from a node before backing up, keeping a visited set so each node and edge is handled once. The visited set is what turns an exponential walk over paths into an O(V + E) traversal, and the recursion stack naturally gives you post-order work like copying, path building or cycle detection.",
    signals: [
      "given edges / adjacency list / graph nodes",
      "clone or copy a graph",
      "can every node be reached from X",
      "find all paths from source to target",
      "use every edge exactly once",
    ],
    template: `function dfsGraph(n: number, edges: [number, number][], start: number): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const visited = new Set<number>();
  const order: number[] = [];
  function dfs(u: number): void {
    visited.add(u);
    order.push(u); // pre-order work
    for (const v of adj[u]) {
      if (!visited.has(v)) dfs(v);
    }
    // post-order work goes here
  }
  dfs(start);
  return order;
}`,
    related: [
      { title: "Find if Path Exists in Graph", slug: "find-if-path-exists-in-graph", difficulty: "Easy" },
      { title: "All Paths From Source to Target", slug: "all-paths-from-source-to-target", difficulty: "Medium" },
      { title: "Keys and Rooms", slug: "keys-and-rooms", difficulty: "Medium" },
      { title: "Number of Provinces", slug: "number-of-provinces", difficulty: "Medium" },
      { title: "Find Eventual Safe States", slug: "find-eventual-safe-states", difficulty: "Medium" },
      { title: "Evaluate Division", slug: "evaluate-division", difficulty: "Medium" },
      { title: "Is Graph Bipartite?", slug: "is-graph-bipartite", difficulty: "Medium" },
      { title: "Reorder Routes to Make All Paths Lead to the City Zero", slug: "reorder-routes-to-make-all-paths-lead-to-the-city-zero", difficulty: "Medium" },
      { title: "Minimum Time to Collect All Apples in a Tree", slug: "minimum-time-to-collect-all-apples-in-a-tree", difficulty: "Medium" },
      { title: "Critical Connections in a Network", slug: "critical-connections-in-a-network", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Garbage collection (mark phase)",
        text: "Mark-and-sweep collectors DFS from the root set through object references, marking everything reachable; unmarked objects are freed.",
      },
      {
        title: "Deep copy / structured clone",
        text: "structuredClone and deep-copy utilities walk the object graph depth-first with a map from original to copy, which is exactly Clone Graph and handles cycles.",
      },
      {
        title: "Web crawlers and link checkers",
        text: "A site link checker follows links depth-first from the home page, keeping a visited set of URLs so pages that link to each other are not fetched forever.",
      },
    ],
  },
  {
    id: "graph-bfs",
    name: "Graph BFS",
    intuition:
      "Explore in rings: everything 1 step away, then 2 steps, and so on, using a queue. In an unweighted graph the first time BFS reaches a node is guaranteed to be by a shortest path, so you never need to revisit it. Seeding the queue with many sources at once (multi-source BFS) computes the distance to the nearest source for every cell in one pass.",
    signals: [
      "minimum number of steps / moves / transformations",
      "shortest path in an unweighted grid or graph",
      "spreads to neighbors each minute",
      "distance to the nearest X for every cell",
      "level by level",
    ],
    template: `function bfs(start: string, target: string, neighbors: (s: string) => string[]): number {
  const queue: string[] = [start];
  const seen = new Set<string>([start]);
  let steps = 0;
  while (queue.length > 0) {
    const size = queue.length; // one full level
    for (let i = 0; i < size; i++) {
      const cur = queue.shift()!;
      if (cur === target) return steps;
      for (const next of neighbors(cur)) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    steps++;
  }
  return -1;
}`,
    related: [
      { title: "01 Matrix", slug: "01-matrix", difficulty: "Medium" },
      { title: "Shortest Path in Binary Matrix", slug: "shortest-path-in-binary-matrix", difficulty: "Medium" },
      { title: "Open the Lock", slug: "open-the-lock", difficulty: "Medium" },
      { title: "Minimum Genetic Mutation", slug: "minimum-genetic-mutation", difficulty: "Medium" },
      { title: "Snakes and Ladders", slug: "snakes-and-ladders", difficulty: "Medium" },
      { title: "As Far from Land as Possible", slug: "as-far-from-land-as-possible", difficulty: "Medium" },
      { title: "Nearest Exit from Entrance in Maze", slug: "nearest-exit-from-entrance-in-maze", difficulty: "Medium" },
      { title: "Shortest Bridge", slug: "shortest-bridge", difficulty: "Medium" },
      { title: "Word Ladder II", slug: "word-ladder-ii", difficulty: "Hard" },
      { title: "Shortest Path in a Grid with Obstacles Elimination", slug: "shortest-path-in-a-grid-with-obstacles-elimination", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Social network degrees",
        text: "\"2nd and 3rd degree connections\" on LinkedIn are BFS levels from your profile over the friend graph.",
      },
      {
        title: "Network hop count",
        text: "Distance-vector routing and tools that count router hops treat each link as cost 1, so the fewest-hop route is a BFS shortest path.",
      },
      {
        title: "Game pathfinding on tiles",
        text: "Tile-based games compute a distance map from the player (or from all exits at once, multi-source) so every enemy can step toward the nearest target.",
      },
    ],
  },
  {
    id: "topological-sort",
    name: "Topological Sort",
    intuition:
      "When tasks have \"A must come before B\" rules, repeatedly take any task with no remaining prerequisites (in-degree 0) and remove its outgoing edges. Each node and edge is processed once, so ordering is O(V + E), and if some nodes never reach in-degree 0 the leftovers form a cycle, which means no valid order exists.",
    signals: [
      "prerequisites / dependencies",
      "X must happen before Y",
      "is it possible to finish all tasks",
      "return a valid ordering",
      "derive an order from sorted words (alien alphabet)",
    ],
    template: `function topoSort(n: number, edges: [number, number][]): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (const [before, after] of edges) { adj[before].push(after); indeg[after]++; }
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  const order: number[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    for (const v of adj[u]) {
      if (--indeg[v] === 0) queue.push(v);
    }
  }
  return order.length === n ? order : []; // [] means a cycle
}`,
    related: [
      { title: "Course Schedule IV", slug: "course-schedule-iv", difficulty: "Medium" },
      { title: "Minimum Height Trees", slug: "minimum-height-trees", difficulty: "Medium" },
      { title: "Parallel Courses", slug: "parallel-courses", difficulty: "Medium", premium: true },
      { title: "Sequence Reconstruction", slug: "sequence-reconstruction", difficulty: "Medium", premium: true },
      { title: "Find All Possible Recipes from Given Supplies", slug: "find-all-possible-recipes-from-given-supplies", difficulty: "Medium" },
      { title: "Parallel Courses III", slug: "parallel-courses-iii", difficulty: "Hard" },
      { title: "Sort Items by Groups Respecting Dependencies", slug: "sort-items-by-groups-respecting-dependencies", difficulty: "Hard" },
      { title: "Build a Matrix With Conditions", slug: "build-a-matrix-with-conditions", difficulty: "Hard" },
      { title: "Largest Color Value in a Directed Graph", slug: "largest-color-value-in-a-directed-graph", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Build systems",
        text: "Make, Bazel and Turborepo order compile steps so every target builds after the targets it depends on, and report an error on circular dependencies.",
      },
      {
        title: "Package managers",
        text: "npm, apt and pip install dependencies before the packages that need them by topologically sorting the dependency graph.",
      },
      {
        title: "Spreadsheet recalculation and DAG schedulers",
        text: "Excel recomputes cells in dependency order and flags circular references; Airflow runs DAG tasks only after their upstream tasks finish.",
      },
    ],
  },
  {
    id: "union-find",
    name: "Union-Find (Disjoint Set Union)",
    intuition:
      "Keep a parent pointer per node; two nodes are in the same group when they lead to the same root. Merging groups is just pointing one root at another, and with path compression plus union by rank both find and union run in nearly O(1). It shines when edges arrive one at a time and you need to answer \"are these already connected?\" without re-running a full DFS each time.",
    signals: [
      "number of connected components / groups",
      "is adding this edge going to create a cycle",
      "merge accounts / sets that share an element",
      "edges arrive over time, query connectivity",
      "is this graph a valid tree",
    ],
    template: `class UnionFind {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]); // path compression
    return this.parent[x];
  }
  union(a: number, b: number): boolean {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false; // already connected: this edge makes a cycle
    if (this.rank[ra] < this.rank[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    return true;
  }
}`,
    related: [
      { title: "Accounts Merge", slug: "accounts-merge", difficulty: "Medium" },
      { title: "Satisfiability of Equality Equations", slug: "satisfiability-of-equality-equations", difficulty: "Medium" },
      { title: "Most Stones Removed with Same Row or Column", slug: "most-stones-removed-with-same-row-or-column", difficulty: "Medium" },
      { title: "Number of Operations to Make Network Connected", slug: "number-of-operations-to-make-network-connected", difficulty: "Medium" },
      { title: "Smallest String With Swaps", slug: "smallest-string-with-swaps", difficulty: "Medium" },
      { title: "Lexicographically Smallest Equivalent String", slug: "lexicographically-smallest-equivalent-string", difficulty: "Medium" },
      { title: "Regions Cut By Slashes", slug: "regions-cut-by-slashes", difficulty: "Medium" },
      { title: "Redundant Connection II", slug: "redundant-connection-ii", difficulty: "Hard" },
      { title: "Number of Islands II", slug: "number-of-islands-ii", difficulty: "Hard", premium: true },
      { title: "Similar String Groups", slug: "similar-string-groups", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Kruskal's MST in network design",
        text: "Kruskal's algorithm uses union-find to skip any cable or road that would connect two already-connected sites, which is how it builds a minimum spanning tree.",
      },
      {
        title: "Identity resolution",
        text: "CRMs and fraud systems merge user records that share an email, phone or device ID; each shared field is a union, and each final root is one real person.",
      },
      {
        title: "Type inference and compilers",
        text: "Hindley-Milner type inference unifies type variables with union-find, and register allocators group variables that must share a location.",
      },
    ],
  },
  {
    id: "shortest-path",
    name: "Weighted Shortest Path (Dijkstra / Bellman-Ford)",
    intuition:
      "With non-negative weights, always expand the unvisited node with the smallest known distance (min-heap); that distance can never improve later, so each node is finalized once in O(E log V). When there is an extra limit such as \"at most k stops\", or negative edges, relax every edge in rounds (Bellman-Ford), where round i finds the best paths using at most i edges.",
    signals: [
      "weighted edges / travel time / cost",
      "minimum time for a signal to reach all nodes",
      "cheapest route",
      "at most k stops",
      "minimize the maximum height/effort along a path",
    ],
    template: `function dijkstra(n: number, adj: [number, number][][], src: number): number[] {
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  const heap: [number, number][] = [[0, src]]; // [distance, node]; use a real min-heap in practice
  while (heap.length > 0) {
    heap.sort((a, b) => a[0] - b[0]);
    const [d, u] = heap.shift()!;
    if (d > dist[u]) continue; // stale entry
    for (const [v, w] of adj[u]) {
      if (d + w < dist[v]) {
        dist[v] = d + w;
        heap.push([dist[v], v]);
      }
    }
  }
  return dist;
}`,
    related: [
      { title: "Path with Maximum Probability", slug: "path-with-maximum-probability", difficulty: "Medium" },
      { title: "Path With Minimum Effort", slug: "path-with-minimum-effort", difficulty: "Medium" },
      { title: "Find the City With the Smallest Number of Neighbors at a Threshold Distance", slug: "find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance", difficulty: "Medium" },
      { title: "Number of Ways to Arrive at Destination", slug: "number-of-ways-to-arrive-at-destination", difficulty: "Medium" },
      { title: "The Maze II", slug: "the-maze-ii", difficulty: "Medium", premium: true },
      { title: "Minimum Cost to Make at Least One Valid Path in a Grid", slug: "minimum-cost-to-make-at-least-one-valid-path-in-a-grid", difficulty: "Hard" },
      { title: "Minimum Obstacle Removal to Reach Corner", slug: "minimum-obstacle-removal-to-reach-corner", difficulty: "Hard" },
      { title: "Minimum Weighted Subgraph With the Required Paths", slug: "minimum-weighted-subgraph-with-the-required-paths", difficulty: "Hard" },
      { title: "Reachable Nodes In Subdivided Graph", slug: "reachable-nodes-in-subdivided-graph", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Maps and navigation",
        text: "Route planners run Dijkstra (or A*, Dijkstra plus a distance heuristic) over road segments weighted by travel time.",
      },
      {
        title: "OSPF and BGP routing",
        text: "OSPF routers run Dijkstra over link costs to build their forwarding tables; distance-vector protocols like RIP are distributed Bellman-Ford.",
      },
      {
        title: "Flight search with stop limits",
        text: "Fare engines find the cheapest itinerary with at most k connections by relaxing edges in k+1 rounds, the same idea as Cheapest Flights Within K Stops.",
      },
    ],
  },
  {
    id: "mst",
    name: "Minimum Spanning Tree (Prim / Kruskal)",
    intuition:
      "To connect every node at minimum total cost, the cheapest edge that crosses between the connected part and the rest is always safe to take. Prim grows one tree using a min-heap of crossing edges; Kruskal sorts all edges and keeps each one unless union-find says its endpoints are already connected. Both avoid trying combinations of edges and finish in O(E log E).",
    signals: [
      "connect all points / cities / houses",
      "minimum total cost to connect",
      "cost is the distance between every pair of points",
      "any two nodes must be reachable, spend as little as possible",
    ],
    template: `function kruskal(n: number, edges: [number, number, number][]): number {
  // edges: [weight, a, b]
  edges.sort((x, y) => x[0] - y[0]);
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  let total = 0, used = 0;
  for (const [w, a, b] of edges) {
    const ra = find(a), rb = find(b);
    if (ra === rb) continue; // would form a cycle
    parent[ra] = rb;
    total += w;
    if (++used === n - 1) break;
  }
  return total;
}`,
    related: [
      { title: "Connecting Cities With Minimum Cost", slug: "connecting-cities-with-minimum-cost", difficulty: "Medium", premium: true },
      { title: "Minimum Score of a Path Between Two Cities", slug: "minimum-score-of-a-path-between-two-cities", difficulty: "Medium" },
      { title: "Optimize Water Distribution in a Village", slug: "optimize-water-distribution-in-a-village", difficulty: "Hard", premium: true },
      { title: "Find Critical and Pseudo-Critical Edges in Minimum Spanning Tree", slug: "find-critical-and-pseudo-critical-edges-in-minimum-spanning-tree", difficulty: "Hard" },
      { title: "Checking Existence of Edge Length Limited Paths", slug: "checking-existence-of-edge-length-limited-paths", difficulty: "Hard" },
      { title: "Remove Max Number of Edges to Keep Graph Fully Traversable", slug: "remove-max-number-of-edges-to-keep-graph-fully-traversable", difficulty: "Hard" },
      { title: "Number of Good Paths", slug: "number-of-good-paths", difficulty: "Hard" },
    ],
    realWorld: [
      {
        title: "Laying cable and pipes",
        text: "Telecom, power and water utilities plan the cheapest network of lines that still reaches every site, which is an MST over candidate links.",
      },
      {
        title: "Spanning Tree Protocol",
        text: "Ethernet switches run STP to disable redundant links and keep a loop-free spanning tree, choosing links by cost toward a root bridge.",
      },
      {
        title: "Clustering",
        text: "Single-linkage clustering builds an MST over data points and cuts its k-1 most expensive edges to get k clusters.",
      },
    ],
  },
];
