import type { APIRoute } from 'astro';
import { buildSearchIndex } from '../lib/content/search-index';
import { cacheHeaders } from '../lib/http/cache';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildSearchIndex()), {
    headers: { 'Content-Type': 'application/json', ...cacheHeaders('page') },
  });
