// Browser-safe stand-ins for `node:test` and `node:assert/strict`.
// test() runs its callback immediately; asserts record pass/fail and never throw.

import type { Recorder } from "./recorder.ts";

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

export function makeModules(rec: Recorder): Record<string, Record<string, unknown>> {
  const test = (_name: unknown, a?: unknown, b?: unknown) => {
    const fn = typeof a === "function" ? a : b;
    if (typeof fn !== "function") return;
    try {
      fn({});
    } catch (err) {
      rec.fail(err);
    }
  };

  const check = (pass: boolean) => rec.assertResult(pass);
  const ok = (v: unknown) => check(Boolean(v));
  const assert = Object.assign(ok, {
    ok,
    equal: (a: unknown, b: unknown) => check(Object.is(a, b)),
    strictEqual: (a: unknown, b: unknown) => check(Object.is(a, b)),
    notEqual: (a: unknown, b: unknown) => check(!Object.is(a, b)),
    notStrictEqual: (a: unknown, b: unknown) => check(!Object.is(a, b)),
    deepEqual: (a: unknown, b: unknown) => check(deepEqual(a, b)),
    deepStrictEqual: (a: unknown, b: unknown) => check(deepEqual(a, b)),
    notDeepEqual: (a: unknown, b: unknown) => check(!deepEqual(a, b)),
    throws: (fn: () => unknown) => {
      try {
        fn();
        check(false);
      } catch {
        check(true);
      }
    },
    match: (s: string, re: RegExp) => check(re.test(s)),
  });

  const testModule = { test, it: test, describe: test, default: test };
  const assertModule = { ...assert, default: assert };
  return {
    "node:test": testModule,
    "node:assert": assertModule,
    "node:assert/strict": assertModule,
  };
}
