import { beforeEach, describe, expect, it } from 'vitest';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { config, ddb } from '../../src/lib/aws';
import { getFeed, putEntry } from '../../src/lib/feed/store';
import { resetTable } from '../../scripts/local-aws';
import type { FeedEntry } from '../../src/lib/content/schemas';

const T0 = 1_700_000_000_000;
const entry = (i: number): FeedEntry => ({ m: 'GET', p: `/writing/p${i}`, s: 200, c: 'warm', ms: i, t: T0 + i * 1000 });

beforeEach(resetTable);

describe('feed store', () => {
  it('returns the 30 newest of 35 entries, newest first', async () => {
    for (let i = 0; i < 35; i++) await putEntry(entry(i));
    const feed = await getFeed();
    expect(feed.entries).toHaveLength(30);
    expect(feed.entries.map((e) => e.ms)).toEqual(Array.from({ length: 30 }, (_, k) => 34 - k));
    expect(feed.updatedAt).toBe(entry(34).t);
  });

  it('is empty with updatedAt 0 when nothing was recorded', async () => {
    expect(await getFeed()).toMatchObject({ entries: [], updatedAt: 0 });
  });

  it('stores an item that expires one day after the request', async () => {
    const e = entry(1);
    await putEntry(e);
    const { Items } = await ddb().send(new QueryCommand({
      TableName: config().table, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': 'feed' },
    }));
    expect(Items).toHaveLength(1);
    expect(Items![0]!.expiresAt).toBe(Math.floor(e.t / 1000) + 86_400);
  });

  it('skips items that fail the schema', async () => {
    await putEntry(entry(1));
    await ddb().send(new PutCommand({
      TableName: config().table,
      Item: { pk: 'feed', sk: '9999999999999#bad', m: 'GET', p: '/', s: 200, c: 'HIT', ms: 1, t: T0 + 99_000 },
    }));
    const feed = await getFeed();
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]!.p).toBe('/writing/p1');
  });
});
