import { describe, expect, it } from 'vitest';
import { currentId } from '../../src/components/site/scrollspy';

const positions = [
  { id: 'a', top: 500 },
  { id: 'b', top: 1000 },
  { id: 'c', top: 1500 },
];

describe('currentId', () => {
  it('is null above the first section', () => {
    expect(currentId(positions, 0)).toBeNull();
  });
  it('returns the last section whose top is above viewportTop + offset', () => {
    expect(currentId(positions, 400)).toBe('a');
    expect(currentId(positions, 900)).toBe('b');
    expect(currentId(positions, 5000)).toBe('c');
  });
  it('honors a custom offset', () => {
    expect(currentId(positions, 0, 600)).toBe('a');
  });
  it('picks within a grid row by the preferred id, else the row\'s first block', () => {
    const grid = [{ id: 'x', top: 500 }, { id: 'y', top: 500 }, { id: 'z', top: 500 }, { id: 'w', top: 900 }];
    expect(currentId(grid, 600)).toBe('x');
    expect(currentId(grid, 600, 120, 'y')).toBe('y');
    expect(currentId(grid, 600, 120, 'w')).toBe('x');
  });
  it('is null for no positions', () => {
    expect(currentId([], 100)).toBeNull();
  });
});
