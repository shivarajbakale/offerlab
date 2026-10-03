// Helpers for reading serialized values back out of a Step.

import type { HeapId, HeapObj, Step, Value } from "../tracer/types.ts";

export function fmtPrim(v: unknown, quote = false): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "number") {
    if (v === Infinity) return "∞";
    if (v === -Infinity) return "-∞";
    if (Number.isNaN(v)) return "NaN";
    return Number.isInteger(v) ? String(v) : String(+v.toFixed(3));
  }
  if (typeof v === "string") return quote ? JSON.stringify(v) : v === "" ? "''" : v;
  return String(v);
}

export function obj(step: Step, v: Value | undefined): HeapObj | undefined {
  return v?.t === "r" ? step.heap[v.id] : undefined;
}

export function refId(v: Value | undefined): HeapId | undefined {
  return v?.t === "r" ? v.id : undefined;
}

/** Compact text for a value inside a cell, table or label. */
export function label(step: Step, v: Value | undefined, depth = 0, quote = false): string {
  if (!v) return "";
  if (v.t === "p") return fmtPrim(v.v, quote);
  if (v.t === "f") return `ƒ ${v.name}`;
  const o = step.heap[v.id];
  if (!o) return "…";
  const inner = (x: Value) => label(step, x, depth + 1, true);
  switch (o.kind) {
    case "array": {
      if (depth > 1) return "[…]";
      const n = depth === 0 ? 6 : 3;
      return `[${o.items.slice(0, n).map(inner).join(",")}${o.len > n ? ",…" : ""}]`;
    }
    case "set":
      return depth > 1 ? "{…}" : `{${o.items.slice(0, 4).map(inner).join(",")}${o.size > 4 ? ",…" : ""}}`;
    case "map":
      return `Map(${o.size})`;
    case "object": {
      const f = o.fields;
      if ("key" in f && "val" in f && f.key.t === "p") return `${fmtPrim(f.key.v)}:${label(step, f.val, depth + 1)}`;
      if ("val" in f && f.val.t === "p") return fmtPrim(f.val.v);
      if ("value" in f && f.value.t === "p") return fmtPrim(f.value.v);
      if (o.className) return o.className;
      if (depth > 1) return "{…}";
      const keys = Object.keys(f).slice(0, 3);
      return `{${keys.map((k) => `${k}:${inner(f[k])}`).join(",")}${Object.keys(f).length > 3 ? ",…" : ""}}`;
    }
  }
}

/** Rebuilds a live JS value (arrays, Maps, Sets, plain objects) for evaluating hint templates. */
export function toJs(step: Step, v: Value, memo = new Map<HeapId, unknown>()): unknown {
  if (v.t === "p") return v.v;
  if (v.t === "f") return undefined;
  if (memo.has(v.id)) return memo.get(v.id);
  const o = step.heap[v.id];
  if (!o) return undefined;
  switch (o.kind) {
    case "array": {
      const arr: unknown[] = [];
      memo.set(v.id, arr);
      for (const x of o.items) arr.push(toJs(step, x, memo));
      return arr;
    }
    case "map": {
      const m = new Map();
      memo.set(v.id, m);
      for (const [k, x] of o.entries) m.set(toJs(step, k, memo), toJs(step, x, memo));
      return m;
    }
    case "set": {
      const s = new Set();
      memo.set(v.id, s);
      for (const x of o.items) s.add(toJs(step, x, memo));
      return s;
    }
    case "object": {
      const out: Record<string, unknown> = {};
      memo.set(v.id, out);
      for (const [k, x] of Object.entries(o.fields)) out[k] = toJs(step, x, memo);
      return out;
    }
  }
}

/** Variables visible in the innermost frame, with `this.x` fields flattened in. */
export function scopeValues(step: Step): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const memo = new Map<HeapId, unknown>();
  // Outer frames first so closures (e.g. `rows` inside a nested dfs) resolve; inner frames win.
  for (const frame of step.stack) {
    for (const [name, v] of frame.vars) {
      if (name === "this") {
        const self = toJs(step, v, memo) as Record<string, unknown> | undefined;
        if (self) for (const [k, x] of Object.entries(self)) out[k] = x;
        out.self = self;
      } else out[name] = toJs(step, v, memo);
    }
  }
  return out;
}

/** Evaluates a JS expression against a scope; undefined result on any failure. */
export function evaluate(expr: string, scope: Record<string, unknown>): { ok: boolean; value?: unknown } {
  const names = Object.keys(scope).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  try {
    const src = expr.replace(/\bthis\./g, "self.");
    const fn = new Function(...names, `"use strict"; return (${src});`);
    return { ok: true, value: fn(...names.map((n) => scope[n])) };
  } catch {
    return { ok: false };
  }
}
