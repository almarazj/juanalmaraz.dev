// Idempotent: processes the old site's portfolio images into whichever environment the env vars select.
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { processImage } from '../src/lib/images/process';

const root = process.argv[2] ?? join(import.meta.dirname, '../../almarazj.github.io/assets/img/portfolio');

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(png|jpe?g)$/i.test(e.name)) yield p;
  }
}

for await (const path of walk(root)) {
  const rel = relative(root, path);
  const base = `portfolio/${join(rel, '..', basename(rel, extname(rel))).toLowerCase().replace(/[^a-z0-9/]+/g, '-')}`;
  const ref = await processImage(await readFile(path), base, basename(rel, extname(rel)), { skipExisting: true });
  console.log(`${rel} -> images/${ref.base}-{${ref.widths.join(',')}}.webp`);
}
