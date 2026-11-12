import { defineMiddleware } from 'astro:middleware';
import { requireAdmin } from './lib/auth/admin';

// The only /admin routes reachable without an admin session: the sign-in page and the endpoint it calls.
const PUBLIC = new Set(['/admin/login', '/admin/api/session']);

export const onRequest = defineMiddleware(async (context, next) => {
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
});
