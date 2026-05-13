import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __DEV__: 'true',
    __PLAYER_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
