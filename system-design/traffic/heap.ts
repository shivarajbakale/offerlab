// A binary min-heap of events ordered by (t, seq): earliest first, and ties in the order they
// were scheduled, so a run never depends on how the heap happens to arrange equal times.

export type Timed = { t: number; seq: number };

const before = (x: Timed, y: Timed) => x.t < y.t || (x.t === y.t && x.seq < y.seq);

export class EventQueue<E extends Timed> {
  private items: E[] = [];

  get size(): number {
    return this.items.length;
  }

  /** The earliest item, without removing it. */
  peek(): E | undefined {
    return this.items[0];
  }

  push(e: E): void {
    const a = this.items;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop(): E | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && before(a[l], a[m])) m = l;
        if (r < a.length && before(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
