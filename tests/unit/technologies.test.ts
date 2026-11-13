import { describe, expect, it } from 'vitest';
import { technologyBoard } from '../../src/lib/content/technologies';

describe('technologyBoard', () => {
  const board = technologyBoard({
    production: ['Python', 'FastAPI', 'Postgres'],
    side: ['Python', 'Astro', 'Vitest', 'DSP'],
    tinkering: ['Rust', 'Astro'],
  });
  const cells = (category: string) => board.lanes.find((l) => l.category === category)?.cells;

  it('keeps each name at the highest level it shows up in', () => {
    expect(cells('Languages')).toMatchObject({ production: [{ name: 'Python' }], side: [], tinkering: [{ name: 'Rust' }] });
    expect(cells('Frameworks')?.side.map((t) => t.name)).toEqual(['Astro']);
  });

  it('folds aliases into the catalog name and drops names outside the catalog', () => {
    expect(cells('Databases')?.production).toEqual([{ name: 'PostgreSQL', icon: 'postgresql', dark: undefined }]);
    expect(JSON.stringify(board)).not.toContain('DSP');
  });

  it('counts per level and leaves out empty lanes', () => {
    expect(board.counts).toEqual({ production: 3, side: 2, tinkering: 1 });
    expect(board.lanes.map((l) => l.category)).toEqual(['Languages', 'Frameworks', 'Databases', 'Testing']);
  });
});
