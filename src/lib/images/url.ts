import { resolveFirebaseConfig } from '../firebase';
import type { ImageRef } from '../content/schemas';

export const objectPath = (base: string, width: number) => `images/${base}-${width}.webp`;

export function imageUrl(ref: ImageRef, width: number, env: Record<string, string | undefined> = process.env): string {
  const { storageBucket, emulated } = resolveFirebaseConfig(env);
  const path = objectPath(ref.base, width);
  if (emulated) {
    const host = env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
    return `http://${host}/v0/b/${storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
  }
  return `https://storage.googleapis.com/${storageBucket}/${path}`;
}

/** Attributes for an <img>: the widest variant as fallback src plus a srcset of all of them. */
export function imageProps(ref: ImageRef, sizes: string) {
  const widths = [...ref.widths].sort((a, b) => a - b);
  // The schema rejects empty widths; this only keeps bad data from throwing.
  if (!widths.length) return { src: '', srcset: '', sizes };
  return {
    src: imageUrl(ref, widths.at(-1)!),
    srcset: widths.map((w) => `${imageUrl(ref, w)} ${w}w`).join(', '),
    sizes,
  };
}
