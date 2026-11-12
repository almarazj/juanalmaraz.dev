import type { APIRoute } from 'astro';
import { forbidden, isAdmin, SESSION_COOKIE, SESSION_DAYS, sessionCookie } from '../../../lib/auth/admin';
import { auth } from '../../../lib/firebase';
import { json } from '../../../lib/http/json';

const MAX_AGE = SESSION_DAYS * 86_400;
// Firebase's guidance: only mint a session from a fresh sign-in, so a leaked old ID token cannot.
const MAX_SIGN_IN_AGE_S = 5 * 60;

const cookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/admin; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { idToken?: unknown } | null;
  if (typeof body?.idToken !== 'string') return json({ error: 'idToken required' }, 'private', 400);
  let claims;
  try {
    claims = await auth().verifyIdToken(body.idToken, true);
  } catch {
    return forbidden();
  }
  if (!isAdmin(claims) || Date.now() / 1000 - claims.auth_time > MAX_SIGN_IN_AGE_S) return forbidden();
  const session = await auth().createSessionCookie(body.idToken, { expiresIn: MAX_AGE * 1000 });
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie(session, MAX_AGE) } });
};

// Signing out revokes every session of the account, not just this browser's cookie.
export const DELETE: APIRoute = async ({ request }) => {
  const current = sessionCookie(request);
  if (current) {
    const claims = await auth().verifySessionCookie(current).catch(() => null);
    if (claims) await auth().revokeRefreshTokens(claims.sub);
  }
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('', 0) } });
};
