/**
 * The lowest block whose top has passed viewportTop + offset.
 * Blocks sharing a top (one row of a grid) cannot be told apart by scrolling: `preferred` wins
 * if it is in that row (the entry a link jumped to), otherwise the row's first block does.
 */
export function currentId(
  positions: { id: string; top: number }[],
  viewportTop: number,
  offset = 120,
  preferred: string | null = null,
): string | null {
  const passed = positions.filter((p) => p.top <= viewportTop + offset);
  if (!passed.length) return null;
  const top = Math.max(...passed.map((p) => p.top));
  const row = passed.filter((p) => Math.abs(p.top - top) < 1);
  return row.find((p) => p.id === preferred)?.id ?? row[0].id;
}

// Sections are `[data-spy-section]`, entries are `[data-spy-entry]` inside them; both need ids.
export function trackSections(cb: (sectionId: string | null, entryId: string | null) => void): void {
  const positions = (selector: string, root: ParentNode = document) =>
    // Entries a filter hides have no box; they would read as top 0 and always count as passed.
    [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => el.getClientRects().length > 0).map((el) => ({
      id: el.id,
      top: el.getBoundingClientRect().top + window.scrollY,
    }));
  let queued = false;
  const run = () => {
    queued = false;
    // The last block's top never reaches the offset at max scroll, so pin it there.
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const pick = (list: { id: string; top: number }[]) =>
      atBottom && list.length ? list[list.length - 1].id : currentId(list, window.scrollY, 120, location.hash.slice(1) || null);
    const sectionId = pick(positions('[data-spy-section]'));
    const section = sectionId && document.getElementById(sectionId);
    const entryId = section ? pick(positions('[data-spy-entry]', section)) : null;
    cb(sectionId, entryId);
  };
  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(run);
    }
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('hashchange', schedule);
  run();
}
