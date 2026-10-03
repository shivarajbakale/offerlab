/**
 * 04. API Evolution and Versioning
 * Level: Senior
 * Group: API & Data Modeling
 *
 * Problem: An API's response shape has to change: a field needs a better name, a new field is
 *   needed. But clients you do not control (mobile apps that users never update, partners'
 *   scripts) were written against the old shape and will keep calling it for months or years.
 *   Change the shape under them and they break, often silently: `Hello, undefined`.
 *
 * Approach: Add, never change in place; break only behind a new version
 *   1. Make additive changes only: new optional fields beside the old ones. Clients must be
 *      tolerant readers that ignore fields they do not know.
 *   2. To rename, expand then contract: add the new field, keep sending the old one, mark it
 *      deprecated, and watch usage.
 *   3. A truly breaking change (removing a field, changing its type) goes in a new version,
 *      chosen by the URL (/v2/users/7) or a header (Api-Version: 2). The old version keeps
 *      working until its announced sunset date, signalled with Deprecation and Sunset headers.
 *   4. A schema diff in CI flags breaking changes before they ship.
 *
 * Cost: every supported version is code to keep, test and run. Old fields are carried, and
 *   sent, until the last client that reads them is gone.
 *
 * Pattern: tolerant reader, expand and contract (parallel change), API versioning
 * Key insight: The server can change in a day; its clients cannot. So the contract is "never
 *   take away what a client may read", and every change is either additive, or a new version
 *   that old clients do not see until they choose it.
 * Tradeoffs: URL versions are easy to see, route, cache and test with a browser, but every
 *   version is a whole new URL space. Header versions keep URLs stable and can be finer
 *   grained, but are invisible in a link and easy to forget. Either way, many versions mean
 *   many code paths; most teams map every old version onto the newest internal model.
 * Staff notes: Decide the default when no version is sent (the oldest, or the one the account
 *   is pinned to), and never change it. Removing a field, renaming, changing a type, making an
 *   optional field required in requests, and adding an enum value a client must handle are
 *   all breaking. Track usage per version and per client before a sunset, and talk to the
 *   heavy users first.
 * Interview signals: "backward compatible", "we need to rename a field", "mobile clients can't
 *   update", "v1 / v2", "deprecate an endpoint", "breaking change".
 * Real world: Stripe pins each account to a dated API version and accepts a Stripe-Version
 *   header to choose another. GitHub's REST API takes a dated X-GitHub-Api-Version header.
 *   Many public APIs put the major version in the path (/v1/). RFC 8594 defines the Sunset
 *   header and RFC 9745 the Deprecation header. OpenAPI marks fields `deprecated: true`;
 *   GraphQL uses the @deprecated directive and typically evolves without versions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

type Headers = Record<string, string>;
export type Res = { status: number; headers: Headers; body: string };
type Field = { type: "string" | "number"; required: boolean };
export type Schema = Record<string, Field>;

// @why When v1 was deprecated (RFC 9745: @ and a Unix time) and when it stops working (RFC 8594: an HTTP date).
const DEPRECATED_AT = "@1790812800";
const SUNSET = "Sat, 01 May 2027 00:00:00 GMT";

export class UserApi {
  // @why How the user is stored. The database's shape is not the API's shape; each version maps it.
  user = { id: 7, displayName: "Ada Lovelace", plan: "pro", avatarUrl: "https://img.example/7.png" };
  // @why Requests per version: the number to watch before turning an old version off.
  usage: Record<string, number> = { "1": 0, "2": 0 };

  /** GET /v1/users/7, /v2/users/7, or /users/7 with an Api-Version header. */
  handle(path: string, headers: Headers): Res {
    const m = /^\/v(\d+)\/users\/7$/.exec(path);
    let version: string;
    if (m) {
      version = m[1]; // @mark urlVersion
    } else if (path === "/users/7") {
      // @why No header means v1, forever: a client that never sent one must keep getting what it always got.
      version = headers["Api-Version"] ?? "1"; // @mark headerVersion
    } else {
      return { status: 404, headers: {}, body: "" };
    }
    if (!(version in this.usage)) return { status: 400, headers: {}, body: `unsupported version ${version}` }; // @mark unsupported
    this.usage[version]++;
    const body = JSON.stringify(this.render(version));
    const res: Res = { status: 200, headers: { "Content-Type": "application/json" }, body }; // @mark respond
    if (version === "1") {
      // @why Tell callers, in every v1 response, that it is going away and when. Code and dashboards can watch for it.
      res.headers["Deprecation"] = DEPRECATED_AT;
      res.headers["Sunset"] = SUNSET; // @mark deprecate
    }
    return res;
  }

  render(version: string): object {
    const u = this.user;
    // @why v1 keeps every field it ever had. New ones went in beside them: displayName and avatarUrl were added, name stays.
    if (version === "1") return { id: u.id, name: u.displayName, displayName: u.displayName, plan: u.plan, avatarUrl: u.avatarUrl }; // @mark renderV1
    // @why v2 drops the deprecated name. Taking a field away is breaking, so it could only happen in a new version.
    return { id: u.id, displayName: u.displayName, plan: u.plan, avatarUrl: u.avatarUrl }; // @mark renderV2
  }
}

/** An app built against the first v1, { id, name, plan }. A tolerant reader: it reads what it needs and ignores the rest. */
export class OldClient {
  api: UserApi;

  constructor(api: UserApi) {
    this.api = api;
  }

  greet(): string {
    const res = this.api.handle("/v1/users/7", {});
    const u = JSON.parse(res.body);
    // @why Looks up the one field it uses. Fields it has never heard of are never looked at.
    const text = `Hello, ${u.name}`; // @mark oldRead
    return text;
  }
}

/** A newer app, on v2, choosing the version with a header. */
export class NewClient {
  api: UserApi;

  constructor(api: UserApi) {
    this.api = api;
  }

  greet(): string {
    const res = this.api.handle("/users/7", { "Api-Version": "2" });
    const u = JSON.parse(res.body);
    const text = `Hello, ${u.displayName}`; // @mark newRead
    return text;
  }
}

/** The CI check: compare an old response schema with a new one, before the new one ships. */
export class Compat {
  breaking: string[] = [];
  additive: string[] = [];

  check(old: Schema, next: Schema) {
    for (const name of Object.keys(old)) {
      const now = next[name];
      if (now === undefined) {
        // @why A client may read this field. Gone, it reads undefined. A rename looks like this too: one removal, one addition.
        this.breaking.push(`removed "${name}"`); // @mark removed
        continue;
      }
      if (now.type !== old[name].type) {
        this.breaking.push(`"${name}" changed from ${old[name].type} to ${now.type}`); // @mark typeChanged
      }
      if (old[name].required && !now.required) {
        // @why A client that always found it may now find it missing.
        this.breaking.push(`"${name}" may now be missing`); // @mark nowOptional
      }
    }
    for (const name of Object.keys(next)) {
      if (!(name in old)) {
        // @why New fields are safe for tolerant readers: they never look at them.
        this.additive.push(`added "${name}"`); // @mark added
      }
    }
  }
}

// --- helpers for the scenarios ---

// Broken on purpose: renames name to displayName inside v1, in place. Old clients are not told.
export class RenamedFieldApi extends UserApi {
  render(_version: string): object {
    const u = this.user;
    return { id: u.id, displayName: u.displayName, plan: u.plan }; // @mark renamedInPlace
  }
}

// Broken on purpose: a client that rejects any field it was not built with, so even an added field breaks it.
export class StrictClient extends OldClient {
  greet(): string {
    const res = this.api.handle("/v1/users/7", {});
    const u = JSON.parse(res.body);
    for (const key of Object.keys(u)) {
      if (!(key in V1_FIRST)) {
        const error = `error: unknown field "${key}"`; // @mark strictReject
        return error;
      }
    }
    return `Hello, ${u.name}`;
  }
}

const str = (required = true): Field => ({ type: "string", required });
const num = (required = true): Field => ({ type: "number", required });
// The response schemas: v1 as first shipped, v1 today (two fields added), v2, and the in-place rename.
const V1_FIRST: Schema = { id: num(), name: str(), plan: str() };
const V1_NOW: Schema = { ...V1_FIRST, displayName: str(), avatarUrl: str(false) };
const V2: Schema = { id: num(), displayName: str(), plan: str(), avatarUrl: str(false) };
const V1_RENAMED: Schema = { id: num(), displayName: str(), plan: str() };

test("url version: /v1 and /v2 return their own shapes", () => {
  const api = new UserApi();
  const v1 = JSON.parse(api.handle("/v1/users/7", {}).body);
  const v2 = JSON.parse(api.handle("/v2/users/7", {}).body);
  assert.deepEqual(Object.keys(v1), ["id", "name", "displayName", "plan", "avatarUrl"]);
  assert.deepEqual(Object.keys(v2), ["id", "displayName", "plan", "avatarUrl"]);
  assert.equal(api.handle("/v3/users/7", {}).status, 400);
});

test("header version: Api-Version picks the shape, and no header means v1", () => {
  const api = new UserApi();
  const none = JSON.parse(api.handle("/users/7", {}).body);
  const two = JSON.parse(api.handle("/users/7", { "Api-Version": "2" }).body);
  assert.equal(none.name, "Ada Lovelace");
  assert.equal(two.name, undefined);
  assert.deepEqual(api.usage, { "1": 1, "2": 1 });
});

test("additive: v1 gained two fields, and the old tolerant client still works", () => {
  const api = new UserApi();
  assert.equal(new OldClient(api).greet(), "Hello, Ada Lovelace");
  assert.equal(new NewClient(api).greet(), "Hello, Ada Lovelace");
});

test("deprecation: v1 answers carry Deprecation and Sunset; v2 answers do not", () => {
  const api = new UserApi();
  const v1 = api.handle("/v1/users/7", {});
  assert.equal(v1.headers["Deprecation"], "@1790812800");
  assert.equal(v1.headers["Sunset"], "Sat, 01 May 2027 00:00:00 GMT");
  const v2 = api.handle("/v2/users/7", {});
  assert.equal(v2.headers["Sunset"], undefined);
  assert.deepEqual(api.usage, { "1": 1, "2": 1 }, "someone still calls v1: not yet safe to turn it off");
});

test("schema check: v1's added fields are safe, v2's removal is breaking", () => {
  const sameVersion = new Compat();
  sameVersion.check(V1_FIRST, V1_NOW);
  assert.deepEqual(sameVersion.breaking, []);
  assert.deepEqual(sameVersion.additive, ['added "displayName"', 'added "avatarUrl"']);
  const nextVersion = new Compat();
  nextVersion.check(V1_NOW, V2);
  assert.deepEqual(nextVersion.breaking, ['removed "name"']);
});

test("schema check: the in-place rename is caught before it ships", () => {
  const c = new Compat();
  c.check(V1_FIRST, V1_RENAMED);
  assert.deepEqual(c.breaking, ['removed "name"']);
  assert.deepEqual(c.additive, ['added "displayName"']);
});

test("schema check: a type change and a field that may go missing are breaking too", () => {
  const c = new Compat();
  c.check(V1_FIRST, { id: str(), name: str(false), plan: str() });
  assert.deepEqual(c.breaking, ['"id" changed from number to string', '"name" may now be missing']);
});

test("broken: renaming a field in place breaks the old client", () => {
  const api = new RenamedFieldApi();
  const res = api.handle("/v1/users/7", {});
  assert.equal(res.status, 200, "the server thinks all is well");
  assert.equal(new OldClient(api).greet(), "Hello, undefined");
});

test("broken: a strict reader rejects a field added to v1", () => {
  const api = new UserApi();
  assert.equal(new StrictClient(api).greet(), 'error: unknown field "displayName"');
});
