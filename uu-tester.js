import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const URL = process.argv[2] || 'https://tilskudd.fiks.test.ks.no/';
const dato = new Date().toISOString().slice(0, 10);
const rapportDir = path.join(__dirname, 'rapporter', dato);
fs.mkdirSync(rapportDir, { recursive: true });

console.log(`\n🔍 Starter UU-analyse av: ${URL}`);
console.log(`📅 Dato: ${dato}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 UU-Tester/1.0'
});
const page = await context.newPage();

// --- Besøk siden ---
console.log('📄 Laster siden...');
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

// --- Axe WCAG-analyse ---
console.log('♿ Kjører axe WCAG-analyse...');
const axeResults = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
  .analyze();

// --- Lenkesjekk ---
console.log('🔗 Sjekker lenker...');
const lenker = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a[href]')).map(a => ({
    tekst: a.innerText.trim() || a.getAttribute('aria-label') || '(ingen tekst)',
    href: a.href,
    harTekst: !!(a.innerText.trim() || a.getAttribute('aria-label'))
  }));
});

const lenkeSjekk = await Promise.all(
  lenker.map(async (lenke) => {
    if (!lenke.href || lenke.href.startsWith('mailto:') || lenke.href.startsWith('tel:')) {
      return { ...lenke, status: 'skip', ok: true };
    }
    try {
      const resp = await fetch(lenke.href, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      return { ...lenke, status: resp.status, ok: resp.ok };
    } catch {
      try {
        const resp = await fetch(lenke.href, { method: 'GET', signal: AbortSignal.timeout(8000) });
        return { ...lenke, status: resp.status, ok: resp.ok };
      } catch (e) {
        return { ...lenke, status: 'feil', ok: false, feil: e.message };
      }
    }
  })
);

// --- Knappesjekk ---
console.log('🔘 Sjekker knapper...');
const knapper = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')).map(el => ({
    tag: el.tagName.toLowerCase(),
    tekst: el.innerText?.trim() || el.getAttribute('value') || el.getAttribute('aria-label') || el.getAttribute('title') || '',
    harLabel: !!(el.innerText?.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('value'))
  }));
});

// --- Bildesjekk ---
console.log('🖼️  Sjekker bilder...');
const bilder = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    alt: img.getAttribute('alt'),
    harAlt: img.hasAttribute('alt'),
    altErTom: img.getAttribute('alt') === ''
  }));
});

// --- Skjemasjekk ---
console.log('📝 Sjekker skjemafelt...');
const skjemafelt = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input, select, textarea')).map(el => {
    const id = el.id;
    const label = id ? document.querySelector(`label[for="${id}"]`) : null;
    return {
      type: el.type || el.tagName.toLowerCase(),
      id: id || '(ingen id)',
      harLabel: !!(label || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.closest('label'))
    };
  }).filter(el => el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button');
});

// --- Overskriftshierarki ---
console.log('📐 Sjekker overskriftshierarki...');
const overskrifter = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
    nivå: parseInt(h.tagName[1]),
    tekst: h.innerText.trim().slice(0, 80)
  }));
});

// --- Oppsummering ---
const døde = lenkeSjekk.filter(l => !l.ok && l.status !== 'skip');
const tomme = lenkeSjekk.filter(l => !l.harTekst && l.status !== 'skip');
const knappUtenLabel = knapper.filter(k => !k.harLabel);
const bilderUtenAlt = bilder.filter(b => !b.harAlt);
const feltUtenLabel = skjemafelt.filter(f => !f.harLabel);

const kritiske = axeResults.violations.filter(v => v.impact === 'critical');
const alvorlige = axeResults.violations.filter(v => v.impact === 'serious');
const moderate = axeResults.violations.filter(v => v.impact === 'moderate');
const mindre = axeResults.violations.filter(v => v.impact === 'minor');

await browser.close();

// --- Lagre JSON ---
const resultat = {
  url: URL,
  dato,
  wcag: {
    brudd: axeResults.violations.length,
    bestått: axeResults.passes.length,
    ufullstendig: axeResults.incomplete.length,
    kritiske: kritiske.length,
    alvorlige: alvorlige.length,
    moderate: moderate.length,
    mindre: mindre.length,
    detaljer: axeResults.violations
  },
  lenker: {
    totalt: lenkeSjekk.filter(l => l.status !== 'skip').length,
    døde: døde.length,
    tomTekst: tomme.length,
    detaljer: døde
  },
  knapper: {
    totalt: knapper.length,
    utenLabel: knappUtenLabel.length,
    detaljer: knappUtenLabel
  },
  bilder: {
    totalt: bilder.length,
    utenAlt: bilderUtenAlt.length,
    detaljer: bilderUtenAlt
  },
  skjema: {
    totalt: skjemafelt.length,
    utenLabel: feltUtenLabel.length,
    detaljer: feltUtenLabel
  },
  overskrifter
};

const jsonFil = path.join(rapportDir, 'resultat.json');
fs.writeFileSync(jsonFil, JSON.stringify(resultat, null, 2));

// --- Generer HTML-rapport ---
const html = genererRapport(resultat);
const htmlFil = path.join(rapportDir, 'rapport.html');
fs.writeFileSync(htmlFil, html);

// --- Terminaloversikt ---
console.log('\n' + '━'.repeat(55));
console.log(`📊 RAPPORT – ${URL}`);
console.log('━'.repeat(55));
console.log(`♿ WCAG-brudd:      ${farge(axeResults.violations.length, 0, 3, 8)}   (kritiske: ${kritiske.length}, alvorlige: ${alvorlige.length})`);
console.log(`🔗 Døde lenker:     ${farge(døde.length, 0, 1, 5)}`);
console.log(`🔘 Knapper u/label: ${farge(knappUtenLabel.length, 0, 1, 5)}`);
console.log(`🖼️  Bilder u/alt:    ${farge(bilderUtenAlt.length, 0, 1, 5)}`);
console.log(`📝 Felt u/label:    ${farge(feltUtenLabel.length, 0, 1, 5)}`);
console.log('━'.repeat(55));

if (axeResults.violations.length > 0) {
  console.log('\nTopp WCAG-brudd:');
  axeResults.violations.slice(0, 5).forEach(v => {
    const ikon = v.impact === 'critical' ? '🔴' : v.impact === 'serious' ? '🟠' : '🟡';
    console.log(`  ${ikon} [${v.id}] ${v.description.slice(0, 70)}`);
  });
}

if (døde.length > 0) {
  console.log('\nDøde lenker:');
  døde.forEach(l => console.log(`  ❌ ${l.status} – ${l.href.slice(0, 70)}`));
}

console.log(`\n📁 HTML-rapport: ${htmlFil}\n`);

function farge(n, grønn, gul, rød) {
  if (n <= grønn) return `\x1b[32m${n}\x1b[0m`;
  if (n <= gul) return `\x1b[33m${n}\x1b[0m`;
  return `\x1b[31m${n}\x1b[0m`;
}

function genererRapport(r) {
  const score = Math.max(0, 100 - (r.wcag.kritiske * 15) - (r.wcag.alvorlige * 8) - (r.wcag.moderate * 3) - (r.wcag.mindre * 1) - (r.lenker.døde * 5) - (r.knapper.utenLabel * 4) - (r.bilder.utenAlt * 4) - (r.skjema.utenLabel * 4));
  const scoreKlasse = score >= 80 ? 'god' : score >= 50 ? 'middels' : 'dårlig';

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UU-rapport – ${r.dato}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f0f2f5; color: #1a1a2e; }
  header { background: #1a1a2e; color: white; padding: 1.5rem 2rem; }
  header h1 { font-size: 1.4rem; }
  header p { opacity: 0.7; font-size: 0.9rem; margin-top: 0.3rem; }
  .container { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
  .score-kort { background: white; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; display: flex; align-items: center; gap: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .score-sirkel { width: 110px; height: 110px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; flex-shrink: 0; }
  .score-sirkel.god { background: #d4edda; color: #155724; border: 4px solid #28a745; }
  .score-sirkel.middels { background: #fff3cd; color: #856404; border: 4px solid #ffc107; }
  .score-sirkel.dårlig { background: #f8d7da; color: #721c24; border: 4px solid #dc3545; }
  .score-info h2 { font-size: 1.2rem; }
  .score-info p { color: #666; margin-top: 0.4rem; font-size: 0.95rem; }
  .kort-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .kort { background: white; border-radius: 10px; padding: 1.2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 5px solid #ccc; }
  .kort.kritisk { border-color: #dc3545; }
  .kort.advarsel { border-color: #ffc107; }
  .kort.ok { border-color: #28a745; }
  .kort .tall { font-size: 2.2rem; font-weight: bold; margin: 0.3rem 0; }
  .kort .etikett { font-size: 0.8rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
  .kort .ikon { font-size: 1.5rem; }
  .seksjon { background: white; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .seksjon h2 { font-size: 1.1rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #f0f2f5; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th { background: #f0f2f5; text-align: left; padding: 0.6rem 0.8rem; font-weight: 600; }
  td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #f0f2f5; vertical-align: top; }
  tr:hover td { background: #fafafa; }
  .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
  .badge.critical { background: #f8d7da; color: #721c24; }
  .badge.serious { background: #ffe5d0; color: #7d3c00; }
  .badge.moderate { background: #fff3cd; color: #856404; }
  .badge.minor { background: #e2e3e5; color: #383d41; }
  .ingenFunn { color: #28a745; font-size: 0.95rem; }
  .overskrift-liste { list-style: none; }
  .overskrift-liste li { padding: 0.3rem 0; }
  .overskrift-liste li::before { content: attr(data-nivå); font-weight: bold; color: #888; margin-right: 0.5rem; font-size: 0.8rem; }
  footer { text-align: center; padding: 2rem; color: #888; font-size: 0.85rem; }
</style>
</head>
<body>
<header>
  <h1>♿ UU-rapport – ${r.url}</h1>
  <p>Generert: ${r.dato} · Analyseverktøy: axe-core + Playwright</p>
</header>
<div class="container">

  <!-- Score-kort -->
  <div class="score-kort">
    <div class="score-sirkel ${scoreKlasse}">${score}</div>
    <div class="score-info">
      <h2>Total UU-score</h2>
      <p>Basert på WCAG-brudd, døde lenker, manglende labels og alt-tekst.<br>
      Mål: 80+ for tilfredsstillende tilgjengelighet.</p>
    </div>
  </div>

  <!-- Nøkkeltall -->
  <div class="kort-grid">
    <div class="kort ${r.wcag.brudd === 0 ? 'ok' : r.wcag.brudd < 5 ? 'advarsel' : 'kritisk'}">
      <div class="ikon">♿</div>
      <div class="tall">${r.wcag.brudd}</div>
      <div class="etikett">WCAG-brudd</div>
    </div>
    <div class="kort ${r.wcag.kritiske === 0 ? 'ok' : 'kritisk'}">
      <div class="ikon">🔴</div>
      <div class="tall">${r.wcag.kritiske}</div>
      <div class="etikett">Kritiske brudd</div>
    </div>
    <div class="kort ${r.lenker.døde === 0 ? 'ok' : 'kritisk'}">
      <div class="ikon">🔗</div>
      <div class="tall">${r.lenker.døde}</div>
      <div class="etikett">Døde lenker</div>
    </div>
    <div class="kort ${r.knapper.utenLabel === 0 ? 'ok' : 'advarsel'}">
      <div class="ikon">🔘</div>
      <div class="tall">${r.knapper.utenLabel}</div>
      <div class="etikett">Knapper u/label</div>
    </div>
    <div class="kort ${r.bilder.utenAlt === 0 ? 'ok' : 'advarsel'}">
      <div class="ikon">🖼️</div>
      <div class="tall">${r.bilder.utenAlt}</div>
      <div class="etikett">Bilder u/alt-tekst</div>
    </div>
    <div class="kort ${r.skjema.utenLabel === 0 ? 'ok' : 'advarsel'}">
      <div class="ikon">📝</div>
      <div class="tall">${r.skjema.utenLabel}</div>
      <div class="etikett">Skjemafelt u/label</div>
    </div>
    <div class="kort ok">
      <div class="ikon">✅</div>
      <div class="tall">${r.wcag.bestått}</div>
      <div class="etikett">WCAG bestått</div>
    </div>
  </div>

  <!-- WCAG-brudd -->
  <div class="seksjon">
    <h2>♿ WCAG-brudd (${r.wcag.brudd})</h2>
    ${r.wcag.detaljer.length === 0
      ? '<p class="ingenFunn">✅ Ingen WCAG-brudd funnet.</p>'
      : `<table>
      <thead><tr><th>Alvorlighet</th><th>Regel</th><th>Beskrivelse</th><th>Berørte elementer</th></tr></thead>
      <tbody>
      ${r.wcag.detaljer.map(v => `
        <tr>
          <td><span class="badge ${v.impact}">${v.impact}</span></td>
          <td><code>${v.id}</code></td>
          <td>${v.description}</td>
          <td>${v.nodes.length}</td>
        </tr>
      `).join('')}
      </tbody>
    </table>`}
  </div>

  <!-- Døde lenker -->
  <div class="seksjon">
    <h2>🔗 Døde lenker (${r.lenker.døde})</h2>
    ${r.lenker.detaljer.length === 0
      ? '<p class="ingenFunn">✅ Ingen døde lenker funnet.</p>'
      : `<table>
      <thead><tr><th>Status</th><th>Lenketekst</th><th>URL</th></tr></thead>
      <tbody>
      ${r.lenker.detaljer.map(l => `
        <tr>
          <td><span class="badge critical">${l.status}</span></td>
          <td>${l.tekst.slice(0, 40)}</td>
          <td style="word-break:break-all;font-size:0.8rem">${l.href}</td>
        </tr>
      `).join('')}
      </tbody>
    </table>`}
  </div>

  <!-- Knapper -->
  <div class="seksjon">
    <h2>🔘 Knapper uten label (${r.knapper.utenLabel})</h2>
    ${r.knapper.detaljer.length === 0
      ? '<p class="ingenFunn">✅ Alle knapper har tilgjengelig navn.</p>'
      : `<table>
      <thead><tr><th>Elementtype</th></tr></thead>
      <tbody>
      ${r.knapper.detaljer.map(k => `<tr><td><code>${k.tag}</code></td></tr>`).join('')}
      </tbody>
    </table>`}
  </div>

  <!-- Bilder -->
  <div class="seksjon">
    <h2>🖼️ Bilder uten alt-tekst (${r.bilder.utenAlt})</h2>
    ${r.bilder.detaljer.length === 0
      ? '<p class="ingenFunn">✅ Alle bilder har alt-attributt.</p>'
      : `<table>
      <thead><tr><th>Bilde-URL</th></tr></thead>
      <tbody>
      ${r.bilder.detaljer.map(b => `<tr><td style="font-size:0.8rem;word-break:break-all">${b.src}</td></tr>`).join('')}
      </tbody>
    </table>`}
  </div>

  <!-- Skjemafelt -->
  <div class="seksjon">
    <h2>📝 Skjemafelt uten label (${r.skjema.utenLabel})</h2>
    ${r.skjema.detaljer.length === 0
      ? '<p class="ingenFunn">✅ Alle skjemafelt har tilgjengelig label.</p>'
      : `<table>
      <thead><tr><th>Type</th><th>ID</th></tr></thead>
      <tbody>
      ${r.skjema.detaljer.map(f => `<tr><td>${f.type}</td><td><code>${f.id}</code></td></tr>`).join('')}
      </tbody>
    </table>`}
  </div>

  <!-- Overskriftshierarki -->
  <div class="seksjon">
    <h2>📐 Overskriftshierarki</h2>
    <ul class="overskrift-liste">
    ${r.overskrifter.map(h => `<li data-nivå="H${h.nivå}" style="padding-left:${(h.nivå - 1) * 1.2}rem">H${h.nivå}: ${h.tekst}</li>`).join('')}
    </ul>
  </div>

</div>
<footer>UU-tester · axe-core + Playwright · ${r.dato}</footer>
</body>
</html>`;
}
