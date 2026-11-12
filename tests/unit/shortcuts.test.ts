import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShortcuts } from '../../src/components/site/shortcuts';

const press = (key: string, extra: Record<string, unknown> = {}) =>
  ({ key, preventDefault() {}, target: { tagName: 'BODY' }, ...extra }) as unknown as KeyboardEvent;

describe('createShortcuts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires a two-key sequence within the timeout', () => {
    const fn = vi.fn();
    const handle = createShortcuts({ 'g e': fn });
    handle(press('g'));
    vi.advanceTimersByTime(700);
    handle(press('e'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does not fire after the timeout', () => {
    const fn = vi.fn();
    const handle = createShortcuts({ 'g e': fn });
    handle(press('g'));
    vi.advanceTimersByTime(801);
    handle(press('e'));
    expect(fn).not.toHaveBeenCalled();
  });

  it('fires single keys', () => {
    const fn = vi.fn();
    createShortcuts({ t: fn })(press('t'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('ignores keys while focus is in a field', () => {
    const fn = vi.fn();
    const handle = createShortcuts({ t: fn });
    handle(press('t', { target: { tagName: 'INPUT' } }));
    handle(press('t', { target: { tagName: 'TEXTAREA' } }));
    handle(press('t', { target: { tagName: 'DIV', isContentEditable: true } }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('ignores auto-repeat', () => {
    const fn = vi.fn();
    createShortcuts({ t: fn })(press('t', { repeat: true }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('ignores keys with a modifier held', () => {
    const fn = vi.fn();
    const handle = createShortcuts({ t: fn });
    handle(press('t', { metaKey: true }));
    handle(press('t', { ctrlKey: true }));
    handle(press('t', { altKey: true }));
    expect(fn).not.toHaveBeenCalled();
  });
});
