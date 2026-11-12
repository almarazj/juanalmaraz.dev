import type { APIRoute } from 'astro';
import { isEditable } from '../../../lib/content/editable';
import { restoreRevision } from '../../../lib/content/repo';
import { json } from '../../../lib/http/json';

export const POST: APIRoute = async ({ request, locals }) => {
  const body = (await request.json().catch(() => null)) as { collection?: unknown; id?: unknown; revisionId?: unknown } | null;
  const { collection, id, revisionId } = body ?? {};
  if (typeof collection !== 'string' || !isEditable(collection) || typeof id !== 'string' || typeof revisionId !== 'string') {
    return json({ error: 'collection, id and revisionId required' }, 'private', 400);
  }
  try {
    await restoreRevision(collection, id, revisionId, locals.adminEmail!);
  } catch (err) {
    if ((err as Error).message.startsWith('Missing revision')) return json({ error: 'revision not found' }, 'private', 404);
    throw err;
  }
  return new Response(null, { status: 204 });
};
