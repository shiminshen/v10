import { listen } from '@videojs/utils/dom';
import type { MediaVolumeState } from '../../../core/media/state';
import type { MediaFeatureAvailability } from '../../../core/media/types';
import { definePlayerFeature } from '../../feature';
import { isMediaVolumeCapable } from '../../media/predicate';

/** Volume to restore when unmuting at zero with no prior non-zero volume. */
const UNMUTE_VOLUME = 0.25;

export const volumeFeature = definePlayerFeature({
  name: 'volume',
  state: ({ target, get }): MediaVolumeState => ({
    volume: 1,
    muted: false,
    volumeAvailability: 'unavailable',
    lastVolume: 0,

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
        if (media.volume === 0) {
          const lastVolume = get().lastVolume as number;
          media.volume = lastVolume > 0 ? lastVolume : UNMUTE_VOLUME;
        }
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

    const sync = () => {
      const next: Partial<MediaVolumeState> = { volume: media.volume, muted: media.muted };
      if (media.volume > 0) next.lastVolume = media.volume;
      set(next);
    };
    sync();

    listen(media, 'volumechange', sync, { signal });
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
