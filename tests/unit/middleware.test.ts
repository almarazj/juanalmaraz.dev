import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { devSessionEmail } from '../../src/lib/auth/admin';
import { verifySession } from '../../src/lib/auth/session';

const putEntry = vi.fn<(e: unknown) => Promise<void>>(async () => {});
vi.mock('astro:middleware', () => ({ defineMiddleware: (f: unknown) => f }));
vi.mock('../../src/lib/feed/store', () => ({ putEntry, FEED_WRITE_TIMEOUT_MS: 250 }));

type Next = () => Promise<Response>;
const ctx = (path: string, method = 'GET') => ({
  url: new URL(`https://juanalmaraz.dev${path}`),
  request: new Request(`https://juanalmaraz.dev${path}`, { method }),
  locals: {},
  rewrite: async () => new Response('login'),
});

// The cold flag is module state, so each test gets a fresh process.
async function load() {
  vi.resetModules();
  const { onRequest } = (await import('../../src/middleware')) as unknown as {
    onRequest: (c: ReturnType<typeof ctx>, n: Next) => Promise<Response>;
  };
  return onRequest;
}

beforeEach(() => putEntry.mockClear());

describe('middleware feed capture', () => {
  it('first request is cold, the next warm', async () => {
    const onRequest = await load();
    const next: Next = async () => new Response('ok');
    await onRequest(ctx('/writing'), next);
    await onRequest(ctx('/writing'), next);
    expect(putEntry.mock.calls.map(([e]) => (e as { c: string }).c)).toEqual(['cold', 'warm']);
  });

  it('/internal/* neither takes the cold flag nor is recorded', async () => {
    const onRequest = await load();
    const next: Next = async () => new Response('ok');
    await onRequest(ctx('/internal/ready'), next);
    expect(putEntry).not.toHaveBeenCalled();
    await onRequest(ctx('/writing'), next);
    expect(putEntry).toHaveBeenCalledWith(expect.objectContaining({ p: '/writing', c: 'cold' }));
  });

  it('records a thrown handler error as 500 and rethrows', async () => {
    const onRequest = await load();
    const boom = new Error('boom');
    await expect(onRequest(ctx('/'), async () => { throw boom; })).rejects.toBe(boom);
    expect(putEntry).toHaveBeenCalledWith(expect.objectContaining({ p: '/', s: 500 }));
  });

  it('keeps the admin guard: a non-admin GET /admin is a 403, no-store, and not recorded', async () => {
    const onRequest = await load();
    const res = await onRequest(ctx('/admin'), async () => new Response('secret'));
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(putEntry).not.toHaveBeenCalled();
  });

  describe('under astro dev on local services', () => {
    beforeEach(() => {
      vi.stubEnv('ADMIN_EMAIL', 'owner@example.com');
      vi.stubEnv('SESSION_KEY', 'dev-session-key');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('signs the owner in with a real session cookie and returns to the same page', async () => {
      const onRequest = await load();
      const res = await onRequest(ctx('/admin/posts?draft=1'), async () => new Response('secret'));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/admin/posts?draft=1');
      const cookie = res.headers.get('Set-Cookie')!;
      expect(cookie).toMatch(/^__session=[\w-]+\.[\w-]+; Path=\/admin; Max-Age=432000; HttpOnly; Secure; SameSite=Lax$/);
      const token = cookie.split(';')[0].slice('__session='.length);
      expect(verifySession(token, Date.now(), 'dev-session-key')?.email).toBe('owner@example.com');
    });

    it('never re-issues over a cookie the browser already sent, so a dropped cookie cannot loop', async () => {
      const onRequest = await load();
      const c = ctx('/admin');
      c.request.headers.set('cookie', '__session=tampered.value');
      const res = await onRequest(c, async () => new Response('secret'));
      expect(res.status).toBe(403);
    });

    it('leaves API writes to the cookie the page already got', async () => {
      const onRequest = await load();
      expect((await onRequest(ctx('/admin/api/save', 'POST'), async () => new Response('ok'))).status).toBe(403);
    });
  });
});

describe('devSessionEmail', () => {
  it('is the owner only in dev, on local services, with ADMIN_EMAIL set', () => {
    const env = { ADMIN_EMAIL: 'owner@example.com' };
    expect(devSessionEmail({ dev: true, local: true, env })).toBe('owner@example.com');
    expect(devSessionEmail({ dev: false, local: true, env })).toBeNull();
    expect(devSessionEmail({ dev: true, local: false, env })).toBeNull();
    expect(devSessionEmail({ dev: true, local: true, env: {} })).toBeNull();
  });
});
