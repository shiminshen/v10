import { listen } from '@videojs/utils/dom';
import type { MediaVolumeState } from '../../../core/media/state';
import type { MediaFeatureAvailability } from '../../../core/media/types';
import { definePlayerFeature } from '../../feature';
import { isMediaVolumeCapable } from '../../media/predicate';

/** Volume to restore when unmuting at zero. */
const UNMUTE_VOLUME = 0.25;

const VOLUME_PREF_KEY = 'videojs-pref-volume';
const MUTED_PREF_KEY = 'videojs-pref-muted';

export const volumeFeature = definePlayerFeature({
  name: 'volume',
  state: ({ target }): MediaVolumeState => ({
    volume: 1,
    muted: false,
    volumeAvailability: 'unavailable',

    setVolume(volume: number) {
      const { media } = target();
      if (!isMediaVolumeCapable(media)) return 0;
      const clamped = Math.max(0, Math.min(1, volume));

      if (clamped > 0 && media.muted) {
        media.muted = false;
      }

      media.volume = clamped;
      return media.volume;
    },

    toggleMuted() {
      const { media } = target();
      if (!isMediaVolumeCapable(media)) return false;
      const effectivelyMuted = media.muted || media.volume === 0;

      if (effectivelyMuted) {
        media.muted = false;
        if (media.volume === 0) media.volume = UNMUTE_VOLUME;
      } else {
        media.muted = true;
      }

      return media.muted;
    },
  }),

  attach({ target, signal, set }) {
    const { media } = target;

    if (!isMediaVolumeCapable(media)) return;

    set({ volumeAvailability: canSetVolume() });

    const storedVolume = readStoredVolume();
    if (storedVolume !== null) media.volume = storedVolume;
    const storedMuted = readStoredMuted();
    if (storedMuted !== null) media.muted = storedMuted;

    const sync = () => set({ volume: media.volume, muted: media.muted });
    sync();

    const persist = () => {
      sync();
      writeStoredVolume(media.volume);
      writeStoredMuted(media.muted);
    };

    listen(media, 'volumechange', persist, { signal });
  },
});

/** Check if volume can be programmatically set (fails on iOS Safari). */
function canSetVolume(): MediaFeatureAvailability {
  const video = document.createElement('video');
  try {
    video.volume = 0.5;
    return video.volume === 0.5 ? 'available' : 'unsupported';
  } catch {
    return 'unsupported';
  }
}

function readStoredVolume(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(VOLUME_PREF_KEY);
    if (raw == null) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readStoredMuted(): boolean | null {
  try {
    const raw = globalThis.localStorage?.getItem(MUTED_PREF_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredVolume(volume: number): void {
  try {
    globalThis.localStorage?.setItem(VOLUME_PREF_KEY, String(volume));
  } catch {
    /* localStorage unavailable (private mode, SSR, quota exceeded) */
  }
}

function writeStoredMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTED_PREF_KEY, muted ? 'true' : 'false');
  } catch {
    /* localStorage unavailable (private mode, SSR, quota exceeded) */
  }
}
