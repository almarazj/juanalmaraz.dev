import { describe, expect, it } from 'vitest';
import { tenure } from '../../src/components/home/tenure';

const now = new Date(Date.UTC(2026, 10, 12));

describe('tenure', () => {
  it('measures a closed period in years, counting both months', () => {
    expect(tenure('2021-03', '2022-12', now).years).toBeCloseTo(22 / 12, 5);
  });

  it('uses now for an open period', () => {
    expect(tenure('2026-01', null, now).years).toBeCloseTo(11 / 12, 5);
  });
});
