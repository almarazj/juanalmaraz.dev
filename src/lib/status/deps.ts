import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { config, ddb, s3 } from '../aws';
import { getFeed } from '../feed/store';
import type { Deps } from './check';
import { uptimeRatio } from './uptime';

const WINDOW_MS = 30 * 86_400_000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function pingDb(): Promise<void> {
  await ddb().send(new GetCommand({ TableName: config().table, Key: { pk: 'site', sk: 'main' } }));
}

async function uptime(now: number): Promise<number | null> {
  const TableName = config().table;
  const [days, first] = await Promise.all([
    ddb().send(new QueryCommand({
      TableName,
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
      ExpressionAttributeValues: { ':pk': 'uptime', ':from': dayOf(now - WINDOW_MS), ':to': dayOf(now) },
    })),
    ddb().send(new GetCommand({ TableName, Key: { pk: 'uptime', sk: 'first' } })),
  ]);
  const items = (days.Items ?? []).map((i) => ({ day: i.sk as string, ok: Number(i.ok ?? 0) }));
  return uptimeRatio(items, typeof first.Item?.t === 'number' ? first.Item.t : null, now);
}

export const liveDeps = (): Deps => ({
  now: () => Date.now(),
  getFeed: async () => {
    const f = await getFeed();
    return { entries: f.entries.length, updatedAt: f.updatedAt, stats: f.stats };
  },
  pingDb,
  bucketExists: async () => {
    await s3().send(new HeadBucketCommand({ Bucket: config().bucket }));
    return true;
  },
  uptime: () => uptime(Date.now()),
});
