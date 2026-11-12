import sharp from 'sharp';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it } from 'vitest';
import { config, s3 } from '../../src/lib/aws';
import { getRaw, saveWithRevision } from '../../src/lib/content/repo';
import { resetTable } from '../../scripts/local-aws';
import { POST } from '../../src/pages/admin/api/upload';

const KEY = /^incoming\/[0-9a-f-]{36}$/;
const Bucket = () => config().bucket;
const call = (body: unknown) =>
  POST({
    request: new Request('http://x/admin/api/upload', { method: 'POST', body: JSON.stringify(body) }),
    locals: { adminEmail: 'owner@example.com' },
  } as never) as Promise<Response>;

// Mimics the browser: presign, then POST the file straight to the returned URL.
async function upload(kind: 'image' | 'resume', bytes: Buffer): Promise<string> {
  const { url, fields, key } = await (await call({ step: 'presign', kind })).json();
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v as string);
  form.set('file', new Blob([new Uint8Array(bytes)]));
  expect((await fetch(url, { method: 'POST', body: form })).status).toBeLessThan(300);
  return key;
}
const incoming = async () =>
  (await s3().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix: 'incoming/' }))).KeyCount ?? 0;
const exists = (Key: string) => s3().send(new HeadObjectCommand({ Bucket: Bucket(), Key })).then(() => true, () => false);

beforeEach(async () => {
  await resetTable();
  await saveWithRevision('site', 'main', { resumePath: '' }, 'test');
});

describe('POST /admin/api/upload', () => {
  it('presigns a POST to a random incoming key', async () => {
    const res = await call({ step: 'presign', kind: 'image' });
    expect(res.status).toBe(200);
    const { url, fields, key } = await res.json();
    expect(key).toMatch(KEY);
    expect(url).toContain(Bucket());
    expect(fields.Policy).toBeTruthy();
    expect(fields.key).toBe(key);
  });

  it.each(['images/x', 'incoming/../site', 'incoming/abc', 'uploads/00000000-0000-0000-0000-000000000000'])(
    'rejects process key %j without touching S3',
    async (key) => {
      const res = await call({ step: 'process', kind: 'image', key, name: 'a.png', alt: 'a' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid upload key' });
    },
  );

  it('processes an uploaded PNG and deletes the original', async () => {
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#c2410c' } }).png().toBuffer();
    const before = await incoming();
    const key = await upload('image', png);
    const res = await call({ step: 'process', kind: 'image', key, name: 'R4 Banner.png', alt: 'Banner' });
    expect(res.status).toBe(200);
    const { ref, preview } = await res.json();
    expect(ref).toMatchObject({ widths: [480, 960, 1600], alt: 'Banner' });
    expect(ref.base).toMatch(/^uploads\/r4-banner-[a-z0-9]+$/);
    expect(preview).toContain(`images/${ref.base}-960.webp`);
    expect(await exists(`images/${ref.base}-960.webp`)).toBe(true);
    expect(await exists(key)).toBe(false);
    expect(await incoming()).toBe(before);
  });

  it('requires alt text and rejects non-images', async () => {
    const key = await upload('image', Buffer.from('hello'));
    expect((await call({ step: 'process', kind: 'image', key, name: 'a.png', alt: '' })).status).toBe(400);
    const res = await call({ step: 'process', kind: 'image', key, name: 'a.png', alt: 'a' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unsupported image' });
  });

  it('stores a resume at the default path and records it on the site doc', async () => {
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
    const key = await upload('resume', pdf);
    expect((await call({ step: 'process', kind: 'resume', key })).status).toBe(204);
    const out = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: 'files/resume/juan-almaraz.pdf' }));
    expect(Buffer.from(await out.Body!.transformToByteArray())).toEqual(pdf);
    expect((await getRaw('site', 'main'))!.resumePath).toBe('files/resume/juan-almaraz.pdf');
    expect(await exists(key)).toBe(false);
  });

  it.each([['without a PDF signature', Buffer.from('<html>')], ['over 5 MB', Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)])]])(
    'rejects a resume %s',
    async (_, bytes) => {
      // Written directly: the presigned policy would already refuse the oversized one.
      const key = `incoming/${crypto.randomUUID()}`;
      await s3().send(new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: bytes }));
      const res = await call({ step: 'process', kind: 'resume', key });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Not a PDF (max 5 MB)' });
      expect(await exists(key)).toBe(false);
    },
  );
});
