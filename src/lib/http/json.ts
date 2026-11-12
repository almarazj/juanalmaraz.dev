import type { APIRoute } from 'astro';
import { cacheHeaders } from './cache';

export const json = (body: unknown, kind: Parameters<typeof cacheHeaders>[0], status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cacheHeaders(kind) },
  });

export const jsonRoute =
  (kind: 'api' | 'requests', load: () => Promise<unknown>): APIRoute =>
  async () => {
    try {
      return json(await load(), kind);
    } catch (err) {
      console.error(err);
      return json({ error: 'internal error' }, 'private', 500);
    }
  };
