import { describe, expect, it } from 'vitest';
import { sanitize, type RequestFacts } from '../../src/lib/feed/sanitize';

const facts = (path: string, extra: Partial<RequestFacts> = {}): RequestFacts => ({
  method: 'GET', path, status: 200, ms: 84, cold: false, t: 1_700_000_000_000, ...extra,
});

describe('sanitize', () => {
  it('maps an allowed request to a feed entry', () => {
    expect(sanitize(facts('/writing/live-request-log'))).toEqual({
      m: 'GET', p: '/writing/live-request-log', s: 200, c: 'warm', ms: 84, t: 1_700_000_000_000,
    });
  });

  it('never carries IP or user agent', () => {
    const f = { ...facts('/'), ip: '203.0.113.7', userAgent: 'curl/8.0' };
    expect(Object.keys(sanitize(f)!).sort()).toEqual(['c', 'm', 'ms', 'p', 's', 't']);
  });

  it('maps cold to c', () => {
    expect(sanitize(facts('/', { cold: true }))).toMatchObject({ c: 'cold' });
    expect(sanitize(facts('/', { cold: false }))).toMatchObject({ c: 'warm' });
  });

  it('buckets unknown paths that 404', () => {
    expect(sanitize(facts('/wp-login.php', { status: 404 }))).toMatchObject({ p: '404 · unknown path', s: 404 });
  });

  it('drops unknown paths that did not 404', () => {
    expect(sanitize(facts('/admin/posts'))).toBeNull();
  });

  it.each([
    ['/<script>alert(1)</script>'],
    ['/%3Cscript%3E'],
    ['/writing/%2e%2e/admin'],
    ['/writing/%252e%252e'],
    ['/writing/' + 'a'.repeat(81)],
  ])('never echoes crafted path %s', (path) => {
    for (const status of [200, 404]) {
      const out = sanitize(facts(path, { status }));
      if (out) expect(out.p).toBe('404 · unknown path');
    }
  });

  it('drops a 4 KB path even when it 404s', () => {
    expect(sanitize(facts('/' + 'a'.repeat(4096), { status: 404 }))).toBeNull();
  });

  it.each(['/_astro/index.js', '/images/profile.jpg', '/search-index.json', '/api/health'])('drops %s', (path) => {
    expect(sanitize(facts(path))).toBeNull();
    expect(sanitize(facts(path, { status: 404 }))).toBeNull();
  });

  it.each([
    ['/admin/x', 404],
    ['/admin', 404],
    ['/internal/ready', 200],
    ['/api/requests', 200],
    ['/api/status', 200],
  ])('drops %s with %i', (path, status) => {
    expect(sanitize(facts(path, { status }))).toBeNull();
  });

  it.each(['/', '/writing', '/api/me', '/api/experience', '/api/stack', '/api/now', '/rss.xml', '/resume.pdf', '/writing/a%2Db'])('keeps %s', (path) => {
    expect(sanitize(facts(path))).not.toBeNull();
  });

  it.each([
    ['unsupported method', { method: 'DELETE' }],
    ['bad status', { status: 99 }],
    ['fractional status', { status: 200.5 }],
  ])('drops %s', (_, extra) => {
    expect(sanitize(facts('/', extra))).toBeNull();
  });
});
