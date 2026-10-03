// Estimation answers: read what the reader typed ("200TB", "1.5k", "2e9") and grade it by factor.
// Pure, so tests cover it.

// Byte units (KB, GiB, ...) are matched before these, so "TB" is terabytes and not "T" plus "B".
const MULTIPLIERS: [RegExp, number][] = [
  [/^bytes?$/i, 1],
  [/^thousand$/i, 1e3],
  [/^million$/i, 1e6],
  [/^billion$/i, 1e9],
  [/^trillion$/i, 1e12],
  [/^k$/i, 1e3],
  [/^m$/i, 1e6],
  [/^[bg]$/i, 1e9],
  [/^t$/i, 1e12],
  [/^p$/i, 1e15],
];
const BYTES: Record<string, number> = { k: 1e3, m: 1e6, g: 1e9, t: 1e12, p: 1e15, e: 1e18 };

/**
 * A number with an optional multiplier: k, M, B or G (billion), T, P; or a byte unit KB, MB, GB,
 * TB, PB, EB (powers of 1000) or KiB..EiB (powers of 1024). Also "2e9", "1,500", "3 million",
 * and a trailing per-time unit such as "/s" or "/day", which is ignored. Returns null when it
 * cannot be read. Note that a lone "B" means billion: write bytes as "bytes" or with a prefix.
 */
export function parseQuantity(text: string, answerUnit = ""): number | null {
  const r = readEstimate(text, answerUnit);
  return "value" in r ? r.value : null;
}

const TIME_WORDS: Record<string, string[]> = {
  ms: ["ms", "millisecond", "milliseconds"],
  s: ["s", "sec", "secs", "second", "seconds"],
  min: ["min", "mins", "minute", "minutes"],
  h: ["h", "hr", "hrs", "hour", "hours"],
  day: ["day", "days"],
};
const BIT_PREFIX: Record<string, number> = { "": 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12, p: 1e15 };

/** The words a reader may type after the number for this unit: "updates/s" gives updates (and s). */
function unitWords(answerUnit: string): Set<string> {
  const words = answerUnit.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out = new Set(words);
  for (const w of words) for (const syn of Object.values(TIME_WORDS)) if (syn.includes(w)) syn.forEach((x) => out.add(x));
  return out;
}

/** Whether the answer is counted in time ("min/year"), where "35m" could mean minutes. */
const isTimeUnit = (answerUnit: string) => {
  const first = answerUnit.toLowerCase().split(/[^a-z]+/).find(Boolean) ?? "";
  return Object.values(TIME_WORDS).some((syn) => syn.includes(first));
};

/**
 * Reads an estimate for an answer counted in `answerUnit`. Besides `parseQuantity`'s forms, the
 * unit itself or any of its words may follow the number ("158 servers", "35 min/year", "250k
 * updates/s"), a leading "$" is ignored, and for a bit rate ("Gbps") any of bps..Pbps is
 * converted to it ("50 Tbps" = 50,000 Gbps). When the unit is time, a lone lowercase "m" is
 * refused as ambiguous (minutes or million?) rather than read as million.
 */
export function readEstimate(text: string, answerUnit = ""): { value: number } | { error: string } {
  const fail = { error: "can't read that number" };
  let t = text.trim().replace(/,/g, "").replace(/^\$\s*/, "");
  const lowerUnit = answerUnit.toLowerCase();
  if (lowerUnit && t.toLowerCase().endsWith(lowerUnit) && /\d/.test(t.slice(0, -lowerUnit.length))) t = t.slice(0, -lowerUnit.length).trim();
  t = t.replace(/\s*(\/|per\s+)\s*[a-z]+$/i, "").trim();
  // A bit rate converts to the answer's bit rate.
  const wantBits = answerUnit.match(/^([kmgtp]?)bps$/i);
  const bits = t.match(/^(.*?\d)\s*([kmgtp]?)bps$/i);
  if (wantBits && bits) {
    const n = parseQuantity(bits[1]);
    return n === null ? fail : { value: (n * BIT_PREFIX[bits[2].toLowerCase()]) / BIT_PREFIX[wantBits[1].toLowerCase()] };
  }
  const words = unitWords(answerUnit);
  const word = t.match(/^(.*?\d[a-z]*)\s+([a-z]+)$/i) ?? t.match(/^(.*?\d)([a-z]{2,})$/i);
  if (word && words.has(word[2].toLowerCase())) t = word[1].trim();
  const m = t.match(/^([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i);
  if (!m) return fail;
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n)) return fail;
  if (!unit) return { value: n };
  if (unit === "m" && isTimeUnit(answerUnit)) return { error: `"m" is ambiguous here: write ${m[1]} ${answerUnit.split("/")[0]}, or ${m[1]}M for million` };
  const bytes = unit.match(/^([kmgtpe])(i?)b$/i);
  if (bytes) {
    const p = bytes[1].toLowerCase();
    return { value: n * (bytes[2] ? 1024 ** ("kmgtpe".indexOf(p) + 1) : BYTES[p]) };
  }
  for (const [re, f] of MULTIPLIERS) if (re.test(unit)) return { value: n * f };
  return fail;
}

/** 1,234 -> "1.2k", 2e14 -> "200T"; bytes as "200 TB". Three significant digits at most. */
export function formatQuantity(v: number, unit = ""): string {
  const bytes = unit === "bytes";
  const steps: [number, string][] = bytes
    ? [[1e18, " EB"], [1e15, " PB"], [1e12, " TB"], [1e9, " GB"], [1e6, " MB"], [1e3, " KB"]]
    : [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"]];
  const short = (x: number) => String(+x.toPrecision(3));
  for (const [f, s] of steps) if (Math.abs(v) >= f) return `${short(v / f)}${s}`;
  return `${short(v)}${bytes ? " bytes" : ""}`;
}

export type Grade = { ok: boolean; factor: number; direction: "high" | "low" | "exact"; message: string };

/** Within `tolerance` (a factor) of the answer either way is accepted. */
export function grade(guess: number, answer: number, tolerance: number, unit = ""): Grade {
  const ratio = guess / answer;
  const factor = ratio >= 1 ? ratio : 1 / ratio;
  const direction = ratio > 1 ? "high" : ratio < 1 ? "low" : "exact";
  const x = factor < 10 ? factor.toFixed(1).replace(/\.0$/, "") : String(Math.round(factor));
  const vs = `${formatQuantity(guess, unit)} against ${formatQuantity(answer, unit)}`;
  const ok = factor <= tolerance;
  const message =
    direction === "exact"
      ? `Spot on: ${formatQuantity(answer, unit)}.`
      : ok
        ? `Within x${tolerance}: off by x${x}, ${direction === "high" ? "a bit high" : "a bit low"} (${vs}).`
        : `Off by x${x}, too ${direction} (${vs}).`;
  return { ok, factor, direction, message };
}
