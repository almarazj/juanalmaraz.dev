import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../src/lib/admin/fetch';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response('ok'));
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockClear());
const sent = () => new Headers(fetchMock.mock.calls[0][1]?.headers);

describe('adminFetch', () => {
  it('sends the body hash CloudFront OAC needs', async () => {
    await adminFetch('/admin/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'abc' });
    expect(sent().get('x-amz-content-sha256')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sent().get('content-type')).toBe('application/json');
    expect(fetchMock.mock.calls[0][1]?.body).toBe('abc');
  });

  it('adds no hash header without a body', async () => {
    await adminFetch('/admin');
    expect(sent().has('x-amz-content-sha256')).toBe(false);
  });
});
