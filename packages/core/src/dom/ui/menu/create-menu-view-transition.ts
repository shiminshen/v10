import { createState, type State } from '@videojs/store';
import { getTransitionStyleAttrs, type TransitionStyleAttrs } from '../../../core/ui/transition';
import { forceLayout } from '../../utils/layout';
import { waitForAnimations as waitForElementAnimations } from '../transition';

import type { NavigationState } from './create-menu';

export type MenuViewTransitionPhase = 'hidden' | 'entering' | 'active' | 'exiting';

export type MenuViewTransitionDirection = NavigationState['direction'];

export interface MenuViewTransitionState {
  phase: MenuViewTransitionPhase;
  direction: MenuViewTransitionDirection;
  triggerId: string | null;
  transitioning?: boolean;
}

export interface MenuViewTransitionSyncOptions {
  active: boolean;
  direction: MenuViewTransitionDirection;
  triggerId?: string | null;
}

export interface MenuViewTransitionAttrs extends TransitionStyleAttrs {
  'data-menu-view': '';
  'data-menu-view-id'?: string | undefined;
  'data-direction': MenuViewTransitionDirection;
  'data-open'?: '' | undefined;
  hidden: boolean;
}

export interface MenuViewTransitionAttrsOptions {
  id?: string;
  root?: boolean;
}

export interface MenuViewTransitionOptions {
  focusFirstItem?: (element: HTMLElement) => void;
  restoreFocus?: (triggerId: string | null) => void;
  waitForAnimations?: (element: HTMLElement) => Promise<void>;
}

export interface MenuViewTransitionApi {
  input: State<MenuViewTransitionState>;
  setElement: (element: HTMLElement | null) => void;
  sync: (options: MenuViewTransitionSyncOptions) => void;
  destroy: () => void;
}

const DEFAULT_MENU_VIEW_TRANSITION_STATE: MenuViewTransitionState = {
  phase: 'hidden',
  direction: 'forward',
  triggerId: null,
  transitioning: false,
};

function focusFirstMenuViewItem(element: HTMLElement): void {
  const firstItem = element.querySelector<HTMLElement>('[data-item]');

  firstItem?.focus({ preventScroll: true });
}

export function getMenuViewTransitionAttrs(
  state: MenuViewTransitionState,
  { id, root = false }: MenuViewTransitionAttrsOptions = {}
): MenuViewTransitionAttrs {
  const viewId = id ?? (root ? 'root' : undefined);

  return {
    'data-menu-view': '',
    ...(viewId && { 'data-menu-view-id': viewId }),
    'data-direction': state.direction,
    ...getTransitionStyleAttrs({
      transitioning: state.transitioning,
      transitionStarting: state.phase === 'entering',
      transitionEnding: state.phase === 'exiting',
    }),
    'data-open': state.phase !== 'hidden' ? '' : undefined,
    hidden: state.phase === 'hidden',
  };
}

export function createMenuViewTransition(options: MenuViewTransitionOptions = {}): MenuViewTransitionApi {
  const input = createState<MenuViewTransitionState>(DEFAULT_MENU_VIEW_TRANSITION_STATE);
  const waitForAnimations =
    options.waitForAnimations ??
    ((element: HTMLElement) => waitForElementAnimations(element, { includeCSSTransitions: true }));
  const focusFirstItem = options.focusFirstItem ?? focusFirstMenuViewItem;

  let element: HTMLElement | null = null;
  let transitionId = 0;
  let raf1 = 0;
  let raf2 = 0;
  let focusRaf = 0;
  let scheduledTransitionId = 0;
  let scheduledPhase: MenuViewTransitionPhase | null = null;

  function cancelFrames(): void {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
    cancelAnimationFrame(focusRaf);
    raf1 = 0;
    raf2 = 0;
    focusRaf = 0;
    scheduledTransitionId = 0;
    scheduledPhase = null;
  }

  function scheduleCurrentPhase(): void {
    const { phase } = input.current;

    if (!element || (phase !== 'entering' && phase !== 'exiting')) return;
    if (scheduledTransitionId === transitionId && scheduledPhase === phase) return;

    scheduledTransitionId = transitionId;
    scheduledPhase = phase;

    if (phase === 'entering') {
      scheduleEnterComplete(transitionId, element);
    } else {
      scheduleExitComplete(transitionId, element);
    }
  }

  function scheduleEnterComplete(currentTransitionId: number, currentElement: HTMLElement): void {
    forceLayout(currentElement);

    raf1 = requestAnimationFrame(() => {
      if (currentTransitionId !== transitionId) return;

      raf2 = requestAnimationFrame(() => {
        if (currentTransitionId !== transitionId) return;

        forceLayout(currentElement);
        input.patch({ phase: 'active' });

        focusRaf = requestAnimationFrame(() => {
          if (currentTransitionId !== transitionId) return;
          focusFirstItem(currentElement);
        });

        waitForAnimations(currentElement).then(
          () => {
            if (currentTransitionId !== transitionId) return;
            input.patch({ transitioning: false });
          },
          () => {
            if (currentTransitionId !== transitionId) return;
            input.patch({ transitioning: false });
          }
        );
      });
    });
  }

  function scheduleExitComplete(currentTransitionId: number, currentElement: HTMLElement): void {
    forceLayout(currentElement);

    raf1 = requestAnimationFrame(async () => {
      await waitForAnimations(currentElement);

      if (currentTransitionId !== transitionId) return;

      const { direction, triggerId } = input.current;

      input.patch({
        phase: 'hidden',
        triggerId: null,
        transitioning: false,
      });

      if (direction === 'back') {
        options.restoreFocus?.(triggerId);
      }
    });
  }

  function startEnter(direction: MenuViewTransitionDirection, triggerId: string | null): void {
    transitionId++;
    cancelFrames();

    input.patch({
      phase: 'entering',
      direction,
      triggerId,
      transitioning: true,
    });
    scheduleCurrentPhase();
  }

  function startExit(direction: MenuViewTransitionDirection): void {
    transitionId++;
    cancelFrames();

    input.patch({
      phase: 'exiting',
      direction,
      transitioning: true,
    });
    scheduleCurrentPhase();
  }

  function setElement(nextElement: HTMLElement | null): void {
    if (element === nextElement) return;

    element = nextElement;
    scheduleCurrentPhase();
  }

  function sync({ active, direction, triggerId = null }: MenuViewTransitionSyncOptions): void {
    const { phase } = input.current;

    if (active && (phase === 'hidden' || phase === 'exiting')) {
      startEnter(direction, triggerId);
    } else if (!active && (phase === 'active' || phase === 'entering')) {
      startExit(direction);
    }
  }

  function destroy(): void {
    transitionId++;
    cancelFrames();
    element = null;
    input.patch(DEFAULT_MENU_VIEW_TRANSITION_STATE);
  }

  return {
    input,
    setElement,
    sync,
    destroy,
  };
}
