import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cognito = vi.hoisted(() => ({
  exchangeCode: vi.fn<(code: string, verifier: string) => Promise<string>>(),
  verifyIdToken: vi.fn<(t: string) => Promise<{ email?: string; email_verified?: boolean }>>(),
}));
vi.mock('../../src/lib/auth/cognito', async (original) => ({ ...(await original<object>()), ...cognito }));

const { GET: signin } = await import('../../src/pages/admin/api/signin');
const { GET: callback } = await import('../../src/pages/admin/api/callback');
const { verifySession } = await import('../../src/lib/auth/session');

const KEY = 'test-session-key';
vi.stubEnv('SESSION_KEY', KEY);
vi.stubEnv('ADMIN_EMAIL', 'owner@example.com');
vi.stubEnv('SITE_URL', 'https://juanalmaraz.dev');
vi.stubEnv('COGNITO_DOMAIN', 'https://jalma.auth.us-east-2.amazoncognito.com');
vi.stubEnv('COGNITO_CLIENT_ID', 'client');

const route = (handler: unknown, url: string, cookie?: string) =>
  (handler as (c: unknown) => Promise<Response>)({
    request: new Request(url, { headers: cookie ? { cookie } : {} }),
    url: new URL(url),
  });

// Starts sign-in like the browser, so the callback sees a real state and verifier.
async function start() {
  const res = await route(signin, 'https://juanalmaraz.dev/admin/api/signin');
  const location = new URL(res.headers.get('location')!);
  const setCookie = res.headers.get('set-cookie')!;
  return { res, location, setCookie, state: location.searchParams.get('state')!, cookie: setCookie.split(';')[0] };
}

const cb = (query: string, cookie?: string) => route(callback, `https://juanalmaraz.dev/admin/api/callback?${query}`, cookie);
const sessionOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith('__session='));

beforeEach(() => {
  cognito.exchangeCode.mockReset().mockResolvedValue('id-token');
  cognito.verifyIdToken.mockReset().mockResolvedValue({ email: 'owner@example.com', email_verified: true });
});

describe('GET /admin/api/signin', () => {
  it('redirects to Cognito with a fresh state and an S256 challenge kept in a short-lived cookie', async () => {
    const a = await start();
    const b = await start();
    expect(a.res.status).toBe(302);
    expect(a.location.origin).toBe('https://jalma.auth.us-east-2.amazoncognito.com');
    expect(a.state).toMatch(/^[\w-]{43}$/);
    expect(a.state).not.toBe(b.state);
    expect(a.setCookie).toMatch(/^__oauth=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/admin\/api\/callback; Max-Age=600$/);
    expect(a.setCookie).toContain(a.state);
    expect(a.location.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('GET /admin/api/callback', () => {
  it('signs the owner in with the verifier matching the challenge', async () => {
    const { state, cookie, location } = await start();
    const res = await cb(`code=abc&state=${state}`, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin');
    const [code, verifier] = cognito.exchangeCode.mock.calls[0];
    expect(code).toBe('abc');
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(location.searchParams.get('code_challenge'));
    expect(cognito.verifyIdToken).toHaveBeenCalledWith('id-token');

    const session = sessionOf(res)!;
    expect(session).toMatch(/^__session=[^;]+; Path=\/admin; Max-Age=432000; HttpOnly; Secure; SameSite=Lax$/);
    const token = decodeURIComponent(session.split(';')[0].slice('__session='.length));
    expect(verifySession(token, Date.now(), KEY)).toMatchObject({ email: 'owner@example.com' });
    expect(res.headers.getSetCookie()).toContain('__oauth=; HttpOnly; Secure; SameSite=Lax; Path=/admin/api/callback; Max-Age=0');
  });

  it('rejects a state mismatch without exchanging the code', async () => {
    const { state, cookie } = await start();
    const res = await cb(`code=abc&state=${state.slice(0, -1)}x`, cookie);
    expect(res.status).toBe(403);
    expect(sessionOf(res)).toBeUndefined();
    expect(cognito.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a callback without the sign-in cookie, state or code', async () => {
    const { state, cookie } = await start();
    for (const res of [await cb(`code=abc&state=${state}`), await cb(`code=abc`, cookie), await cb(`state=${state}`, cookie), await cb(`code=abc&state=`, '__oauth=.')]) {
      expect(res.status).toBe(403);
      expect(sessionOf(res)).toBeUndefined();
    }
    expect(cognito.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a non-allowlisted or unverified email', async () => {
    for (const claims of [{ email: 'someone@example.com', email_verified: true }, { email: 'owner@example.com', email_verified: false }]) {
      cognito.verifyIdToken.mockResolvedValueOnce(claims);
      const { state, cookie } = await start();
      const res = await cb(`code=abc&state=${state}`, cookie);
      expect(res.status).toBe(403);
      expect(sessionOf(res)).toBeUndefined();
    }
  });

  it('rejects a failed exchange or a token that does not verify', async () => {
    cognito.exchangeCode.mockRejectedValueOnce(new Error('token endpoint 400'));
    let { state, cookie } = await start();
    expect((await cb(`code=abc&state=${state}`, cookie)).status).toBe(403);
    cognito.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    ({ state, cookie } = await start());
    const res = await cb(`code=abc&state=${state}`, cookie);
    expect(res.status).toBe(403);
    expect(sessionOf(res)).toBeUndefined();
  });
});
