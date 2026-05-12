import {
  afterDoubleAnimationFrame,
  type DoubleAnimationFrameHandles,
  resetDoubleAnimationFrameHandles,
  resolveTranslateXPercent,
  scheduleDoubleAnimationFrame,
} from '@videojs/utils/dom';
import { getTransitionStyleAttrs, TransitionDataAttrs, type TransitionStyleAttrs } from '../../../core/ui/transition';
import { forceLayout } from '../../utils/layout';
import { waitForAnimations } from '../transition';
import type { MenuViewTransitionDirection, MenuViewTransitionState } from './create-menu-view-transition';

export interface MenuViewportTransitionOptions {
  minWidth?: number;
}

export interface MenuViewportAttrs {
  'data-menu-viewport': '';
}

export interface MenuRootViewAttrs extends TransitionStyleAttrs {
  'data-menu-view': '';
  'data-menu-view-id': 'root';
  'data-direction': MenuViewTransitionDirection;
  'data-open': '';
  hidden: false;
}

export interface MenuViewAttrs extends TransitionStyleAttrs {
  'data-menu-view': '';
  'data-menu-view-id'?: string;
  'data-direction': MenuViewTransitionDirection;
  'data-open': '';
  hidden: false;
}

export interface MenuViewAttrsOptions {
  id?: string;
  root?: boolean;
}

export interface MenuViewportSyncOptions {
  activeViewId?: string | null;
  view?: HTMLElement | null;
  viewState?: MenuViewTransitionState | null;
}

interface MenuViewSize {
  width: number;
  height: number;
}

interface InlineStyleSnapshotEntry {
  property: string;
  value: string;
  priority: string;
}

interface MenuViewMeasureOptions {
  open?: boolean;
}

interface PendingMenuViewTransition {
  entering: HTMLElement;
  fromView: HTMLElement;
  fromSize: MenuViewSize;
  toSize: MenuViewSize;
}

interface MenuViewportTransitionState {
  pending: PendingMenuViewTransition | null;
  phaseKeys: WeakMap<HTMLElement, string>;
  rootSize: MenuViewSize | null;
  rootTransitionId: number;
  rootStartingRafs: DoubleAnimationFrameHandles;
  viewportTransitionId: number;
  viewportTransitioning: boolean;
}

const DEFAULT_MENU_VIEWPORT_MIN_WIDTH = 160;
const MENU_VIEW_ATTR = 'data-menu-view';
const MENU_VIEW_ID_ATTR = 'data-menu-view-id';
const MENU_ROOT_VIEW_ID = 'root';
const MENU_VIEW_DIRECTION_ATTR = 'data-direction';
const MENU_VIEWPORT_ATTR = 'data-menu-viewport';
const MENU_WIDTH_VAR = '--media-menu-width';
const MENU_HEIGHT_VAR = '--media-menu-height';
const MENU_VIEW_EXIT_COMPLETE_THRESHOLD = 99;
const MENU_VIEW_EXIT_OPACITY_THRESHOLD = 0.01;
const MENU_VIEW_MEASURE_STYLE_PROPERTIES = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'max-width',
];

const viewportTransitionStates = new WeakMap<HTMLElement, MenuViewportTransitionState>();

export function getMenuViewportAttrs(): MenuViewportAttrs {
  return {
    'data-menu-viewport': '',
  };
}

export function getMenuViewAttrs({ id, root = false }: MenuViewAttrsOptions = {}): MenuViewAttrs {
  const viewId = id ?? (root ? MENU_ROOT_VIEW_ID : undefined);

  return {
    'data-menu-view': '',
    ...(viewId && { [MENU_VIEW_ID_ATTR]: viewId }),
    'data-direction': 'forward',
    ...getTransitionStyleAttrs({
      transitionStarting: false,
      transitionEnding: false,
    }),
    'data-open': '',
    hidden: false,
  };
}

export function getMenuRootViewAttrs(): MenuRootViewAttrs {
  return getMenuViewAttrs({ root: true }) as MenuRootViewAttrs;
}

function getViewportTransitionState(content: HTMLElement): MenuViewportTransitionState {
  let state = viewportTransitionStates.get(content);

  if (!state) {
    state = {
      pending: null,
      phaseKeys: new WeakMap(),
      rootSize: null,
      rootTransitionId: 0,
      rootStartingRafs: { first: 0, second: 0 },
      viewportTransitionId: 0,
      viewportTransitioning: false,
    };
    viewportTransitionStates.set(content, state);
  }

  return state;
}

export function getMenuViewportElement(content: HTMLElement | null): HTMLElement | null {
  if (!content) return null;

  return content.querySelector<HTMLElement>(`:scope > [${MENU_VIEWPORT_ATTR}]`) ?? content;
}

function getViewportElement(content: HTMLElement, view?: HTMLElement | null): HTMLElement {
  const viewport = getMenuViewportElement(content);

  if (viewport && viewport !== content) {
    return viewport;
  }

  if (view?.parentElement && content.contains(view.parentElement)) {
    return view.parentElement;
  }

  return content;
}

function getRootViewElement(viewport: HTMLElement): HTMLElement | null {
  return viewport.querySelector<HTMLElement>(`:scope > [${MENU_VIEW_ID_ATTR}="${MENU_ROOT_VIEW_ID}"]`);
}

function isRootViewElement(view: HTMLElement): boolean {
  return view.getAttribute(MENU_VIEW_ID_ATTR) === MENU_ROOT_VIEW_ID;
}

function getActiveMenuViewElement(viewport: HTMLElement, exclude?: HTMLElement | null): HTMLElement | null {
  return (
    Array.from(viewport.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child !== exclude &&
        child.hasAttribute(MENU_VIEW_ATTR) &&
        !isRootViewElement(child) &&
        !child.hidden &&
        !child.hasAttribute(TransitionDataAttrs.transitionEnding)
    ) ?? null
  );
}

function resolveMinWidth(options: MenuViewportTransitionOptions | undefined): number {
  return options?.minWidth ?? DEFAULT_MENU_VIEWPORT_MIN_WIDTH;
}

function snapshotInlineStyle(element: HTMLElement): InlineStyleSnapshotEntry[] {
  return MENU_VIEW_MEASURE_STYLE_PROPERTIES.map((property) => ({
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  }));
}

function restoreInlineStyle(element: HTMLElement, snapshot: InlineStyleSnapshotEntry[]): void {
  for (const { property, value, priority } of snapshot) {
    if (value) {
      element.style.setProperty(property, value, priority);
    } else {
      element.style.removeProperty(property);
    }
  }
}

function measureMenuView(view: HTMLElement, minWidth: number, options: MenuViewMeasureOptions = {}): MenuViewSize {
  const snapshot = snapshotInlineStyle(view);
  const wasHidden = view.hidden;
  const wasOpen = view.hasAttribute('data-open');

  try {
    if (options.open) {
      setMenuViewOpen(view, true);
    }

    view.hidden = false;
    view.style.setProperty('display', 'block');
    view.style.setProperty('position', 'absolute');
    view.style.setProperty('top', '0px');
    view.style.setProperty('right', 'auto');
    view.style.setProperty('bottom', 'auto');
    view.style.setProperty('left', '0px');
    view.style.setProperty('width', 'max-content');
    view.style.setProperty('height', 'auto');
    view.style.setProperty('min-width', `${minWidth}px`);
    view.style.setProperty('max-width', 'none');
    forceLayout(view);

    const rect = view.getBoundingClientRect();

    return {
      width: Math.ceil(Math.max(minWidth, rect.width, view.scrollWidth)),
      height: Math.ceil(Math.max(rect.height, view.scrollHeight)),
    };
  } finally {
    view.hidden = wasHidden;

    if (options.open && !wasOpen) {
      setMenuViewOpen(view, false);
    }

    restoreInlineStyle(view, snapshot);
    forceLayout(view);
  }
}

function setViewportSize(content: HTMLElement, size: MenuViewSize): void {
  if (size.width > 0) {
    content.style.setProperty(MENU_WIDTH_VAR, `${size.width}px`);
  }

  if (size.height > 0) {
    content.style.setProperty(MENU_HEIGHT_VAR, `${size.height}px`);
  }
}

function isMenuViewSizeValid(size: MenuViewSize): boolean {
  return size.width > 0 && size.height > 0;
}

function getCurrentViewportSize(content: HTMLElement): MenuViewSize | null {
  const width = Number.parseFloat(content.style.getPropertyValue(MENU_WIDTH_VAR));
  const height = Number.parseFloat(content.style.getPropertyValue(MENU_HEIGHT_VAR));

  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  const size = { width, height };

  return isMenuViewSizeValid(size) ? size : null;
}

function measureRootMenuView(
  content: HTMLElement,
  rootView: HTMLElement,
  state: MenuViewportTransitionState,
  minWidth: number
): MenuViewSize {
  const size = measureMenuView(rootView, minWidth, { open: true });

  if (isMenuViewSizeValid(size)) {
    state.rootSize = size;
    return size;
  }

  return state.rootSize ?? getCurrentViewportSize(content) ?? size;
}

function setMenuViewOpen(view: HTMLElement, open: boolean): void {
  if (open) {
    view.setAttribute('data-open', '');
  } else {
    view.removeAttribute('data-open');
  }
}

function clearMenuViewTransitionStyleAttrs(view: HTMLElement): void {
  view.removeAttribute(TransitionDataAttrs.transitionStarting);
  view.removeAttribute(TransitionDataAttrs.transitionEnding);
}

function clearMenuViewTransitionAttrs(view: HTMLElement): void {
  clearMenuViewTransitionStyleAttrs(view);
  view.removeAttribute(TransitionDataAttrs.transitioning);
}

function cancelRootViewTransitionFrames(state: MenuViewportTransitionState): void {
  cancelAnimationFrame(state.rootStartingRafs.first);
  cancelAnimationFrame(state.rootStartingRafs.second);
  resetDoubleAnimationFrameHandles(state.rootStartingRafs);
}

function startRootViewTransition(
  rootView: HTMLElement,
  state: MenuViewportTransitionState,
  phase: 'entering' | 'exiting',
  direction: MenuViewTransitionDirection
): number {
  state.rootTransitionId += 1;
  cancelRootViewTransitionFrames(state);
  clearMenuViewTransitionStyleAttrs(rootView);
  rootView.setAttribute(MENU_VIEW_DIRECTION_ATTR, direction);
  rootView.setAttribute(TransitionDataAttrs.transitioning, '');
  rootView.setAttribute(
    phase === 'entering' ? TransitionDataAttrs.transitionStarting : TransitionDataAttrs.transitionEnding,
    ''
  );
  return state.rootTransitionId;
}

function resetRootViewTransition(rootView: HTMLElement, state: MenuViewportTransitionState): void {
  state.rootTransitionId += 1;
  cancelRootViewTransitionFrames(state);
  clearMenuViewTransitionAttrs(rootView);
}

function startViewportTransition(content: HTMLElement, state: MenuViewportTransitionState): number {
  state.viewportTransitionId += 1;
  state.viewportTransitioning = true;
  content.setAttribute(TransitionDataAttrs.transitioning, '');
  return state.viewportTransitionId;
}

function clearViewportTransition(
  content: HTMLElement,
  state: MenuViewportTransitionState,
  transitionId?: number
): void {
  if (transitionId !== undefined && state.viewportTransitionId !== transitionId) return;
  if (!state.viewportTransitioning) return;

  state.viewportTransitioning = false;
  content.removeAttribute(TransitionDataAttrs.transitioning);
}

function scheduleViewportTransitionAttrsClear(
  content: HTMLElement,
  state: MenuViewportTransitionState,
  transitionId: number
): void {
  afterDoubleAnimationFrame(
    () => state.viewportTransitionId === transitionId,
    () => {
      waitForAnimations(content, { includeCSSTransitions: true }).then(() => {
        clearViewportTransition(content, state, transitionId);
      });
    }
  );
}

function scheduleRootViewTransitionAttrsClear(
  rootView: HTMLElement,
  state: MenuViewportTransitionState,
  transitionId: number
): void {
  function clear(): void {
    if (state.rootTransitionId !== transitionId) return;

    clearMenuViewTransitionAttrs(rootView);
  }

  function clearWhenExitIsVisuallyComplete(): void {
    if (state.rootTransitionId !== transitionId || !rootView.hasAttribute(TransitionDataAttrs.transitionEnding)) return;

    if (isMenuViewExitVisuallyComplete(rootView)) {
      clear();
      return;
    }

    requestAnimationFrame(clearWhenExitIsVisuallyComplete);
  }

  afterDoubleAnimationFrame(
    () => state.rootTransitionId === transitionId,
    () => {
      clearWhenExitIsVisuallyComplete();

      waitForAnimations(rootView, { includeCSSTransitions: true }).then(() => {
        clear();
      });
    }
  );
}

function isMenuViewExitVisuallyComplete(view: HTMLElement): boolean {
  const style = getComputedStyle(view);
  const opacity = Number.parseFloat(style.opacity);

  if (Number.isFinite(opacity) && opacity <= MENU_VIEW_EXIT_OPACITY_THRESHOLD) {
    return true;
  }

  const translate = resolveTranslateXPercent(style.getPropertyValue('translate'), view.getBoundingClientRect().width);

  return translate !== null && Math.abs(translate) >= MENU_VIEW_EXIT_COMPLETE_THRESHOLD;
}

function scheduleRootViewStartingStyleClear(
  rootView: HTMLElement,
  state: MenuViewportTransitionState,
  transitionId: number
): void {
  scheduleDoubleAnimationFrame(
    state.rootStartingRafs,
    () => state.rootTransitionId === transitionId,
    () => {
      rootView.removeAttribute(TransitionDataAttrs.transitionStarting);
    }
  );
}

function prepareEnteringMenuView(
  content: HTMLElement,
  rootView: HTMLElement,
  entering: HTMLElement,
  state: MenuViewportTransitionState,
  options?: MenuViewportTransitionOptions
): void {
  const minWidth = resolveMinWidth(options);
  const viewport = getViewportElement(content, entering);
  const fromView = getActiveMenuViewElement(viewport, entering) ?? rootView;
  const fromSize = measureMenuView(fromView, minWidth);
  const toSize = measureMenuView(entering, minWidth);

  state.pending = { entering, fromView, fromSize, toSize };

  if (isRootViewElement(fromView)) {
    setMenuViewOpen(rootView, true);
  }

  startViewportTransition(content, state);
  setViewportSize(content, fromSize);
  forceLayout(content);
}

function startEnteringMenuView(
  content: HTMLElement,
  rootView: HTMLElement,
  entering: HTMLElement,
  state: MenuViewportTransitionState,
  direction: MenuViewTransitionDirection,
  options?: MenuViewportTransitionOptions
): void {
  const minWidth = resolveMinWidth(options);
  const viewport = getViewportElement(content, entering);
  const fromView = getActiveMenuViewElement(viewport, entering) ?? rootView;
  const current =
    state.pending?.entering === entering
      ? state.pending
      : {
          entering,
          fromView,
          fromSize: measureMenuView(fromView, minWidth),
          toSize: measureMenuView(entering, minWidth),
        };

  state.pending = null;

  const viewportTransitionId = startViewportTransition(content, state);
  setViewportSize(content, current.fromSize);
  forceLayout(current.fromView);
  let rootTransitionId: number | null = null;
  if (isRootViewElement(current.fromView)) {
    rootTransitionId = startRootViewTransition(rootView, state, 'exiting', direction);
  }
  setMenuViewOpen(rootView, false);
  forceLayout(current.fromView);
  setViewportSize(content, current.toSize);
  scheduleViewportTransitionAttrsClear(content, state, viewportTransitionId);
  if (rootTransitionId !== null) {
    scheduleRootViewTransitionAttrsClear(rootView, state, rootTransitionId);
  }
}

function startExitingMenuView(
  content: HTMLElement,
  rootView: HTMLElement,
  exiting: HTMLElement,
  transitionState: MenuViewportTransitionState,
  direction: MenuViewTransitionDirection,
  options?: MenuViewportTransitionOptions
): void {
  transitionState.pending = null;

  const viewport = getViewportElement(content, exiting);
  const hasActiveSiblingView = getActiveMenuViewElement(viewport, exiting) !== null;

  if (hasActiveSiblingView && exiting.hasAttribute(TransitionDataAttrs.transitionEnding)) {
    return;
  }

  const minWidth = resolveMinWidth(options);
  const fromSize = measureMenuView(exiting, minWidth);
  const toSize = measureRootMenuView(content, rootView, transitionState, minWidth);
  const viewportTransitionId = startViewportTransition(content, transitionState);
  const rootTransitionId = startRootViewTransition(rootView, transitionState, 'entering', direction);

  setViewportSize(content, fromSize);
  setMenuViewOpen(rootView, false);
  forceLayout(rootView);
  setMenuViewOpen(rootView, true);
  forceLayout(rootView);
  setViewportSize(content, toSize);
  scheduleRootViewStartingStyleClear(rootView, transitionState, rootTransitionId);
  scheduleViewportTransitionAttrsClear(content, transitionState, viewportTransitionId);
  scheduleRootViewTransitionAttrsClear(rootView, transitionState, rootTransitionId);
}

function syncRootMenuView(
  content: HTMLElement | null,
  hasActiveChildView: boolean,
  options?: MenuViewportTransitionOptions
): void {
  if (!content) return;

  const transitionState = getViewportTransitionState(content);

  if (hasActiveChildView) {
    if (transitionState.viewportTransitioning) {
      content.setAttribute(TransitionDataAttrs.transitioning, '');
    }
    return;
  }

  const viewport = getViewportElement(content);
  const rootView = getRootViewElement(viewport);

  if (!rootView || getActiveMenuViewElement(viewport)) return;

  const size = measureRootMenuView(content, rootView, transitionState, resolveMinWidth(options));

  clearViewportTransition(content, transitionState);
  resetRootViewTransition(rootView, transitionState);
  setMenuViewOpen(rootView, true);
  setViewportSize(content, size);
}

export function syncMenuViewport(
  content: HTMLElement | null,
  sync: MenuViewportSyncOptions = {},
  options?: MenuViewportTransitionOptions
): void {
  if (!content) return;

  const { activeViewId = null, view = null, viewState = null } = sync;

  if (!view || !viewState) {
    syncRootMenuView(content, activeViewId !== null, options);
    return;
  }

  const viewport = getViewportElement(content, view);
  const rootView = getRootViewElement(viewport);

  if (!rootView) return;

  const state = getViewportTransitionState(content);
  const phaseKey = `${viewState.phase}:${viewState.direction}`;

  if (state.phaseKeys.get(view) === phaseKey) return;

  state.phaseKeys.set(view, phaseKey);

  if (viewState.phase === 'hidden') {
    state.phaseKeys.delete(view);
    syncRootMenuView(content, getActiveMenuViewElement(viewport, view) !== null, options);
    return;
  }

  if (viewState.phase === 'entering') {
    prepareEnteringMenuView(content, rootView, view, state, options);
    return;
  }

  if (viewState.phase === 'active') {
    startEnteringMenuView(content, rootView, view, state, viewState.direction, options);
    return;
  }

  startExitingMenuView(content, rootView, view, state, viewState.direction, options);
}

export function syncMenuViewRoot(
  content: HTMLElement | null,
  hasActiveChildView: boolean,
  options?: MenuViewportTransitionOptions
): void {
  syncMenuViewport(content, { activeViewId: hasActiveChildView ? 'active' : null }, options);
}

export function syncMenuViewTransition(
  content: HTMLElement | null,
  view: HTMLElement | null,
  viewState: MenuViewTransitionState,
  options?: MenuViewportTransitionOptions
): void {
  syncMenuViewport(content, { view, viewState }, options);
}
