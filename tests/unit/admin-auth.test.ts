import { describe, expect, it } from 'vitest';
import { requireAdmin, type VerifySession } from '../../src/lib/auth/admin';

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
