import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedBuffer, flushOnSigterm } from '../../src/lib/feed/buffer';
import type { FeedEntry } from '../../src/lib/content/schemas';

const e = (p: string, extra: Partial<FeedEntry> = {}): FeedEntry => ({ m: 'GET', p, s: 200, c: 'HIT', ms: 10, t: 0, ...extra });
const writer = () => vi.fn<(entries: FeedEntry[]) => Promise<void>>(async () => {});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createFeedBuffer', () => {
  it('writes at most once per window and caps the batch', async () => {
    const write = writer();
    const buffer = createFeedBuffer({ write, read: async () => [] });
    await buffer.push(e('/first'));
    expect(write).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 50; i++) {
      await buffer.push(e(`/${i}`));
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![0]).toHaveLength(30);
    expect(write.mock.calls[1]![0][0]!.p).toBe('/49');
  });

  it('awaits the write inside the push once the window has elapsed', async () => {
    const write = writer();
    const buffer = createFeedBuffer({ write, read: async () => [] });
    await buffer.push(e('/a'));
    await vi.advanceTimersByTimeAsync(9_000);
    await buffer.push(e('/b'));
    expect(write).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1_000);
    await buffer.push(e('/c'));
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith([e('/c'), e('/b'), e('/a')]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('merges stored entries on the first flush after a cold start', async () => {
    const write = writer();
    const buffer = createFeedBuffer({ write, read: async () => [e('x'), e('y')] });
    await buffer.push(e('new'));
    expect(write).toHaveBeenCalledWith([e('new'), e('x'), e('y')]);
  });

  it('never writes only the new entries when the stored feed cannot be read', async () => {
    const write = writer();
    const read = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue([e('x')]);
    const buffer = createFeedBuffer({ write, read });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await buffer.push(e('new'));
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledWith([e('new'), e('x')]);
  });

  it('keeps entries for the next flush when a write fails', async () => {
    const write = writer().mockRejectedValueOnce(new Error('down'));
    const buffer = createFeedBuffer({ write, read: async () => [] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await buffer.push(e('a'));
    await buffer.push(e('b'));
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenLastCalledWith([e('b'), e('a')]);
  });
});

describe('flushOnSigterm', () => {
  it('flushes pending entries once, then exits', async () => {
    const write = writer();
    const buffer = createFeedBuffer({ write, read: async () => [] });
    await buffer.push(e('a'));
    await buffer.push(e('pending'));
    expect(write).toHaveBeenCalledTimes(1);

    const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
    flushOnSigterm(buffer, proc);
    proc.emit('SIGTERM');
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith([e('pending'), e('a')]);
    expect(proc.listenerCount('SIGTERM')).toBe(0);
  });

  it('does not write when nothing is pending', async () => {
    const write = writer();
    const buffer = createFeedBuffer({ write, read: async () => [] });
    const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
    flushOnSigterm(buffer, proc);
    proc.emit('SIGTERM');
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled());
    expect(write).not.toHaveBeenCalled();
  });
});
