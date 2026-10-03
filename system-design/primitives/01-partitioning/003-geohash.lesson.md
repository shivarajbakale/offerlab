# Geohash

## What it is

- **What it is:** A way to turn a latitude and longitude into a short text, such as `gcpuzg`, that names a rectangle on the map. Each extra character names a smaller rectangle inside the last one, so places in the same rectangle share the start of their text.
- **The problem it solves:** A database that keeps keys in sorted order can only keep places together along one value, so sorting by latitude finds a thin strip around the whole planet, not the places near you. Geohash folds both coordinates into one sortable key, so "what is near me?" becomes a few reads of keys that share a prefix.
- **Reach for it when:** Places are stored in a sorted key-value store or database with no map index, the question is "what is within a few kilometres of here?", and places are spread evenly enough that one cell size suits most areas.
- **Not the right tool when:** Places are crowded in some areas and sparse in others and fit in one machine's memory; a [quadtree](#/sd-01-partitioning/004-quadtree) makes cells small only where places crowd. If your database already has a spatial index, or you need cells of more even area, use that index or a library such as Google's S2 or Uber's H3.
- **Where you'll meet it:** Redis's GEOADD and GEOSEARCH, which store each point as a geohash-style 52-bit score in a sorted set; Elasticsearch's geohash grid aggregation; Gustavo Niemeyer's geohash.org (2008); and interview questions such as "Design Yelp" or "Design a proximity service".

## Words we'll use

- **Latitude** — how far north or south a place is, from -90 (South Pole) to 90 (North Pole) degrees. Drawn up and down here.
- **Longitude** — how far east or west a place is, from -180 to 180 degrees. 0 runs through Greenwich in London. Drawn left and right here.
- **Sorted key-value store** — a database that keeps records in order of a text key and can quickly read every record whose key falls in a range, for example every key starting with `gcpuz`. Reading such a range is a **range scan**.
- **Cell** — a rectangle on the map.
- **Bit** — a single 0 or 1.
- **Base 32** — writing every group of 5 bits as one character, using 32 symbols (the digits and most letters).
- **Geohash** — a short text, such as `gcpuzg`, that names a cell. Each extra character names a smaller cell inside the last one.
- **Prefix** — the first few characters of a text. `gcp` is a prefix of `gcpuzg`.
- **Precision** — how many characters of a geohash are used. More characters, smaller cell.
- **Neighbours** — the 8 cells of the same size that touch a cell: north, south, east, west and the four corners.

## The world we're in

- There are millions of places (cafes, drivers, shops), each with a latitude and longitude.
- They live in a sorted key-value store. It can find a key, or scan a range of keys, quickly. It has no idea what a map is.
- Users ask "what is near me?" all the time, so a search must not read the whole store.

## The goal

Find every place within a short distance of a location, using only a few range scans of a sorted store.

## The naive attempt

"Sort the places by latitude, and read the range of latitudes near me." That finds everything at my latitude, but that is a thin strip right around the planet, full of places thousands of kilometres east and west. One number can't keep places that are close in two directions together.

"Then cut the map into a grid of cells, give each cell a name, store each place under its cell's name, and read only the cell I am standing in." This is much better: the cell is one range of the store. Here the search location (the red crosshair) is near the Royal Observatory in Greenwich, and the dashed box is the area we want: everything within about one cell's width. The park, in the same cell, is found.
[▶ Broken: only the location's own cell is searched](play:broken: prefix only@at=found)
But the cafe, about 120 metres east and inside the dashed box, is in the next cell over, so it is never read. A search that misses the nearest cafe is wrong.
[▶ Broken: the cafe across the edge is missed](play:broken: prefix only@at=result)

## Building it up

**1. Name cells by halving the map, and alternate the coordinates.** Start with the whole world. Is the place in the west or east half of the longitudes? Write 0 for west, 1 for east, and keep only that half. Here the first bit is 0: the observatory is just west of longitude 0.
[▶ The first bit keeps the western half](play:encode@at=west#1)
Then do the same with latitude (south 0, north 1), then longitude again, and so on. Every bit halves the box. Every 5 bits become one character. After 5 bits the box is the cell `g`, 45° wide and 45° tall.
[▶ The first character, g](play:encode@at=char#1)
The second character, `gc`, is a cell inside `g`, 32 times smaller.
[▶ The second character, gc, inside g](play:encode@at=char#2)
After 6 characters the cell `gcpuzg` is about 760 metres wide and 610 metres tall here.
[▶ Six characters: gcpuzg](play:encode@at=char#6)
After 8, `gcpuzgqb` is about 24 by 19 metres.
[▶ Eight characters: a cell of a few metres](play:encode@at=char#8)

**2. A shared prefix means a shared cell, and a range in the sorted store.** Two places in the same cell have geohashes that start with the same characters, so sorting by geohash puts them next to each other. A park and a pond 70 metres apart share 6 characters, `gcpuzg`. A station 2 kilometres away shares only 5. Reading "every key that starts with `gcpuzg`" is a single range scan.
[▶ park, pond and station, with their geohashes](play:prefix@at=inserted#3)

**3. But a cell edge can split two close places completely.** The longitude 0 line is the edge between the very first halves, so a place just west of it starts with `g` and a place just east starts with `u`. Two places 42 metres apart share no prefix at all. Here the east point's cells narrow down to `u10hb520`, while the west point, just across the edge, is `gcpuzgrb`.
[▶ 42 metres apart, and no shared prefix](play:edge@at=char#16)
This is why reading only your own cell misses things: being close does not always mean sharing a prefix. Every cell has edges, and every place is near one.

**4. Search the cell and its 8 neighbours.** The search first encodes the location to the chosen precision to get its own cell, `gcpuzg`. Then it works out the 8 cells of the same size around it. Those 9 cells cover a 3-by-3 block, and the dashed box (one cell's width in every direction) always fits inside it, wherever the location sits in its cell.
[▶ The 9 cells to search, around gcpuzg](play:search@at=cells)
Each cell is one range scan. The own cell gives the park.
[▶ The own cell: the park is returned](play:search@at=found#1)
The cell to the north gives the pier.
[▶ The cell to the north: the pier](play:search@at=found#2)
And the cell to the east, `u10hb5`, across the meridian, gives the cafe that the naive search missed.
[▶ The cell to the east: the cafe is found](play:search@at=found#3)
A candidate is only returned if it is inside the dashed box: the school is in a neighbouring cell, but beyond the box, so it is checked and left out.

**5. Choose the precision from the search radius.** Each character divides the cell by 32. At the equator, 5 characters is about 4.9 km square, 6 is about 1.2 km by 0.6 km, and 7 about 150 m square. Pick the precision whose cell is at least as big as the radius you need, so the 3-by-3 block covers it, then filter the candidates by their real distance.

## Why it works now

- A geohash prefix is exactly a cell, because every character only ever narrows the box it came from. The test checks that each cell sits inside the one before it and is 32 times smaller.
- A sorted store keeps all keys with the same prefix together, so one cell is one range scan.
- Any place within one cell's width of the location lies in the location's own cell or one of its 8 neighbours. The search reads all 9, so it cannot miss one. The test checks that the cafe across the edge is found [▶ see it](play:search@at=found#3), and that it is missed when only the own cell is read [▶ see it](play:broken: prefix only@at=result).

## What it costs

- **9 range scans per search**, instead of one. Most return few points, but each is a separate read.
- **Cells are rectangles of fixed size.** A cell in a city may hold thousands of places, and one in the desert none. You can't make cells small in the city and big in the desert with one precision (a quadtree, lesson 004, can).
- **Extra candidates.** The 9 cells cover more ground than a circle around you, so candidates must still be filtered by real distance.
- **Cells are not square in metres.** A degree of longitude gets shorter toward the poles, so the same geohash length covers less east-west distance in Oslo than in Singapore.

## Staff notes

- **Precision is a choice per query, not per point.** Store a long geohash (say 8 to 12 characters) for every point, and query with whatever prefix length fits the radius. Range scans on shorter prefixes still work.
- **Hot cells.** A cell over a stadium or a city centre can hold far more points than its neighbours. Large systems often split work by more than the cell, or use adaptive structures.
- **Alternatives.** Google's S2 library projects the sphere onto a cube and numbers cells along a space-filling curve, which keeps cell sizes more even. Uber's H3 uses hexagons, which have six neighbours at the same distance. Both still turn a location into a cell id you can store and scan.
- **Many stores already do this.** Redis keeps its geo indexes as geohash-like numbers in a sorted set. Before building your own, check what the store offers.

## Check yourself

- **Q:** Two places are 42 metres apart. Must their geohashes share a prefix?
  A: No. If a cell edge runs between them, they can differ from the very first character. Here one is `gcpuzgrb` and the other `u10hb520`. [▶ See it](play:edge@at=char#16)
- **Q:** Why does each extra character make the cell 32 times smaller?
  A: A character is 5 bits, and every bit halves the box, alternating longitude and latitude. Five halvings make it 32 times smaller. [▶ See it](play:encode@at=char#2)
- **Q:** The search reads only the cell you are standing in. What does it miss?
  A: Anything close by that sits across an edge of your cell. Here the cafe, 120 metres east, is missed. [▶ See it](play:broken: prefix only@at=result)
- **Q:** How many range scans does the full search do, and why that many?
  A: Nine: your own cell and the 8 cells around it, so that every near place is covered whatever edge it lies across. [▶ See it](play:search@at=cells)

## Deep dive

- Geohash was published by Gustavo Niemeyer in 2008 together with the geohash.org service.
- Interleaving the bits of two coordinates is the Z-order (or Morton) curve, described by G. M. Morton in 1966. It is a space-filling curve: a path that visits every cell once, keeping most near cells near each other along the path.
- Redis's GEOADD and GEOSEARCH, Elasticsearch's geohash grid aggregation, and many databases' spatial indexes build on these ideas.
