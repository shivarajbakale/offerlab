// The pattern catalog, merged from one file per topic group.

import { arraysPatterns } from "./arrays.ts";
import { dpPatterns } from "./dp.ts";
import { graphsPatterns } from "./graphs.ts";
import { searchPatterns } from "./search.ts";
import type { Pattern } from "./types.ts";

export type { Pattern };

export const patterns: Pattern[] = [...arraysPatterns, ...searchPatterns, ...graphsPatterns, ...dpPatterns];

export const patternById = new Map(patterns.map((p) => [p.id, p]));
