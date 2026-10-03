# API evolution and versioning

## What it is

- **What it is:** The rules for changing an API that other people's code already depends on: which changes are safe to make in place, which need a new version, and how to retire an old one.
- **The problem it solves:** Renaming or removing one field can break apps and scripts you do not control, often silently, while the server still answers 200. Only adding within a version, putting breaking changes in a new version, and checking schemas in CI keep old clients working.
- **Reach for it when:** An API has clients you cannot update on your own schedule (mobile apps, partners, public developers), a field needs renaming, removing or a new type, or you need to know when old code is safe to delete.
- **Not the right tool when:** The only client ships with the server in the same deploy, such as a web frontend released together with its backend: change both at once. GraphQL APIs usually mark old fields deprecated instead of adding versions.
- **Where you'll meet it:** Stripe's dated API versions, pinned per account and chosen per request with a `Stripe-Version` header; GitHub's `X-GitHub-Api-Version` header; the `Sunset` (RFC 8594) and `Deprecation` (RFC 9745) headers; OpenAPI diff tools in CI.

## Words we'll use

- **Contract** — what an API promises its clients: which URLs exist, and which fields each response has, with which types.
- **Schema** — a written-down description of one response's shape: field names, types, and whether each is always present (**required**) or may be missing (**optional**).
- **Breaking change** — a change to the contract that can make a working client fail: removing or renaming a field, changing a field's type, making a field that was always there sometimes missing.
- **Additive change** — adding something new (a field, an endpoint) without changing or removing anything old.
- **Tolerant reader** — a client that reads only the fields it needs and ignores any others. A **strict reader** rejects a response that has any field it does not know.
- **Expand and contract** — renaming in safe steps: add the new field next to the old (expand), move clients over, and only then remove the old one (contract). Also called a parallel change.
- **Version** — a named edition of the contract, such as v1 or v2. A client chooses one, by **URL** (`/v2/users/7`) or by **header** (`Api-Version: 2` on `/users/7`).
- **Deprecated** — still working, but going away; clients should move off it. **Sunset** — the date it stops working.

## The world we're in

- `GET /v1/users/7` first shipped returning `{ id, name, plan }`.
- Clients we do not control call it: a mobile app on phones that are rarely updated, and a partner's script. Some of them will keep calling the old shape for years.
- The team wants to rename `name` to `displayName` and add an `avatarUrl`.
- The server can deploy any day. Clients change when their owners get round to it, if ever.

## The goal

Change the API as the product needs, without breaking any client that is still working today, and know when it is finally safe to delete old code.

## The naive attempt

"`displayName` is a better name. Rename the field and deploy."

The server's v1 now returns `{ id, displayName, plan }`, and still answers 200.
[▶ Broken: v1 now says displayName](play:broken: renaming a field in place@at=renamedInPlace#1)
The old app reads `name`, which is no longer there. In JavaScript that is not even an error: the screen says "Hello, undefined". In a typed client it may crash. Nothing on the server noticed.
[▶ Broken: the old client greets "undefined"](play:broken: renaming a field in place@at=oldRead#1)
A rename is really two changes: a field removed, and a field added. The removal is what breaks clients.

## Building it up

**1. Additive changes only, within a version.** Add `displayName` and `avatarUrl` to v1, and keep `name`, filled from the same data. Every field an old client may read is still there.
[▶ v1 keeps name and gains two fields](play:url version@at=renderV1#1)

**2. Clients must be tolerant readers.** The old app looks up `name` and never looks at anything else, so the two new fields cost it nothing. It still says "Hello, Ada Lovelace".
[▶ The old client reads only name](play:additive@at=oldRead#1)
A strict reader breaks even on an additive change: it sees `displayName`, which it was not built with, and refuses the whole response. Some JSON libraries do this by default (Jackson's plain ObjectMapper fails on unknown properties unless configured not to). Additive changes are only safe if clients are tolerant, so say so in the API's docs.
[▶ Broken: the strict reader rejects displayName](play:broken: a strict reader@at=strictReject#1)

**3. Mark the old field deprecated, and say when it goes.** Document `name` as deprecated (OpenAPI has `deprecated: true` for that). For the whole v1, send a `Deprecation` header (RFC 9745) with the date it was deprecated, and a `Sunset` header (RFC 8594) with the date it stops working. These headers describe a whole resource or version, not one field.
[▶ Every v1 answer carries Deprecation and Sunset](play:deprecation@at=deprecate#1)

**4. Put the breaking change in a new version.** v2 is v1 without `name`. Old clients keep asking for v1 and keep getting it; new clients ask for v2.
[▶ v2 has no name](play:url version@at=renderV2#1)
The version can live in the URL, `/v2/users/7`:
[▶ The URL picks v2](play:url version@at=urlVersion#2)
or in a header on an unversioned URL, `Api-Version: 2`. With no header, the server must answer a fixed default, forever (the oldest version, or the one the account is pinned to): a client that never sent the header must keep getting what it always got.
[▶ No header: v1](play:header version@at=headerVersion#1)
[▶ Api-Version: 2](play:header version@at=headerVersion#2)
A version the server does not have is a 400, not a guess.
[▶ v3 does not exist: 400](play:url version@at=unsupported#3)

**5. Count who still uses the old version.** The server counts requests per version. v1 can be turned off when the count reaches zero, or the sunset date passes and the remaining callers have been told. Here one caller still uses v1.
[▶ Usage per version](play:deprecation@at=respond#2)

**6. Catch breaking changes in CI, not in production.** Compare the response schema the change produces with the one already shipped. Added fields are listed as safe. A removed field, a changed type, or a field that may now be missing is breaking, and fails the build unless it ships as a new version.
[▶ v1's two added fields are safe](play:schema check: v1's added@at=added#2)
[▶ v2's removal is breaking](play:schema check: v1's added@at=removed#1)
The in-place rename from the naive attempt is caught here: one removal (`name`), one addition (`displayName`).
[▶ The rename, caught](play:schema check: the in-place rename@at=removed#1)
[▶ A type change and a now-optional field](play:schema check: a type change@at=nowOptional#1)

## Why it works now

A client only breaks when something it reads is taken away or changes meaning. Within a version, the server only ever adds, and tolerant clients ignore what they did not ask for, so nothing they read changes.
[▶ The old client still works](play:additive@at=oldRead#1)
Everything that takes something away goes into a new version, which no client sees until its owner chooses to move. And the schema check makes "taking something away" a build failure instead of an outage.

## What it costs

- **Old versions are code to keep.** Every version needs routing, tests and on-call knowledge. The usual answer is one internal model, with a thin layer per version that maps it to that version's shape.
- **Old fields are sent to everyone.** v1 carries `name` and `displayName`, the same data twice, until v1 is gone.
- **Deprecation takes calendar time.** Months for partners, years for mobile apps. Usage counts per client tell you who to chase.
- **Not every break is a schema change.** Changing what a field means (cents to dollars), adding an enum value that a client's exhaustive `switch` does not handle, or tightening validation on requests also break clients. The schema check cannot see the first; review must.

## Staff notes

- URL versioning is easy to see, route, cache, and try in a browser; header versioning keeps one URL per resource and allows finer, dated versions. Pick one, document the default, and never change the default.
- Version as rarely as you can. Most changes can be additive; a new major version is a migration you are asking every client to do.
- Requests evolve the other way round: the server must be tolerant of what clients send. Adding an optional request field is safe; adding a required one is breaking.
- GraphQL usually avoids versions: clients ask for exactly the fields they read, the server marks old fields `@deprecated`, and field-level usage tells you when one is unused.
- Stripe pins each account to a dated version and lets a request choose another with a `Stripe-Version` header; GitHub's REST API takes a dated `X-GitHub-Api-Version` header.

## Check yourself

- **Q:** The server renames `name` to `displayName` inside v1. What does the old app show, and why did the server not notice?
  A: "Hello, undefined": the field it reads is gone. The server still answered 200, so nothing on its side looked wrong. [▶ Show it](play:broken: renaming a field in place@at=oldRead#1)
- **Q:** Why is adding `displayName` and `avatarUrl` to v1 safe for the old app?
  A: It is a tolerant reader: it looks up `name`, which is still there, and never looks at the new fields. [▶ Show it](play:additive@at=oldRead#1)
- **Q:** When is even an additive change breaking?
  A: When the client is a strict reader that rejects unknown fields: it refuses the response because of `displayName`. [▶ Show it](play:broken: a strict reader@at=strictReject#1)
- **Q:** A client calls `/users/7` with no `Api-Version` header. Which version should it get?
  A: v1, the oldest, and that default must never change, or clients that never sent a header break. [▶ Show it](play:header version@at=headerVersion#1)
- **Q:** How does a schema check see a rename?
  A: As one removed field, which is breaking, and one added field, which is safe. [▶ Show it](play:schema check: the in-place rename@at=removed#1)
