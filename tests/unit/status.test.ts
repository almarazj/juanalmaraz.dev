import { describe, expect, it, vi } from 'vitest';
import { checkServices, type Deps } from '../../src/lib/status/check';

const NOW = 1_000_000_000;
const deps = (over: Partial<Deps> = {}): Deps => ({
  now: () => NOW,
  getFeed: async () => ({ entries: 3, updatedAt: NOW - 180_000, stats: { p50: 18, coldRatio: 0.06 } }),
  pingDb: async () => {},
  bucketExists: async () => true,
  uptime: async () => null,
  ...over,
});
const row = (s: Awaited<ReturnType<typeof checkServices>>, name: string) => s.services.find((x) => x.name === name)!;

describe('checkServices', () => {
  it('reports everything ok with detail text', async () => {
    const s = await checkServices(deps());
    expect(s.overall).toBe('ok');
    expect(s.uptime30d).toBeNull();
    expect(row(s, 'Website (CDN)').detail).toBe('-');
    expect(row(s, 'App (Cloud Run)').detail).toBe('p50 18 ms');
    expect(row(s, 'Live request log').detail).toBe('last entry 3 min ago');
  });
  it('marks Database and overall down when the Firestore read fails', async () => {
    const s = await checkServices(deps({ pingDb: async () => { throw new Error('boom'); } }));
    expect(row(s, 'Database (Firestore)').state).toBe('down');
    expect(row(s, 'Public API').state).toBe('down');
    expect(s.overall).toBe('down');
  });
  it('warns when the feed is older than 24 hours', async () => {
    const s = await checkServices(deps({ getFeed: async () => ({ entries: 3, updatedAt: NOW - 25 * 3_600_000, stats: { p50: 1, coldRatio: 1 } }) }));
    expect(row(s, 'Live request log').state).toBe('warn');
    expect(s.overall).toBe('warn');
  });
  it('marks Storage down when the bucket is missing', async () => {
    expect(row(await checkServices(deps({ bucketExists: async () => false })), 'Storage').state).toBe('down');
  });
  it('never fails because of the uptime lookup', async () => {
    const s = await checkServices(deps({ uptime: async () => { throw new Error('x'); } }));
    expect(s.uptime30d).toBeNull();
  });
  it('marks the log unreadable without throwing when the feed read rejects', async () => {
    const s = await checkServices(deps({ getFeed: async () => { throw new Error('x'); } }));
    expect(row(s, 'Live request log')).toMatchObject({ state: 'down', detail: 'unreadable' });
    expect(row(s, 'Website (CDN)').detail).toBe('-');
  });
  it('warns with "no entries yet" when the feed was never written', async () => {
    const s = await checkServices(deps({ getFeed: async () => ({ entries: 0, updatedAt: 0, stats: { p50: 0, coldRatio: 0 } }) }));
    expect(row(s, 'Live request log')).toMatchObject({ state: 'warn', detail: 'no entries yet' });
  });
  it('treats dependencies that never resolve as down within the deadline', async () => {
    vi.useFakeTimers();
    try {
      const never = () => new Promise<never>(() => {});
      const pending = checkServices(deps({ pingDb: never, bucketExists: never, getFeed: never, uptime: never }));
      await vi.advanceTimersByTimeAsync(3000);
      const s = await pending;
      expect(row(s, 'Database (Firestore)').state).toBe('down');
      expect(row(s, 'Storage').state).toBe('down');
      expect(row(s, 'Live request log').state).toBe('down');
      expect(s.overall).toBe('down');
      expect(s.uptime30d).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
