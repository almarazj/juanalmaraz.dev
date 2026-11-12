import { createSign, generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { authorizeUrl, exchangeCode, idVerifier, verifyIdToken } from '../../src/lib/auth/cognito';

const POOL = 'us-east-2_TestPool';
const CLIENT = 'test-client';
const env = {
  SITE_URL: 'https://juanalmaraz.dev',
  COGNITO_DOMAIN: 'https://jalma.auth.us-east-2.amazoncognito.com',
  COGNITO_CLIENT_ID: CLIENT,
  COGNITO_USER_POOL_ID: POOL,
  COGNITO_CLIENT_SECRET: 'shh',
};
for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = `${b64({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64(claims)}`;
  return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
}
const now = () => Math.floor(Date.now() / 1000);
const claims = (extra: Record<string, unknown> = {}) => ({
  sub: 'u1',
  iss: `https://cognito-idp.us-east-2.amazonaws.com/${POOL}`,
  aud: CLIENT,
  token_use: 'id',
  email: 'owner@example.com',
  email_verified: true,
  iat: now(),
  exp: now() + 3600,
  ...extra,
});

describe('authorizeUrl', () => {
  it('asks Cognito for a Google code with PKCE', () => {
    const url = authorizeUrl('st', 'ch', env);
    expect(url.startsWith(`${env.COGNITO_DOMAIN}/oauth2/authorize?`)).toBe(true);
    expect(url).toContain('identity_provider=Google');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fjuanalmaraz.dev%2Fadmin%2Fapi%2Fcallback');
    const q = new URL(url).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      response_type: 'code', client_id: CLIENT, scope: 'openid email', state: 'st', code_challenge: 'ch',
    });
  });

  it('fails closed without configuration', () => {
    expect(() => authorizeUrl('st', 'ch', { ...env, COGNITO_DOMAIN: undefined })).toThrow();
  });
});

describe('exchangeCode', () => {
  it('posts the code and verifier with HTTP Basic client auth', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ id_token: 'idt', access_token: 'at' }));
    await expect(exchangeCode('the-code', 'the-verifier', fetchImpl as typeof fetch)).resolves.toBe('idt');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${env.COGNITO_DOMAIN}/oauth2/token`);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(`Basic ${Buffer.from(`${CLIENT}:shh`).toString('base64')}`);
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: 'https://juanalmaraz.dev/admin/api/callback',
    });
  });

  it('throws on a non-200', async () => {
    const fetchImpl = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    await expect(exchangeCode('c', 'v', fetchImpl as typeof fetch)).rejects.toThrow();
  });
});

describe('verifyIdToken', () => {
  beforeAll(() => {
    idVerifier().cacheJwks({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] } as never);
  });

  it('accepts an ID token from the pool for this client', async () => {
    await expect(verifyIdToken(jwt(claims()))).resolves.toMatchObject({ email: 'owner@example.com', email_verified: true });
  });

  it('reads a string "false" email_verified as unverified', async () => {
    await expect(verifyIdToken(jwt(claims({ email_verified: 'false' })))).resolves.toMatchObject({ email_verified: false });
    await expect(verifyIdToken(jwt(claims({ email_verified: 'true' })))).resolves.toMatchObject({ email_verified: true });
  });

  it('rejects an access token', async () => {
    await expect(verifyIdToken(jwt(claims({ token_use: 'access', client_id: CLIENT, aud: undefined })))).rejects.toThrow();
  });

  it('rejects another audience, issuer or an expired token', async () => {
    await expect(verifyIdToken(jwt(claims({ aud: 'other' })))).rejects.toThrow();
    await expect(verifyIdToken(jwt(claims({ iss: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_Other' })))).rejects.toThrow();
    await expect(verifyIdToken(jwt(claims({ exp: now() - 10 })))).rejects.toThrow();
  });
});
