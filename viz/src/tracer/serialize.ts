// Converts live JS values into the plain Value / HeapObj trace format.
// Object ids are stable for the whole execution (WeakMap), so the UI can animate
// the same TreeNode / ListNode moving between steps.

import type { HeapId, HeapObj, Value } from "./types.ts";

export type SerializeLimits = { maxHeapObjects: number; maxItems: number };

export class Identity {
  private ids = new WeakMap<object, HeapId>();
  private next = 1;
  of(obj: object): HeapId {
    let id = this.ids.get(obj);
    if (id === undefined) {
      id = this.next++;
      this.ids.set(obj, id);
    }
    return id;
  }
}

export class Snapshot {
  heap: Record<HeapId, HeapObj> = {};
  private count = 0;
  private pending: [HeapId, object][] = [];
  private identity: Identity;
  private limits: SerializeLimits;

  constructor(identity: Identity, limits: SerializeLimits) {
    this.identity = identity;
    this.limits = limits;
  }

  value(v: unknown): Value {
    if (v === null || v === undefined) return { t: "p", v: v as null | undefined };
    switch (typeof v) {
      case "number":
      case "string":
      case "boolean":
        return { t: "p", v };
      case "bigint":
        return { t: "p", v: `${v}n` };
      case "symbol":
        return { t: "p", v: v.toString() };
      case "function":
        return { t: "f", name: v.name || "λ" };
    }
    const id = this.identity.of(v as object);
    if (!(id in this.heap) && this.count < this.limits.maxHeapObjects) {
      this.count++;
      // Placeholder first so cycles terminate; filled in by drain().
      this.heap[id] = { kind: "object", className: "…", fields: {} };
      this.pending.push([id, v as object]);
    }
    return { t: "r", id };
  }

  /** Serializes every object reached so far, breadth first. */
  drain(): void {
    while (this.pending.length) {
      const [id, obj] = this.pending.shift()!;
      this.heap[id] = this.object(obj);
    }
  }

  private object(obj: object): HeapObj {
    const max = this.limits.maxItems;
    if (Array.isArray(obj) || ArrayBuffer.isView(obj)) {
      const arr = obj as unknown as ArrayLike<unknown>;
      const items: Value[] = [];
      for (let i = 0; i < Math.min(arr.length, max); i++) items.push(this.value(arr[i]));
      return { kind: "array", items, len: arr.length };
    }
    if (obj instanceof Map) {
      const entries: [Value, Value][] = [];
      for (const [k, v] of obj) {
        if (entries.length >= max) break;
        entries.push([this.value(k), this.value(v)]);
      }
      return { kind: "map", entries, size: obj.size };
    }
    if (obj instanceof Set) {
      const items: Value[] = [];
      for (const v of obj) {
        if (items.length >= max) break;
        items.push(this.value(v));
      }
      return { kind: "set", items, size: obj.size };
    }
    const fields: Record<string, Value> = {};
    let n = 0;
    for (const key of Object.keys(obj)) {
      if (n++ >= max) break;
      fields[key] = this.value((obj as Record<string, unknown>)[key]);
    }
    const proto = Object.getPrototypeOf(obj);
    const className = proto && proto !== Object.prototype ? (proto.constructor?.name ?? "") : "";
    return { kind: "object", className, fields };
  }
}

/** Short human label for a live value, used in example labels. */
export function shortLabel(v: unknown, depth = 0): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v.length > 24 ? v.slice(0, 24) + "…" : v);
  if (typeof v !== "object") return String(v);
  if (depth > 1) return "…";
  if (Array.isArray(v)) {
    const head = v.slice(0, 6).map((x) => shortLabel(x, depth + 1));
    return `[${head.join(",")}${v.length > 6 ? ",…" : ""}]`;
  }
  if (v instanceof Map) return `Map(${v.size})`;
  if (v instanceof Set) return `Set(${v.size})`;
  const name = Object.getPrototypeOf(v)?.constructor?.name ?? "Object";
  const val = (v as { val?: unknown }).val;
  return val !== undefined && typeof val !== "object" ? `${name}(${String(val)})` : name;
}
