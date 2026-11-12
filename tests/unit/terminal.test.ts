import { describe, expect, it } from 'vitest';
import { formatAgo } from '../../src/components/home/terminal';

describe('formatAgo', () => {
  it.each([
    [0, '0 s ago'],
    [-5_000, '0 s ago'],
    [14_400, '14 s ago'],
    [3 * 60_000 + 5_000, '3 min ago'],
    [2 * 3_600_000, '2 h ago'],
    [3 * 86_400_000, '3 d ago'],
  ])('%i ms', (ms, label) => {
    expect(formatAgo(ms)).toBe(label);
  });
});
