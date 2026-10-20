import { defineConfig } from '@playwright/test';

/** Çalışan yereldeki uygulamada Bluey duman testi. Kendi sunucusunu açmaz. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: ['bluey-smoke.spec.ts'],
  timeout: 3_000_000,
  use: {
    baseURL: 'http://localhost:5174',
    headless: false,
    viewport: { width: 1440, height: 900 },
    channel: 'chrome',
    launchOptions: { slowMo: 400 },
  },
});
