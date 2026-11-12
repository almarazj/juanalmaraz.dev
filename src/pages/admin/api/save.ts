import type { APIRoute } from 'astro';
import { ID, isEditable, SINGLETONS, validate } from '../../../lib/content/editable';
import { getRaw, saveWithRevision } from '../../../lib/content/repo';
import { json } from '../../../lib/http/json';

const ALREADY_EXISTS = 6;

export const POST: APIRoute = async ({ request, locals }) => {
  const body = (await request.json().catch(() => null)) as
    | { collection?: unknown; id?: unknown; data?: unknown; create?: unknown }
    | null;
  const { collection, id, data, create } = body ?? {};
  if (typeof collection !== 'string' || !isEditable(collection)) return json({ error: 'unknown collection' }, 'private', 400);
  const singleton = SINGLETONS.includes(collection);
  if (typeof id !== 'string' || (singleton ? id !== 'main' : !ID.test(id) || id === 'new')) {
    return json({ errors: { id: 'Use lowercase letters, digits and dashes' } }, 'private', 422);
  }
  const result = validate(collection, data);
  if (!result.ok) return json({ errors: result.errors }, 'private', 422);

  const doc = { ...result.data };
  const existing = await getRaw(collection, id);
  if (collection === 'posts') {
    const now = Date.now();
    doc.updatedAt = now;
    // The first publish stamps the date; later edits and unpublishing keep it.
    doc.publishedAt = (existing?.publishedAt as number | undefined) || (doc.status === 'published' ? now : 0);
  }
  if (collection === 'site') doc.resumePath = existing?.resumePath ?? '';

  try {
    await saveWithRevision(collection, id, doc, locals.adminEmail!, { create: create === true });
  } catch (err) {
    if ((err as { code?: number }).code === ALREADY_EXISTS) return json({ errors: { id: 'Already exists' } }, 'private', 409);
    throw err;
  }
  return json({ id }, 'private');
};
