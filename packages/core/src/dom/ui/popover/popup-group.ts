export type PopupGroupCloseReason = 'group-open';

export interface PopupGroupMember {
  close: (reason: PopupGroupCloseReason) => void;
}

export interface PopupGroup {
  open: (member: PopupGroupMember) => void;
  close: (member: PopupGroupMember) => void;
  /** Register a trigger element so peers skip capture-phase outside-dismiss when opening another member. */
  addMemberTrigger: (element: HTMLElement) => () => void;
  /** True if the event path hits another member's trigger (not `ownTrigger`). */
  pathHasPeerMemberTrigger: (path: EventTarget[], ownTrigger: HTMLElement | null) => boolean;
}

let sharedMenuPopupGroup: PopupGroup | null = null;

/**
 * Document-wide menu coordination: exclusive open + peer-trigger outside-dismiss skipping.
 * Used when a menu's `group` resolver is omitted or returns `undefined` (no player or shell group).
 */
export function getSharedMenuPopupGroup(): PopupGroup {
  sharedMenuPopupGroup ??= createPopupGroup();
  return sharedMenuPopupGroup;
}

/**
 * Wraps a popup group so `open` / `close` run only when `forwardsOpenClose()` is true.
 * Trigger registration and peer detection always delegate to the inner group (submenus register triggers but do not call `open`/`close`).
 */
export function wrapPopupGroupOpenClose(group: PopupGroup, forwardsOpenClose: () => boolean): PopupGroup {
  return {
    open(member) {
      if (!forwardsOpenClose()) return;
      group.open(member);
    },
    close(member) {
      if (!forwardsOpenClose()) return;
      group.close(member);
    },
    addMemberTrigger(element) {
      return group.addMemberTrigger(element);
    },
    pathHasPeerMemberTrigger(path, ownTrigger) {
      return group.pathHasPeerMemberTrigger(path, ownTrigger);
    },
  };
}

export function createPopupGroup(): PopupGroup {
  let current: PopupGroupMember | null = null;
  const memberTriggers = new Set<HTMLElement>();

  return {
    open(member) {
      if (current === member) return;

      current?.close('group-open');
      current = member;
    },

    close(member) {
      if (current === member) current = null;
    },

    addMemberTrigger(element: HTMLElement) {
      memberTriggers.add(element);
      return () => memberTriggers.delete(element);
    },

    pathHasPeerMemberTrigger(path: EventTarget[], ownTrigger: HTMLElement | null) {
      for (const node of path) {
        if (node instanceof HTMLElement && memberTriggers.has(node) && node !== ownTrigger) {
          return true;
        }
      }
      return false;
    },
  };
}
