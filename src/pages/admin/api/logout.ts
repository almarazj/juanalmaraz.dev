import type { APIRoute } from 'astro';
import { revokeSessions, SESSION_COOKIE } from '../../../lib/auth/admin';
import { logoutUrl } from '../../../lib/auth/cognito';

// Signing out revokes every session, not just this browser's cookie.
export const POST: APIRoute = async () => {
  await revokeSessions(Date.now());
  return Response.json(
    { logoutUrl: logoutUrl() },
    { headers: { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } },
  );
};
