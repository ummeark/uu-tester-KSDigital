import path from 'path';
import { SIDE_TIMEOUT } from '../config.js';

/**
 * Logger inn via ID-porten TestID.
 * Returnerer { url, steg } — url er siden man lander på, steg er skjermbildelogg.
 *
 * modus:    'fast'      → fyller inn testFnr
 *           'tilfeldig' → klikker "Hent tilfeldig person"
 * skjermDir → om satt, lagres PNG for hvert steg her (innlogging-steg-N.png)
 */
export async function loggInn(context, startUrl, { modus = 'fast', testFnr = '10895696434', timeout = 20000, skjermDir = null } = {}) {
  const page = await context.newPage();
  const steg = [];

  async function bilde(nr, tittel, beskriv) {
    if (!skjermDir) return;
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    const filnavn = `innlogging-steg-${nr}.png`;
    await page.screenshot({ path: path.join(skjermDir, filnavn) }).catch(() => {});
    steg.push({ nr, tittel, beskriv, fil: `skjermbilder/${filnavn}` });
  }

  try {
    console.log(`\n🔐 Logger inn via ID-porten TestID (modus: ${modus})...`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout });

    await bilde(1, 'Applikasjon – ikke innlogget', '«Logg inn»-knappen er synlig. Brukeren klikker den for å starte innloggingsflyten.');

    // Klikk Logg inn-knappen hvis vi ikke allerede er hos ID-porten
    if (!page.url().includes('idporten.no')) {
      const loggInnKnapp = page.locator('a:has-text("Logg inn"), button:has-text("Logg inn")').first();
      if (await loggInnKnapp.count() > 0) {
        await loggInnKnapp.click({ timeout: 8000 });
        await page.waitForLoadState('domcontentloaded', { timeout });
      }
    }

    if (!page.url().includes('idporten.no')) {
      console.log('  ℹ️  Ingen omdirigering til ID-porten – antar allerede innlogget');
      const url = page.url();
      await page.close();
      return { url, steg };
    }

    await bilde(2, 'ID-porten – velg innloggingsmetode', 'ID-porten viser tilgjengelige metoder. Brukeren velger TestID.');

    // Klikk TestID
    await page.locator('a:has-text("TestID"), button:has-text("TestID")').first().click({ timeout: 8000 });
    await page.waitForLoadState('domcontentloaded', { timeout });

    await bilde(3, 'TestID-skjema – tomt', 'Feltet for Personidentifikator (syntetisk) er tomt og klart for innfylling.');

    if (modus === 'tilfeldig') {
      await page.locator('button:has-text("Hent tilfeldig")').click({ timeout: 8000 });
      await page.waitForFunction(
        () => { const el = document.querySelector('input[type="text"]'); return el && el.value.length >= 11; },
        { timeout: 8000 }
      );
      await bilde(4, 'Tilfeldig personidentifikator hentet', 'Systemet har fylt inn en tilfeldig syntetisk personidentifikator automatisk.');
    } else {
      const input = page.locator('input[type="text"], input[name="pid"], input[id="pid"]').first();
      await input.clear({ timeout: 5000 });
      await input.fill(testFnr, { timeout: 5000 });
      await bilde(4, `Personidentifikator ${testFnr} fylt inn`, `Fast testpersonidentifikator ${testFnr} er skrevet inn. Klar for å klikke Autentiser.`);
    }

    await page.locator('button:has-text("Autentiser"), input[value="Autentiser"]').first().click({ timeout: 8000 });
    await page.waitForURL(/tilskudd\.fiks\.test\.ks\.no/, { timeout });

    await bilde(5, 'Innlogget – landet på Min side', 'Autentisering vellykket. Brukeren er videresendt tilbake til applikasjonen.');

    const landingsUrl = page.url();
    console.log(`  ✅ Innlogget. Landet på: ${landingsUrl}`);
    await page.close();
    return { url: landingsUrl, steg };
  } catch (e) {
    const snapFil = `/tmp/idporten-login-feil.png`;
    await page.screenshot({ path: snapFil }).catch(() => {});
    console.log(`  ❌ Innlogging feilet: ${e.message.slice(0, 120)}`);
    console.log(`  📸 Skjermbilde: ${snapFil}`);
    await page.close();
    return { url: null, steg };
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
