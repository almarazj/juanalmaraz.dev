/** Escapes text for element content; attribute values go through `attr`. */
export const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const attr = (s: string) => esc(s).replace(/"/g, '&quot;');
export const span = (cls: string, text: unknown) => `<span class="${cls}">${esc(text)}</span>`;

const external = (href: string) => /^https?:/.test(href);
export const link = (href: string, label: string) =>
  `<a href="${attr(href)}"${external(href) ? ' target="_blank" rel="noopener"' : ''}>${esc(label)}</a>`;

/** Turns http(s) URLs inside already escaped text into links; quotes and angle brackets end a URL. */
export const linkify = (escaped: string) =>
  escaped.replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

export function highlightJson(value: unknown): string {
  return esc(JSON.stringify(value, null, 2) ?? 'null').replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (_, str: string | undefined, colon: string | undefined, lit: string | undefined, num: string) => {
      if (str) return colon ? `<span class="c-info">${str}</span>${colon}` : `<span class="c-acc">${linkify(str)}</span>`;
      if (lit) return `<span class="c-cyan">${lit}</span>`;
      return `<span class="c-mag">${num}</span>`;
    },
  );
}
