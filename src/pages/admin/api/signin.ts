import type { APIRoute } from 'astro';
import { createHash, randomBytes } from 'node:crypto';
import { authorizeUrl, OAUTH_COOKIE } from '../../../lib/auth/cognito';

export const GET: APIRoute = () => {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return new Response(null, {
    status: 302,
    headers: { Location: authorizeUrl(state, challenge), 'Set-Cookie': OAUTH_COOKIE(`${state}.${verifier}`, 600) },
  });
};
