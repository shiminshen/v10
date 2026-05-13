import { describe, expect, it, vi } from 'vitest';
import { createPopupGroup } from '../popup-group';

describe('createPopupGroup', () => {
  it('closes the previously open member when another opens', () => {
    const group = createPopupGroup();
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const first = { close: closeFirst };
    const second = { close: closeSecond };

    group.open(first);
    closeFirst.mockClear();

    group.open(second);

    expect(closeFirst).toHaveBeenCalledWith('group-open');
    expect(closeSecond).not.toHaveBeenCalled();
  });

  it('does not close when the same member opens twice', () => {
    const group = createPopupGroup();
    const close = vi.fn();
    const member = { close };

    group.open(member);
    close.mockClear();
    group.open(member);

    expect(close).not.toHaveBeenCalled();
  });

  it('allows a new member to open after the current member closes', () => {
    const group = createPopupGroup();
    const closeA = vi.fn();
    const closeB = vi.fn();
    const a = { close: closeA };
    const b = { close: closeB };

    group.open(a);
    group.close(a);
    closeB.mockClear();
    group.open(b);

    expect(closeB).not.toHaveBeenCalled();
    expect(closeA).not.toHaveBeenCalled();
  });
});
