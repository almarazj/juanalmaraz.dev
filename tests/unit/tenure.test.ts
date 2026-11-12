import { describe, expect, it } from 'vitest';
import { tenure } from '../../src/components/home/tenure';

const now = new Date(Date.UTC(2026, 10, 12));

describe('tenure', () => {
  it('measures a closed period in years and bar width', () => {
    const t = tenure('2021-03', '2022-12', now);
    expect(Math.abs(t.years - 1.8)).toBeLessThan(0.1);
    expect(Math.abs(t.widthPct - 30)).toBeLessThan(1);
  });

  it('uses now for an open period', () => {
    expect(tenure('2026-01', null, now).years).toBeCloseTo(11 / 12, 5);
  });

  it('caps the bar at 100%', () => {
    const t = tenure('2016-01', '2023-12', now);
    expect(t.years).toBe(8);
    expect(t.widthPct).toBe(100);
  });
});
