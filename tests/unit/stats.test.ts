import { describe, expect, it } from 'vitest';
import { feedStats } from '../../src/lib/feed/stats';
import type { FeedEntry } from '../../src/lib/content/schemas';

const e = (extra: Partial<FeedEntry>): FeedEntry => ({ m: 'GET', p: '/', s: 200, c: 'HIT', ms: 10, t: 0, ...extra });

describe('feedStats', () => {
  it('computes rpm over the last minute, median latency and hit ratio', () => {
    const now = 1_000_000;
    const entries = [
      e({ t: now - 1_000, ms: 10, c: 'HIT' }),
      e({ t: now - 30_000, ms: 30, c: 'MISS' }),
      e({ t: now - 61_000, ms: 20, c: 'HIT' }),
    ];
    expect(feedStats(entries, now)).toEqual({ rpm: 2, p50: 20, hitRatio: 0.67 });
  });

  it('handles an empty feed', () => {
    expect(feedStats([], 0)).toEqual({ rpm: 0, p50: 0, hitRatio: 0 });
  });
});
