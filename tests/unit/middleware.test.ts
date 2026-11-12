import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
