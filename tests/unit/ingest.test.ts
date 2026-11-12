import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));
const saveFeed = vi.fn(async () => {});
vi.mock('../../src/lib/content/repo', () => ({
  getFeed: async () => ({ entries: [], updatedAt: 0, stats: { rpm: 0, p50: 0, hitRatio: 0 } }),
  saveFeed,
}));

const { POST } = await import('../../src/pages/internal/ingest');

const SA = 'push@demo.iam.gserviceaccount.com';
const logEntry = {
  timestamp: '2026-11-12T10:00:00Z',
  httpRequest: { requestMethod: 'GET', requestUrl: 'https://juanalmaraz.dev/', status: 200, cacheHit: true, latency: '0.010s' },
};
const push = (body: unknown, token?: string) =>
  POST({
    request: new Request('http://localhost/internal/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  } as APIContext);
const message = (data: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(data)).toString('base64'), messageId: '1', publishTime: '' },
  subscription: 's',
});

beforeEach(() => {
  vi.stubEnv('PUSH_AUDIENCE', 'https://run.example/internal/ingest');
  vi.stubEnv('PUSH_SA', SA);
  vi.stubEnv('INGEST_AUTH', '');
  verifyIdToken.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const validToken = () =>
  verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: SA, email_verified: true }) });

describe('POST /internal/ingest', () => {
  it('rejects a request without a token', async () => {
    expect((await push(message(logEntry))).status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a token that fails verification', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad signature'));
    expect((await push(message(logEntry), 't')).status).toBe(401);
  });

  it('rejects a valid token from another account', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'other@x.com', email_verified: true }) });
    expect((await push(message(logEntry), 't')).status).toBe(401);
  });

  it('rejects an unverified email', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: SA, email_verified: false }) });
    expect((await push(message(logEntry), 't')).status).toBe(401);
  });

  it('checks the configured audience', async () => {
    validToken();
    expect((await push(message(logEntry), 't')).status).toBe(204);
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 't', audience: 'https://run.example/internal/ingest' });
  });

  it('fails closed when the audience is not configured', async () => {
    validToken();
    vi.stubEnv('PUSH_AUDIENCE', '');
    expect((await push(message(logEntry), 't')).status).toBe(401);
  });

  it('ignores INGEST_AUTH=disabled outside the emulator', async () => {
    vi.stubEnv('INGEST_AUTH', 'disabled');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    expect((await push(message(logEntry))).status).toBe(401);
  });

  it('allows INGEST_AUTH=disabled under the emulator', async () => {
    vi.stubEnv('INGEST_AUTH', 'disabled');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'localhost:8080');
    expect((await push(message(logEntry))).status).toBe(204);
  });

  it('acks entries that sanitize drops', async () => {
    validToken();
    const dropped = { ...logEntry, httpRequest: { ...logEntry.httpRequest, requestUrl: 'https://juanalmaraz.dev/admin' } };
    expect((await push(message(dropped), 't')).status).toBe(204);
  });

  it.each([
    ['invalid JSON', '{'],
    ['missing message', {}],
    ['non-base64 JSON data', { message: { data: '!!!' } }],
  ])('returns 400 for %s', async (_, body) => {
    validToken();
    expect((await push(body, 't')).status).toBe(400);
  });
});
