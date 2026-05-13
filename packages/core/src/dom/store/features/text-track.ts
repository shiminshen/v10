import { findTrackElement, getTextTrackList, listen } from '@videojs/utils/dom';

import type { MediaTextCue, MediaTextTrack, MediaTextTrackState } from '../../../core/media/state';
import type { MediaTextTrackCapability, TextTrackLike } from '../../../core/media/types';
import { definePlayerFeature } from '../../feature';
import { isMediaTextTrackCapable, isQuerySelectorAllCapable } from '../../media/predicate';

const CAPTION_LANG_PREF_KEY = 'videojs-pref-caption-language';

export const textTrackFeature = definePlayerFeature({
  name: 'textTrack',
  state: ({ target }): MediaTextTrackState => ({
    chaptersCues: [],
    thumbnailCues: [],
    thumbnailTrackSrc: null,
    textTrackList: [],
    subtitlesShowing: false,
    toggleSubtitles(forceShow?: boolean) {
      const { media } = target();
      if (!isMediaTextTrackCapable(media)) return false;

      const subtitlesTracks = getTextTrackList(
        media,
        (track) => track.kind === 'subtitles' || track.kind === 'captions'
      );
      if (!subtitlesTracks.length) return false;

      const showing = subtitlesTracks.some((track) => track.mode === 'showing');
      const nextShowing = forceShow ?? !showing;

      for (const track of subtitlesTracks) {
        track.mode = nextShowing ? 'showing' : 'disabled';
      }

      return nextShowing;
    },
  }),

  attach({ target, signal, set }) {
    const { media } = target;

    if (!isMediaTextTrackCapable(media)) return;

    let trackCleanup: AbortController | null = null;
    let hydrated = false;

    const sync = () => {
      trackCleanup?.abort();
      trackCleanup = new AbortController();

      let chaptersTrack: TextTrackLike | null = null;
      let thumbnailTrack: TextTrackLike | null = null;
      const textTrackList: MediaTextTrack[] = [];
      let subtitlesShowing = false;

      for (let i = 0; i < media.textTracks.length; i++) {
        const track = media.textTracks[i]!;
        if (!chaptersTrack && track.kind === 'chapters') chaptersTrack = track;
        if (!thumbnailTrack && track.kind === 'metadata' && track.label === 'thumbnails') thumbnailTrack = track;

        textTrackList.push({
          kind: track.kind as TextTrackKind,
          label: track.label,
          language: track.language,
          mode: track.mode,
        });

        if ((track.kind === 'captions' || track.kind === 'subtitles') && track.mode === 'showing') {
          subtitlesShowing = true;
        }
      }

      // VTTCue extends TextTrackCue with `text` — cast via `unknown` since
      // the CueList is typed as TextTrackCue which doesn't expose `text`.
      const chaptersCues: MediaTextCue[] = chaptersTrack?.cues
        ? (Array.from(chaptersTrack.cues) as unknown as MediaTextCue[])
        : [];
      const thumbnailCues: MediaTextCue[] = thumbnailTrack?.cues
        ? (Array.from(thumbnailTrack.cues) as unknown as MediaTextCue[])
        : [];

      let thumbnailTrackSrc: string | null = null;
      if (thumbnailTrack) {
        const el = findTrackElement(media, thumbnailTrack);
        thumbnailTrackSrc = el?.src ?? null;
      }

      // Listen for <track> load events on tracks that don't have cues yet.
      // `addtrack` fires before cues are parsed — we need the `load` event
      // on the <track> element to know when cues are ready.
      const tracks = (isQuerySelectorAllCapable<'track'>(media) && media.querySelectorAll('track')) || [];
      const shadowTracks = (media instanceof HTMLElement && media.shadowRoot?.querySelectorAll('track')) || [];

      for (const trackEl of [...tracks, ...shadowTracks]) {
        if (!trackEl.track?.cues?.length) {
          listen(trackEl, 'load', sync, { signal: trackCleanup.signal });
        }
      }

      set({ chaptersCues, thumbnailCues, thumbnailTrackSrc, textTrackList, subtitlesShowing });

      const showingLanguage = findShowingCaptionLanguage(media);
      if (showingLanguage) {
        writeStoredCaptionLanguage(showingLanguage);
        hydrated = true;
        return;
      }

      if (hydrated) return;

      const storedLanguage = readStoredCaptionLanguage();
      if (!storedLanguage) return;

      if (tryActivateCaptionLanguage(media, storedLanguage)) {
        hydrated = true;
      }
    };

    sync();

    const textTracks = media.textTracks;
    if (textTracks instanceof EventTarget) {
      listen(textTracks, 'addtrack', sync, { signal });
      listen(textTracks, 'removetrack', sync, { signal });
      listen(textTracks, 'change', sync, { signal });
    }
    listen(media, 'loadstart', sync, { signal });

    signal.addEventListener('abort', () => trackCleanup?.abort(), { once: true });
  },
});

function isCaptionKind(kind: string): boolean {
  return kind === 'captions' || kind === 'subtitles';
}

function findShowingCaptionLanguage(media: MediaTextTrackCapability): string | null {
  for (let i = 0; i < media.textTracks.length; i++) {
    const track = media.textTracks[i]!;
    if (isCaptionKind(track.kind) && track.mode === 'showing' && track.language) {
      return track.language;
    }
  }
  return null;
}

function tryActivateCaptionLanguage(media: MediaTextTrackCapability, language: string): boolean {
  for (let i = 0; i < media.textTracks.length; i++) {
    const track = media.textTracks[i]!;
    if (isCaptionKind(track.kind) && track.language === language) {
      track.mode = 'showing';
      return true;
    }
  }
  return false;
}

function readStoredCaptionLanguage(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(CAPTION_LANG_PREF_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredCaptionLanguage(language: string): void {
  try {
    globalThis.localStorage?.setItem(CAPTION_LANG_PREF_KEY, language);
  } catch {
    /* localStorage unavailable (private mode, SSR, quota exceeded) */
  }
}
