import { describe, expect, it } from 'vitest';
import { autocomplete, CommandHistory, formatAgo, parseCommand } from '../../src/components/home/terminal';

describe('formatAgo', () => {
  it.each([
    [0, '0 s ago'],
    [-5_000, '0 s ago'],
    [14_400, '14 s ago'],
    [3 * 60_000 + 5_000, '3 min ago'],
    [2 * 3_600_000, '2 h ago'],
    [3 * 86_400_000, '3 d ago'],
  ])('%i ms', (ms, label) => {
    expect(formatAgo(ms)).toBe(label);
  });
});

describe('parseCommand', () => {
  it('parses curl commands with various formats', () => {
    expect(parseCommand('curl /api/me')).toEqual({ type: 'curl', path: '/api/me' });
    expect(parseCommand('curl /me')).toEqual({ type: 'curl', path: '/api/me' });
    expect(parseCommand('curl me')).toEqual({ type: 'curl', path: '/api/me' });
    expect(parseCommand('curl juanalmaraz.dev/api/stack')).toEqual({ type: 'curl', path: '/api/stack' });
    expect(parseCommand('curl https://juanalmaraz.dev/api/now')).toEqual({ type: 'curl', path: '/api/now' });
    expect(parseCommand('/stack')).toEqual({ type: 'curl', path: '/api/stack' });
  });

  it('parses built-in commands', () => {
    expect(parseCommand('help')).toEqual({ type: 'help' });
    expect(parseCommand('clear')).toEqual({ type: 'clear' });
    expect(parseCommand('')).toEqual({ type: 'empty' });
    expect(parseCommand('   ')).toEqual({ type: 'empty' });
  });

  it('marks unknown commands', () => {
    expect(parseCommand('foo bar')).toEqual({ type: 'unknown', raw: 'foo bar' });
    expect(parseCommand('curl')).toEqual({ type: 'unknown', raw: 'curl' });
  });
});

describe('autocomplete', () => {
  it('autocompletes prefixes', () => {
    expect(autocomplete('h')).toBe('help');
    expect(autocomplete('cl')).toBe('clear');
    expect(autocomplete('curl /api/s')).toBe('curl /api/stack');
    expect(autocomplete('curl /api/n')).toBe('curl /api/now');
  });

  it('returns original input if no match', () => {
    expect(autocomplete('xyz')).toBe('xyz');
  });

  it('cycles through matches when multiple candidates match', () => {
    const first = autocomplete('curl /api/');
    expect(['curl /api/me', 'curl /api/stack', 'curl /api/now', 'curl /api/requests']).toContain(first);
    const second = autocomplete(first);
    expect(['curl /api/me', 'curl /api/stack', 'curl /api/now', 'curl /api/requests']).toContain(second);
    expect(second).not.toBe(first);
  });
});

describe('CommandHistory', () => {
  it('navigates history back and forward', () => {
    const history = new CommandHistory();
    history.push('curl /api/me');
    history.push('curl /api/stack');

    expect(history.prev('current draft')).toBe('curl /api/stack');
    expect(history.prev('curl /api/stack')).toBe('curl /api/me');
    expect(history.prev('curl /api/me')).toBe('curl /api/me');

    expect(history.next()).toBe('curl /api/stack');
    expect(history.next()).toBe('current draft');
    expect(history.next()).toBe('current draft');
  });

  it('ignores duplicate consecutive commands and empty entries', () => {
    const history = new CommandHistory();
    history.push('help');
    history.push('help');
    history.push('   ');

    expect(history.prev('')).toBe('help');
    expect(history.prev('help')).toBe('help');
  });
});

