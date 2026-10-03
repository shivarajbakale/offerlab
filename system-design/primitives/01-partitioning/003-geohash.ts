/**
 * 003. Geohash
 * Level: Senior
 * Group: Partitioning
 *
 * Problem: Find the places near a location among millions, using a store that can only sort
 *   keys and scan a range of them. Sorting by latitude alone (or longitude alone) puts places
 *   next to each other in the list that are far apart on the map.
 *
 * Approach: Interleaved bits as a sortable key, plus the 8 neighbouring cells
 *   Halve the world's longitude range and record which half the point is in (one bit), then
 *   do the same for latitude, and keep alternating. Every 5 bits become one base-32
 *   character. Each prefix of the result names a rectangle (a cell), and longer prefixes
 *   name smaller cells inside it, so places in the same cell share a prefix and sit together
 *   in sorted order. A search scans the prefix range of the location's own cell and of the 8
 *   cells around it, because a near point can sit just across a cell edge.
 *
 * Cost: encoding O(p) for p characters; a search is 9 range scans in a sorted store, each
 *   O(log n + k) for k points in the cell.
 *
 * Pattern: partitioning, spatial index
 * Key insight: Interleaving the bits of longitude and latitude turns a 2D position into one
 *   string whose prefixes are nested rectangles, so "near" becomes mostly "same prefix", which
 *   any sorted key-value store can scan.
 * Tradeoffs: Simple, and works on any ordered store. But a cell edge can split two points a few
 *   metres apart into cells with no common prefix, so a search must check the neighbours, and
 *   cells are rectangles of fixed size that hold very different numbers of points in a city and
 *   in a desert.
 * Staff notes: Cells get narrower in real distance toward the poles, because lines of longitude
 *   meet there; a fixed precision does not mean a fixed radius. Pick the precision from the
 *   search radius, then filter the candidates by true distance. Alternatives such as Google's
 *   S2 (cells on a cube projected onto the sphere) and Uber's H3 (hexagons) have more even cell
 *   sizes. Use a quadtree (004) when the data is in memory and very uneven.
 * Interview signals: "find drivers near me", "nearby restaurants", "proximity search", "location
 *   as a database key", "Yelp", "Uber", "Tinder".
 * Real world: Geohash was published by Gustavo Niemeyer in 2008. Redis stores its geo indexes
 *   (GEOADD, GEOSEARCH) as geohash-like scores in a sorted set, and Elasticsearch supports
 *   geohash grid aggregations.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @why 32 symbols, so each character holds exactly 5 bits. The letters a, i, l and o are left out to avoid misreading.
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** A rectangle on the map: x is longitude, y is latitude, in degrees. */
export type Cell = { x0: number; y0: number; x1: number; y1: number; label?: string };
export type Place = { name: string; lat: number; lon: number; hash: string };

/** The geohash of a location: `precision` characters, each narrowing the cell. */
function encode(lat: number, lon: number, precision: number): string {
  // @why The whole world to start with; every bit halves it.
  const box: Cell = { x0: -180, y0: -90, x1: 180, y1: 90 };
  // For drawing only: the cell after each character.
  const trail: Cell[] = [];
  let hash = "";
  let ch = 0;
  let bits = 0;
  // @why Bits alternate longitude, latitude, longitude, ... so both coordinates narrow together.
  let lonBit = true;
  while (hash.length < precision) {
    if (lonBit) {
      const mid = (box.x0 + box.x1) / 2;
      if (lon >= mid) {
        ch = ch * 2 + 1;
        box.x0 = mid; // @mark east
      } else {
        ch = ch * 2;
        box.x1 = mid; // @mark west
      }
    } else {
      const mid = (box.y0 + box.y1) / 2;
      if (lat >= mid) {
        ch = ch * 2 + 1;
        box.y0 = mid;
      } else {
        ch = ch * 2;
        box.y1 = mid;
      }
    }
    lonBit = !lonBit;
    bits++;
    if (bits === 5) {
      hash += BASE32[ch];
      trail.push({ ...box, label: hash }); // @mark char
      ch = 0;
      bits = 0;
    }
  }
  return hash;
}

// Not exported, so the visualizer runs it silently: a search shows its scan, not 8 more encodings.
class Cells {
  /** The rectangle a geohash names. */
  static box(hash: string): Cell {
    const box: Cell = { x0: -180, y0: -90, x1: 180, y1: 90, label: hash };
    let lonBit = true;
    for (const c of hash) {
      const v = BASE32.indexOf(c);
      for (let b = 4; b >= 0; b--) {
        const bit = (v >> b) & 1;
        if (lonBit) {
          const mid = (box.x0 + box.x1) / 2;
          if (bit) box.x0 = mid;
          else box.x1 = mid;
        } else {
          const mid = (box.y0 + box.y1) / 2;
          if (bit) box.y0 = mid;
          else box.y1 = mid;
        }
        lonBit = !lonBit;
      }
    }
    return box;
  }

  /** The 8 cells of the same size around a cell: step one cell width and height from its centre. */
  static around(hash: string): string[] {
    const c = Cells.box(hash);
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const out: string[] = [];
    for (const dy of [1, 0, -1]) {
      for (const dx of [-1, 0, 1]) {
        if (dx === 0 && dy === 0) continue;
        const lat = (c.y0 + c.y1) / 2 + dy * h;
        // @why Longitude wraps around at 180; latitude does not, so there is nothing beyond a pole.
        const lon = ((((c.x0 + c.x1) / 2 + dx * w + 180) % 360) + 360) % 360 - 180;
        if (lat > -90 && lat < 90) out.push(encode(lat, lon, hash.length));
      }
    }
    return out;
  }
}

export class GeoIndex {
  // @viz spatial:trail|cells,points,box|query
  // @why Kept sorted by geohash, as a key-value store would keep them, so one cell is one range of the list.
  points: Place[] = [];
  // For drawing only: the cells the last search checked.
  cells: Cell[] = [];
  // For drawing only: what the last search covered, visited and returned.
  query: { box: Cell; visited: Cell[]; found: Place[] } | null = null;
  // How many stored points the last search looked at.
  checked = 0;
  // @why Characters stored per point. A search can use any shorter prefix of them.
  precision = 8;

  add(name: string, lat: number, lon: number): Place {
    const place = { name, lat, lon, hash: encode(lat, lon, this.precision) }; // @mark add
    let i = this.points.length;
    while (i > 0 && this.points[i - 1].hash > place.hash) i--;
    this.points.splice(i, 0, place); // @mark inserted
    return place;
  }

  /** Every stored point within one cell width (at this precision) of the location. */
  nearby(lat: number, lon: number, precision: number): Place[] {
    // @why One cell's size at this precision: longitude gets the extra bit when 5 × precision is odd.
    const w = 360 / 2 ** Math.ceil((5 * precision) / 2);
    const h = 180 / 2 ** Math.floor((5 * precision) / 2);
    this.query = { box: { x0: lon - w, y0: lat - h, x1: lon + w, y1: lat + h }, visited: [], found: [] };
    this.checked = 0;
    const center = encode(lat, lon, precision); // @mark center
    const prefixes = this.searchCells(center);
    this.cells = prefixes.map((p) => Cells.box(p)); // @mark cells
    for (let c = 0; c < prefixes.length; c++) {
      this.query.visited.push(this.cells[c]); // @mark visit
      // Every point in this cell is one range of the sorted list: from the first hash starting with the prefix.
      let i = this.firstAtOrAfter(prefixes[c]);
      while (i < this.points.length && this.points[i].hash.startsWith(prefixes[c])) {
        const p = this.points[i];
        this.checked++;
        // @why A cell's corner can be farther away than the search reaches, so each candidate is still checked.
        if (Math.abs(p.lat - lat) <= h && Math.abs(p.lon - lon) <= w) {
          this.query.found.push(p); // @mark found
        }
        i++;
      }
    }
    return this.query.found; // @mark result
  }

  // @why The location's own cell is not enough: a point a few metres away can be just across an edge. The 8 neighbours cover every side.
  searchCells(center: string): string[] {
    return [center, ...Cells.around(center)];
  }

  /** Binary search: index of the first point whose hash sorts at or after the prefix. */
  firstAtOrAfter(prefix: string): number {
    let lo = 0;
    let hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.points[mid].hash < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: searches only the location's own cell, so a point just across an edge is missed.
export class PrefixOnlyIndex extends GeoIndex {
  searchCells(center: string): string[] {
    return [center]; // @mark own
  }
}

// Around the Royal Observatory in Greenwich, where the prime meridian (longitude 0) is a cell edge at every precision.
const HERE = { lat: 51.4779, lon: -0.001 };
const PLACES: [string, number, number][] = [
  ["cafe", 51.4782, 0.0007],
  ["park", 51.4772, -0.006],
  ["pier", 51.483, -0.009],
  ["school", 51.484, 0.009],
  ["station", 51.495, -0.012],
  ["bridge", 51.47, 0.015],
];

function indexOf(broken = false): GeoIndex {
  const index = broken ? new PrefixOnlyIndex() : new GeoIndex();
  for (const [name, lat, lon] of PLACES) index.add(name, lat, lon);
  return index;
}

function sharedPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
}

function boxOf(hash: string): Cell {
  return Cells.box(hash);
}

function metres(a: Place, b: Place): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

test("encode: each extra character narrows the cell", () => {
  const index = new GeoIndex();
  const place = index.add("observatory", 51.4779, -0.0015);
  assert.equal(place.hash.length, 8);
  for (let k = 1; k < place.hash.length; k++) {
    const outer = boxOf(place.hash.slice(0, k));
    const inner = boxOf(place.hash.slice(0, k + 1));
    // Each cell lies inside the one before and is 32 times smaller.
    assert.ok(inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.y0 >= outer.y0 && inner.y1 <= outer.y1);
    const area = (c: Cell) => (c.x1 - c.x0) * (c.y1 - c.y0);
    assert.ok(Math.abs(area(outer) / area(inner) - 32) < 1e-6);
    assert.ok(inner.x0 <= place.lon && place.lon <= inner.x1 && inner.y0 <= place.lat && place.lat <= inner.y1);
  }
});

test("prefix: nearby points share a prefix", () => {
  const index = new GeoIndex();
  const park = index.add("park", 51.4772, -0.006);
  const pond = index.add("pond", 51.4776, -0.0052);
  const station = index.add("station", 51.495, -0.012);
  assert.ok(metres(park, pond) < 100);
  assert.ok(sharedPrefix(park.hash, pond.hash) >= 6);
  // Points sharing a long prefix sit next to each other in the sorted list.
  assert.ok(sharedPrefix(park.hash, station.hash) < sharedPrefix(park.hash, pond.hash));
});

test("edge: two points metres apart across a cell edge share no prefix", () => {
  const index = new GeoIndex();
  const west = index.add("west", 51.4779, -0.0003);
  const east = index.add("east", 51.4779, 0.0003);
  assert.ok(metres(west, east) < 50);
  assert.equal(sharedPrefix(west.hash, east.hash), 0);
});

test("search: checking the neighbours finds the near point", () => {
  const index = indexOf();
  const found = index.nearby(HERE.lat, HERE.lon, 6).map((p) => p.name);
  assert.deepEqual([...found].sort(), ["cafe", "park", "pier"]);
  // The cafe is in a different cell from the search location, across the meridian.
  assert.notEqual(index.points.find((p) => p.name === "cafe")!.hash.slice(0, 6), index.cells[0].label);
});

test("broken: prefix only — misses a point just across the edge", () => {
  const index = indexOf(true);
  const found = index.nearby(HERE.lat, HERE.lon, 6).map((p) => p.name);
  assert.ok(!found.includes("cafe"));
  assert.ok(found.includes("park"));
});
