import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { listPublished } from '../lib/content/repo';
import { cacheHeaders } from '../lib/http/cache';
import { SITE } from '../lib/site';

export const GET: APIRoute = async () => {
  const posts = (await listPublished('posts')).sort((a, b) => b.publishedAt - a.publishedAt);
  const res = await rss({
    title: 'Juan Almaraz',
    description: 'Posts by Juan Almaraz.',
    site: SITE,
    items: posts.map((p) => ({
      title: p.title,
      description: p.summary,
      pubDate: new Date(p.publishedAt),
      link: `/writing/${p.id}`,
    })),
  });
  for (const [k, v] of Object.entries(cacheHeaders('page'))) res.headers.set(k, v);
  return res;
};
