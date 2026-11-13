import type { APIRoute } from 'astro';
import { revokeSessions, sessionSetCookie } from '../../../lib/auth/admin';
import { logoutUrl } from '../../../lib/auth/cognito';

// Signing out revokes every session, not just this browser's cookie.
export const POST: APIRoute = async () => {
  await revokeSessions(Date.now());
  return Response.json(
    { logoutUrl: logoutUrl() },
    { headers: { 'Set-Cookie': sessionSetCookie('', 0) } },
  );
};
