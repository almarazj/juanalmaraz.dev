import type { APIRoute } from 'astro';

// Lambda Web Adapter readiness probe: must not touch any dependency.
export const GET: APIRoute = () => new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
