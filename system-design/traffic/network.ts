// A machine's network card. Answers being sent share its bandwidth fairly (like TCP flows): with
// n transfers under way each gets min(per-flow limit, bandwidth / n). A transfer's own limit
// stands for the receiver's link and TCP's window: one download never fills a 10 Gbps card.
//
// Under request scaling each simulated transfer stands for `scale` real ones, so the card keeps
// 1/scale of its bandwidth while a transfer keeps its real size and per-flow limit: the share each
// real transfer would get, bandwidth / (scale x n), comes out the same. That is exact while
// bandwidth / scale stays above the per-flow limit; below it the engine flags the run approximate.

export class Nic<T> {
  private flows: { item: T; bits: number; left: number }[] = [];
  private last = 0;
  /** Bumped whenever the set of transfers changes, so a scheduled finish that no longer holds is ignored. */
  gen = 0;
  /** Since the last frame: share of the bandwidth in use x ms, and bits sent. */
  area = 0;
  sent = 0;

  private cap: number;
  private flowCap: number;

  /** Bandwidth and per-transfer limit, in bits per ms. */
  constructor(cap: number, flowCap: number) {
    this.cap = cap;
    this.flowCap = flowCap;
  }

  get size(): number {
    return this.flows.length;
  }

  private rate(): number {
    return this.flows.length ? Math.min(this.flowCap, this.cap / this.flows.length) : 0;
  }

  /** Moves every transfer forward to `now`. */
  advance(now: number): void {
    const dt = now - this.last;
    if (dt > 0 && this.flows.length) {
      const r = this.rate();
      for (const f of this.flows) f.left -= r * dt;
      const total = r * this.flows.length;
      this.area += (total / this.cap) * dt;
      this.sent += total * dt;
    }
    this.last = now;
  }

  add(now: number, item: T, bits: number): void {
    this.advance(now);
    this.flows.push({ item, bits, left: bits });
    this.gen++;
  }

  /** When the next transfer will finish, if nothing changes before then. */
  next(): number {
    if (!this.flows.length) return Infinity;
    let min = Infinity;
    for (const f of this.flows) min = Math.min(min, f.left);
    return this.last + Math.max(0, min) / this.rate();
  }

  /** Takes out the transfers finished by `now` (up to rounding error). */
  finished(now: number): T[] {
    this.advance(now);
    const out: T[] = [];
    this.flows = this.flows.filter((f) => {
      if (f.left > 1e-9 * f.bits + 1e-9) return true;
      out.push(f.item);
      return false;
    });
    this.gen++;
    return out;
  }

  /** The machine died: every transfer is cut off. */
  clear(now: number): void {
    this.advance(now);
    this.flows = [];
    this.gen++;
  }
}
