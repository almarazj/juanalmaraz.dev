import type { APIRoute } from 'astro';
import { OAuth2Client } from 'google-auth-library';
import { getFeed, saveFeed } from '../../lib/content/repo';
import { cacheHeaders } from '../../lib/http/cache';
import { createFeedBuffer, flushOnSigterm } from '../../lib/feed/buffer';
import { sanitize } from '../../lib/feed/sanitize';

const MAX_BODY = 64 * 1024;
const oauth = new OAuth2Client();
const buffer = createFeedBuffer({ write: (entries) => saveFeed(entries), read: async () => (await getFeed()).entries });
flushOnSigterm(buffer);

async function authorized(request: Request): Promise<boolean> {
  const env = process.env;
  if (env.INGEST_AUTH === 'disabled' && env.FIRESTORE_EMULATOR_HOST) return true;
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || !env.PUSH_AUDIENCE || !env.PUSH_SA) return false;
  try {
    const payload = (await oauth.verifyIdToken({ idToken: token, audience: env.PUSH_AUDIENCE })).getPayload();
    return payload?.email === env.PUSH_SA && payload.email_verified === true;
  } catch {
    return false;
  }
}

function decode(body: string): unknown {
  try {
    const data = JSON.parse(body)?.message?.data;
    if (typeof data !== 'string') return undefined;
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

const empty = (status: number) => new Response(null, { status, headers: cacheHeaders('private') });

// Pub/Sub retries anything but 2xx, so dropped entries are still acked with 204.
export const POST: APIRoute = async ({ request }) => {
  if (!(await authorized(request))) return empty(401);
  const body = await request.text();
  if (body.length > MAX_BODY) return empty(400);
  const logEntry = decode(body);
  if (logEntry === undefined) return empty(400);
  const entry = sanitize(logEntry, Date.now());
  if (entry) await buffer.push(entry);
  return empty(204);
};
