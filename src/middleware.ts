import { defineMiddleware } from 'astro:middleware';
import type { APIContext, MiddlewareNext } from 'astro';
import { requireAdmin } from './lib/auth/admin';
import { recordRequest, takeColdFlag } from './lib/feed/capture';

// The only /admin routes reachable without an admin session: the sign-in page and the OAuth round trip.
const PUBLIC = new Set(['/admin/login', '/admin/api/signin', '/admin/api/callback']);

const guard = async (context: APIContext, next: MiddlewareNext): Promise<Response> => {
  const path = context.url.pathname.toLowerCase().replace(/\/+$/, '');
  if (path !== '/admin' && !path.startsWith('/admin/')) return next();

  let response: Response;
  if (PUBLIC.has(path)) {
    response = await next();
  } else {
    try {
      context.locals.adminEmail = (await requireAdmin(context.request)).email;
      response = await next();
    } catch (err) {
      if (!(err instanceof Response)) throw err;
      response = err;
      // Pages answer 403 with the sign-in form, so the owner can sign in where they landed.
      if (context.request.method === 'GET' && !path.startsWith('/admin/api/')) {
        const page = await context.rewrite('/admin/login');
        response = new Response(page.body, { status: 403, headers: page.headers });
      }
    }
  }
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex');
  return response;
};

// /internal/* is infrastructure (probes): it must neither consume the cold flag nor reach the feed.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (pathname === '/internal' || pathname.startsWith('/internal/')) return guard(context, next);
  const cold = takeColdFlag();
  const start = performance.now();
  const facts = () => ({ method: context.request.method, path: pathname, ms: performance.now() - start, cold, t: Date.now() });
  let response: Response;
  try {
    response = await guard(context, next);
  } catch (err) {
    await recordRequest({ ...facts(), status: 500 });
    throw err;
  }
  await recordRequest({ ...facts(), status: response.status });
  return response;
});
