import { describe, expect, it } from 'vitest';
import { sanitize } from '../../src/lib/feed/sanitize';

const now = Date.UTC(2026, 10, 12);
const entry = (requestUrl: string, extra: Record<string, unknown> = {}) => ({
  timestamp: '2026-11-12T10:00:00.000Z',
  httpRequest: {
    requestMethod: 'GET',
    requestUrl: `https://juanalmaraz.dev${requestUrl}`,
    status: 200,
    cacheHit: true,
    latency: '0.084s',
    remoteIp: '203.0.113.7',
    userAgent: 'curl/8.0',
    ...extra,
  },
});

describe('sanitize', () => {
  it('maps an allowed request to a feed entry', () => {
    expect(sanitize(entry('/writing/live-request-log?utm=x'), now)).toEqual({
      m: 'GET', p: '/writing/live-request-log', s: 200, c: 'HIT', ms: 84, t: Date.parse('2026-11-12T10:00:00.000Z'),
    });
  });

  it('never carries IP or user agent', () => {
    expect(Object.keys(sanitize(entry('/'), now)!).sort()).toEqual(['c', 'm', 'ms', 'p', 's', 't']);
  });

  it('treats a missing cacheHit as MISS and falls back to now without a timestamp', () => {
    const e = entry('/api/me', { cacheHit: undefined });
    expect(sanitize({ httpRequest: e.httpRequest }, now)).toMatchObject({ c: 'MISS', t: now });
  });

  it('buckets unknown paths that 404', () => {
    expect(sanitize(entry('/wp-login.php', { status: 404 }), now)).toMatchObject({ p: '404 · unknown path', s: 404 });
  });

  it('drops unknown paths that did not 404', () => {
    expect(sanitize(entry('/admin/posts'), now)).toBeNull();
  });

  it.each([
    ['/<script>alert(1)</script>'],
    ['/%3Cscript%3E'],
    ['/writing/%2e%2e/admin'],
    ['/writing/%252e%252e'],
    ['/writing/' + 'a'.repeat(81)],
  ])('never echoes crafted path %s', (path) => {
    for (const status of [200, 404]) {
      const out = sanitize(entry(path, { status }), now);
      if (out) expect(out.p).toBe('404 · unknown path');
    }
  });

  it('drops a 4 KB path even when it 404s', () => {
    expect(sanitize(entry('/' + 'a'.repeat(4096), { status: 404 }), now)).toBeNull();
  });

  it.each(['/_astro/index.js', '/images/profile.jpg', '/search-index.json'])('drops asset %s', (path) => {
    expect(sanitize(entry(path), now)).toBeNull();
    expect(sanitize(entry(path, { status: 404 }), now)).toBeNull();
  });

  it.each([
    ['/admin/x', 404],
    ['/admin', 404],
    ['/internal/ingest', 200],
    ['/internal/ingest', 404],
    ['/api/requests', 200],
    ['/api/status', 200],
  ])('drops %s with %i', (path, status) => {
    expect(sanitize(entry(path, { status }), now)).toBeNull();
  });

  it.each(['/', '/writing', '/api/me', '/api/experience', '/api/stack', '/api/now', '/rss.xml', '/resume.pdf', '/writing/a%2Db'])('keeps %s', (path) => {
    expect(sanitize(entry(path), now)).not.toBeNull();
  });

  it.each([
    ['unsupported method', { requestMethod: 'DELETE' }],
    ['bad status', { status: 'x' }],
    ['bad latency', { latency: 'soon' }],
    ['missing url', { requestUrl: undefined }],
  ])('drops %s', (_, extra) => {
    expect(sanitize(entry('/', extra), now)).toBeNull();
  });

  it('drops non-objects', () => {
    expect(sanitize(null, now)).toBeNull();
    expect(sanitize('x', now)).toBeNull();
    expect(sanitize({}, now)).toBeNull();
  });
});
