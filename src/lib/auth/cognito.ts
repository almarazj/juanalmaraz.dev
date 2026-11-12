import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { secret } from '../aws';

type Env = Record<string, string | undefined>;

function need(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

// Holds the sign-in's state and PKCE verifier, only on the way back from Cognito.
export const OAUTH_COOKIE = (value: string, maxAge: number) =>
  `__oauth=${value}; HttpOnly; Secure; SameSite=Lax; Path=/admin/api/callback; Max-Age=${maxAge}`;

const redirectUri = (env: Env) => `${need(env, 'SITE_URL')}/admin/api/callback`;

export function authorizeUrl(state: string, codeChallenge: string, env: Env = process.env): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: need(env, 'COGNITO_CLIENT_ID'),
    redirect_uri: redirectUri(env),
    scope: 'openid email',
    identity_provider: 'Google',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${need(env, 'COGNITO_DOMAIN')}/oauth2/authorize?${query}`;
}

export function logoutUrl(env: Env = process.env): string {
  const query = new URLSearchParams({ client_id: need(env, 'COGNITO_CLIENT_ID'), logout_uri: `${need(env, 'SITE_URL')}/admin/login` });
  return `${need(env, 'COGNITO_DOMAIN')}/logout?${query}`;
}

export async function exchangeCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const env = process.env;
  const clientId = need(env, 'COGNITO_CLIENT_ID');
  const basic = Buffer.from(`${clientId}:${await secret('cognito-client-secret')}`).toString('base64');
  const res = await fetchImpl(`${need(env, 'COGNITO_DOMAIN')}/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri(env),
      code_verifier: verifier,
    }).toString(),
  });
  // Only the status: the body of a failed exchange is not worth risking in logs.
  if (res.status !== 200) throw new Error(`token endpoint ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: unknown };
  if (typeof id_token !== 'string') throw new Error('token endpoint returned no id_token');
  return id_token;
}

let verifier: ReturnType<typeof createVerifier> | undefined;
const createVerifier = () =>
  CognitoJwtVerifier.create({
    userPoolId: need(process.env, 'COGNITO_USER_POOL_ID'),
    clientId: need(process.env, 'COGNITO_CLIENT_ID'),
    tokenUse: 'id',
  });
// Kept per process so the pool's JWKS is fetched once.
export const idVerifier = () => (verifier ??= createVerifier());

export async function verifyIdToken(idToken: string): Promise<{ email?: string; email_verified?: boolean }> {
  const { email, email_verified }: Record<string, unknown> = await idVerifier().verify(idToken);
  // Federated attributes can arrive as strings, and "false" must not read as verified.
  return { email: typeof email === 'string' ? email : undefined, email_verified: email_verified === true || email_verified === 'true' };
}
