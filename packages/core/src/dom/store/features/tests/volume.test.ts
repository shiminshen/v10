import { createStore } from '@videojs/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerTarget } from '../../../media/types';
import { createMockVideo } from '../../../tests/test-helpers';
import { volumeFeature } from '../volume';

const VOLUME_PREF_KEY = 'videojs-pref-volume';
const MUTED_PREF_KEY = 'videojs-pref-muted';

describe('volumeFeature', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('attach', () => {
    it('syncs volume state on attach', () => {
      const video = createMockVideo({
        volume: 0.8,
        muted: false,
      });

      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      expect(store.state.volume).toBe(0.8);
      expect(store.state.muted).toBe(false);
    });

    it('sets volumeAvailability on attach', () => {
      const video = createMockVideo({});
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      // Should be 'available' or 'unsupported' based on browser capability
      expect(['available', 'unsupported']).toContain(store.state.volumeAvailability);
    });

    it('updates on volumechange event', () => {
      const video = createMockVideo({ volume: 1, muted: false });

      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      expect(store.state.volume).toBe(1);

      // Update mock volume
      video.volume = 0.5;
      video.muted = true;
      video.dispatchEvent(new Event('volumechange'));

      expect(store.state.volume).toBe(0.5);
      expect(store.state.muted).toBe(true);
    });
  });

  describe('actions', () => {
    describe('setVolume', () => {
      it('sets volume on target', async () => {
        const video = createMockVideo({});
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        const result = await store.setVolume(0.7);

        expect(video.volume).toBe(0.7);
        expect(result).toBe(0.7);
      });

      it('clamps volume to min 0', async () => {
        const video = createMockVideo({});
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        await store.setVolume(-0.5);

        expect(video.volume).toBe(0);
      });

      it('clamps volume to max 1', async () => {
        const video = createMockVideo({});
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        await store.setVolume(1.5);

        expect(video.volume).toBe(1);
      });

      it('unmutes when setting volume above 0 while muted', async () => {
        const video = createMockVideo({ muted: true, volume: 0.5 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        await store.setVolume(0.7);

        expect(video.volume).toBe(0.7);
        expect(video.muted).toBe(false);
      });

      it('does not unmute when setting volume to 0', async () => {
        const video = createMockVideo({ muted: true, volume: 0.5 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        await store.setVolume(0);

        expect(video.volume).toBe(0);
        expect(video.muted).toBe(true);
      });

      it('does not change muted when already unmuted', async () => {
        const video = createMockVideo({ muted: false, volume: 0.5 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        await store.setVolume(0.8);

        expect(video.volume).toBe(0.8);
        expect(video.muted).toBe(false);
      });
    });

    describe('toggleMuted', () => {
      it('mutes when unmuted with volume > 0', async () => {
        const video = createMockVideo({ muted: false, volume: 0.8 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        const result = await store.toggleMuted();

        expect(video.muted).toBe(true);
        expect(video.volume).toBe(0.8);
        expect(result).toBe(true);
      });

      it('unmutes when muted with volume > 0', async () => {
        const video = createMockVideo({ muted: true, volume: 0.6 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        const result = await store.toggleMuted();

        expect(video.muted).toBe(false);
        expect(video.volume).toBe(0.6);
        expect(result).toBe(false);
      });

      it('restores volume to 0.25 when unmuting at volume 0', async () => {
        const video = createMockVideo({ muted: true, volume: 0 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        await store.toggleMuted();

        expect(video.muted).toBe(false);
        expect(video.volume).toBe(0.25);
      });

      it('unmutes and restores volume when volume is 0 and not muted', async () => {
        const video = createMockVideo({ muted: false, volume: 0 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        const result = await store.toggleMuted();

        expect(video.muted).toBe(false);
        expect(video.volume).toBe(0.25);
        expect(result).toBe(false);
      });
    });
  });

  describe('persistence', () => {
    it('hydrates volume from localStorage on attach', () => {
      localStorage.setItem(VOLUME_PREF_KEY, '0.42');

      const video = createMockVideo({ volume: 1 });
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      expect(video.volume).toBe(0.42);
      expect(store.state.volume).toBe(0.42);
    });

    it('hydrates muted from localStorage on attach', () => {
      localStorage.setItem(MUTED_PREF_KEY, 'true');

      const video = createMockVideo({ muted: false });
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      expect(video.muted).toBe(true);
      expect(store.state.muted).toBe(true);
    });

    it('persists volume to localStorage on volumechange', () => {
      const video = createMockVideo({ volume: 1 });
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      video.volume = 0.3;
      video.dispatchEvent(new Event('volumechange'));

      expect(localStorage.getItem(VOLUME_PREF_KEY)).toBe('0.3');
    });

    it('persists muted to localStorage on volumechange', () => {
      const video = createMockVideo({ muted: false });
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      video.muted = true;
      video.dispatchEvent(new Event('volumechange'));

      expect(localStorage.getItem(MUTED_PREF_KEY)).toBe('true');
    });

    it('ignores invalid stored volume (non-numeric)', () => {
      localStorage.setItem(VOLUME_PREF_KEY, 'banana');

      const video = createMockVideo({ volume: 0.7 });
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      expect(video.volume).toBe(0.7);
    });

    it('ignores stored volume out of [0, 1] range', () => {
      localStorage.setItem(VOLUME_PREF_KEY, '1.5');

      const video = createMockVideo({ volume: 0.7 });
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      expect(video.volume).toBe(0.7);
    });

    it('ignores invalid stored muted value', () => {
      localStorage.setItem(MUTED_PREF_KEY, 'banana');

      const video = createMockVideo({ muted: false });
      const store = createStore<PlayerTarget>()(volumeFeature);
      store.attach({ media: video, container: null });

      expect(video.muted).toBe(false);
    });

    it('does not throw when localStorage.getItem throws (private mode)', () => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => {
        throw new Error('SecurityError');
      });

      try {
        const video = createMockVideo({ volume: 0.6 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        expect(() => store.attach({ media: video, container: null })).not.toThrow();
        expect(video.volume).toBe(0.6);
      } finally {
        Storage.prototype.getItem = original;
      }
    });

    it('does not throw when localStorage.setItem throws (quota exceeded)', () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      try {
        const video = createMockVideo({ volume: 1 });
        const store = createStore<PlayerTarget>()(volumeFeature);
        store.attach({ media: video, container: null });

        video.volume = 0.4;
        expect(() => video.dispatchEvent(new Event('volumechange'))).not.toThrow();
      } finally {
        Storage.prototype.setItem = original;
      }
    });
  });
});
