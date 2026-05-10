import { PlaybackRateMenuCore, PlaybackRateMenuDataAttrs } from '@videojs/core';
import {
  applyElementProps,
  applyStateDataAttrs,
  logMissingFeature,
  type MenuApi,
  selectPlaybackRate,
} from '@videojs/core/dom';
import type { PropertyDeclarationMap, PropertyValues } from '@videojs/element';
import { ContextConsumer } from '@videojs/element/context';

import { playerContext } from '../../player/context';
import { PlayerController } from '../../player/player-controller';
import { MediaElement } from '../media-element';
import { type MenuContextValue, menuContext } from '../menu/context';

export class PlaybackRateMenuTriggerElement extends MediaElement {
  static readonly tagName = 'media-playback-rate-menu-trigger';

  static override properties = {
    label: { type: String },
    disabled: { type: Boolean },
    commandfor: { type: String },
  } satisfies PropertyDeclarationMap<'label' | 'disabled' | 'commandfor'>;

  label = '';
  disabled = false;
  commandfor: string | undefined = undefined;
  formatRate = PlaybackRateMenuCore.defaultProps.formatRate;

  readonly #core = new PlaybackRateMenuCore();
  readonly #mediaState = new PlayerController(this, playerContext, selectPlaybackRate);
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
    const isSubmenuTrigger = Boolean(menuCtx && this.commandfor);

    this.#syncLabel(this.#core.getRateLabel(state.rate));
    this.#syncSubmenuRegistration(isSubmenuTrigger ? menuCtx : null);

    if (isSubmenuTrigger && menuCtx && this.commandfor) {
      const topEntry = menuCtx.navigation.stack[menuCtx.navigation.stack.length - 1];

      applyElementProps(this, {
        ...this.#core.getAttrs(state),
        role: 'menuitem',
        'aria-haspopup': 'menu',
        'aria-expanded': topEntry?.menuId === this.commandfor ? 'true' : 'false',
        'data-has-submenu': '',
      });
    } else {
      applyElementProps(this, {
        role: 'button',
        tabIndex: 0,
        'data-has-submenu': undefined,
        ...this.#core.getAttrs(state),
      });
    }

    applyStateDataAttrs(this, state, PlaybackRateMenuDataAttrs);
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

  #syncLabel(label: string): void {
    const labelPart = this.querySelector<HTMLElement>('[data-part~="label"]');

    if (labelPart) labelPart.textContent = label;
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

export namespace PlaybackRateMenuTriggerElement {
  export type State = PlaybackRateMenuCore.State;
}
