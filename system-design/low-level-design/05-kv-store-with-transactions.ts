/**
 * 05. Key-Value Store with Transactions
 * Level: Senior
 * Group: Low-Level Design
 *
 * Problem: Design an in-memory key-value store with get, set and delete, plus transactions:
 *   BEGIN opens one, ROLLBACK undoes everything since the matching BEGIN, COMMIT keeps it.
 *   Transactions nest: a ROLLBACK undoes only the innermost open transaction, and the outer
 *   ones keep their changes. Reads inside a transaction see its own changes. BEGIN should not
 *   cost time proportional to the size of the store.
 *
 * Approach: The committed data, plus a stack of change layers
 *   `data` holds what is committed. Each BEGIN pushes an empty layer (a map) on a stack; set and
 *   delete write into the top layer only, a delete as a tombstone (null). A get looks in the
 *   layers from the top down and falls back to `data`: the first layer that mentions the key
 *   wins. ROLLBACK pops the top layer and throws it away; the layers below are untouched.
 *   COMMIT pops the top layer and copies it into the layer below, or into `data` if it was the
 *   outermost one.
 *
 * Cost: BEGIN and ROLLBACK O(1); set and delete O(1); get O(depth of nesting); COMMIT
 *   O(keys changed in the top layer). Memory: one entry per key changed per open layer.
 *
 * Pattern: stack of overlays (copy-on-write layers), tombstones
 * Key insight: Keep each transaction's changes apart, in its own layer, instead of in one
 *   shared change set or a copy of the whole store. Then undoing the innermost transaction is
 *   simply dropping its layer, and nothing it did can leak into, or erase, the outer ones.
 * Tradeoffs: Layers make BEGIN free and ROLLBACK free but make reads slower the deeper the
 *   nesting. An undo log (record each key's old value on write, replay backwards on rollback)
 *   writes straight into the data, so reads stay O(1), but rollback costs O(changes) and a
 *   reader outside the transaction would see uncommitted values. Copying the whole store at
 *   BEGIN is simplest and O(n) per BEGIN.
 * Staff notes: Interviewers probe: what COMMIT means when nested (here it folds into the
 *   parent; the classic "simple database" exercise instead commits every open level at once,
 *   so ask), how delete works inside a transaction (a tombstone, or the old value shows
 *   through), how to add COUNT(value) in O(1) (keep counts per value and adjust them in each
 *   layer), and concurrency (this is one session's view; many clients need isolation, which
 *   real stores give with locks or multi-version concurrency control).
 * Interview signals: "in-memory database", "BEGIN ROLLBACK COMMIT", "nested transactions",
 *   "undo", "savepoints".
 * Real world: SQL savepoints are nested rollback points inside one transaction (SAVEPOINT,
 *   ROLLBACK TO SAVEPOINT, RELEASE SAVEPOINT). Overlay layers are how copy-on-write file systems
 *   and container image layers present a merged view. Redis MULTI/EXEC queues commands but
 *   has no rollback.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/** A layer maps a key to its new value, or to null for "deleted in this transaction". */
export type Layer = Map<string, string | null>;
type Drawn = { name: string; changes: [string, string | null][] };

export class KVStore {
  // @viz levels:data,stack hide:value,layers
  // @why What is committed. Only the outermost COMMIT, or a write outside any transaction, changes it.
  data = new Map<string, string>();
  // @why One layer per open transaction, innermost last. Each holds only what its own transaction changed.
  layers: Layer[] = [];
  // @why For the picture only: the open layers, innermost last, with a dagger for a tombstone.
  stack: Drawn[] = [];

  get(key: string): string | undefined {
    // @why Innermost first: the newest change to a key hides every older one.
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (layer.has(key)) {
        const v = layer.get(key)!;
        // @why A tombstone: deleted in an open transaction, so the committed value must not show through.
        return v === null ? undefined : v; // @mark layerHit
      }
    }
    return this.data.get(key); // @mark base
  }

  set(key: string, value: string) {
    if (this.layers.length === 0) {
      this.data.set(key, value); // @mark direct
      return;
    }
    // @why Only the top layer is written. The layers below, and the data, keep their values for a rollback.
    this.layers[this.layers.length - 1].set(key, value); // @mark write
    picture(this);
  }

  delete(key: string) {
    if (this.layers.length === 0) {
      this.data.delete(key);
      return;
    }
    // @why Not removed: marked removed. Removing it from the layer would just let the older value show again.
    this.layers[this.layers.length - 1].set(key, null); // @mark tombstone
    picture(this);
  }

  begin() {
    // @why An empty layer. Nothing is copied, so BEGIN costs the same for ten keys or ten million.
    this.layers.push(new Map()); // @mark begin
    picture(this);
  }

  /** Undo the innermost open transaction. Returns false if none is open. */
  rollback(): boolean {
    if (this.layers.length === 0) {
      // @why Nothing to undo. Refusing is safer than guessing, and the caller learns its BEGINs and ROLLBACKs do not match.
      return false; // @mark noTx
    }
    // @why Throw the top layer away. The outer layers were never touched, so they are exactly as they were.
    this.layers.pop(); // @mark rollback
    picture(this);
    return true;
  }

  /** Keep the innermost open transaction's changes. Returns false if none is open. */
  commit(): boolean {
    const top = this.layers.pop();
    if (!top) return false;
    const below = this.layers[this.layers.length - 1];
    for (const [key, value] of top) {
      if (below) {
        // @why Nested: the changes become the outer transaction's changes. The outer one can still roll them back.
        below.set(key, value); // @mark fold
      } else if (value === null) {
        this.data.delete(key); // @mark apply
      } else {
        // @why The outermost commit: now, and only now, the data changes.
        this.data.set(key, value); // @mark applySet
      }
    }
    picture(this);
    return true;
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: one change set shared by every nesting level, and a depth counter.
export class FlatTxStore {
  data = new Map<string, string>();
  // @why Every open transaction's changes, mixed together. Nothing records which level made which change.
  pending = new Map<string, string>();
  depth = 0;
  stack: Drawn[] = [];

  get(key: string): string | undefined {
    return this.pending.has(key) ? this.pending.get(key) : this.data.get(key);
  }

  set(key: string, value: string) {
    if (this.depth === 0) this.data.set(key, value);
    else this.pending.set(key, value);
    picture(this);
  }

  begin() {
    this.depth++;
    picture(this);
  }

  rollback(): boolean {
    if (this.depth === 0) return false;
    // @why Meant to undo the inner transaction, but it cannot tell inner changes from outer ones, so it clears them all.
    this.pending.clear(); // @mark clearAll
    this.depth--;
    picture(this);
    return true;
  }

  commit(): boolean {
    if (this.depth === 0) return false;
    this.depth--;
    if (this.depth === 0) {
      for (const [k, v] of this.pending) this.data.set(k, v);
      this.pending.clear();
    }
    picture(this);
    return true;
  }
}

// Quiet: redraws the open layers for the picture, so stepping through a command does not step into it.
function picture(db: KVStore | FlatTxStore) {
  if (db instanceof KVStore) db.stack = db.layers.map((l, i) => ({ name: `BEGIN ${i + 1}`, changes: [...l] }));
  else db.stack = db.depth > 0 ? [{ name: `${db.depth} open, one shared set`, changes: [...db.pending] }] : [];
}

test("transaction: changes are visible inside, and gone after rollback", () => {
  const db = new KVStore();
  db.set("a", "1");
  db.begin();
  db.set("a", "2");
  db.set("b", "3");
  assert.equal(db.get("a"), "2", "a transaction sees its own writes");
  assert.equal(db.data.get("a"), "1", "the committed data is untouched");
  db.rollback();
  assert.equal(db.get("a"), "1");
  assert.equal(db.get("b"), undefined);
});

test("nested: an inner rollback undoes only the inner transaction", () => {
  const db = new KVStore();
  db.begin();
  db.set("a", "10");
  db.begin();
  db.set("a", "20");
  db.set("b", "5");
  assert.equal(db.get("a"), "20");
  db.rollback();
  assert.equal(db.get("a"), "10", "the outer transaction's a is back");
  assert.equal(db.get("b"), undefined);
  db.commit();
  assert.deepEqual([...db.data], [["a", "10"]]);
});

test("delete: a tombstone hides the committed value until rollback or commit", () => {
  const db = new KVStore();
  db.set("a", "1");
  db.begin();
  db.delete("a");
  assert.equal(db.get("a"), undefined, "deleted inside the transaction");
  db.rollback();
  assert.equal(db.get("a"), "1", "rollback brings it back");
  db.begin();
  db.delete("a");
  db.commit();
  assert.equal(db.data.has("a"), false, "commit removes it for real");
});

test("commit: an inner commit folds into the outer transaction, which can still roll it back", () => {
  const db = new KVStore();
  db.begin();
  db.set("x", "1");
  db.begin();
  db.set("x", "2");
  db.commit();
  assert.equal(db.get("x"), "2");
  assert.equal(db.data.has("x"), false, "nothing is committed until the outermost commit");
  db.rollback();
  assert.equal(db.get("x"), undefined, "rolling back the outer transaction undoes the inner commit too");
});

test("no transaction: rollback and commit outside a transaction are refused", () => {
  const db = new KVStore();
  db.set("a", "1");
  assert.equal(db.rollback(), false);
  assert.equal(db.commit(), false);
  assert.equal(db.get("a"), "1");
});

test("broken: one flat change set — an inner rollback throws away the outer transaction's changes", () => {
  const db = new FlatTxStore();
  db.begin();
  db.set("a", "10");
  db.begin();
  db.set("b", "5");
  db.rollback();
  // Only the inner transaction (b) should be undone. The outer one's a = 10 is lost too.
  assert.equal(db.get("a"), undefined, "a = 10 is gone");
  db.commit();
  assert.equal(db.data.size, 0, "the outer commit has nothing left to commit");
  // The layered store, same commands: a = 10 survives and is committed.
  const good = new KVStore();
  good.begin();
  good.set("a", "10");
  good.begin();
  good.set("b", "5");
  good.rollback();
  good.commit();
  assert.deepEqual([...good.data], [["a", "10"]]);
});
