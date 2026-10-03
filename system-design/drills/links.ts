// Node only: the id of every problem in the repository, the way the visualizer names them, so
// flashcard tests can check each card's `link`. viz/tests/drills.test.ts checks these ids match
// the visualizer's own parser. (The visualizer stubs this module when it loads a deck.)

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Deck } from "./index.ts";

const repo = join(import.meta.dirname, "../..");
const tsFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")) : []);
const subdirs = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((d) => !d.includes(".")) : []);
const strip = (f: string) => f.replace(/\.ts$/, "");

/** Every problem id: "07-trees/046-invert-binary-tree", "sd-05-replication/017-...", "sd-microservices/01-...". */
export function problemIds(): Set<string> {
  const ids = new Set<string>();
  const nc = join(repo, "neetcode-150");
  for (const d of subdirs(nc)) for (const f of tsFiles(join(nc, d))) ids.add(`${d}/${strip(f)}`);
  const prim = join(repo, "system-design/primitives");
  for (const d of subdirs(prim)) for (const f of tsFiles(join(prim, d))) ids.add(`sd-${d}/${strip(f)}`);
  for (const track of ["architectures", "microservices", "low-level-design", "api-design"]) {
    for (const f of tsFiles(join(repo, "system-design", track))) ids.add(`sd-${track}/${strip(f)}`);
  }
  const drills = join(repo, "system-design/drills");
  for (const d of subdirs(drills)) for (const f of tsFiles(join(drills, d))) ids.add(`sd-drills-${d}/${strip(f)}`);
  return ids;
}

/** Cards whose `link` names no problem; a deck's test asserts this is empty. */
export function unknownLinks(deck: Deck): string[] {
  const ids = problemIds();
  return deck.cards.flatMap((c) => (c.link && !ids.has(c.link) ? [`"${c.front}" links to unknown problem ${c.link}`] : []));
}
