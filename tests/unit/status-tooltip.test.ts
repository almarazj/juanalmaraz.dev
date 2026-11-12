import { describe, expect, it } from 'vitest';
import { placeTooltip, withinIntent } from '../../src/components/site/status-tooltip';

describe('withinIntent', () => {
  it('is true inside the radius and false outside', () => {
    expect(withinIntent([0, 0], [20, 20])).toBe(true);
    expect(withinIntent([0, 0], [40, 40])).toBe(false);
  });
});

describe('placeTooltip', () => {
  const size = { width: 200, height: 100 };
  const viewport = { width: 1000, height: 800 };
  it('sits right and below the pointer by the offset', () => {
    expect(placeTooltip([100, 100], size, viewport)).toEqual([116, 116]);
  });
  it('flips left near the right edge and up near the bottom', () => {
    expect(placeTooltip([900, 750], size, viewport)).toEqual([900 - 16 - 200, 750 - 16 - 100]);
  });
});
