import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '../../src/lib/auth/session';

const KEY = 'k1';
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const token = signSession('owner@example.com', NOW, KEY);

describe('session token', () => {
  it('verifies what it signed', () => {
    expect(verifySession(token, NOW + DAY, KEY)).toEqual({ email: 'owner@example.com', iat: NOW });
  });

  it('rejects a changed payload', () => {
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'evil@example.com', iat: NOW, exp: NOW + 5 * DAY })).toString('base64url');
    expect(verifySession(`${forged}.${sig}`, NOW, KEY)).toBeNull();
  });

  it('rejects a changed signature, even one decoding to the same bytes', () => {
    const [payload, sig] = token.split('.');
    const flip = (c: string) => (c === 'A' ? 'B' : 'A');
    expect(verifySession(`${payload}.${flip(sig[0])}${sig.slice(1)}`, NOW, KEY)).toBeNull();
    expect(verifySession(`${payload}.${sig.slice(0, -1)}${flip(sig.at(-1)!)}`, NOW, KEY)).toBeNull();
    expect(verifySession(`${payload}.${sig}=`, NOW, KEY)).toBeNull();
  });

  it('rejects the wrong key', () => {
    expect(verifySession(token, NOW, 'k2')).toBeNull();
  });

  it('expires 5 days after issue', () => {
    expect(verifySession(token, NOW + 5 * DAY - 1, KEY)).not.toBeNull();
    expect(verifySession(token, NOW + 5 * DAY, KEY)).toBeNull();
  });

  it('rejects garbage', () => {
    for (const t of ['garbage', '', '.', 'a.b.c', `${token}.x`]) expect(verifySession(t, NOW, KEY)).toBeNull();
  });
});
