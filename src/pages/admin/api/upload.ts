import type { APIRoute } from 'astro';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { config, s3 } from '../../../lib/aws';
import { getRaw, saveWithRevision } from '../../../lib/content/repo';
import { json } from '../../../lib/http/json';
import { processImage } from '../../../lib/images/process';
import { imageUrl } from '../../../lib/images/url';

const DEFAULT_RESUME = 'files/resume/juan-almaraz.pdf';
const MB = 1024 * 1024;
const MAX_BYTES = { image: 15 * MB, resume: 5 * MB };
const KEY = /^incoming\/[0-9a-f-]{36}$/;

// "My Photo (2).JPG" -> "my-photo-2"; the timestamp keeps re-uploads from overwriting cached variants.
const baseFor = (name: string) => {
  const stem = name.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `uploads/${stem || 'image'}-${Date.now().toString(36)}`;
};

const bad = (error: string, status = 400) => json({ error }, 'private', status);

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  const kind: 'image' | 'resume' | undefined = body?.kind === 'image' || body?.kind === 'resume' ? body.kind : undefined;
  if (!kind) return bad('kind required');
  const Bucket = config().bucket;

  if (body.step === 'presign') {
    const key = `incoming/${crypto.randomUUID()}`;
    const post = await createPresignedPost(s3(), {
      Bucket,
      Key: key,
      Conditions: [['content-length-range', 1, MAX_BYTES[kind]]],
      Expires: 300,
    });
    return json({ ...post, key }, 'private');
  }
  if (body.step !== 'process') return bad('step required');

  const key = body.key;
  if (typeof key !== 'string' || !KEY.test(key)) return bad('Invalid upload key');
  const alt = String(body.alt ?? '').trim();

  try {
    if (kind === 'image' && !alt) return bad('Alt text required');
    const site = kind === 'resume' ? await getRaw('site', 'main') : null;
    if (kind === 'resume' && !site) return bad('Create the site page first', 409);
    const object = await s3().send(new GetObjectCommand({ Bucket, Key: key })).catch(() => null);
    if (!object?.Body) return bad('Upload not found', 404);
    const bytes = Buffer.from(await object.Body.transformToByteArray());

    if (kind === 'resume') {
      if (bytes.length > MAX_BYTES.resume || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return bad('Not a PDF (max 5 MB)');
      const path = typeof site!.resumePath === 'string' && site!.resumePath ? site!.resumePath : DEFAULT_RESUME;
      await s3().send(new PutObjectCommand({ Bucket, Key: path, Body: bytes, ContentType: 'application/pdf' }));
      if (site!.resumePath !== path) await saveWithRevision('site', 'main', { ...site!, resumePath: path }, locals.adminEmail!);
      return new Response(null, { status: 204 });
    }

    const ref = await processImage(bytes, baseFor(String(body.name ?? '')), alt);
    return json({ ref, preview: imageUrl(ref, ref.widths.find((w) => w >= 960) ?? ref.widths.at(-1)!) }, 'private');
  } catch (err) {
    if ((err as Error).message === 'Unsupported image') return bad('Unsupported image');
    throw err;
  } finally {
    await s3().send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => undefined);
  }
};
