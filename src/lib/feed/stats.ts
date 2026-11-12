import type { FeedEntry } from '../content/schemas';

export function feedStats(entries: FeedEntry[], now: number) {
  const ms = entries.map((e) => e.ms).sort((a, b) => a - b);
  const mid = ms.length >> 1;
  const p50 = ms.length === 0 ? 0 : ms.length % 2 ? ms[mid]! : Math.round((ms[mid - 1]! + ms[mid]!) / 2);
  const colds = entries.filter((e) => e.c === 'cold').length;
  return {
    rpm: entries.filter((e) => e.t > now - 60_000).length,
    p50,
    coldRatio: entries.length === 0 ? 0 : Math.round((colds / entries.length) * 100) / 100,
  };
}
