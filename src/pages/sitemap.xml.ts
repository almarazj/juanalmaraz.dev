import type { APIRoute } from 'astro';
import { listPublished } from '../lib/content/repo';
import { cacheHeaders } from '../lib/http/cache';
import { SITE } from '../lib/site';

export const GET: APIRoute = async () => {
  const posts = await listPublished('posts');
  const urls: { path: string; lastmod?: string }[] = [
    { path: '/' },
    { path: '/writing' },
    ...posts.map((p) => ({ path: `/writing/${p.id}`, lastmod: new Date(p.updatedAt).toISOString() })),
  ];
  const body = urls
    .map((u) => `<url><loc>${SITE}${u.path}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`,
    { headers: { 'Content-Type': 'application/xml', ...cacheHeaders('page') } },
  );
};
