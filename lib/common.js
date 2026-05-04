import { SIDE_TIMEOUT } from '../config.js';

/**
 * Logger inn via ID-porten TestID.
 * Returnerer URL-en appen lander på etter vellykket autentisering, eller null ved feil.
 *
 * modus: 'fast'      → fyller inn testFnr i personnummer-feltet
 *        'tilfeldig' → klikker "Hent tilfeldig person"-knappen
 */
export async function loggInn(context, startUrl, { modus = 'fast', testFnr = '10895696434', timeout = 20000 } = {}) {
  const page = await context.newPage();
  try {
    console.log(`\n🔐 Logger inn via ID-porten TestID (modus: ${modus})...`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout });

    if (!page.url().includes('idporten.no')) {
      console.log('  ℹ️  Ingen omdirigering til ID-porten – antar allerede innlogget');
      const url = page.url();
      await page.close();
      return url;
    }

    // Klikk TestID-valget på selector-siden
    await page.locator('a:has-text("TestID"), button:has-text("TestID")').first().click({ timeout: 8000 });
    await page.waitForLoadState('domcontentloaded', { timeout });

    if (modus === 'tilfeldig') {
      await page.locator('button:has-text("Hent tilfeldig")').click({ timeout: 8000 });
      // Vent til personnummer-feltet er fylt inn av serveren
      await page.waitForFunction(
        () => { const el = document.querySelector('input[type="text"]'); return el && el.value.length >= 11; },
        { timeout: 8000 }
      );
    } else {
      const input = page.locator('input[type="text"], input[name="pid"], input[id="pid"]').first();
      await input.clear({ timeout: 5000 });
      await input.fill(testFnr, { timeout: 5000 });
    }

    await page.locator('button:has-text("Autentiser"), input[value="Autentiser"]').first().click({ timeout: 8000 });
    await page.waitForURL(/tilskudd\.fiks\.test\.ks\.no/, { timeout });

    const landingsUrl = page.url();
    console.log(`  ✅ Innlogget. Landet på: ${landingsUrl}`);
    await page.close();
    return landingsUrl;
  } catch (e) {
    const snapFil = `/tmp/idporten-login-feil.png`;
    await page.screenshot({ path: snapFil }).catch(() => {});
    console.log(`  ❌ Innlogging feilet: ${e.message.slice(0, 120)}`);
    console.log(`  📸 Skjermbilde: ${snapFil}`);
    await page.close();
    return null;
  }
}

/**
 * Henter versjonsnummer fra siden (f.eks. v0.4.3).
 * @param {import('playwright').BrowserContext} ctx
 * @param {string} startUrl
 */
export async function hentVersjon(ctx, startUrl) {
  const p = await ctx.newPage();
  try {
    await p.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: SIDE_TIMEOUT });
    const tekst = await p.evaluate(() => document.body.innerText);
    const match = tekst.match(/v\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch { return null; } finally { await p.close(); }
}

/**
 * Navigerer til URL og returnerer true/false.
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {number} [timeout]
 */
export async function gåTil(page, url, timeout = SIDE_TIMEOUT) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    return true;
  } catch { return false; }
}

/**
 * Sjekker om tekst inneholder krasjindikatorer.
 * @param {string} tekst
 */
export function sjekkKrasj(tekst) {
  return ['500', 'internal server error', 'something went wrong', 'uventet feil', 'oops']
    .some(ord => tekst.toLowerCase().includes(ord));
}

/**
 * Sjekker om tekst inneholder feilmeldingsindikatorer.
 * @param {string} tekst
 * @param {string[]} [feilord]
 */
export function sjekkFeilmelding(tekst, feilord = ['feil', 'error', 'ugyldig', 'mangler', 'påkrevd', 'required', 'invalid', 'ikke gyldig', 'ikke tillatt']) {
  const lower = tekst.toLowerCase();
  return feilord.some(ord => lower.includes(ord));
}
