const policies = {
  page: 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
  api: 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  requests: 'public, max-age=0, s-maxage=5',
  status: 'public, max-age=0, s-maxage=30',
  private: 'no-store',
} as const;

export function cacheHeaders(kind: keyof typeof policies): Record<string, string> {
  return { 'Cache-Control': policies[kind] };
}
