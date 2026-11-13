import type { APIRoute } from 'astro';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookieValue, forbidden, isAdmin, issueSession } from '../../../lib/auth/admin';
import { exchangeCode, OAUTH_COOKIE, verifyIdToken } from '../../../lib/auth/cognito';

// Hashing first gives equal lengths, so the comparison leaks neither content nor length.
const sameString = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

const reject = () => {
  const res = forbidden();
  res.headers.append('Set-Cookie', OAUTH_COOKIE('', 0));
  return res;
};

export const GET: APIRoute = async ({ request, url }) => {
  const [expected, verifier] = cookieValue(request, '__oauth')?.split('.') ?? [];
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!expected || !verifier || !state || !code || !sameString(state, expected)) return reject();

  try {
    const claims = await verifyIdToken(await exchangeCode(code, verifier));
    if (!isAdmin(claims)) return reject();
    const headers = new Headers({ Location: '/admin' });
    headers.append('Set-Cookie', await issueSession(claims.email!, Date.now()));
    headers.append('Set-Cookie', OAUTH_COOKIE('', 0));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.warn(`admin sign-in rejected: ${(err as Error).message}`);
    return reject();
  }
};
