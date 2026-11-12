import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved = new Map<string, { data: Buffer; options: unknown }>();
vi.mock('../../src/lib/firebase', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/firebase')>()),
  bucket: () => ({
    file: (path: string) => ({
      exists: async () => [saved.has(path)],
      save: async (data: Buffer, options: unknown) => void saved.set(path, { data, options }),
    }),
  }),
}));

const { processImage } = await import('../../src/lib/images/process');
const { imageProps, imageUrl } = await import('../../src/lib/images/url');

const jpeg = (width: number) =>
  sharp({ create: { width, height: Math.round(width / 2), channels: 3, background: '#468' } }).jpeg().toBuffer();

beforeEach(() => saved.clear());

describe('processImage', () => {
  it('writes 480, 960 and 1600 WebP variants for a 2000px source', async () => {
    const ref = await processImage(await jpeg(2000), 'projects/a', 'alt');
    expect(ref).toEqual({ base: 'projects/a', widths: [480, 960, 1600], alt: 'alt' });
    expect([...saved.keys()].sort()).toEqual(['images/projects/a-1600.webp', 'images/projects/a-480.webp', 'images/projects/a-960.webp']);
    const first = saved.get('images/projects/a-960.webp')!;
    expect((await sharp(first.data).metadata())).toMatchObject({ format: 'webp', width: 960 });
    expect(first.options).toMatchObject({
      contentType: 'image/webp',
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
  });

  it('does not upscale a 600px source', async () => {
    const ref = await processImage(await jpeg(600), 'b', 'alt');
    expect(ref.widths).toEqual([480, 600]);
    expect((await sharp(saved.get('images/b-600.webp')!.data).metadata()).width).toBe(600);
  });

  it.each([[480, [480]], [960, [480, 960]], [1600, [480, 960, 1600]], [300, [300]]])(
    'lists exactly the real variants for a %ipx source',
    async (width, expected) => {
      expect((await processImage(await jpeg(width), 'f', 'alt')).widths).toEqual(expected);
    },
  );

  it('measures width after EXIF rotation', async () => {
    // Stored 1000x400 with orientation 6 displays as 400x1000, so only 400 fits.
    const rotated = await sharp({ create: { width: 1000, height: 400, channels: 3, background: '#468' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const ref = await processImage(rotated, 'g', 'alt');
    expect(ref.widths).toEqual([400]);
    expect((await sharp(saved.get('images/g-400.webp')!.data).metadata()).width).toBe(400);
  });

  it('keeps a source narrower than the smallest width as its only variant', async () => {
    expect((await processImage(await jpeg(300), 'c', 'alt')).widths).toEqual([300]);
  });

  it('rejects text and oversized input', async () => {
    await expect(processImage(Buffer.from('hello'), 'd', 'alt')).rejects.toThrow('Unsupported image');
    await expect(processImage(Buffer.alloc(15 * 1024 * 1024 + 1), 'd', 'alt')).rejects.toThrow('Unsupported image');
  });

  it.each(['Bad', '/x', 'a b', 'a//b', 'a/', '../x'])('rejects base %j', async (base) => {
    await expect(processImage(await jpeg(600), base, 'alt')).rejects.toThrow('Invalid image base');
  });

  it('skips objects that already exist', async () => {
    await processImage(await jpeg(600), 'e', 'alt');
    const before = saved.get('images/e-480.webp')!;
    await processImage(await jpeg(600), 'e', 'alt', { skipExisting: true });
    expect(saved.get('images/e-480.webp')).toBe(before);
  });
});

describe('imageProps', () => {
  it('does not throw on an empty width list', () => {
    expect(imageProps({ base: 'a', widths: [], alt: '' }, '1px')).toEqual({ src: '', srcset: '', sizes: '1px' });
  });
});

describe('imageUrl', () => {
  const ref = { base: 'projects/a', widths: [480, 960], alt: '' };
  it('uses the public bucket URL in production', () => {
    const env = { GOOGLE_CLOUD_PROJECT: 'p', STORAGE_BUCKET: 'bkt' };
    expect(imageUrl(ref, 480, env)).toBe('https://storage.googleapis.com/bkt/images/projects/a-480.webp');
  });
  it('uses the emulator URL with an encoded object path', () => {
    expect(imageUrl(ref, 480, { FIRESTORE_EMULATOR_HOST: 'x' })).toBe(
      'http://127.0.0.1:9199/v0/b/demo-juanalmaraz.appspot.com/o/images%2Fprojects%2Fa-480.webp?alt=media',
    );
  });
  it('builds a srcset with the widest variant as src', () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'x';
    const p = imageProps(ref, '100px');
    expect(p.src).toContain('a-960.webp');
    expect(p.srcset).toMatch(/a-480\.webp\?alt=media 480w, .*a-960\.webp\?alt=media 960w$/);
  });
});
