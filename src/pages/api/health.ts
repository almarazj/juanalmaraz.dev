import type { APIRoute } from 'astro';
import { json } from '../../lib/http/json';
import { pingDb } from '../../lib/status/deps';

// Exercises CloudFront, the function and DynamoDB for the uptime probe, so it is never cached.
export const GET: APIRoute = async () => {
  try {
    await pingDb();
    return json({ ok: true }, 'private');
  } catch (err) {
    console.error(err);
    return json({ ok: false }, 'private', 503);
  }
};
