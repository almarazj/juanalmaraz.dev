import type { APIRoute } from 'astro';
import { json } from '../../../lib/http/json';
import { renderMarkdown } from '../../../lib/markdown/render';

// Server-side so the preview is exactly the sanitized HTML the public page will render.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { md?: unknown } | null;
  if (typeof body?.md !== 'string') return json({ error: 'md required' }, 'private', 400);
  return json({ html: (await renderMarkdown(body.md)).html }, 'private');
};
