import { auth } from '../firebase';

export const SESSION_COOKIE = '__session';
export const SESSION_DAYS = 5;

export type VerifySession = (cookie: string) => Promise<{ email?: string; email_verified?: boolean }>;

interface Options {
  verify?: VerifySession;
  adminEmail?: string;
}

const liveVerify: VerifySession = (cookie) => auth().verifySessionCookie(cookie, true);

// An unset ADMIN_EMAIL matches nobody, so a misconfigured deploy fails closed.
export const isAdmin = (claims: { email?: string; email_verified?: boolean }, adminEmail = process.env.ADMIN_EMAIL) =>
  Boolean(adminEmail && claims.email_verified && claims.email?.toLowerCase() === adminEmail.toLowerCase());

export function sessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie') ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const forbidden = () =>
  new Response('forbidden', { status: 403, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });

export async function requireAdmin(
  request: Request,
  { verify = liveVerify, adminEmail = process.env.ADMIN_EMAIL }: Options = {},
): Promise<{ email: string }> {
  const cookie = sessionCookie(request);
  if (!cookie) throw forbidden();
  let claims;
  try {
    claims = await verify(cookie);
  } catch {
    throw forbidden();
  }
  if (!isAdmin(claims, adminEmail)) throw forbidden();
  return { email: claims.email! };
}
