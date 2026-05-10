import { CaptionsMenuCore, CaptionsMenuDataAttrs } from '@videojs/core';
import {
  applyElementProps,
  applyStateDataAttrs,
  logMissingFeature,
  type MenuApi,
  selectTextTrack,
} from '@videojs/core/dom';
import type { PropertyDeclarationMap, PropertyValues } from '@videojs/element';
import { ContextConsumer } from '@videojs/element/context';

import { playerContext } from '../../player/context';
import { PlayerController } from '../../player/player-controller';
import { MediaElement } from '../media-element';
import { type MenuContextValue, menuContext } from '../menu/context';

export class CaptionsMenuTriggerElement extends MediaElement {
  static readonly tagName = 'media-captions-menu-trigger';

  static override properties = {
    label: { type: String },
    offLabel: { type: String, attribute: 'off-label' },
    disabled: { type: Boolean },
    commandfor: { type: String },
  } satisfies PropertyDeclarationMap<'label' | 'offLabel' | 'disabled' | 'commandfor'>;

  label = '';
  offLabel = CaptionsMenuCore.defaultProps.offLabel;
  disabled = false;
  commandfor: string | undefined = undefined;
  formatTrack = CaptionsMenuCore.defaultProps.formatTrack;

  readonly #core = new CaptionsMenuCore();
  readonly #mediaState = new PlayerController(this, playerContext, selectTextTrack);
  readonly #menuCtx = new ContextConsumer(this, { context: menuContext, subscribe: true });

  #disconnect: AbortController | null = null;
  #registeredMenu: MenuApi | null = null;
  #cleanupRegistration: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.destroyed) return;

    this.#disconnect = new AbortController();
    applyElementProps(
      this,
      {
        onClick: this.#handleClick,
        onKeyDown: this.#handleKeyDown,
        onPointerdown: this.#handlePointerDown,
        onPointerenter: this.#handlePointerEnter,
      },
      { signal: this.#disconnect.signal }
    );

    if (__DEV__ && !this.#mediaState.value && this.#mediaState.displayName) {
      logMissingFeature(this.localName, this.#mediaState.displayName);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#cleanupSubmenuRegistration();
    this.#disconnect?.abort();
    this.#disconnect = null;
  }

  /** Returns the trigger's current label derived from media state. */
  getLabel(): string | undefined {
    return this.#core.state.current.label || undefined;
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    const media = this.#mediaState.value;
    if (!media) return;

    this.#core.setProps(this);
    this.#core.setMedia(media);
    const state = this.#core.getState();
    const menuCtx = this.#menuCtx.value ?? null;
    const isSubmenuTrigger = Boolean(menuCtx && this.commandfor && state.availability === 'available');

    this.#syncLabel(state);
    this.#syncSubmenuRegistration(isSubmenuTrigger ? menuCtx : null);

    if (menuCtx && this.commandfor) {
      const topEntry = menuCtx.navigation.stack[menuCtx.navigation.stack.length - 1];

      applyElementProps(this, {
        ...this.#core.getAttrs(state),
        role: 'menuitem',
        hidden: state.availability !== 'available',
        'aria-haspopup': 'menu',
        'aria-expanded': topEntry?.menuId === this.commandfor ? 'true' : 'false',
        'data-has-submenu': '',
      });
    } else {
      applyElementProps(this, {
        role: 'button',
        tabIndex: 0,
        hidden: undefined,
        'data-has-submenu': undefined,
        ...this.#core.getAttrs(state),
      });
    }

    applyStateDataAttrs(this, state, CaptionsMenuDataAttrs);
  }

  #handleClick = (event: MouseEvent): void => {
    const menuCtx = this.#menuCtx.value ?? null;

    if (menuCtx && this.commandfor) {
      if (event.button !== 0) return;

      if (!this.#mediaState.value || this.#core.state.current.disabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      menuCtx.menu.push(this.commandfor, this.id);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (this.#mediaState.value && !this.#core.state.current.disabled) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  };

  #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.target !== event.currentTarget) return;

    const menuCtx = this.#menuCtx.value ?? null;

    if (menuCtx && this.commandfor) {
      if (!this.#mediaState.value || this.#core.state.current.disabled) {
        if (event.key !== 'Tab') event.preventDefault();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopImmediatePropagation();
        menuCtx.menu.push(this.commandfor, this.id);
      }
      return;
    }

    if (!this.#mediaState.value || this.#core.state.current.disabled) {
      if (event.key !== 'Tab') event.preventDefault();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.click();
    }
  };

  #handlePointerDown = (event: PointerEvent): void => {
    const menuCtx = this.#menuCtx.value ?? null;

    if (event.button !== 0 || !menuCtx || !this.commandfor || this.#core.state.current.disabled) return;

    menuCtx.menu.push(this.commandfor, this.id);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  #handlePointerEnter = (): void => {
    const menuCtx = this.#menuCtx.value ?? null;

    if (!menuCtx || !this.commandfor || this.#core.state.current.disabled) return;

    menuCtx.menu.highlight(this, { focus: false });
  };

  #syncLabel(state: CaptionsMenuCore.State): void {
    const labelPart = this.querySelector<HTMLElement>('[data-part~="label"]');

    if (!labelPart) return;

    const selectedTrack = this.#core.getSelectedTrack(state);
    labelPart.textContent = selectedTrack ? this.#core.getTrackLabel(selectedTrack) : this.#core.getOffLabel();
  }

  #syncSubmenuRegistration(menuCtx: MenuContextValue | null): void {
    if (!menuCtx) {
      this.#cleanupSubmenuRegistration();
      return;
    }

    if (this.#registeredMenu === menuCtx.menu) return;

    this.#cleanupSubmenuRegistration();
    this.#registeredMenu = menuCtx.menu;
    this.#cleanupRegistration = menuCtx.menu.registerItem(this);
  }

  #cleanupSubmenuRegistration(): void {
    this.#cleanupRegistration?.();
    this.#cleanupRegistration = null;
    this.#registeredMenu = null;
  }
}

export namespace CaptionsMenuTriggerElement {
  export type State = CaptionsMenuCore.State;
}
