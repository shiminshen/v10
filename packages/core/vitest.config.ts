import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __DEV__: 'true',
    __PLAYER_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          include: ['src/core/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'core/dom',
          include: ['src/dom/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['src/dom/tests/setup.ts'],
        },
      },
    ],
  },
});
