import { describe, expect, it, vi } from 'vitest';
import { handler } from '../../lambdas/probe/index.mjs';

const NOW = Date.UTC(2026, 10, 12, 23, 59, 0);
const deps = (fetch: typeof globalThis.fetch) => ({
  now: () => NOW,
  fetch,
  addOk: vi.fn(async () => {}),
  markFirst: vi.fn(async () => {}),
});

describe('probe', () => {
  it('records an ok for today and the first probe on a 200', async () => {
    const d = deps(async () => new Response('{}', { status: 200 }));
    await expect(handler({}, d)).resolves.toEqual({ ok: true });
    expect(d.addOk).toHaveBeenCalledOnce();
    expect(d.addOk).toHaveBeenCalledWith('2026-11-12', Date.UTC(2026, 10, 12) / 1000 + 35 * 86_400);
    expect(d.markFirst).toHaveBeenCalledOnce();
    expect(d.markFirst).toHaveBeenCalledWith(NOW);
  });
  it('writes nothing on a 503', async () => {
    const d = deps(async () => new Response('{}', { status: 503 }));
    await expect(handler({}, d)).resolves.toEqual({ ok: false });
    expect(d.addOk).not.toHaveBeenCalled();
    expect(d.markFirst).not.toHaveBeenCalled();
  });
  it('writes nothing when the request times out', async () => {
    vi.useFakeTimers();
    try {
      const d = deps((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
      const result = handler({}, d);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(result).resolves.toEqual({ ok: false });
      expect(d.addOk).not.toHaveBeenCalled();
      expect(d.markFirst).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
