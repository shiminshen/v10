import { describe, expect, it, vi } from 'vitest';
import { createPopupGroup, getSharedMenuPopupGroup, wrapPopupGroupOpenClose } from '../popup-group';

describe('getSharedMenuPopupGroup', () => {
  it('returns the same instance across calls', () => {
    expect(getSharedMenuPopupGroup()).toBe(getSharedMenuPopupGroup());
  });

  it('is distinct from a freshly created group', () => {
    expect(getSharedMenuPopupGroup()).not.toBe(createPopupGroup());
  });
});

describe('wrapPopupGroupOpenClose', () => {
  it('forwards open and close only when forwardsOpenClose is true', () => {
    const inner = createPopupGroup();
    const openInner = vi.spyOn(inner, 'open');
    const closeInner = vi.spyOn(inner, 'close');
    let forwards = true;
    const wrapped = wrapPopupGroupOpenClose(inner, () => forwards);

    const member = { close: vi.fn() };
    wrapped.open(member);
    expect(openInner).toHaveBeenCalledTimes(1);

    forwards = false;
    openInner.mockClear();
    wrapped.open(member);
    expect(openInner).not.toHaveBeenCalled();

    wrapped.close(member);
    expect(closeInner).not.toHaveBeenCalled();

    forwards = true;
    wrapped.close(member);
    expect(closeInner).toHaveBeenCalledTimes(1);
  });

  it('always forwards addMemberTrigger and pathHasPeerMemberTrigger', () => {
    const inner = createPopupGroup();
    const addInner = vi.spyOn(inner, 'addMemberTrigger');
    const forwards = false;
    const wrapped = wrapPopupGroupOpenClose(inner, () => forwards);
    const btn = document.createElement('button');

    wrapped.addMemberTrigger(btn);

    expect(addInner).toHaveBeenCalledWith(btn);
    expect(wrapped.pathHasPeerMemberTrigger([btn], null)).toBe(true);
  });
});

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

  it('tracks member triggers for peer detection', () => {
    const group = createPopupGroup();
    const a = document.createElement('button');
    const b = document.createElement('button');
    group.addMemberTrigger(a);
    const unregB = group.addMemberTrigger(b);

    expect(group.pathHasPeerMemberTrigger([b], a)).toBe(true);
    expect(group.pathHasPeerMemberTrigger([b], b)).toBe(false);
    expect(group.pathHasPeerMemberTrigger([document.body], a)).toBe(false);

    unregB();
    expect(group.pathHasPeerMemberTrigger([b], a)).toBe(false);
  });
});
