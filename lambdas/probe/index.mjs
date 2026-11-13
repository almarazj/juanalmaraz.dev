// Uptime probe: requests the site's health route and counts successes per UTC day in DynamoDB.
// A failed or missing probe writes nothing, so the uptime ratio treats it as downtime.
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const DAY_MS = 86_400_000;
const db = new DynamoDBClient({});

/** @type {{ now(): number; fetch: typeof fetch; addOk(day: string, expiresAt: number): Promise<void>; markFirst(t: number): Promise<void> }} */
const liveDeps = {
  now: () => Date.now(),
  fetch: (...args) => fetch(...args),
  addOk: async (day, expiresAt) => {
    await db.send(new UpdateItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: { S: 'uptime' }, sk: { S: day } },
      UpdateExpression: 'ADD ok :one SET expiresAt = :exp',
      ExpressionAttributeValues: { ':one': { N: '1' }, ':exp': { N: String(expiresAt) } },
    }));
  },
  markFirst: async (t) => {
    try {
      await db.send(new UpdateItemCommand({
        TableName: process.env.TABLE_NAME,
        Key: { pk: { S: 'uptime' }, sk: { S: 'first' } },
        UpdateExpression: 'SET t = :t',
        ConditionExpression: 'attribute_not_exists(pk)',
        ExpressionAttributeValues: { ':t': { N: String(t) } },
      }));
    } catch (err) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    }
  },
};

/**
 * @param {unknown} _event
 * @param {typeof liveDeps} deps
 * @returns {Promise<{ ok: boolean }>}
 */
export async function handler(_event, deps = liveDeps) {
  const t = deps.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  let ok = false;
  try {
    ok = (await deps.fetch(`${process.env.SITE_URL}/api/health`, { signal: abort.signal })).status === 200;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  if (!ok) return { ok: false };
  const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
  await deps.addOk(new Date(dayStart).toISOString().slice(0, 10), (dayStart + 35 * DAY_MS) / 1000);
  await deps.markFirst(t);
  return { ok: true };
}
