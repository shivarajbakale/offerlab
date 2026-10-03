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
};

export type CallTree = {
  nodes: CallNode[];
  activeAt: (number | null)[];
  maxDepth: number;
  /** Some function calls itself (directly or through a helper with the same name). */
  recursive: boolean;
};

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
      const node: CallNode = {
        id: nodes.length,
        label: `${name}(${args.join(", ")})`,
        parent: parent?.id ?? null,
        children: [],
        start: k,
        end: k,
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

  return { nodes, activeAt, maxDepth, recursive };
}
