// brukerhistorie.playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './brukerhistorie.setup.js',
  testMatch: 'brukerhistorie-tester.js',
  outputDir: 'brukerhistorie-resultater/traces',
  reporter: [
    ['json', { outputFile: 'brukerhistorie-resultater/brukerhistorie-resultat.json' }],
    ['list'],
  ],
  use: {
    headless: true,
    bypassCSP: true,
    storageState: 'brukerhistorie-resultater/auth.json',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  timeout: 30000,
  workers: 1,
});
