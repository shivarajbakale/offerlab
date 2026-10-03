// Random draws for the traffic engine, all from one seeded generator so runs repeat exactly.

import { makeRng } from "../kernel/sim.ts";

export { makeRng };
export type Rng = () => number;

/** Exponential with the given mean: the gap between arrivals when requests come independently. */
export function exponential(rand: Rng, mean: number): number {
  return -mean * Math.log(1 - rand());
}

/** Standard normal, by the Box-Muller method. */
export function normal(rand: Rng): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Lognormal with the given mean and coefficient of variation (spread divided by mean): a long right tail, like real latency. */
export function lognormal(rand: Rng, mean: number, cv: number): number {
  const s2 = Math.log(1 + cv * cv);
  return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * normal(rand));
}

/** The p-th percentile (0..1) of an ascending list; 0 for an empty one. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}
