# Key-value store with transactions

## What it is

- **What it is:** An in-memory table of keys and values with get, set and delete, plus BEGIN, COMMIT and ROLLBACK that can be nested. Each open transaction keeps its own changes in a separate layer, stacked on top of the committed data.
- **The problem it solves:** With one shared set of pending changes, rolling back an inner transaction also throws away the outer transaction's changes, so work nobody rolled back is lost without any error. Copying the whole store at each BEGIN avoids that but costs time in proportion to the store's size. A stack of layers makes BEGIN and ROLLBACK cost the same for ten keys or ten million.
- **Reach for it when:** An interview asks for an in-memory database with BEGIN, ROLLBACK and COMMIT, nested transactions, undo, or savepoints, or a design needs to try changes and throw them away cheaply.
- **Not the right tool when:** Many clients run transactions at once: they need isolation through locks or versions, see [optimistic concurrency](#/sd-api-design/03-optimistic-concurrency). Data must survive a crash: add a [write-ahead log](#/sd-03-storage/008-write-ahead-log). Only one level of undo and fast reads matter: an undo log is simpler.
- **Where you'll meet it:** The "simple database" exercise is a well-known interview problem. SQL savepoints (SAVEPOINT, ROLLBACK TO SAVEPOINT, RELEASE SAVEPOINT) are nested rollback points; Linux OverlayFS and container image layers stack layers the same way and mark deletions with whiteout files; Redis MULTI/EXEC queues commands but has no rollback.

## Words we'll use

- **Key-value store** — a table of names (keys) to values, with three operations: `get(key)`, `set(key, value)` and `delete(key)`.
- **Transaction** — a group of changes that is kept or undone as a whole. `BEGIN` opens one; `COMMIT` keeps its changes; `ROLLBACK` undoes them, as if they never happened.
- **Committed data** — what the store holds once every transaction that changed it has committed. Here it is the map `data`.
- **Nested transaction** — a `BEGIN` while another transaction is still open. The newest one is the **innermost**; a `ROLLBACK` or `COMMIT` applies to it.
- **Layer** — the changes made by one open transaction, and nothing else, kept in their own map.
- **Stack** — a list you only add to and remove from at the end, so the last thing added is the first removed. Open transactions form a stack: the innermost one is always closed first.
- **Tombstone** — a marker that says "this key was deleted in this layer" (here `null`, drawn as †). Without it, deleting a key in a layer would let the older value show through.
- **Read-your-writes** — inside a transaction, a `get` sees the transaction's own changes.

## The world we're in

- One client, one session, one thread. Commands come one at a time: `set`, `get`, `delete`, `begin`, `rollback`, `commit`.
- The store may hold millions of keys; a transaction usually touches a few.
- Transactions nest. A program opens one, calls a helper that opens its own, and the helper may roll back without undoing the caller's work.
- Outside any transaction, a `set` changes the committed data at once.

## The goal

`ROLLBACK` undoes exactly the innermost open transaction: its changes vanish, and every outer transaction's changes stay. `COMMIT` keeps the innermost transaction's changes, but they become permanent only when the outermost transaction commits. Reads see the newest change at any level. `BEGIN` costs the same whatever the size of the store.

## The naive attempt

"Keep one map of pending changes and a counter of how deep we are. `ROLLBACK` clears the pending changes and lowers the counter."

It works for one level. With two, it breaks. The outer transaction sets `a = 10`; the inner one sets `b = 5` and rolls back. The rollback was meant to undo `b` only, but the pending map does not know which level made which change, so it clears everything.
[▶ Broken: the inner rollback clears the outer transaction's a = 10](play:broken: one flat change set@at=clearAll#1)
The outer transaction then commits, and there is nothing left to commit: `a = 10` is lost, silently, though nobody rolled the outer transaction back. The layered store given the same commands commits `a = 10`.
[▶ The layered store commits a = 10](play:broken: one flat change set@at=applySet#1)

## Building it up

**1. One layer per transaction, on a stack.** `begin()` pushes a new, empty map onto `layers`. Nothing is copied, so `BEGIN` is O(1) for any store size.
[▶ BEGIN pushes an empty layer](play:transaction@at=begin#1)

**2. Write only to the top layer.** Inside a transaction, `set` writes into the innermost layer and nowhere else. `data` and the outer layers keep their values, which is exactly what a rollback will need.
[▶ set(a, 2) goes into the top layer; data still says a = 1](play:transaction@at=write#1)

**3. Read from the top down.** `get` checks the layers from innermost to outermost and stops at the first that mentions the key; if none does, it reads `data`. So a transaction reads its own writes, and an inner change hides an outer one.
[▶ get(a) finds 2 in the top layer](play:transaction@at=layerHit#1)

**4. ROLLBACK drops the top layer.** `rollback()` pops the innermost layer and throws it away. Nothing else was ever touched, so nothing else needs repairing.
[▶ Rollback: the layer is gone](play:transaction@at=rollback#1)
[▶ get(a) reads the committed 1 again](play:transaction@at=base#1)
With two levels: the outer layer has `a = 10`, the inner has `a = 20` and `b = 5`. Rolling back the inner one leaves the outer layer as it was, so `a` reads 10 again and `b` is gone. That is the case the flat change set got wrong.
[▶ Inner rollback](play:nested@at=rollback#1)
[▶ a = 10 is still there, in the outer layer](play:nested@at=layerHit#2)

**5. Deletes are tombstones.** `delete(a)` inside a transaction writes `a → null` into the top layer. A `get` that meets the tombstone stops there and answers "not found"; if the key were just removed from the layer, the read would fall through to `data` and find the old value.
[▶ delete(a) writes a tombstone](play:delete@at=tombstone#1)
[▶ get(a) stops at the tombstone: not found](play:delete@at=layerHit#1)
Roll back, and the tombstone goes with its layer: `a` reads 1 again. Commit instead, and the delete reaches `data`.
[▶ The committed delete removes a from the data](play:delete@at=apply#1)

**6. COMMIT folds the top layer into the one below.** `commit()` pops the top layer and copies each change into the next layer down. Only when there is no layer below, the outermost commit, does it write to `data`. An inner commit therefore means "keep this as part of my parent", and the parent can still roll it all back.
[▶ Inner commit: x = 2 joins the outer layer](play:commit@at=fold#1)
[▶ The outer rollback undoes the inner commit too](play:commit@at=rollback#1)

**7. Refuse what makes no sense.** `rollback()` or `commit()` with no open transaction returns false instead of guessing.
[▶ ROLLBACK with no transaction open is refused](play:no transaction@at=noTx#1)

## Why it works now

- Each transaction's changes live only in its own layer, so dropping a layer undoes exactly that transaction. The flat change set mixed every level's changes, and its rollback took the outer ones too.
  [▶ See it break](play:broken: one flat change set@at=clearAll#1)
- Reads go from the newest layer to the oldest, then to `data`, so the most recent change to a key always wins, and tombstones make deletes win too.
- `data` changes only outside transactions or at the outermost commit, so a rolled-back transaction, at any depth, never touched it.
- `BEGIN` and `ROLLBACK` never copy or scan anything; their cost does not depend on the size of the store.

## What it costs

- **Reads slow down with depth.** A `get` may check every open layer before `data`: O(depth). Nesting is usually shallow, so this rarely matters.
- **A commit copies its layer.** O(keys changed) per commit, once per level, so a change made at depth 5 is copied up to five times. Merging the smaller map into the larger one cuts this.
- **One session only.** Two clients' transactions here would share one stack. Real stores give each session its own and need **isolation** (what one open transaction may see of another's changes), using locks or multi-version concurrency control. That is a separate design.
- **No durability.** It is all in memory: a crash loses committed data too. A write-ahead log (primitive 008) is the usual fix.
- **Alternatives.** An undo log (write into `data` directly, record each key's old value, replay backwards on rollback) keeps reads O(1) but makes rollback O(changes) and lets other readers see uncommitted values. Copying the whole store at `BEGIN` is the simplest correct design and O(n) per `BEGIN`.

## Staff notes

- **Ask what nested COMMIT means.** Here it folds into the parent (like releasing a savepoint). The well-known "simple database" exercise defines `COMMIT` as committing every open transaction at once. Both are reasonable; picking one silently is the mistake.
- **Extensibility.** Commands as objects (`Set`, `Delete`, `Begin` ...) make a text protocol and a replay log easy to add. `COUNT(value)` in O(1) needs a count per value, adjusted on every write and kept per layer so a rollback restores the counts too.
- **Invariants to state.** `layers.length` is the number of open transactions; `data` only changes at depth 0 or on the outermost commit; a key's visible value is the topmost layer's entry, or `data`'s.
- **Testing.** Script sequences of commands and assert every `get`; test each rule at depth 1 and depth 2 (nesting is where the bugs are); test delete-then-rollback and set-then-delete in the same layer.
- **Concurrency follow-up.** Many clients: give each its own stack of layers over shared `data`, and at outermost commit check for conflicts (did someone else commit a key I read or wrote since my BEGIN?) or take locks as keys are touched. That is optimistic versus pessimistic concurrency control.

## Check yourself

- **Q:** BEGIN; set a 10; BEGIN; set b 5; ROLLBACK. With one shared change set, what happens to a, and why?
  A: a = 10 is lost: the rollback clears the shared set, which cannot tell the outer change from the inner one. [▶ Show it](play:broken: one flat change set@at=clearAll#1)
- **Q:** In the layered store, the outer layer has a = 10 and the inner has a = 20. After the inner ROLLBACK, what does get(a) return?
  A: 10. The inner layer is dropped, and the read finds a in the outer layer. [▶ Show it](play:nested@at=layerHit#2)
- **Q:** a = 1 is committed. Inside a transaction, a is deleted. Why must the delete write a tombstone instead of removing a from the layer?
  A: Removing it from the layer would let the read fall through to data and find 1; the tombstone stops the read and answers not found. [▶ Show it](play:delete@at=layerHit#1)
- **Q:** BEGIN; set x 1; BEGIN; set x 2; COMMIT; ROLLBACK. What is x afterwards?
  A: Not set. The inner commit only folded x = 2 into the outer layer, and the outer rollback dropped that layer. [▶ Show it](play:commit@at=rollback#1)
- **Q:** Why does BEGIN cost the same for a store of ten keys or ten million?
  A: It pushes one empty layer; nothing is copied until changes are made. [▶ Show it](play:transaction@at=begin#1)
