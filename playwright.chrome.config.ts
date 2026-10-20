import { defineConfig } from '@playwright/test';

/** Kurulu Google Chrome. Varsayılan e2e SwiftShader Chromium'da kalır. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: [
    'views.spec.ts',
    'shell.spec.ts',
    'slots.spec.ts',
    'seam.spec.ts',
    'print-size.spec.ts',
    'suggest.spec.ts',
    'keys-flow.spec.ts',
    'select.spec.ts',
    'navigate.spec.ts',
  ],
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5301',
    viewport: { width: 1400, height: 850 },
    channel: 'chrome',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npx vite --port 5301 --strictPort',
    url: 'http://localhost:5301',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
