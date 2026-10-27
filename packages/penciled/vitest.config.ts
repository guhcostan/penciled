import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Pre-bundled up front: discovering these mid-run reloads the browser and breaks the run.
  optimizeDeps: { include: ['react', 'react-dom/client', '@floating-ui/dom', 'axe-core'] },
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.node.test.ts'],
          // Some UI updates wait for an animation frame, which a busy CI browser can hold back
          // for over a second. A longer timeout only slows down tests that are about to fail.
          expect: { poll: { timeout: 3000 } },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
          },
        },
      },
      {
        // Server-side rendering: importing the package must not touch `window` or `document`.
        test: { name: 'node', include: ['test/**/*.node.test.ts'], environment: 'node' },
      },
    ],
  },
});
