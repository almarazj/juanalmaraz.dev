import type { FeedEntry } from '../content/schemas';

const allowed = /^\/(?:|writing|writing\/[a-z0-9-]{1,80}|api\/(?:me|experience|stack|now)|rss\.xml|resume\.pdf)$/;
// Assets, private surfaces and the endpoints the page itself polls never reach the feed, whatever the status.
const dropped = /^\/(?:_astro\/|images\/|search-index\.json$|(?:admin|internal)(?:\/|$)|api\/(?:requests|status|health)$)/;
const methods = new Set(['GET', 'POST', 'HEAD']);
const MAX_PATH = 200;

export interface RequestFacts {
  method: string;
  path: string;
  status: number;
  ms: number;
  cold: boolean;
  t: number;
}

function pathOf(raw: string): string | null {
  if (raw.length > MAX_PATH) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

// Turns a handled request into a public feed row; only allowlisted paths are ever echoed back.
export function sanitize(facts: RequestFacts): FeedEntry | null {
  const { method, status, ms, cold, t } = facts;
  if (!methods.has(method)) return null;
  if (!Number.isInteger(status) || status < 100 || status > 599) return null;
  const path = pathOf(facts.path);
  if (path === null || dropped.test(path)) return null;

  let p = path;
  if (!allowed.test(path)) {
    if (status !== 404) return null;
    p = '404 · unknown path';
  }
  return { m: method as FeedEntry['m'], p, s: status, c: cold ? 'cold' : 'warm', ms: Math.max(0, Math.round(ms)), t };
}
