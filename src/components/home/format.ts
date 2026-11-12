const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthLabel = (ym: string) => `${months[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const yearSpan = (start: string, end: string | null) => `${start.slice(0, 4)} - ${end ? end.slice(0, 4) : 'now'}`;

// Display label for an external link; never throws on bad input.
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
