import { describe, expect, it } from 'vitest';
import { PROBE_INTERVAL_MS, uptimeRatio } from '../../src/lib/status/uptime';

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const H = 3_600_000;
const D = 86_400_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

describe('uptimeRatio', () => {
  it('is null before the first probe', () => {
    expect(uptimeRatio([], null, NOW)).toBeNull();
  });
  it('is 1 when every slot since the first probe succeeded', () => {
    expect(uptimeRatio([{ day: day(NOW), ok: 12 }], NOW - H, NOW)).toBe(1);
  });
  it('is 0.5 when half the slots succeeded', () => {
    expect(uptimeRatio([{ day: day(NOW), ok: 6 }], NOW - H, NOW)).toBe(0.5);
  });
  it('counts only the 30 day window for an old first probe', () => {
    expect(uptimeRatio([{ day: day(NOW - D), ok: 8640 }], NOW - 60 * D, NOW)).toBe(1);
  });
  it('is 0 when probes stopped and no day has an ok count', () => {
    expect(uptimeRatio([], NOW - 2 * D, NOW)).toBe(0);
  });
  it('ignores ok counts from days before the window start', () => {
    expect(uptimeRatio([{ day: day(NOW - 40 * D), ok: 5000 }, { day: day(NOW), ok: 12 }], NOW - H, NOW)).toBe(1);
    expect(uptimeRatio([{ day: day(NOW - 40 * D), ok: 5000 }], NOW - 60 * D, NOW)).toBe(0);
  });
  it('never exceeds 1', () => {
    expect(uptimeRatio([{ day: day(NOW), ok: 99 }], NOW - H, NOW)).toBe(1);
  });
  it('probes every 5 minutes', () => {
    expect(PROBE_INTERVAL_MS).toBe(300_000);
  });
});
