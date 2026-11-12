import { describe, expect, it } from 'vitest';
import { search, type PaletteItem } from '../../src/components/site/palette';

const item = (group: string, label: string, hint = '', target = '/'): PaletteItem => ({ group, label, hint, target });
const idx: PaletteItem[] = [
  item('Actions', 'Switch theme'),
  item('About', 'Quick questions', 'Which club? Boca Juniors'),
  item('Writing', 'Idempotent webhooks', 'Retries without double charges'),
  item('Sections', 'Experience'),
  item('Experience', 'Backend engineer', 'Acme · Remote'),
  item('Links', 'GitHub'),
];

describe('search', () => {
  it('finds an item by text in its hint, case-insensitively', () => {
    expect(search(idx, 'boca').map((i) => i.label)).toEqual(['Quick questions']);
  });

  it('matches the group name', () => {
    expect(search(idx, 'ACTIONS').map((i) => i.label)).toEqual(['Switch theme']);
  });

  it('returns everything for an empty query, in group order', () => {
    expect(search(idx, '').map((i) => i.group)).toEqual([
      'Sections', 'Experience', 'Writing', 'About', 'Links', 'Actions',
    ]);
  });

  it('keeps group order for filtered results', () => {
    expect(search(idx, 'e').map((i) => i.group)).toEqual(['Sections', 'Experience', 'Writing', 'About', 'Actions']);
  });
});
