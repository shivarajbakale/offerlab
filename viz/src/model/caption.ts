// The caption a building block's picture shows at a step: the latest `@caption` whose line has run
// in this scenario, filled in with the values from just after that line ran. Pure, so tests can use it.

import type { Step } from "../tracer/types.ts";
import type { Caption } from "./systems/types.ts";
import type { Hints } from "./hints.ts";
import { scopeValues } from "./heap.ts";
import { fillTemplate } from "./narrate.ts";

const TONE = /^(good|bad):\s*/;

/** Fills a caption template from the step after its line ran, or the step itself if that fails. */
function fill(template: string, steps: Step[], j: number): string {
  const after = steps[j + 1];
  if (after) {
    const text = fillTemplate(template, scopeValues(after));
    if (!/\{[^{}]+\}/.test(text)) return text;
  }
  return fillTemplate(template, scopeValues(steps[j]));
}

/** The caption at step k (the step about to run is k, so captions of lines that ran before it count). */
export function captionAt(steps: Step[], k: number, hints: Hints): Caption | null {
  if (!Object.keys(hints.caption).length) return null;
  for (let j = Math.min(k, steps.length - 1); j >= 0; j--) {
    const template = hints.caption[steps[j].line];
    // The step at k shows the state after its line ran, so its own caption applies.
    if (template === undefined || steps[j].event === "call") continue;
    // The tone may come from the template itself ({x > y ? "bad: ..." : "..."}), so read it after filling.
    const text = fill(template, steps, j);
    const tone = text.match(TONE)?.[1] as Caption["tone"] | undefined;
    return { tone: tone ?? "info", text: text.replace(TONE, "") };
  }
  return null;
}
