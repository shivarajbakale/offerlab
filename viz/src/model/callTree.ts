// Recursion tree for a run: one node per traced call, built from the step stream.

import type { Step } from "../tracer/types.ts";
import { label } from "./heap.ts";

export type CallNode = {
  id: number;
  label: string;
  parent: number | null;
  children: number[];
  /** Step index of the call and of the last step inside it. */
  start: number;
  end: number;
  ret?: string;
  retStep?: number;
  /** The first argument that is a tree or list node, so the drawing can show what that node's call returned. */
  node?: number;
  /** The results list grew during this call: it, or a call under it, found an answer. */
  found?: boolean;
};

export type CallTree = {
  nodes: CallNode[];
  activeAt: (number | null)[];
  maxDepth: number;
  /** Some function calls itself (directly or through a helper with the same name). */
  recursive: boolean;
  /** The run collects answers in a results list, so calls are marked as finding one or not. */
  collects: boolean;
};

const RESULT_NAMES = /^(res|result|results|ans|answer|out|output|combos|combinations|perms|permutations|subsets|paths|boards|partitions)$/;

/** Length of the results list visible in the outermost frame, if there is one. */
function resultLen(s: Step): number | undefined {
  for (const [n, v] of s.stack[0]?.vars ?? []) {
    if (!RESULT_NAMES.test(n) || v.t !== "r") continue;
    const o = s.heap[v.id];
    if (o?.kind === "array") return o.len;
  }
  return undefined;
}

export function buildCallTree(steps: Step[]): CallTree {
  const nodes: CallNode[] = [];
  const activeAt: (number | null)[] = [];
  const open: CallNode[] = [];
  let maxDepth = 0;
  let recursive = false;
  const fnOf = new Map<number, string>();

  steps.forEach((s, k) => {
    // A call step already includes its new frame, so its parent sits one level up.
    const depth = s.event === "call" ? s.stack.length - 1 : s.stack.length;
    while (open.length > depth) open.pop();
    if (s.event === "call") {
      const frame = s.stack.at(-1)!;
      const args = frame.params
        .filter((p) => p !== "this")
        .map((p) => label(s, frame.vars.find(([n]) => n === p)?.[1], 2, true));
      const name = frame.fn.includes(".") ? frame.fn.split(".").pop()! : frame.fn;
      const parent = open.at(-1) ?? null;
      const nodeArg = frame.params
        .map((p) => frame.vars.find(([n]) => n === p)?.[1])
        .find((v) => {
          const o = v?.t === "r" ? s.heap[v.id] : undefined;
          return o?.kind === "object" && ("left" in o.fields || "next" in o.fields);
        });
      const node: CallNode = {
        id: nodes.length,
        label: `${name}(${args.join(", ")})`,
        parent: parent?.id ?? null,
        children: [],
        start: k,
        end: k,
        ...(nodeArg?.t === "r" ? { node: nodeArg.id } : {}),
      };
      nodes.push(node);
      fnOf.set(node.id, frame.fn);
      if (parent && fnOf.get(parent.id) === frame.fn) recursive = true;
      parent?.children.push(node.id);
      open.push(node);
      maxDepth = Math.max(maxDepth, open.length);
    }
    const top = open.at(-1);
    if (top && s.event === "return") {
      const frame = s.stack.at(-1);
      if (frame?.returned && !(frame.returned.t === "p" && frame.returned.v === undefined)) {
        top.ret = label(s, frame.returned, 1, true);
        top.retStep = k;
      }
    }
    for (const n of open) n.end = k;
    activeAt.push(top?.id ?? null);
  });

  const lens = steps.map(resultLen);
  const collects = recursive && lens.some((n) => n !== undefined);
  if (collects) for (const n of nodes) n.found = (lens[n.end] ?? 0) > (lens[n.start] ?? 0);
  return { nodes, activeAt, maxDepth, recursive, collects };
}
