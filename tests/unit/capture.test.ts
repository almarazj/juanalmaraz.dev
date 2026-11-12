import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordRequest, takeColdFlag } from '../../src/lib/feed/capture';

const facts = (path: string) => ({ method: 'GET', path, status: 200, ms: 5, cold: false, t: 1 });

afterEach(() => vi.restoreAllMocks());

describe('capture', () => {
  it('takeColdFlag is true exactly once', () => {
    expect(takeColdFlag()).toBe(true);
    expect(takeColdFlag()).toBe(false);
    expect(takeColdFlag()).toBe(false);
  });

  it('puts a kept entry', async () => {
    const put = vi.fn(async () => {});
    await recordRequest(facts('/writing'), put);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ p: '/writing', c: 'warm' }));
  });

  it('logs and swallows a throttled write', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('slow down'), { name: 'ProvisionedThroughputExceededException' });
    await expect(recordRequest(facts('/'), async () => { throw err; })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('feed write failed: ProvisionedThroughputExceededException');
  });

  it('never calls put for a dropped path', async () => {
    const put = vi.fn(async () => {});
    await recordRequest(facts('/admin/posts'), put);
    expect(put).not.toHaveBeenCalled();
  });
});
