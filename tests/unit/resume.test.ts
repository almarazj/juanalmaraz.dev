import { describe, expect, it, vi } from 'vitest';

const state = { site: (): Promise<unknown> => Promise.resolve({ resumePath: 'resume/x.pdf' }), exists: false };
vi.mock('../../src/lib/content/repo', () => ({ getSingleton: () => state.site() }));
vi.mock('../../src/lib/firebase', () => ({
  bucket: () => ({ file: () => ({ exists: async () => [state.exists], download: async () => [Buffer.from('%PDF')] }) }),
}));

const { GET } = await import('../../src/pages/resume.pdf');
const run = () => {
  const rewrite = vi.fn(async () => new Response('404 page', { status: 404 }));
  return { rewrite, res: GET({ rewrite } as never) as Promise<Response> };
};

describe('GET /resume.pdf', () => {
  it('rewrites to the 404 page when the object is missing', async () => {
    state.exists = false;
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
