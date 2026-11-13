import { createHmac, timingSafeEqual } from 'node:crypto';

const LIFETIME_MS = 5 * 86_400_000;

const mac = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

// Times are epoch milliseconds, so a logout revokes a session minted even a second earlier.
export function signSession(email: string, now: number, key: string): string {
  const payload = Buffer.from(JSON.stringify({ e: email, iat: now, exp: now + LIFETIME_MS })).toString('base64url');
  return `${payload}.${mac(payload, key)}`;
}

export function verifySession(token: string, now: number, key: string): { email: string; iat: number } | null {
  const [payload, sig, ...rest] = token.split('.');
  if (!payload || !sig || rest.length) return null;
  // Compare the encoded strings: base64url decoding ignores trailing bits, so decoded bytes would accept variants.
  const expected = Buffer.from(mac(payload, key));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims: { e?: unknown; iat?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  const { e, iat, exp } = claims ?? {};
  if (typeof e !== 'string' || typeof iat !== 'number' || typeof exp !== 'number' || now >= exp) return null;
  return { email: e, iat };
}
