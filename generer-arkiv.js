import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rapportDir = path.join(__dirname, 'rapporter');
const docsDir = path.join(__dirname, 'docs');

// Les alle datoer
const datoer = fs.readdirSync(rapportDir)
  .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .sort()
  .reverse(); // Nyeste først

// --- Les resultater per testtype ---

function lesUU(dato) {
  const fil = path.join(rapportDir, dato, 'resultat.json');
  if (!fs.existsSync(fil)) return null;
  const json = JSON.parse(fs.readFileSync(fil, 'utf-8'));
  const t = json.totalt || {
    sider: 1,
    wcagBrudd: json.wcag?.brudd || 0,
    kritiske: json.wcag?.kritiske || 0,
    alvorlige: json.wcag?.alvorlige || 0,
    moderate: json.wcag?.moderate || 0,
    mindre: json.wcag?.mindre || 0,
    dødelenker: json.lenker?.døde || 0,
    knappUtenLabel: Array.isArray(json.knapper) ? json.knapper.filter(k => !k.harLabel).length : 0,
    bilderUtenAlt: Array.isArray(json.bilder) ? json.bilder.filter(b => !b.harAlt).length : 0,
    feltUtenLabel: Array.isArray(json.skjema) ? json.skjema.filter(f => !f.harLabel).length : 0,
  };
  const score = Math.max(0, 100
    - (t.kritiske || 0) * 15 - (t.alvorlige || 0) * 8 - (t.moderate || 0) * 3 - (t.mindre || 0)
    - (t.dødelenker || 0) * 5 - (t.knappUtenLabel || 0) * 4 - (t.bilderUtenAlt || 0) * 4 - (t.feltUtenLabel || 0) * 4
  );
  return { dato, score, totalt: t };
}

function lesMonkey(dato) {
  const fil = path.join(rapportDir, dato, 'monkey-resultat.json');
  if (!fs.existsSync(fil)) return null;
  const json = JSON.parse(fs.readFileSync(fil, 'utf-8'));
  return { dato, score: json.score, totalt: json.totalt };
}

function lesSikkerhet(dato) {
  const fil = path.join(rapportDir, dato, 'sikkerhet-resultat.json');
  if (!fs.existsSync(fil)) return null;
  const json = JSON.parse(fs.readFileSync(fil, 'utf-8'));
  return { dato, score: json.score, totalt: json.totalt };
}

function lesNegativ(dato) {
  const fil = path.join(rapportDir, dato, 'negativ-resultat.json');
  if (!fs.existsSync(fil)) return null;
  const json = JSON.parse(fs.readFileSync(fil, 'utf-8'));
  return { dato, score: json.score, totalt: json.totalt };
}

const uu      = datoer.map(lesUU).filter(Boolean);
const monkey  = datoer.map(lesMonkey).filter(Boolean);
const sikkerhet = datoer.map(lesSikkerhet).filter(Boolean);
const negativ = datoer.map(lesNegativ).filter(Boolean);

// --- Kopier rapporter til docs/arkiv/ ---

const arkivDir = path.join(docsDir, 'arkiv');
fs.mkdirSync(arkivDir, { recursive: true });

const rapportFiler = ['rapport.html', 'monkey-rapport.html', 'sikkerhet-rapport.html', 'negativ-rapport.html'];

for (const dato of datoer) {
  const kildedir = path.join(rapportDir, dato);
  const måldir = path.join(arkivDir, dato);
  fs.mkdirSync(måldir, { recursive: true });

  for (const fil of rapportFiler) {
    const src = path.join(kildedir, fil);
    if (fs.existsSync(src)) {
      let html = fs.readFileSync(src, 'utf-8');
      html = html.replace(/src="skjermbilder\//g, `src="../${dato}/skjermbilder/`);
      html = html.replace(/href="skjermbilder\//g, `href="../${dato}/skjermbilder/`);
      fs.writeFileSync(path.join(måldir, fil), html);
    }
  }

  // Kopier skjermbilder
  for (const skjermNavn of ['skjermbilder', 'skjermbilder-monkey', 'skjermbilder-negativ', 'skjermbilder-sikkerhet']) {
    const src = path.join(kildedir, skjermNavn);
    const mål = path.join(arkivDir, dato, skjermNavn);
    if (fs.existsSync(src)) {
      fs.mkdirSync(mål, { recursive: true });
      fs.readdirSync(src).forEach(f => fs.copyFileSync(path.join(src, f), path.join(mål, f)));
    }
  }
}

// --- Hjelpefunksjoner ---

function scoreKlasse(s) { return s >= 80 ? 'god' : s >= 50 ? 'middels' : 'dårlig'; }

function trendPil(liste, i) {
  if (i >= liste.length - 1) return '';
  const diff = liste[i].score - liste[i + 1].score;
  if (diff > 0) return `<span class="trend opp">↑ +${diff}</span>`;
  if (diff < 0) return `<span class="trend ned">↓ ${diff}</span>`;
  return `<span class="trend lik">→ 0</span>`;
}

const norskDato = (dato) => new Date(dato).toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

function grafHTML(liste, rapportFil) {
  if (liste.length === 0) return '<p style="color:#9ca3af;font-size:0.82rem">Ingen data ennå.</p>';
  return `<div class="graf">
    ${[...liste].reverse().map(r => `
      <div class="søyle-wrapper" title="${r.dato}: ${r.score} poeng">
        <a href="arkiv/${r.dato}/${rapportFil}" style="width:100%;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:flex-end">
          <div class="søyle ${scoreKlasse(r.score)}" style="height:${r.score}%"></div>
        </a>
        <span class="søyle-dato">${r.dato.slice(5)}</span>
      </div>`).join('')}
  </div>`;
}

function radHTML(r, i, liste, rapportFil, nøkkeltallFn) {
  return `
  <a class="rapport-rad ${scoreKlasse(r.score)}" href="arkiv/${r.dato}/${rapportFil}">
    <div class="score-boble ${scoreKlasse(r.score)}">${r.score}</div>
    <div class="dato-info">
      <h3>${norskDato(r.dato)}</h3>
      <p>${r.dato} &nbsp; ${trendPil(liste, i)}</p>
    </div>
    <div class="nøkkeltall">${nøkkeltallFn(r)}</div>
    <div class="åpne-knapp">Se rapport →</div>
  </a>`;
}

function seksjonHTML(tittel, ikon, liste, rapportFil, sisteRapportLenke, nøkkeltallFn) {
  return `
  <section class="testtype-seksjon">
    <div class="seksjon-header">
      <span class="seksjon-ikon">${ikon}</span>
      <h2>${tittel}</h2>
      <span class="seksjon-antall">${liste.length} kjøringer</span>
      <a href="${sisteRapportLenke}" class="seksjon-lenke">Siste rapport →</a>
    </div>
    <div class="trend-graf">
      <div class="graf-tittel">Score-utvikling</div>
      ${grafHTML(liste, rapportFil)}
    </div>
    <div class="rapport-liste">
      ${liste.length === 0
        ? '<p style="color:#9ca3af;font-size:0.82rem;padding:1rem 0">Ingen rapporter ennå.</p>'
        : liste.map((r, i) => radHTML(r, i, liste, rapportFil, nøkkeltallFn)).join('')}
    </div>
  </section>`;
}

// --- Nøkkeltall per testtype ---

const uuNøkkel = r => `
  <span>${r.totalt.wcagBrudd > 0 ? `<b class="rød">WCAG ${r.totalt.wcagBrudd}</b>` : '<span class="grønn">WCAG 0</span>'}</span>
  <span>${r.totalt.dødelenker > 0 ? `<b class="rød">Lenker ${r.totalt.dødelenker}</b>` : '<span class="grønn">Lenker 0</span>'}</span>
  <span>${r.totalt.sider} sider</span>`;

const monkeyNøkkel = r => `
  <span>${r.totalt.jsErrors > 0 ? `<b class="rød">JS-feil ${r.totalt.jsErrors}</b>` : '<span class="grønn">Ingen JS-feil</span>'}</span>
  <span>${r.totalt.kritiske > 0 ? `<b class="rød">Kritiske ${r.totalt.kritiske}</b>` : '<span class="grønn">Ingen kritiske</span>'}</span>
  <span>${r.totalt.iterasjoner} iterasjoner</span>`;

const sikkerhetNøkkel = r => `
  <span>${r.totalt.kritiske > 0 ? `<b class="rød">Kritiske ${r.totalt.kritiske}</b>` : '<span class="grønn">Ingen kritiske</span>'}</span>
  <span>${r.totalt.alvorlige > 0 ? `<b class="rød">Alvorlige ${r.totalt.alvorlige}</b>` : '<span class="grønn">Ingen alvorlige</span>'}</span>
  <span>${r.totalt.ok} bestått</span>`;

const negativNøkkel = r => `
  <span><span class="grønn">Bestått ${r.totalt.bestått}</span></span>
  <span>${r.totalt.advarsel > 0 ? `<b class="rød">Advarsler ${r.totalt.advarsel}</b>` : '<span class="grønn">Ingen advarsler</span>'}</span>
  <span>${r.totalt.feil > 0 ? `<b class="rød">Feil ${r.totalt.feil}</b>` : '<span class="grønn">Ingen feil</span>'}</span>`;

// --- Generer HTML ---

const arkivHTML = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Testrapporter – Arkiv – KS Tilskudd</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #faf6f0; color: #0f0e17; }

  header { background: #0a1355; color: white; padding: 1.6rem 2.5rem; }
  .header-inner { max-width: 980px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .header-merkevare { font-size: 0.72rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; opacity: 0.45; margin-bottom: .4rem; }
  header h1 { font-size: 1.3rem; font-weight: 600; }
  header p { opacity: 0.5; font-size: 0.82rem; margin-top: 0.3rem; }
  .header-nav { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .header-nav a { display: inline-block; padding: .45rem 1.1rem; border: 1px solid rgba(255,255,255,.3); border-radius: 100px; color: rgba(255,255,255,.8); text-decoration: none; font-size: 0.82rem; transition: all .15s; white-space: nowrap; }
  .header-nav a:hover { background: rgba(255,255,255,.1); color: white; border-color: rgba(255,255,255,.6); }

  .container { max-width: 980px; margin: 2.5rem auto; padding: 0 1.5rem; display: flex; flex-direction: column; gap: 2.5rem; }

  /* Seksjon per testtype */
  .testtype-seksjon { background: white; border: 1px solid #f1f0ee; box-shadow: 0 1px 4px rgba(10,19,85,.06); }
  .seksjon-header { display: flex; align-items: center; gap: 0.8rem; padding: 1.2rem 1.6rem; border-bottom: 1px solid #f1f0ee; flex-wrap: wrap; }
  .seksjon-ikon { font-size: 1.3rem; }
  .seksjon-header h2 { font-size: 1rem; font-weight: 700; color: #0a1355; flex: 1; }
  .seksjon-antall { font-size: 0.78rem; color: #9ca3af; }
  .seksjon-lenke { font-size: 0.82rem; color: #07604f; text-decoration: none; font-weight: 500; white-space: nowrap; }
  .seksjon-lenke:hover { text-decoration: underline; }

  /* Trend-graf */
  .trend-graf { padding: 1.2rem 1.6rem; border-bottom: 1px solid #f4f3f1; }
  .graf-tittel { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; margin-bottom: 0.8rem; }
  .graf { display: flex; align-items: flex-end; gap: 5px; height: 60px; }
  .søyle-wrapper { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
  .søyle { width: 100%; transition: opacity .2s; cursor: pointer; }
  .søyle:hover { opacity: 0.75; }
  .søyle.god { background: #07604f; }
  .søyle.middels { background: #b8860b; }
  .søyle.dårlig { background: #c53030; }
  .søyle-dato { font-size: 0.55rem; color: #9ca3af; text-align: center; writing-mode: vertical-rl; transform: rotate(180deg); }

  /* Rapportliste */
  .rapport-liste { display: flex; flex-direction: column; }
  .rapport-rad { border-top: 1px solid #f4f3f1; border-left: 4px solid #e5e3de; padding: 1rem 1.6rem; display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 1.2rem; text-decoration: none; color: inherit; transition: background .15s; }
  .rapport-rad:hover { background: #faf6f0; }
  .rapport-rad.god { border-left-color: #07604f; }
  .rapport-rad.middels { border-left-color: #b8860b; }
  .rapport-rad.dårlig { border-left-color: #c53030; }

  .score-boble { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 700; flex-shrink: 0; }
  .score-boble.god { background: #07604f; color: white; }
  .score-boble.middels { background: #f3dda2; color: #0a1355; }
  .score-boble.dårlig { background: #c53030; color: white; }

  .dato-info h3 { font-size: .88rem; font-weight: 600; color: #0a1355; }
  .dato-info p { font-size: 0.74rem; color: #9ca3af; margin-top: 0.2rem; }

  .nøkkeltall { display: flex; gap: 1rem; font-size: 0.78rem; color: #6b7280; flex-wrap: wrap; }
  .nøkkeltall span { display: flex; align-items: center; gap: 0.3rem; }
  .nøkkeltall .rød { color: #c53030; font-weight: 600; }
  .nøkkeltall .grønn { color: #07604f; }

  .åpne-knapp { background: #0a1355; color: white; padding: 0.4rem 1rem; border-radius: 100px; font-size: 0.78rem; white-space: nowrap; font-weight: 500; }
  .rapport-rad:hover .åpne-knapp { background: #2b3285; }

  .trend { font-size: 0.75rem; font-weight: 600; }
  .trend.opp { color: #07604f; }
  .trend.ned { color: #c53030; }
  .trend.lik { color: #9ca3af; }

  footer { text-align: center; padding: 2.5rem; color: #9ca3af; font-size: 0.78rem; border-top: 1px solid #f1f0ee; margin-top: 1rem; }

  @media (max-width: 640px) {
    .rapport-rad { grid-template-columns: auto 1fr auto; }
    .nøkkeltall { display: none; }
  }
</style>
</head>
<body>
<header>
  <div class="header-inner">
    <div>
      <div class="header-merkevare">KS Tilskudd · Testrapporter</div>
      <h1>Arkiv</h1>
      <p>Historikk for alle fire testtyper</p>
    </div>
    <nav class="header-nav">
      <a href="rapport.html">UU-rapport</a>
      <a href="monkey-rapport.html">Monkey-test</a>
      <a href="sikkerhet-rapport.html">Sikkerhetstest</a>
      <a href="negativ-rapport.html">Negativ test</a>
    </nav>
  </div>
</header>
<div class="container">

  ${seksjonHTML('UU-test (WCAG / tilgjengelighet)', '♿', uu, 'rapport.html', 'rapport.html', uuNøkkel)}
  ${seksjonHTML('Monkey-test', '🐒', monkey, 'monkey-rapport.html', 'monkey-rapport.html', monkeyNøkkel)}
  ${seksjonHTML('Sikkerhetstest', '🔐', sikkerhet, 'sikkerhet-rapport.html', 'sikkerhet-rapport.html', sikkerhetNøkkel)}
  ${seksjonHTML('Negativ test', '🧪', negativ, 'negativ-rapport.html', 'negativ-rapport.html', negativNøkkel)}

</div>
<footer>KS Tilskudd · Testrapporter · axe-core + Playwright</footer>
</body>
</html>`;

fs.writeFileSync(path.join(docsDir, 'arkiv.html'), arkivHTML);
console.log(`✅ Arkiv generert → docs/arkiv.html`);
console.log(`   UU: ${uu.length} | Monkey: ${monkey.length} | Sikkerhet: ${sikkerhet.length} | Negativ: ${negativ.length}`);
