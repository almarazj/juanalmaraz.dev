import type { APIRoute } from 'astro';
import { getRaw, saveWithRevision } from '../../../lib/content/repo';
import { bucket } from '../../../lib/firebase';
import { json } from '../../../lib/http/json';
import { processImage } from '../../../lib/images/process';
import { imageUrl } from '../../../lib/images/url';

const DEFAULT_RESUME = 'resume/juan-almaraz.pdf';
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// "My Photo (2).JPG" -> "my-photo-2"; the timestamp keeps re-uploads from overwriting cached variants.
const baseFor = (name: string) => {
  const stem = name.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `uploads/${stem || 'image'}-${Date.now().toString(36)}`;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return json({ error: 'file required' }, 'private', 400);
  const bytes = Buffer.from(await file.arrayBuffer());

  if (form!.get('kind') === 'resume') {
    if (file.size > MAX_PDF_BYTES || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return json({ error: 'Not a PDF (max 10 MB)' }, 'private', 400);
    }
    const site = await getRaw('site', 'main');
    if (!site) return json({ error: 'Create the site page first' }, 'private', 409);
    const path = typeof site.resumePath === 'string' && site.resumePath ? site.resumePath : DEFAULT_RESUME;
    await bucket().file(path).save(bytes, { contentType: 'application/pdf' });
    if (site.resumePath !== path) await saveWithRevision('site', 'main', { ...site, resumePath: path }, locals.adminEmail!);
    return new Response(null, { status: 204 });
  }

  const alt = String(form!.get('alt') ?? '').trim();
  if (!alt) return json({ error: 'Alt text required' }, 'private', 400);
  try {
    const ref = await processImage(bytes, baseFor(file.name), alt);
    return json({ ref, preview: imageUrl(ref, ref.widths.find((w) => w >= 960) ?? ref.widths.at(-1)!) }, 'private');
  } catch (err) {
    if ((err as Error).message === 'Unsupported image') return json({ error: 'Unsupported image' }, 'private', 400);
    throw err;
  }
};
