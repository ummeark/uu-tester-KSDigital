// brukerhistorie.setup.js
// Logger inn via ID-porten TestID og lagrer auth-tilstand for gjenbruk i tester.
import { chromium } from 'playwright';
import { loggInn } from './lib/common.js';
import { TEST_FNR, TEST_MODUS } from './config.js';
import fs from 'fs';

// process.argv[2] fanges av playwright-runneren – les URL direkte fra env.
const START_URL = process.env.TEST_URL || 'https://tilskudd.fiks.test.ks.no/';

export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const { url } = await loggInn(context, START_URL, { modus: TEST_MODUS, testFnr: TEST_FNR });
  if (!url) throw new Error('Innlogging feilet – kan ikke kjøre brukerhistorietester');
  fs.mkdirSync('brukerhistorie-resultater', { recursive: true });
  await context.storageState({ path: 'brukerhistorie-resultater/auth.json' });
  await browser.close();
}
