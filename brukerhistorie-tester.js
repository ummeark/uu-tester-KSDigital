// brukerhistorie-tester.js
// Brukerhistorietester med @playwright/test.
// Hver test.describe tilsvarer én brukerhistorie med akseptansekriterier som test()-steg.
import { test, expect } from '@playwright/test';
import { START_URL, SIDE_TIMEOUT, IDLE_TIMEOUT } from './config.js';

const base = START_URL.replace(/\/$/, '');

// ── BH-1 ─────────────────────────────────────────────────────────────────────
test.describe('BH-1: Som søker vil jeg se oversikt over tilskuddsordninger', () => {

  test('kan navigere til utlysningslisten', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    await expect(page).toHaveURL(/utlysinger/);
  });

  test('utlysningslisten inneholder minst én ordning', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    const kort = page.locator('article, [class*="card"], [class*="kort"], li a[href*="utlysing"]');
    await expect(kort.first()).toBeVisible({ timeout: SIDE_TIMEOUT });
  });

  test('kan klikke seg inn på en utlysning og se detaljer', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    const forstelenke = page.locator('a[href*="utlysing"]').first();
    await expect(forstelenke).toBeVisible({ timeout: SIDE_TIMEOUT });
    await forstelenke.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(`${base}/utlysinger`);
  });

});

// ── BH-2 ─────────────────────────────────────────────────────────────────────
test.describe('BH-2: Som søker vil jeg søke etter en tilskuddsordning', () => {

  test('søkefeltet er synlig og fokuserbart', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    const felt = page.locator('input[type="search"], input[name*="search"], input[placeholder*="øk"]').first();
    await expect(felt).toBeVisible({ timeout: SIDE_TIMEOUT });
    await felt.click();
    await expect(felt).toBeFocused();
  });

  test('søk med gyldig tekst gir respons uten feilside', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    const felt = page.locator('input[type="search"], input[name*="search"], input[placeholder*="øk"]').first();
    await felt.fill('tilskudd');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('domcontentloaded');
    const body = await page.textContent('body');
    expect(body).not.toMatch(/500|Internal Server Error|Uventet feil/);
  });

  test('søk med tom streng beholder utlysningslisten', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    const felt = page.locator('input[type="search"], input[name*="search"], input[placeholder*="øk"]').first();
    await felt.fill('');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/utlysinger/);
  });

});

// ── BH-3 ─────────────────────────────────────────────────────────────────────
test.describe('BH-3: Som innlogget søker vil jeg se mine søknader', () => {

  test('min side er tilgjengelig etter innlogging', async ({ page }) => {
    await page.goto(`${base}/minside`, { timeout: IDLE_TIMEOUT });
    await expect(page).toHaveURL(/minside/);
  });

  test('min side viser ikke innloggingsskjema (brukeren er innlogget)', async ({ page }) => {
    await page.goto(`${base}/minside`, { timeout: IDLE_TIMEOUT });
    const loggInnKnapp = page.locator('a:has-text("Logg inn"), button:has-text("Logg inn")');
    await expect(loggInnKnapp).toHaveCount(0);
  });

  test('min side laster uten JavaScript-feil', async ({ page }) => {
    const feil = [];
    page.on('pageerror', e => feil.push(e.message));
    await page.goto(`${base}/minside`, { timeout: IDLE_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT });
    expect(feil, `JS-feil: ${feil.join(', ')}`).toHaveLength(0);
  });

});

// ── BH-4 ─────────────────────────────────────────────────────────────────────
test.describe('BH-4: Som søker vil jeg kunne navigere tilbake fra en utlysning', () => {

  test('tilbake-navigasjon fra utlysning fungerer', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    const lenke = page.locator('a[href*="utlysinger/"]').first();
    const href = await lenke.getAttribute('href');
    const absoluteHref = href.startsWith('http') ? href : `${base}${href}`;
    await page.goto(absoluteHref, { waitUntil: 'domcontentloaded', timeout: SIDE_TIMEOUT });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/utlysinger/);
  });

  test('F5-refresh på utlysningslisten beholder siden', async ({ page }) => {
    await page.goto(`${base}/utlysinger`, { timeout: IDLE_TIMEOUT });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/utlysinger/);
    const body = await page.textContent('body');
    expect(body).not.toMatch(/500|Internal Server Error|Uventet feil/);
  });

});
