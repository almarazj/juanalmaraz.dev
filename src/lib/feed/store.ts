import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'node:crypto';
import { config, ddb } from '../aws';
import { FeedEntrySchema, type FeedEntry } from '../content/schemas';
import { feedStats } from './stats';

export interface Feed {
  entries: FeedEntry[];
  updatedAt: number;
  stats: ReturnType<typeof feedStats>;
}

const DAY_S = 86_400;

// The padded timestamp makes the sort key order by time; the random suffix keeps same-millisecond requests apart.
// The write is awaited before the visitor's response, so a stalled table must not hold it for long.
export const FEED_WRITE_TIMEOUT_MS = 250;

export async function putEntry(e: FeedEntry): Promise<void> {
  await ddb().send(new PutCommand({
    TableName: config().table,
    Item: {
      ...e,
      pk: 'feed',
      sk: `${String(e.t).padStart(13, '0')}#${randomBytes(3).toString('hex')}`,
      expiresAt: Math.floor(e.t / 1000) + DAY_S,
    },
  }), { abortSignal: AbortSignal.timeout(FEED_WRITE_TIMEOUT_MS) });
}

// Invalid rows are skipped so one bad write cannot take the whole feed down.
export async function getFeed(limit = 30): Promise<Feed> {
  const out = await ddb().send(new QueryCommand({
    TableName: config().table,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'feed' },
    ScanIndexForward: false,
    Limit: limit,
  }));
  const entries = (out.Items ?? []).flatMap((i) => {
    const r = FeedEntrySchema.safeParse(i);
    return r.success ? [r.data] : [];
  });
  const updatedAt = entries[0]?.t ?? 0;
  return { entries, updatedAt, stats: feedStats(entries, Date.now()) };
}
