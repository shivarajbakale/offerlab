// The 💬 line: explains what the highlighted line just did.

import type { HeapId, Step, Value } from "../tracer/types.ts";
import type { Hints } from "./hints.ts";
import { evaluate, fmtPrim, label, scopeValues } from "./heap.ts";

export type Narration = {
  kind: "say" | "call" | "return" | "check" | "change" | "code";
  text: string;
  /** For checks: the condition outcome. */
  outcome?: boolean;
  /** For hint text on an if/while/for line: the condition and its outcome. */
  check?: { cond: string; outcome: boolean };
};

/** Text inside the first balanced parentheses after `from`. */
function parenContent(code: string, from: number): string | null {
  const open = code.indexOf("(", from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")" && --depth === 0) return code.slice(open + 1, i);
  }
  return null;
}

export function conditionOf(code: string): { kind: "if" | "while" | "for"; cond: string } | null {
  const c = code.replace(/^}\s*/, "");
  if (/^(else\s+)?if\s*\(/.test(c)) {
    const cond = parenContent(c, 0);
    return cond ? { kind: "if", cond } : null;
  }
  if (/^while\s*\(/.test(c)) {
    const cond = parenContent(c, 0);
    return cond ? { kind: "while", cond } : null;
  }
  if (/^for\s*\(/.test(c)) {
    const inside = parenContent(c, 0);
    const parts = inside?.split(";");
    if (parts && parts.length === 3 && parts[1].trim()) return { kind: "for", cond: parts[1].trim() };
  }
  return null;
}

export function fillTemplate(template: string, scope: Record<string, unknown>): string {
  return template.replace(/\{([^{}]+)\}/g, (whole, expr: string) => {
    const r = evaluate(expr, scope);
    if (!r.ok) return whole;
    const v = r.value;
    if (typeof v === "object" && v !== null) {
      try {
        return JSON.stringify(v instanceof Set ? [...v] : v instanceof Map ? [...v] : v);
      } catch {
        return String(v);
      }
    }
    return fmtPrim(v);
  });
}

function nameOfId(step: Step, id: HeapId): string | undefined {
  for (let fi = step.stack.length - 1; fi >= 0; fi--) {
    for (const [n, v] of step.stack[fi].vars) {
      if (v.t === "r" && v.id === id) return n;
      if (n === "this" && v.t === "r") {
        const self = step.heap[v.id];
        if (self?.kind === "object") {
          for (const [f, fv] of Object.entries(self.fields)) if (fv.t === "r" && fv.id === id) return f;
        }
      }
    }
  }
  return undefined;
}

/** Human-readable list of what changed between two states of the same frame. */
export function describeChanges(before: Step, after: Step): string[] {
  const out: string[] = [];
  const bf = before.stack.at(-1);
  const af = after.stack.at(-1);
  if (!bf || !af) return out;
  if (before.stack.length === after.stack.length && bf.fn === af.fn) {
    const prevVals = new Map(bf.vars.map(([n, v]) => [n, label(before, v, 0, true)]));
    for (const [n, v] of af.vars) {
      if (n === "this") continue;
      const now = label(after, v, 0, true);
      const was = prevVals.get(n);
      if (was === undefined) out.push(`${n} = ${now}`);
      else if (was !== now && v.t !== "r") out.push(`${n}: ${was} → ${now}`);
      else if (was !== now && v.t === "r") {
        const pv = bf.vars.find(([k]) => k === n)?.[1];
        if (!(pv?.t === "r" && pv.id === v.id)) out.push(`${n} → ${now}`);
      }
    }
  }
  for (const [idStr, o] of Object.entries(after.heap)) {
    const id = Number(idStr);
    const p = before.heap[id];
    if (!p || JSON.stringify(p) === JSON.stringify(o)) continue;
    const name = nameOfId(after, id);
    if (!name) continue;
    if (o.kind === "array" && p.kind === "array") {
      if (o.len > p.len) {
        const added = o.items.slice(p.len).map((v) => label(after, v, 1, true));
        out.push(`${name}.push(${added.join(", ")})`);
      } else if (o.len < p.len) {
        out.push(`${name}.pop() → ${label(before, p.items[p.len - 1], 1, true)}`);
      } else {
        o.items.forEach((v, i) => {
          const was = label(before, p.items[i], 1, true);
          const now = label(after, v, 1, true);
          if (was !== now) out.push(`${name}[${i}] = ${now}`);
        });
      }
    } else if (o.kind === "map" && p.kind === "map") {
      const prev = new Map(p.entries.map(([k, v]) => [label(before, k, 1, true), label(before, v, 1, true)]));
      const seen = new Set<string>();
      for (const [k, v] of o.entries) {
        const kt = label(after, k, 1, true);
        seen.add(kt);
        const vt = label(after, v, 1, true);
        if (prev.get(kt) !== vt) out.push(`${name}[${kt}] = ${vt}`);
      }
      for (const k of prev.keys()) if (!seen.has(k)) out.push(`${name}.delete(${k})`);
    } else if (o.kind === "set" && p.kind === "set") {
      const prev = new Set(p.items.map((v) => label(before, v, 1, true)));
      const now = new Set(o.items.map((v) => label(after, v, 1, true)));
      for (const v of now) if (!prev.has(v)) out.push(`${name}.add(${v})`);
      for (const v of prev) if (!now.has(v)) out.push(`${name}.delete(${v})`);
    } else if (o.kind === "object" && p.kind === "object") {
      for (const [f, v] of Object.entries(o.fields)) {
        const was = p.fields[f] ? label(before, p.fields[f] as Value, 1, true) : undefined;
        const now = label(after, v, 1, true);
        if (was !== now) out.push(`${name}.${f} = ${now}`);
      }
    }
  }
  return out;
}

export function narrate(steps: Step[], k: number, lines: string[], hints: Hints): Narration {
  const s = steps[k];
  const after = steps[k + 1] ?? s;
  const code = (lines[s.line - 1] ?? "").trim().replace(/\s*\/\/.*$/, "");
  const frame = s.stack.at(-1);

  if (hints.say[s.line] && s.event !== "return" && s.event !== "call") {
    const scope = scopeValues(s);
    const text = fillTemplate(hints.say[s.line], scope);
    const cond = conditionOf(code);
    const r = cond ? evaluate(cond.cond, scope) : { ok: false };
    return r.ok && cond
      ? { kind: "say", text, check: { cond: cond.cond, outcome: Boolean(r.value) } }
      : { kind: "say", text };
  }
  if (s.event === "call" && frame) {
    const args = frame.params
      .filter((p) => p !== "this")
      .map((p) => label(s, frame.vars.find(([n]) => n === p)?.[1], 1, true));
    const fn = frame.fn.startsWith("new ") ? frame.fn : `${frame.fn}(${args.join(", ")})`;
    const depth = s.stack.length > 1 ? ` (depth ${s.stack.length})` : "";
    return { kind: "call", text: `Call ${fn}${depth}` };
  }
  if (s.event === "return" && frame) {
    const caller = s.stack.at(-2);
    const val = frame.returned ? label(s, frame.returned, 0, true) : "undefined";
    return { kind: "return", text: `Return ${val}${caller ? ` to ${caller.fn}` : ""}` };
  }
  const cond = conditionOf(code);
  if (cond) {
    const r = evaluate(cond.cond, scopeValues(s));
    if (r.ok) {
      const yes = Boolean(r.value);
      const tail =
        cond.kind === "if" ? (yes ? "take the branch" : "skip it") : yes ? "keep looping" : "exit the loop";
      return { kind: "check", text: `${cond.cond}  →  ${yes}, ${tail}`, outcome: yes };
    }
  }
  const changes = describeChanges(s, after);
  if (changes.length) {
    const shown = changes.slice(0, 4).join("   ·   ");
    return { kind: "change", text: changes.length > 4 ? `${shown}   ·   …` : shown };
  }
  return { kind: "code", text: code };
}
