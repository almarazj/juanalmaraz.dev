// Extruded bitmap letters, rotated around the vertical axis, z-buffered and lit per face.
const J = ['#####', '   # ', '   # ', '   # ', '#  # ', '#  # ', ' ##  '];
const A = [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'];

export const COLS = 32;
export const ROWS = 13;
export const REST_ANGLE = -0.6;

const SHADES = '.,-~:;=!*#$@';
const DEPTH = 0.9;
const STEP = 0.12;
const CAMERA = 30;
const SCALE_X = 2.2;
// Terminal cells are about twice as tall as wide.
const SCALE_Y = 1.2;
const TILT = 0.18;

type Point = [x: number, y: number, z: number, nx: number, ny: number, nz: number];
type Vec = [number, number, number];

const points: Point[] = (() => {
  const grid = J.map((row, i) => `${row} ${A[i]}`);
  const h = grid.length;
  const w = grid[0].length;
  const on = (x: number, y: number) => grid[y]?.[x] === '#';
  const out: Point[] = [];
  const face = (o: Vec, u: Vec, v: Vec, n: Vec) => {
    for (let s = 0; s <= 1.0001; s += STEP) {
      for (let t = 0; t <= 1.0001; t += STEP) {
        out.push([o[0] + u[0] * s + v[0] * t - w / 2, o[1] + u[1] * s + v[1] * t - h / 2, o[2] + u[2] * s + v[2] * t, ...n]);
      }
    }
  };
  const d2 = 2 * DEPTH;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      face([x, y, -DEPTH], [1, 0, 0], [0, 1, 0], [0, 0, -1]);
      face([x, y, DEPTH], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
      if (!on(x - 1, y)) face([x, y, -DEPTH], [0, 1, 0], [0, 0, d2], [-1, 0, 0]);
      if (!on(x + 1, y)) face([x + 1, y, -DEPTH], [0, 1, 0], [0, 0, d2], [1, 0, 0]);
      if (!on(x, y - 1)) face([x, y, -DEPTH], [1, 0, 0], [0, 0, d2], [0, -1, 0]);
      if (!on(x, y + 1)) face([x, y + 1, -DEPTH], [1, 0, 0], [0, 0, d2], [0, 1, 0]);
    }
  }
  return out;
})();

// Light from the upper left, in front of the letters.
const len = Math.hypot(0.4, 0.7, 1);
const LIGHT: Vec = [-0.4 / len, -0.7 / len, -1 / len];

/** One frame of the spinning "JA" as ROWS lines of COLS characters. */
export function frame(angle: number): string {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const cb = Math.cos(TILT);
  const sb = Math.sin(TILT);
  const cells = new Array<string>(COLS * ROWS).fill(' ');
  const depth = new Float32Array(COLS * ROWS);
  for (const [x, y, z, nx, ny, nz] of points) {
    const x1 = x * ca + z * sa;
    const z1 = -x * sa + z * ca;
    const nx1 = nx * ca + nz * sa;
    const nz1 = -nx * sa + nz * ca;
    const y2 = y * cb - z1 * sb;
    const z2 = y * sb + z1 * cb;
    const ny2 = ny * cb - nz1 * sb;
    const nz2 = ny * sb + nz1 * cb;
    const ooz = 1 / (z2 + CAMERA);
    const f = CAMERA * ooz;
    const c = Math.round(COLS / 2 + x1 * SCALE_X * f);
    const r = Math.round(ROWS / 2 - 1 + y2 * SCALE_Y * f);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
    const i = r * COLS + c;
    if (ooz <= depth[i]) continue;
    depth[i] = ooz;
    const lum = nx1 * LIGHT[0] + ny2 * LIGHT[1] + nz2 * LIGHT[2];
    cells[i] = lum > 0 ? SHADES[Math.min(SHADES.length - 1, Math.floor(lum * SHADES.length))] : '.';
  }
  const lines: string[] = [];
  for (let r = 0; r < ROWS; r++) lines.push(cells.slice(r * COLS, (r + 1) * COLS).join(''));
  return lines.join('\n');
}
