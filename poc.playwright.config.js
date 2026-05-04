// poc.playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './poc-crawl.setup.js',
  testMatch: 'poc-uu-tester.js',
  outputDir: 'poc-resultater/traces',
  reporter: [
    ['json', { outputFile: 'poc-resultater/poc-uu-resultat.json' }],
    ['list'],
  ],
  use: {
    headless: true,
    bypassCSP: true,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  timeout: 30000,
  workers: 3,
});
