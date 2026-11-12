import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { config, s3 } from '../../src/lib/aws';

const KEY = `files/resume/r4-${Date.now().toString(36)}.pdf`;
const Bucket = () => config().bucket;
const state = { site: (): Promise<unknown> => Promise.resolve({ resumePath: KEY }) };
vi.mock('../../src/lib/content/repo', () => ({ getSingleton: () => state.site() }));

const { GET } = await import('../../src/pages/resume.pdf');
const run = () => {
  const rewrite = vi.fn(async () => new Response('404 page', { status: 404 }));
  return { rewrite, res: GET({ rewrite } as never) as Promise<Response> };
};

describe('GET /resume.pdf', () => {
  it('streams the PDF inline from S3', async () => {
    await s3().send(new PutObjectCommand({ Bucket: Bucket(), Key: KEY, Body: Buffer.from('%PDF-1.4 x'), ContentType: 'application/pdf' }));
    const out = await run().res;
    expect(out.status).toBe(200);
    expect(out.headers.get('content-type')).toBe('application/pdf');
    expect(out.headers.get('content-disposition')).toBe('inline; filename="juan-almaraz-resume.pdf"');
    expect(await out.text()).toBe('%PDF-1.4 x');
  });

  it('rewrites to the 404 page when the object is missing', async () => {
    await s3().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: KEY }));
    const { rewrite, res } = run();
    expect((await res).status).toBe(404);
    expect(rewrite).toHaveBeenCalledWith('/404');
  });

  it('rewrites to the 404 page when the site doc is missing or invalid', async () => {
    state.site = () => Promise.reject(new Error('Missing singleton site/main'));
    const { rewrite, res } = run();
    expect((await res).status).toBe(404);
    expect(rewrite).toHaveBeenCalledWith('/404');
  });

  it('rewrites to the 404 page when resumePath is empty', async () => {
    state.site = () => Promise.resolve({ resumePath: '' });
    const { rewrite, res } = run();
    expect((await res).status).toBe(404);
    expect(rewrite).toHaveBeenCalled();
  });
});
