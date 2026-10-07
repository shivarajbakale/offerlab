# Quadtree

## What it is

- **What it is:** A tree that indexes points on a map by cutting the map into four equal quarters, and cutting any quarter into four again whenever it holds too many points. Crowded areas end up with small cells and empty areas with big ones.
- **The problem it solves:** Finding the points inside a box by checking every point is too slow, and a fixed grid cannot suit both a crowded city and an empty desert with one cell size. A quadtree lets a search skip every cell that misses the box, so it looks only at points near the box.
- **Reach for it when:** Points sit in one machine's memory, are spread very unevenly, and you answer many "what is in this box?" or "who is nearest?" queries, such as the drivers of one city in a matching service, or the objects in a game world.
- **Not the right tool when:** Points live in a database shared by many servers, or there are too many for one machine's memory; store a [geohash](#/sd-01-partitioning/003-geohash) or S2 cell id as a sorted key and use range reads instead. For shapes rather than points, databases use R-trees.
- **Where you'll meet it:** Finkel and Bentley's 1974 paper; games and 3D graphics, where its three-dimensional cousin, the octree, speeds up collision checks; web map tiles, which quarter the world at each zoom level; and interview questions such as "Design Yelp" or "Design Uber", where a quadtree of places or drivers is a common answer.

## In plain words

A ride-hailing app has to answer "which drivers are near this rider?" many times a second, while thousands of drivers move around a city. Checking every driver each time is too slow. Cutting the city into a fixed grid helps, but the busy centre needs small squares and the quiet suburbs big ones, and one fixed grid can't do both.

A quadtree cuts the map the way you would sort a growing pile of paper: when one tray gets too full, split it into four smaller trays. Busy areas end up cut into many small squares, and empty areas stay as one big square. To search, you only open the squares that overlap the area you care about, and ignore the rest of the city.

In the picture on the right, the map is a city 10 km across, with streets drawn only for the feel of a map. Dots are drivers, labelled with short names (a, b, p1, …). Each outlined square is one cell of the tree; a cell that gets more than 4 drivers splits into four quarters, so you can watch the squares get smaller where drivers crowd. In a search, the red cross is the rider, the dashed box is the area around them, filled squares are the cells the search looked inside, and drivers that turn orange are the ones it found. The scale bar gives real distances, and the box at the top says what just happened.

## Words we'll use

- **Point** — one place on a flat map, given by two numbers: x (left to right) and y (bottom to top). Here the map runs from 0 to 100 both ways.
- **Range search** — "give me every point inside this box". The box is drawn dashed.
- **Cell** — a rectangle of the map.
- **Grid** — the map cut into cells that are all the same size.
- **Capacity** — the most points one cell may hold before it splits. Here it is 4.
- **Split** — cutting a cell into four equal quarters and handing its points down to them.
- **Node** — one cell in the tree. The top node covers the whole map; a node that has split has four **children**, one per quarter.
- **Leaf** — a node that has not split. Only leaves hold points.
- **Depth** — how many splits lie above a node. The top node is at depth 0, its quarters at depth 1, and so on.
- **Prune** — skip a node, and everything below it, without looking inside.

## The world we're in

- There are many points in memory, such as drivers, shops or objects in a game.
- They are spread very unevenly: crowded in a few places, sparse almost everywhere else.
- Range searches come often (every map scroll, every "who is near me?"), so checking every point each time is too slow.

## The goal

Answer a range search by looking at roughly the points near the box, not at every point, however unevenly the points are spread.

## The naive attempt

"Keep all the points in one list, and check each one against the box." It is simple and always right. But every search reads every point, near or far. Here 40 points are stored and the box holds 3 of them, yet all 40 are checked.
[▶ Broken: 40 points checked to find 3](play:broken: no capacity@at=result)

A fixed grid helps: check only the grid cells that touch the box. But one cell size can't suit both a city and a desert. Cells small enough for the crowded downtown leave millions of empty cells elsewhere; cells big enough for the countryside put thousands of points in each downtown cell.

## Building it up

**1. Split a cell only when it gets too full.** Start with one cell for the whole map. Points go into it until it holds 4. Here a fifth point arrives, so the cell holds 5, one more than its capacity.
[▶ The fifth point makes the cell too full](play:split@at=stored#1)
The cell splits into four equal quarters.
[▶ The cell splits into four quarters](play:split@at=split)
Its points are handed down to the quarter each one sits in: a, c and d go to three of the quarters, and b and e to the top-right one. The top node now holds no points; it only points to its four children.
[▶ The last point lands in its quarter](play:split@at=stored#6)

**2. Cells get small only where the points are.** A cell only splits when its own points overflow it. In this run, 4 points are spread over the map, then 14 arrive in a small cluster near (67, 67). The cluster's cell overflows, splits, and its quarters overflow and split again, down to cells less than 2 units across.
[▶ The sixth split, deep inside the cluster](play:dense area@at=split#6)
At the end, the bottom-left quarter, which holds only two points, is still one cell 50 units across. The test checks that the cluster's points sit at depth 3 or deeper, and that the empty corner's leaf is at depth 1.
[▶ Small cells in the cluster, big cells elsewhere](play:dense area@at=stored#44)

**3. A search only goes into cells that touch the box.** 40 points are stored, and the tree has 25 nodes. The search starts at the top node, which covers everything, so it is visited.
[▶ The search starts at the top node](play:query@at=visit#1)
In each visited leaf, the points are checked against the box. The first match is found after checking only one point.
[▶ The first point inside the box](play:query@at=found#1)
A node whose cell does not touch the box is skipped with one comparison, and nothing under it is looked at.
[▶ A whole cell outside the box is skipped](play:query@at=skip#1)
In the end the search visits 6 of the 25 nodes and checks 8 of the 40 points to return all 3 inside the box.
[▶ 6 nodes visited, 8 points checked, 3 found](play:query@at=result)

**4. Cap the depth.** If many points share exactly the same spot, no split can ever separate them: they all land in the same quarter again and again. Without a limit the tree would split forever. So splitting stops at a maximum depth (8 here), and a leaf at that depth simply holds more than its capacity.

## Why it works now

- Each node's cell contains all of its children's cells. So if a node's cell misses the box, every point below it misses the box too, and skipping it can't lose an answer. The test checks that the search returns exactly the points a full scan finds.
- Splitting follows the points, so crowded areas get small cells and every leaf holds only a few points. A search near the cluster checks a few small cells; a search in the countryside checks a few big ones.
- The tests check that the search visits fewer nodes than the tree has and checks fewer than half the points [▶ see it](play:query@at=result), while the unsplit version checks all 40 [▶ see it](play:broken: no capacity@at=result).

## What it costs

- **Inserts walk down the tree**, one step per level, and a split moves a few points.
- **Memory for nodes and links.** Every split adds four nodes.
- **Uneven shape.** A cluster makes a deep, narrow part of the tree. Inserting and searching there take more steps.
- **Moving points are awkward.** A point that moves has to be removed and inserted again, and cells that empty out are not merged back unless you write code to do it.
- **It lives in memory.** The tree is nodes joined by references, which doesn't map directly onto a database's sorted keys.

## Staff notes

- **Rebuild or update?** For moving things such as drivers, many systems rebuild the tree from scratch every few seconds instead of updating it point by point. Building from a fresh list is fast and leaves no stale cells behind.
- **When a geohash in a key-value store is better (lesson 003).** If the points live in a database, are shared by many servers, or there are too many for one machine's memory, store a geohash or S2 cell id as a key and use range scans. A quadtree suits one machine's in-memory index, for example a matching service that holds the drivers of one city.
- **Choosing the capacity.** A small capacity means more nodes and deeper trees; a large one means more points checked per leaf. Values from a handful up to a few dozen are common.
- **Nearest-neighbour search** ("the 5 closest drivers") also works on a quadtree: search the cells nearest the location first, and stop once no unvisited cell can hold anything closer than what you have.
- **Related structures.** k-d trees split on one coordinate at a time, at the data's median. R-trees, used by many databases for spatial indexes, group nearby shapes into overlapping boxes instead of cutting space into equal quarters.

## Check yourself

- **Q:** A cell with capacity 4 already holds 4 points. What happens when a fifth arrives?
  A: The cell splits into four equal quarters, and all five points move down into the quarter that contains each of them. [▶ See it](play:split@at=split)
- **Q:** Why can the search skip a node without looking at any of the points below it?
  A: Every point below a node lies inside that node's cell. If the cell doesn't touch the box, none of those points can be in the box. [▶ See it](play:query@at=skip#1)
- **Q:** 14 points are added in one small area. Where does the tree get deeper?
  A: Only around that area. The quarters far away never overflow, so they stay big. [▶ See it](play:dense area@at=stored#44)
- **Q:** Without a capacity limit, how many points does a search check?
  A: All of them. Nothing ever splits, so there is one cell holding everything, and the search must check every point. [▶ See it](play:broken: no capacity@at=result)

## When to use which

- **Quadtree** — the points fit in one machine's memory, are spread very unevenly, and are searched by area or nearest-first. Example: a matching service that holds the live drivers of one city, a game world, or the objects on a map screen. For moving points, many systems simply rebuild the tree every few seconds.
- **[Geohash](#/sd-01-partitioning/003-geohash) (or S2 / H3 cell ids)** — the points live in a database shared by many servers, or there are too many for one machine. Store the cell id as a sorted key and use range reads. Example: millions of restaurants for a "Design Yelp" proximity service.
- **A fixed grid** — the points are spread fairly evenly and you want the simplest code: cut the map into equal squares and keep a list per square.
- **R-tree (inside a spatial database)** — you store shapes such as roads, buildings or delivery zones, not just points, or you'd rather let PostGIS or a similar database do it.
- **k-d tree** — static points in memory where you mostly ask for the nearest neighbours, such as a fixed list of stores.
- **[Consistent hashing](#/sd-01-partitioning/001-consistent-hashing)** — when you need to split the data across servers. It ignores location, so it is often combined with the above: shard drivers by city or by geohash prefix, then keep a quadtree per shard.
- **In an interview:** for "Design Uber", say each city's live driver locations sit in an in-memory quadtree (or a geohash index in Redis), updated every few seconds, and that a search reads only the cells around the rider. Point out that the tree splits only where drivers crowd.

## Deep dive

- Raphael Finkel and Jon Bentley, "Quad Trees: A Data Structure for Retrieval on Composite Keys" (1974), introduced the point quadtree. The version here, which always splits a cell into four equal quarters, is often called a point-region (PR) quadtree.
- The same idea in three dimensions, splitting into eight, is the octree, common in 3D graphics and games.
- Map tile schemes used by web maps divide the world into four tiles at each zoom level, which is the same quartering.
