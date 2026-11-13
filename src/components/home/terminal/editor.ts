// Line editing logic, kept free of the DOM so it can be tested on its own.

export const tokenize = (s: string) =>
  (s.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^(["'])(.*)\1$/, '$2'));

/** The grey rest-of-line, like zsh-autosuggestions: newest history match first, then the common commands. */
export function suggest(value: string, history: readonly string[], common: readonly string[]): string {
  if (!value) return '';
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.length > value.length && h.startsWith(value)) return h.slice(value.length);
  }
  const c = common.find((h) => h.length > value.length && h.startsWith(value));
  return c ? c.slice(value.length) : '';
}

export interface HistoryCursor {
  index: number;
  prefix: string;
  draft: string;
}

/**
 * Moves through history entries that start with what was typed before the first step.
 * Returns null at the oldest entry; stepping past the newest restores the draft.
 */
export function stepHistory(
  history: readonly string[],
  cursor: HistoryCursor | null,
  current: string,
  dir: -1 | 1,
): { cursor: HistoryCursor | null; value: string } | null {
  const c = cursor ?? { index: history.length, prefix: current, draft: current };
  let i = c.index;
  do i += dir;
  while (i >= 0 && i < history.length && (!history[i].startsWith(c.prefix) || history[i] === current));
  if (i < 0) return null;
  if (i >= history.length) return { cursor: null, value: c.draft };
  return { cursor: { ...c, index: i }, value: history[i] };
}

/** The word under completion, within the last pipeline stage. */
export function completionTarget(value: string, pos: number) {
  const left = value.slice(0, pos);
  const stage = left.slice(left.lastIndexOf('|') + 1).replace(/^\s+/, '');
  const words = stage.split(/\s+/);
  const cur = words[words.length - 1];
  return { words, cur, start: pos - cur.length };
}

export const commonPrefix = (xs: readonly string[]) =>
  xs.reduce((p, x) => {
    let i = 0;
    while (i < p.length && p[i] === x[i]) i++;
    return p.slice(0, i);
  });

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** A likely intended command for a typo, if one is close enough. */
export const closest = (name: string, names: readonly string[]) =>
  names.find((n) => distance(n, name) <= (name.length > 3 ? 2 : 1));
