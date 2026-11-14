import type { PROJECT_DOMAINS } from '../../lib/content/schemas';

type Domain = (typeof PROJECT_DOMAINS)[number];

/** Drawn into a 160x90 viewBox (the card's 16:9 cover). */
export const ART_BOX = { w: 160, h: 90 };

// Deterministic noise, so the server renders the same drawing every time.
function* lcg(seed: number) {
  for (;;) {
    seed = (seed * 9301 + 49297) % 233280;
    yield seed / 233280;
  }
}

const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** SVG children for a project without an image, picked by its first domain. */
export function projectArt(domain: Domain): string {
  const { w, h } = ART_BOX;
  const mid = h / 2;
  if (domain === 'Backend') {
    const boxes = ['API', 'Queue', 'Workers', 'DB'];
    return boxes
      .map((label, i) => {
        const x = 4 + i * 40;
        const box = `<rect class="box" x="${x}" y="33" width="32" height="24" rx="3"/><text class="lbl" x="${x + 16}" y="47.5">${label}</text>`;
        return box + (i < boxes.length - 1 ? `<path class="ln" d="M${x + 32} 45 h8"/>` : '');
      })
      .join('');
  }
  if (domain === 'DSP') {
    const pts: [number, number][] = [];
    for (let x = 8; x <= w - 8; x += 2) pts.push([x, mid + 28 * Math.sin(x / 6) * Math.sin(x / 47 + 0.4)]);
    return `<path class="ax" d="M8 ${mid} H${w - 8}"/><polyline class="ln" points="${poly(pts)}"/>`;
  }
  if (domain === 'Acoustics') {
    const rnd = lcg(7);
    const pts: [number, number][] = [];
    for (let x = 12; x <= w - 8; x += 2) pts.push([x, mid + (rnd.next().value! - 0.5) * 76 * Math.exp(-(x - 12) / 26)]);
    return `<path class="ax" d="M8 ${mid} H${w - 8}"/><polyline class="ln" points="${poly(pts)}"/>`;
  }
  if (domain === 'Electronics') {
    return '<path class="ln" d="M16 45 H48 l4 -10 l8 20 l8 -20 l8 20 l8 -20 l4 10 H108 M108 29 v32 M116 33 v24 M116 45 H144 M32 45 v20 M24 65 h16 M27 70 h10 M30 75 h4"/>';
  }
  const rnd = lcg(3);
  const dots = Array.from({ length: 40 }, (_, i) => {
    const [cx, cy] = i % 2 ? [100, 34] : [60, 58];
    return `<circle class="${i % 2 ? 'pt' : 'pt2'}" cx="${(cx + (rnd.next().value! - 0.5) * 44).toFixed(1)}" cy="${(cy + (rnd.next().value! - 0.5) * 36).toFixed(1)}" r="2.6"/>`;
  });
  return `<path class="ax" d="M16 ${h - 8} H${w - 8} M16 ${h - 8} V8"/><path class="ln dash" d="M28 12 L140 80"/>${dots.join('')}`;
}
