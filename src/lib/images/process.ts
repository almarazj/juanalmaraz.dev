import sharp from 'sharp';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config, s3 } from '../aws';
import type { ImageRef } from '../content/schemas';
import { objectPath } from './url';

export const WIDTHS = [480, 960, 1600] as const;
const MAX_BYTES = 15 * 1024 * 1024;
const BASE = /^[a-z0-9][a-z0-9/-]{0,120}$/;

export async function processImage(
  input: Buffer,
  base: string,
  alt: string,
  opts: { skipExisting?: boolean } = {},
): Promise<ImageRef> {
  if (!BASE.test(base) || base.includes('//') || base.endsWith('/')) throw new Error(`Invalid image base: ${base}`);
  if (input.length > MAX_BYTES) throw new Error('Unsupported image');
  let source: number | undefined;
  try {
    const { width, height, orientation = 1 } = await sharp(input).metadata();
    // Metadata is pre-EXIF-rotation; orientations 5-8 swap the axes.
    source = orientation >= 5 ? height : width;
  } catch {
    throw new Error('Unsupported image');
  }
  if (!source) throw new Error('Unsupported image');

  // Never upscale; a source narrower than the largest variant is kept as its own variant.
  const widths: number[] = WIDTHS.filter((w) => w <= source);
  if (source < WIDTHS[WIDTHS.length - 1] && !widths.includes(source)) widths.push(source);

  await Promise.all(
    widths.map(async (w) => {
      const Key = objectPath(base, w);
      const Bucket = config().bucket;
      if (opts.skipExisting && (await s3().send(new HeadObjectCommand({ Bucket, Key })).then(() => true, () => false))) return;
      const Body = await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      await s3().send(new PutObjectCommand({
        Bucket, Key, Body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable',
      }));
    }),
  );
  return { base, widths, alt };
}
