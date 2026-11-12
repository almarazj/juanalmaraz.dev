import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { config, ddb, secret } from '../aws';
import { verifySession } from './session';

export const SESSION_COOKIE = '__session';
export const SESSION_DAYS = 5;

export type VerifySession = (cookie: string) => Promise<{ email?: string; email_verified?: boolean }>;

interface Options {
  verify?: VerifySession;
  adminEmail?: string;
}

const AUTH_KEY = { pk: 'auth', sk: 'main' };

// Signing out sets this, which revokes every session issued before it.
export async function revokeSessions(now: number): Promise<void> {
  await ddb().send(new PutCommand({ TableName: config().table, Item: { ...AUTH_KEY, sessionsValidAfter: now } }));
}

const liveVerify: VerifySession = async (cookie) => {
  const session = verifySession(cookie, Date.now(), await secret('session-key'));
  if (!session) throw new Error('invalid session');
  const { Item } = await ddb().send(new GetCommand({ TableName: config().table, Key: AUTH_KEY, ConsistentRead: true }));
  if (typeof Item?.sessionsValidAfter === 'number' && session.iat < Item.sessionsValidAfter) throw new Error('revoked session');
  return { email: session.email, email_verified: true };
};

// An unset ADMIN_EMAIL matches nobody, so a misconfigured deploy fails closed.
export const isAdmin = (claims: { email?: string; email_verified?: boolean }, adminEmail = process.env.ADMIN_EMAIL) =>
  Boolean(adminEmail && claims.email_verified && claims.email?.toLowerCase() === adminEmail.toLowerCase());

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export const sessionCookie = (request: Request) => cookieValue(request, SESSION_COOKIE);

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
