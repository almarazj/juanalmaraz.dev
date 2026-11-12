import { applicationDefault } from 'firebase-admin/app';
import { bucket, db } from '../firebase';
import { getFeed } from '../content/repo';
import type { Deps } from './check';

const WINDOW_S = 30 * 86_400;

// Returns null when no uptime check is configured (local, previews).
async function uptimeRatio(env: Record<string, string | undefined>): Promise<number | null> {
  const id = env.UPTIME_CHECK_ID;
  const project = env.GOOGLE_CLOUD_PROJECT;
  if (!id || !project) return null;
  const { access_token } = await applicationDefault().getAccessToken();
  const now = Date.now();
  const q = new URLSearchParams({
    filter: `metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.labels.check_id="${id}"`,
    'interval.startTime': new Date(now - WINDOW_S * 1000).toISOString(),
    'interval.endTime': new Date(now).toISOString(),
    'aggregation.alignmentPeriod': `${WINDOW_S}s`,
    'aggregation.perSeriesAligner': 'ALIGN_FRACTION_TRUE',
    'aggregation.crossSeriesReducer': 'REDUCE_MEAN',
  });
  const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${q}`, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { timeSeries?: { points?: { value?: { doubleValue?: number } }[] }[] };
  const v = body.timeSeries?.[0]?.points?.[0]?.value?.doubleValue;
  return typeof v === 'number' ? v : null;
}

export const liveDeps = (): Deps => ({
  now: () => Date.now(),
  getFeed: async () => {
    const f = await getFeed();
    return { entries: f.entries.length, updatedAt: f.updatedAt, stats: f.stats };
  },
  pingDb: async () => {
    await db().doc('site/main').get();
  },
  // The Storage emulator reports exists() false for its implicit bucket, so list instead; it throws when the bucket is missing.
  bucketExists: async () => {
    await bucket().getFiles({ maxResults: 1 });
    return true;
  },
  uptime: () => uptimeRatio(process.env),
});
