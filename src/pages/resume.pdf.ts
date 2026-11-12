import type { APIRoute } from 'astro';
import { bucket } from '../lib/firebase';
import { getSingleton } from '../lib/content/repo';
import { cacheHeaders } from '../lib/http/cache';

export const GET: APIRoute = async ({ rewrite }) => {
  try {
    // A missing or invalid site doc means there is no resume to serve.
    const { resumePath } = await getSingleton('site/main').catch(() => ({ resumePath: '' }));
    if (!resumePath) return rewrite('/404');
    const file = bucket().file(resumePath);
    if (!(await file.exists())[0]) return rewrite('/404');
    const [pdf] = await file.download();
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="juan-almaraz-resume.pdf"',
        ...cacheHeaders('page'),
      },
    });
  } catch (err) {
    console.error(err);
    return new Response('internal error', { status: 500, headers: cacheHeaders('private') });
  }
};
