import { describe, expect, it } from 'vitest';
import { ART_BOX, projectArt } from '../../src/components/home/project-art';
import { PROJECT_DOMAINS } from '../../src/lib/content/schemas';

describe('projectArt', () => {
  it('draws every domain inside the cover box, the same way each time', () => {
    for (const d of PROJECT_DOMAINS) {
      const svg = projectArt(d);
      expect(svg).toBe(projectArt(d));
      expect(svg, d).toMatch(/<(path|polyline|rect|circle) /);
      const coords = [...svg.matchAll(/ (?:points|cx|cy|x|y)="([^"]+)"/g)].flatMap((m) => m[1].split(/[ ,]/).map(Number));
      for (const n of coords) {
        expect(n, d).toBeGreaterThanOrEqual(0);
        expect(n, d).toBeLessThanOrEqual(ART_BOX.w);
      }
    }
  });
});
