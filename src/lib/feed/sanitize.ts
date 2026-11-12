import type { FeedEntry } from '../content/schemas';

const allowed = /^\/(?:|writing|writing\/[a-z0-9-]{1,80}|api\/(?:me|experience|stack|now)|rss\.xml|resume\.pdf)$/;
// Assets, private surfaces and the endpoints the page itself polls never reach the feed, whatever the status.
const dropped = /^\/(?:_astro\/|images\/|search-index\.json$|(?:admin|internal)(?:\/|$)|api\/(?:requests|status)$)/;
const methods = new Set(['GET', 'POST', 'HEAD']);
const MAX_PATH = 200;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function pathOf(requestUrl: unknown): string | null {
  if (typeof requestUrl !== 'string') return null;
  try {
    const raw = new URL(requestUrl, 'https://juanalmaraz.dev').pathname;
    if (raw.length > MAX_PATH) return null;
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

// Turns a Cloud Logging entry into a public feed row; only allowlisted paths are ever echoed back.
export function sanitize(logEntry: unknown, now: number): FeedEntry | null {
  if (!isObject(logEntry) || !isObject(logEntry.httpRequest)) return null;
  const { requestMethod, requestUrl, status, cacheHit, latency } = logEntry.httpRequest;
  if (typeof requestMethod !== 'string' || !methods.has(requestMethod)) return null;
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) return null;
  const seconds = typeof latency === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(latency)?.[1] : undefined;
  if (seconds === undefined) return null;
  const path = pathOf(requestUrl);
  if (path === null || dropped.test(path)) return null;

  let p = path;
  if (!allowed.test(path)) {
    if (status !== 404) return null;
    p = '404 · unknown path';
  }
  const t = typeof logEntry.timestamp === 'string' ? Date.parse(logEntry.timestamp) : NaN;
  return {
    m: requestMethod as FeedEntry['m'],
    p,
    s: status,
    c: cacheHit === true ? 'HIT' : 'MISS',
    ms: Math.round(Number(seconds) * 1000),
    t: Number.isFinite(t) ? t : now,
  };
}
