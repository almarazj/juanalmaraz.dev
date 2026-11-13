export const PROBE_INTERVAL_MS = 300_000;

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

// The denominator is the number of probe slots that should have run, so a stopped probe counts as downtime.
export function uptimeRatio(
  days: { day: string; ok: number }[],
  firstProbeAt: number | null,
  now: number,
  windowMs = 30 * 86_400_000,
): number | null {
  if (firstProbeAt === null) return null;
  const start = Math.max(now - windowMs, firstProbeAt);
  const expected = Math.max(1, Math.floor((now - start) / PROBE_INTERVAL_MS));
  const from = dayOf(start);
  const ok = days.filter((d) => d.day >= from).reduce((n, d) => n + d.ok, 0);
  return Math.round(Math.min(1, ok / expected) * 10_000) / 10_000;
}
