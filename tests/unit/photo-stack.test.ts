import { describe, expect, it } from 'vitest';
import { cycle, shouldSendBack } from '../../src/components/home/photo-stack';

describe('photo stack', () => {
  it('cycle moves the first item to the end without mutating', () => {
    const order = ['a', 'b', 'c'];
    expect(cycle(order)).toEqual(['b', 'c', 'a']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('cycle of an empty list is empty', () => {
    expect(cycle([])).toEqual([]);
  });

  it('sends back only past 90px of travel', () => {
    expect(shouldSendBack(60, 60)).toBe(false);
    expect(shouldSendBack(80, 60)).toBe(true);
    expect(shouldSendBack(-91, 0)).toBe(true);
  });
});
