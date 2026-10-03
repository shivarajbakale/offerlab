/**
 * 002. Rendezvous Hashing
 * Level: Staff
 * Group: Partitioning
 *
 * Problem: Pick a server for each key so that every client agrees, without storing any shared
 *   table or ring, and so that adding or removing a server moves only the keys that must move.
 *
 * Approach: Highest random weight
 *   For a key, give every server a score: the hash of the server's name joined with the key.
 *   The server with the highest score owns the key. A server's score for a key never depends on
 *   the other servers, so removing a server only changes the winner for keys it had won, and a
 *   new server only takes the keys where its score beats the old winner's.
 *
 * Cost: lookup O(n) hashes for n servers; no memory beyond the server list; adding or removing
 *   a server is O(1), and about 1/n of the keys move.
 *
 * Pattern: partitioning
 * Key insight: Each key holds its own election, and every server's vote (score) is fixed by the
 *   server's name and the key alone. Candidates joining or leaving cannot change how the others
 *   rank against each other.
 * Tradeoffs: Nothing to store or rebuild, and the split is even without virtual nodes, but each
 *   lookup hashes once per server. Fine for tens of servers; for thousands, a ring's O(log n)
 *   search, or a hierarchy of rendezvous choices, is cheaper.
 * Staff notes: Picking the top k scores instead of the top one gives k replicas, and when a
 *   server leaves, each key's next choice is already known. Weighted variants scale each score
 *   so a bigger server wins more often. Lookups can be cached per key. Every client must use
 *   the same hash and the same server names, or they disagree.
 * Interview signals: "choose a cache node per object", "sticky routing without shared state",
 *   "small, changing set of servers", "replica placement".
 * Real world: Introduced by Thaler and Ravishankar (1996) as highest random weight (HRW)
 *   hashing. It is used for choosing cache servers, for example in Microsoft's Cache Array
 *   Routing Protocol (CARP), and in some load balancers and storage systems.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Not exported, so the visualizer runs it silently: one hash is one step, not a loop of them.
class Hash {
  /** 32-bit FNV-1a over the characters, then a final mix (from MurmurHash3). */
  static of(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    // @why FNV-1a alone leaves similar strings close together; the mix spreads them over the whole range.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
}

export class RendezvousHash {
  // @viz grid:scores labels:servers,keys hide:row,key,keys
  servers: string[] = [];
  // For drawing only: the keys in the score table, one row each.
  keys: string[] = [];
  // For drawing only: scores[i][j] is server j's score for key i.
  scores: number[][] = [];
  // For drawing only: the winner of each row.
  owners: string[] = [];
  // How many scores have been computed so far, to show what a lookup costs.
  hashes = 0;

  addServer(server: string) {
    this.servers.push(server);
  }

  removeServer(server: string) {
    // @why Nothing else to update: there is no ring or table to rebuild. The other servers' scores do not change.
    this.servers = this.servers.filter((s) => s !== server); // @mark remove
  }

  score(server: string, key: string): number {
    this.hashes++;
    // @why The key is part of the hashed text, so each key ranks the servers in its own random order.
    // @why Four digits keep the table readable; a real system keeps all 32 bits so ties almost never happen.
    return Hash.of(`${server}|${key}`) % 10_000;
  }

  owner(key: string): string {
    let best = "";
    let bestScore = -1;
    for (const server of this.servers) {
      const s = this.score(server, key); // @mark score
      // @why Ties are broken by name, so every client picks the same winner.
      if (s > bestScore || (s === bestScore && server < best)) {
        best = server;
        bestScore = s; // @mark lead
      }
    }
    return best; // @mark winner
  }

  /** Fills the drawn table: every server's score for every key, and each row's winner. */
  scoreTable(names: string[]): string[] {
    this.keys = names;
    this.scores = [];
    this.owners = [];
    for (let i = 0; i < names.length; i++) {
      const row: number[] = [];
      this.scores.push(row);
      for (let j = 0; j < this.servers.length; j++) row.push(this.score(this.servers[j], names[i]));
      this.owners.push(this.owner(names[i])); // @mark row
    }
    return this.owners; // @mark done
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: the score hashes only the server's name, so every key ranks the servers the same way.
export class ScoreIgnoresKey extends RendezvousHash {
  score(server: string, key: string): number {
    this.hashes++;
    return Hash.of(server) % 10_000; // @mark nokey
  }
}

const SERVERS = ["A", "B", "C"];
const KEYS = ["user:1", "user:2", "user:3", "user:4", "user:5", "user:6", "user:7", "user:8"];

function build(servers: string[], broken = false): RendezvousHash {
  const r = broken ? new ScoreIgnoresKey() : new RendezvousHash();
  for (const s of servers) r.addServer(s);
  return r;
}

function ownersOf(r: RendezvousHash, n: number): string[] {
  const owners: string[] = [];
  for (let i = 0; i < n; i++) owners.push(r.owner(`k${i}`));
  return owners;
}

function tableOf(r: RendezvousHash, keys: string[]): string[] {
  r.scoreTable(keys);
  return [...r.owners];
}

function movedFraction(before: string[], after: string[]): number {
  let moved = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) moved++;
  return moved / before.length;
}

test("pick: the highest score wins", () => {
  const r = build(SERVERS);
  r.scoreTable(KEYS.slice(0, 6));
  const winner = r.owner("user:3");
  const row = r.scores[2];
  assert.equal(winner, SERVERS[row.indexOf(Math.max(...row))]);
  r.scores.forEach((row, i) => assert.equal(r.owners[i], SERVERS[row.indexOf(Math.max(...row))]));
});

test("remove a server: only its keys move", () => {
  const r = build([...SERVERS, "D"]);
  const before = tableOf(r, KEYS);
  r.removeServer("B");
  r.scoreTable(KEYS);
  const after = r.owners;
  assert.ok(before.includes("B"));
  KEYS.forEach((_, i) => {
    if (before[i] === "B") assert.notEqual(after[i], "B");
    else assert.equal(after[i], before[i]);
  });
});

test("add a server: about 1/(n+1) of keys move", () => {
  const r = build(SERVERS);
  const before = ownersOf(r, 10_000);
  const beforeTable = tableOf(r, KEYS);
  r.addServer("D");
  r.scoreTable(KEYS);
  const after = ownersOf(r, 10_000);
  const fraction = movedFraction(before, after);
  assert.ok(fraction > 0.2 && fraction < 0.3, `moved ${fraction}`);
  // Every key that moved went to the new server: all 10,000, and the eight in the table.
  assert.deepEqual(after.filter((owner, i) => owner !== before[i] && owner !== "D"), []);
  KEYS.forEach((_, i) => assert.ok(r.owners[i] === beforeTable[i] || r.owners[i] === "D"));
});

test("cost: a lookup hashes once per server", () => {
  const r = build([...SERVERS, "D", "E"]);
  const before = r.hashes;
  r.owner("user:5");
  assert.equal(r.hashes - before, r.servers.length);
});

test("broken: score ignores the key — every key picks the same server", () => {
  const r = build(SERVERS, true);
  r.scoreTable(KEYS);
  const owners = ownersOf(r, 10_000);
  assert.equal(new Set(owners).size, 1);
  assert.equal(new Set(r.owners).size, 1);
});
