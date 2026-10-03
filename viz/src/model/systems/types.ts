// The contract between `@viz <kind>:` hints and the systems views (ring, bits, levels, ...).
// A builder reads the variables named in its hint and returns one panel, plus the heap ids it
// drew so the generic scene walk does not draw them again.

import type { HeapId, Step, Value } from "../../tracer/types.ts";

export type SystemsKind = "ring" | "spatial" | "bits" | "levels" | "pages" | "timeline";
export const SYSTEMS_KINDS: SystemsKind[] = ["ring", "spatial", "bits", "levels", "pages", "timeline"];

export type SystemsCtx = {
  step: Step;
  prev: Step | undefined;
  /** The hint's variable names, in order: `@viz ring:tokens,keys` gives ["tokens", "keys"]. */
  args: string[];
  /** A variable's value (innermost frame first, then `this` fields; dotted paths allowed). */
  find: (name: string) => Value | undefined;
  /** The same lookup in the previous step, to tell what changed. */
  findPrev: (name: string) => Value | undefined;
  /** Plain JS copy of a value in this step: arrays, Maps, Sets and objects (with `__class` and `__id`). */
  js: (v: Value | undefined) => unknown;
  /** The same, for a value read with `findPrev`. */
  jsPrev: (v: Value | undefined) => unknown;
};

export type Built<P> = { panel: P; uses: HeapId[] } | null;
export type Builder<P> = (ctx: SystemsCtx) => Built<P>;
