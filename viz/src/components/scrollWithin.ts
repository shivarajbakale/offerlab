// scrollIntoView scrolls every scrollable ancestor, so on phones (where the whole page scrolls)
// following the current line would yank the page away from the visual. This scrolls only the
// element's own scroll box.

export function scrollWithin(el: Element | null | undefined, behavior: ScrollBehavior = "auto") {
  if (!(el instanceof HTMLElement)) return;
  let box = el.parentElement;
  while (box) {
    const { overflowY } = getComputedStyle(box);
    // Stop at the first scroll box even if it has nothing to scroll, so the page never moves.
    if (overflowY === "auto" || overflowY === "scroll") break;
    box = box.parentElement;
  }
  if (!box || box.scrollHeight <= box.clientHeight) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  // Same as block: "nearest": move only as far as needed to bring the element fully into view.
  let dy = 0;
  if (r.top < b.top) dy = r.top - b.top;
  else if (r.bottom > b.bottom) dy = Math.min(r.bottom - b.bottom, r.top - b.top);
  if (dy) box.scrollBy({ top: dy, behavior });
}
