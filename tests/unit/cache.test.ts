import { describe, expect, it } from 'vitest';
import { cacheHeaders } from '../../src/lib/http/cache';

describe('cacheHeaders', () => {
  it.each([
    ['page', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'],
    ['api', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'],
    ['requests', 'public, max-age=0, s-maxage=5'],
    ['status', 'public, max-age=0, s-maxage=30'],
    ['private', 'no-store'],
  ] as const)('%s', (kind, value) => {
    expect(cacheHeaders(kind)).toEqual({ 'Cache-Control': value });
  });
});
