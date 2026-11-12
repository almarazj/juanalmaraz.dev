const isEditable = (t: EventTarget | null) => {
  const el = t as (HTMLElement & { isContentEditable?: boolean }) | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.isContentEditable);
};

// Keys are "t" or "g e" sequences; the second key must land within timeoutMs of the first.
export function createShortcuts(map: Record<string, () => void>, timeoutMs = 800): (e: KeyboardEvent) => void {
  const prefixes = new Set(Object.keys(map).filter((k) => k.includes(' ')).map((k) => k.split(' ')[0]));
  let pending: { key: string; at: number } | null = null;
  return (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
    const prior = pending && Date.now() - pending.at <= timeoutMs ? pending.key : null;
    pending = null;
    const run = (combo: string) => {
      if (!map[combo]) return false;
      e.preventDefault();
      map[combo]();
      return true;
    };
    if (prior && run(`${prior} ${e.key}`)) return;
    if (run(e.key)) return;
    if (prefixes.has(e.key)) pending = { key: e.key, at: Date.now() };
  };
}
