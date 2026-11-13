const monthIndex = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + m - 1;
};

// Both months count: Mar 2021 to Dec 2022 is 22 months.
export function tenure(start: string, end: string | null, now: Date): { years: number } {
  const last = end ? monthIndex(end) : now.getUTCFullYear() * 12 + now.getUTCMonth();
  return { years: Math.max(0, last - monthIndex(start) + 1) / 12 };
}
