import sharp from 'sharp';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { config, s3 } from '../../src/lib/aws';
import { processImage } from '../../src/lib/images/process';
import { imageProps, imageUrl } from '../../src/lib/images/url';

// Variants are written to the shared local bucket, so every test gets its own prefix.
const run = Date.now().toString(36);
let n = 0;
const uniq = (base: string) => `r4-${run}-${n++}/${base}`;
const Bucket = () => config().bucket;
const head = (key: string) => s3().send(new HeadObjectCommand({ Bucket: Bucket(), Key: key }));
const read = async (key: string) =>
  Buffer.from(await (await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: key }))).Body!.transformToByteArray());
const exists = (key: string) => head(key).then(() => true, () => false);

const jpeg = (width: number) =>
  sharp({ create: { width, height: Math.round(width / 2), channels: 3, background: '#468' } }).jpeg().toBuffer();

describe('processImage', () => {
  it('writes 480, 960 and 1600 WebP variants for a 2000px source', async () => {
    const base = uniq('a');
    const ref = await processImage(await jpeg(2000), base, 'alt');
    expect(ref).toEqual({ base, widths: [480, 960, 1600], alt: 'alt' });
    for (const w of ref.widths) {
      const key = `images/${base}-${w}.webp`;
      expect(await head(key)).toMatchObject({ ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' });
      expect(await sharp(await read(key)).metadata()).toMatchObject({ format: 'webp', width: w });
    }
    expect(await exists(`images/${base}-2000.webp`)).toBe(false);
  });

  it('does not upscale a 600px source', async () => {
    const base = uniq('b');
    const ref = await processImage(await jpeg(600), base, 'alt');
    expect(ref.widths).toEqual([480, 600]);
    expect((await sharp(await read(`images/${base}-600.webp`)).metadata()).width).toBe(600);
  });

  it.each([[480, [480]], [960, [480, 960]], [1600, [480, 960, 1600]], [300, [300]]])(
    'lists exactly the real variants for a %ipx source',
    async (width, expected) => {
      expect((await processImage(await jpeg(width), uniq('f'), 'alt')).widths).toEqual(expected);
    },
  );

  it('measures width after EXIF rotation', async () => {
    // Stored 1000x400 with orientation 6 displays as 400x1000, so only 400 fits.
    const rotated = await sharp({ create: { width: 1000, height: 400, channels: 3, background: '#468' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const base = uniq('g');
    const ref = await processImage(rotated, base, 'alt');
    expect(ref.widths).toEqual([400]);
    expect((await sharp(await read(`images/${base}-400.webp`)).metadata()).width).toBe(400);
  });

  it('keeps a source narrower than the smallest width as its only variant', async () => {
    expect((await processImage(await jpeg(300), uniq('c'), 'alt')).widths).toEqual([300]);
  });

  it('rejects text and oversized input', async () => {
    await expect(processImage(Buffer.from('hello'), 'd', 'alt')).rejects.toThrow('Unsupported image');
    await expect(processImage(Buffer.alloc(15 * 1024 * 1024 + 1), 'd', 'alt')).rejects.toThrow('Unsupported image');
  });

  it.each(['Bad', '/x', 'a b', 'a//b', 'a/', '../x'])('rejects base %j', async (base) => {
    await expect(processImage(await jpeg(600), base, 'alt')).rejects.toThrow('Invalid image base');
  });

  it('skips objects that already exist', async () => {
    const base = uniq('e');
    await processImage(await jpeg(600), base, 'alt');
    const before = (await head(`images/${base}-480.webp`)).ETag;
    await processImage(await jpeg(600), base, 'alt', { skipExisting: true });
    expect((await head(`images/${base}-480.webp`)).ETag).toBe(before);
  });
});

describe('imageProps', () => {
  it('does not throw on an empty width list', () => {
    expect(imageProps({ base: 'a', widths: [], alt: '' }, '1px')).toEqual({ src: '', srcset: '', sizes: '1px' });
  });
});

describe('imageUrl', () => {
  const ref = { base: 'projects/a', widths: [480, 960], alt: '' };
  const prod = { TABLE_NAME: 't', MEDIA_BUCKET: 'bkt' };
  const local = { AWS_ENDPOINT_URL_DYNAMODB: 'http://d', AWS_ENDPOINT_URL_S3: 'http://localhost:9000' };
  it('is same-origin outside local', () => {
    expect(imageUrl(ref, 480, prod)).toBe('/images/projects/a-480.webp');
  });
  it('points at the local S3 bucket when local', () => {
    expect(imageUrl(ref, 480, local)).toBe('http://localhost:9000/juanalmaraz-media-local/images/projects/a-480.webp');
  });
  it('builds a srcset with the widest variant as src', () => {
    const p = imageProps(ref, '100px');
    expect(p.src).toContain('a-960.webp');
    expect(p.srcset).toMatch(/a-480\.webp 480w, .*a-960\.webp 960w$/);
  });
});
