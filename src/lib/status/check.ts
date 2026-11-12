export type State = 'ok' | 'warn' | 'down';
export interface Status {
  overall: State;
  checkedAt: number;
  services: { name: string; state: State; detail: string }[];
  uptime30d: number | null;
}
export interface Deps {
  now(): number;
  getFeed(): Promise<{ entries: number; updatedAt: number; stats: { p50: number; hitRatio: number } }>;
  pingDb(): Promise<void>;
  bucketExists(): Promise<boolean>;
  uptime(): Promise<number | null>;
}

const DEADLINE_MS = 3000;
const STALE_MS = 24 * 3_600_000;
const rank: Record<State, number> = { ok: 0, warn: 1, down: 2 };

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

// A hung dependency must not hang the endpoint: it counts as failed.
async function within<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), DEADLINE_MS);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

export async function checkServices(deps: Deps): Promise<Status> {
  const checkedAt = deps.now();
  const [feed, db, storage, uptime30d] = await Promise.all([
    within(deps.getFeed()).catch(() => null),
    (async () => {
      const t = deps.now();
      try {
        await within(deps.pingDb());
        return { ok: true, ms: deps.now() - t };
      } catch {
        return { ok: false, ms: 0 };
      }
    })(),
    within(deps.bucketExists()).catch(() => false),
    within(deps.uptime()).catch(() => null),
  ]);
  const hasData = !!feed && feed.entries > 0;
  const log: Status['services'][number] = !feed
    ? { name: 'Live request log', state: 'down', detail: 'unreadable' }
    : feed.updatedAt === 0
      ? { name: 'Live request log', state: 'warn', detail: 'no entries yet' }
      : {
          name: 'Live request log',
          state: checkedAt - feed.updatedAt > STALE_MS ? 'warn' : 'ok',
          detail: `last entry ${ago(checkedAt - feed.updatedAt)}`,
        };
  const services: Status['services'] = [
    { name: 'Website (CDN)', state: 'ok', detail: hasData ? `${Math.round(feed.stats.hitRatio * 100)}% hit` : '-' },
    { name: 'App (Cloud Run)', state: 'ok', detail: hasData ? `p50 ${feed.stats.p50} ms` : '-' },
    { name: 'Database (Firestore)', state: db.ok ? 'ok' : 'down', detail: db.ok ? `${db.ms} ms` : 'unreachable' },
    { name: 'Storage', state: storage ? 'ok' : 'down', detail: storage ? 'bucket found' : 'bucket missing' },
    { name: 'Public API', state: db.ok ? 'ok' : 'down', detail: db.ok ? 'responding' : 'unavailable' },
    log,
  ];
  const overall = services.reduce<State>((w, s) => (rank[s.state] > rank[w] ? s.state : w), 'ok');
  return { overall, checkedAt, services, uptime30d };
}
