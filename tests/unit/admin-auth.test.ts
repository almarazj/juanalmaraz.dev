import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin, revokeSessions, type VerifySession } from '../../src/lib/auth/admin';
import { signSession } from '../../src/lib/auth/session';
import { resetTable } from '../../scripts/local-aws';
import { POST as logout } from '../../src/pages/admin/api/logout';

const ADMIN = 'owner@example.com';
const req = (cookie?: string) => new Request('http://x/admin', { headers: cookie ? { cookie } : {} });
const claims = (email: string, email_verified = true): VerifySession => async () => ({ email, email_verified });

async function status(p: Promise<unknown>) {
  try {
    await p;
    return 200;
  } catch (err) {
    if (err instanceof Response) return err.status;
    throw err;
  }
}

describe('requireAdmin', () => {
  it('passes the allowlisted, verified email', async () => {
    await expect(requireAdmin(req('__session=c'), { verify: claims(ADMIN), adminEmail: ADMIN })).resolves.toEqual({ email: ADMIN });
  });

  it('matches the allowlist case-insensitively', async () => {
    await expect(requireAdmin(req('__session=c'), { verify: claims('Owner@Example.com'), adminEmail: ADMIN })).resolves.toBeTruthy();
  });

  it('rejects another verified email with 403', async () => {
    expect(await status(requireAdmin(req('__session=c'), { verify: claims('other@example.com'), adminEmail: ADMIN }))).toBe(403);
  });

  it('rejects the allowlisted email when it is not verified', async () => {
    expect(await status(requireAdmin(req('__session=c'), { verify: claims(ADMIN, false), adminEmail: ADMIN }))).toBe(403);
  });

  it('rejects an expired cookie with 403', async () => {
    const verify: VerifySession = async () => {
      throw Object.assign(new Error('expired'), { code: 'auth/session-cookie-expired' });
    };
    expect(await status(requireAdmin(req('__session=c'), { verify, adminEmail: ADMIN }))).toBe(403);
  });

  it('rejects a request without the cookie', async () => {
    expect(await status(requireAdmin(req(), { verify: claims(ADMIN), adminEmail: ADMIN }))).toBe(403);
  });

  it('fails closed when ADMIN_EMAIL is unset', async () => {
    expect(await status(requireAdmin(req('__session=c'), { verify: claims(''), adminEmail: '' }))).toBe(403);
    expect(await status(requireAdmin(req('__session=c'), { verify: claims(ADMIN), adminEmail: undefined }))).toBe(403);
  });
});

describe('live session verifier', () => {
  const KEY = 'test-session-key';
  const live = (email: string, iat = Date.now(), key = KEY) => req(`__session=${encodeURIComponent(signSession(email, iat, key))}`);

  beforeAll(() => vi.stubEnv('SESSION_KEY', KEY));
  beforeEach(() => resetTable());

  it('passes a valid owner session', async () => {
    await expect(requireAdmin(live(ADMIN), { adminEmail: ADMIN })).resolves.toEqual({ email: ADMIN });
  });

  it('rejects a valid session for another email', async () => {
    expect(await status(requireAdmin(live('other@example.com'), { adminEmail: ADMIN }))).toBe(403);
  });

  it('rejects a session signed with another key, or expired', async () => {
    expect(await status(requireAdmin(live(ADMIN, Date.now(), 'other-key'), { adminEmail: ADMIN }))).toBe(403);
    expect(await status(requireAdmin(live(ADMIN, Date.now() - 5 * 86_400_000 - 1), { adminEmail: ADMIN }))).toBe(403);
  });

  it('rejects a session issued before sessionsValidAfter', async () => {
    const before = live(ADMIN, Date.now() - 1000);
    await revokeSessions(Date.now());
    expect(await status(requireAdmin(before, { adminEmail: ADMIN }))).toBe(403);
    await expect(requireAdmin(live(ADMIN, Date.now() + 1), { adminEmail: ADMIN })).resolves.toEqual({ email: ADMIN });
  });

  it('logout revokes every session, clears the cookie and points at Cognito logout', async () => {
    vi.stubEnv('SITE_URL', 'https://juanalmaraz.dev');
    vi.stubEnv('COGNITO_DOMAIN', 'https://jalma.auth.us-east-2.amazoncognito.com');
    vi.stubEnv('COGNITO_CLIENT_ID', 'client');
    const before = live(ADMIN, Date.now() - 1);
    const res = await (logout as unknown as () => Promise<Response>)();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBe('__session=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    const { logoutUrl } = await res.json();
    expect(logoutUrl).toBe(
      'https://jalma.auth.us-east-2.amazoncognito.com/logout?client_id=client&logout_uri=https%3A%2F%2Fjuanalmaraz.dev%2Fadmin%2Flogin',
    );
    expect(await status(requireAdmin(before, { adminEmail: ADMIN }))).toBe(403);
  });
});
