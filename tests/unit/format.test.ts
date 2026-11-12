import { describe, expect, it } from 'vitest';
import { hostLabel } from '../../src/components/home/format';

describe('hostLabel', () => {
  it('strips www from the hostname', () => expect(hostLabel('https://www.letterboxd.com/film/x/')).toBe('letterboxd.com'));
  it('returns malformed input unchanged instead of throwing', () => expect(hostLabel('not a url')).toBe('not a url'));
});
