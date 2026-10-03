# Optimistic concurrency

## What it is

- **What it is:** A way to stop two clients overwriting each other's changes without locks. Each record carries a version; a client sends back the version it read, and the server writes only if the record is still at that version.
- **The problem it solves:** When two people read the same record, change it and save, the second save silently erases the first, and both are told it worked. With versions, the second writer is told it conflicted, and redoes its change on the new value.
- **Reach for it when:** Clients read, edit and save whole records (forms, documents, settings), conflicts are rare, and edits take long enough that holding a lock would make others wait.
- **Not the right tool when:** A counter or stock level can change in one atomic update such as `stock = stock - 2`, which cannot lose a write. For a hot record many clients write at once, most attempts conflict, and a lock or a queue works better.
- **Where you'll meet it:** HTTP's `ETag` and `If-Match` headers (RFC 9110); Kubernetes' `resourceVersion`, which makes a stale update fail with 409 Conflict; JPA's `@Version` and Rails' `lock_version`; conditional writes in Amazon DynamoDB.

## Words we'll use

- **Resource** — one thing the API serves at one URL, here an item in a shop at `/items/1`, with a stock count.
- **Read-modify-write** — read a value, change it in the client, write the whole new value back. Editing a form and pressing Save is one.
- **Lost update** — two clients read the same value, each writes its own change, and the second write silently erases the first.
- **Version** — a number stored with each row that goes up by one on every write. Here it lives in a **version column** of the table.
- **ETag** (entity tag) — a response header that names one version of a resource, such as `ETag: "v3"`. Any change to the resource gives it a new ETag.
- **Conditional request** — a request that says "only do this if...". **If-Match** on a write means "only if the resource is still at this ETag". **If-None-Match** on a read means "only send it if it is no longer at this ETag".
- **412 Precondition Failed** — the server did not do the request because a precondition it carried was false (here If-Match; also If-Unmodified-Since, or If-None-Match on a write). **428 Precondition Required** — the server refuses to do a write that has no condition at all.
- **Atomic** — done as one indivisible step: nothing else can run in the middle of it.
- **Optimistic** concurrency — let everyone read and edit without locks, and check for a conflict only at the moment of writing. **Pessimistic** concurrency locks the record first so nobody else can change it meanwhile.

## The world we're in

- A shop API with `GET /items/1` and `PUT /items/1`. PUT replaces the item's stock with the number in the body.
- Two clerks, Alice and Bob, use it at the same time. Each one's screen reads the item, lets the clerk sell some, and writes the new stock back.
- The item starts with 10 in stock at version 1.
- The steps of the two clerks interleave in a fixed order, so the runs are repeatable.

## The goal

When two clerks change the same item at the same time, both changes count, or one of them is told it conflicted. Never may a write silently erase another one. And do it without making clerks wait on each other's locks.

## The naive attempt

"PUT replaces the item with what the client sent. The latest write wins."

Alice and Bob both read the item: stock 10.
[▶ Broken: Bob reads 10 too](play:broken: read-modify-write@at=saw#2)
Alice sells 3 and writes 7. That is right.
[▶ Broken: Alice writes 7](play:broken: read-modify-write@at=overwrite#1)
Bob sells 2. His screen still says 10, so he writes 8. The server writes it: 200 OK.
[▶ Broken: Bob writes 8 over Alice's 7](play:broken: read-modify-write@at=overwrite#2)
Five items were sold, but the stock says 8, as if only two were (it should be 5). Both requests succeeded, so nobody is told anything went wrong. That is a lost update.

## Building it up

**1. Give every row a version.** Add a version column. Every write adds one. The item starts at version 1.

**2. Hand the version to the client as an ETag.** `GET /items/1` returns the stock and `ETag: "v1"`. The client keeps the ETag with what it read: "my edit is based on v1".
[▶ The read returns stock and ETag](play:one clerk@at=saw#1)

**3. Write only if nothing changed.** The client sends its ETag back on the write: `If-Match: "v1"`. The server turns it into one conditional statement: `UPDATE items SET stock = 7, version = version + 1 WHERE id = 1 AND version = 1`. If the row is still at version 1, the write happens and the item is now v2.
[▶ The write matches v1 and bumps to v2](play:one clerk@at=bump#1)

**4. Watch the two clerks again.** Both read v1. Alice writes first, with `If-Match: "v1"`: it matches, and the item is now 7 at v2.
[▶ Alice's write succeeds](play:two clerks@at=bump#1)
Bob writes 8 with `If-Match: "v1"`. The row is at version 2, so the `WHERE` matches no row and nothing is written.
[▶ Bob's write matches no row](play:two clerks@at=staleRow#2)
The server answers 412 Precondition Failed. Bob's 8 was computed from an old number, and now he knows it.
[▶ Bob gets 412](play:two clerks@at=preconditionFailed#2)

**5. On 412, read again and redo the change.** Bob's screen reads again: stock 7, `ETag: "v2"`. It subtracts 2 and writes 5 with `If-Match: "v2"`. That matches. Stock 5, version 3: both sales count.
[▶ Bob rereads and sees 7](play:two clerks@at=saw#3)
[▶ Bob's redone write: 5 at v3](play:two clerks@at=bump#2)
For a stock count the client can redo the change by itself. For a document edited by a person, the client shows the new version and asks them to merge.

**6. Refuse writes with no condition.** A client that sends no If-Match at all would write blind. The server can require the header and answer 428 Precondition Required.
[▶ No If-Match: 428](play:no If-Match@at=noCondition#1)

**7. The check must be part of the write.** It is tempting to read the version, compare it, then write in a second step. Two requests can both pass the comparison before either writes, and the second write erases the first again.
[▶ Broken: both requests pass the check](play:broken: check, then write@at=checkOnly#2)
[▶ Broken: the second write lands anyway](play:broken: check, then write@at=applyLater#2)
That is why the version test goes in the `UPDATE`'s `WHERE`: the database does the check and the write as one atomic step.

**8. The same ETag saves bandwidth on reads.** A client that has v1 cached can ask `GET` with `If-None-Match: "v1"`. If the item is unchanged the server answers 304 Not Modified with no body; once a write moves it to v2, the same request gets 200 and the new item.
[▶ Unchanged: 304, no body](play:conditional GET@at=notModified#2)
[▶ Changed: 200 with ETag v2](play:conditional GET@at=read#2)

## Why it works now

A lost update happens when a write is based on a read that is no longer true. The version records whether the row changed since the read, and If-Match carries that read's version to the write. Because the database checks the version and writes in one step, exactly one of two racing writers can match it; the other gets 412 and must start from the new value.
[▶ The loser gets 412, not a silent overwrite](play:two clerks@at=preconditionFailed#2)
No one holds a lock while a clerk thinks, so nobody waits, and a conflict costs only one more read and write.

## What it costs

- **Retries under contention.** If many clients write the same row at once, most get 412 and retry, and the retries collide again. For a hot record a lock, a queue, or a different data model works better.
- **Client work.** Every client must keep the ETag, send If-Match, and handle 412. A client that just retries the same body without rereading defeats the point.
- **A version per resource.** One integer column, and it must change on every write, including writes made outside the API.
- **ETags must be strong for If-Match.** RFC 9110 compares If-Match with the strong comparison, so a weak ETag (`W/"v3"`) never matches it. Here any ETag that is not exactly `"vN"` matches no version.

## Staff notes

- Many updates do not need a read-modify-write at all. `UPDATE items SET stock = stock - 2 WHERE id = 1 AND stock >= 2` is atomic in the database and cannot lose a sale. Use versions when clients replace whole documents.
- Optimistic fits when conflicts are rare and edits are long (a person filling a form). Pessimistic locking (`SELECT ... FOR UPDATE`) fits short transactions on hot rows, inside one service.
- ETags can be a version number or a hash of the content. A version is cheaper; a hash also lets two servers that rebuilt the same content agree.
- PATCH needs it too. A patch like "set title" can still erase a concurrent edit to the same field.
- Libraries do this for you: JPA's `@Version` and Rails' `lock_version` add the version to every update's `WHERE`. Kubernetes answers 409 Conflict when an update carries a stale `resourceVersion`.

## Check yourself

- **Q:** Alice and Bob both read stock 10. Alice writes 7, then Bob writes 8. With last write wins, what is the stock, and what went wrong?
  A: 8. Bob's write was based on 10 and erased Alice's sale. Five were sold, but the stock shows 8, as if only two were. [▶ Show it](play:broken: read-modify-write@at=overwrite#2)
- **Q:** With If-Match, why does Bob's write fail, and what does the server answer?
  A: Bob sent `If-Match: "v1"`, but Alice's write moved the item to v2, so the conditional update matches no row. The server answers 412. [▶ Show it](play:two clerks@at=preconditionFailed#2)
- **Q:** What should Bob's client do after 412?
  A: Read again (stock 7, v2), redo the sale on the new number, and write 5 with `If-Match: "v2"`. [▶ Show it](play:two clerks@at=bump#2)
- **Q:** Why must the version check be inside the UPDATE, not a separate read first?
  A: Two requests can both pass a separate check before either writes, and then the second write erases the first. [▶ Show it](play:broken: check, then write@at=applyLater#2)
- **Q:** A client sends `If-None-Match: "v1"` on GET and the item has not changed. What comes back?
  A: 304 Not Modified, with no body: its cached copy is still current. [▶ Show it](play:conditional GET@at=notModified#2)
