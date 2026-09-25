import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5299',
    viewport: { width: 1400, height: 850 },
    // WebGL için yazılım çizici
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npx vite --port 5299 --strictPort',
    url: 'http://localhost:5299',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
