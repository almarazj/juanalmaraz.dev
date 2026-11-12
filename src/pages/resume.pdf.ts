import type { APIRoute } from 'astro';
import { GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { config, s3 } from '../lib/aws';
import { getSingleton } from '../lib/content/repo';
import { cacheHeaders } from '../lib/http/cache';

export const GET: APIRoute = async ({ rewrite }) => {
  try {
    // A missing or invalid site doc means there is no resume to serve.
    const { resumePath } = await getSingleton('site/main').catch(() => ({ resumePath: '' }));
    if (!resumePath) return rewrite('/404');
    const object = await s3().send(new GetObjectCommand({ Bucket: config().bucket, Key: resumePath })).catch((err) => {
      if (err instanceof NoSuchKey) return null;
      throw err;
    });
    if (!object?.Body) return rewrite('/404');
    return new Response(new Uint8Array(await object.Body.transformToByteArray()), {
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
