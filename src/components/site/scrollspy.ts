export function currentId(
  positions: { id: string; top: number }[],
  viewportTop: number,
  offset = 120,
): string | null {
  let found: string | null = null;
  for (const p of positions) if (p.top <= viewportTop + offset) found = p.id;
  return found;
}

// Sections are `[data-spy-section]`, entries are `[data-spy-entry]` inside them; both need ids.
export function trackSections(cb: (sectionId: string | null, entryId: string | null) => void): void {
  const positions = (selector: string, root: ParentNode = document) =>
    [...root.querySelectorAll<HTMLElement>(selector)].map((el) => ({
      id: el.id,
      top: el.getBoundingClientRect().top + window.scrollY,
    }));
  let queued = false;
  const run = () => {
    queued = false;
    // The last block's top never reaches the offset at max scroll, so pin it there.
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const pick = (list: { id: string; top: number }[]) =>
      atBottom && list.length ? list[list.length - 1].id : currentId(list, window.scrollY);
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
  run();
}
