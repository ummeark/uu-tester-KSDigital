import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rapportDir = path.join(__dirname, 'rapporter');
const docsDir = path.join(__dirname, 'docs');

// Les alle tilgjengelige rapporter
const datoer = fs.readdirSync(rapportDir)
  .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.existsSync(path.join(rapportDir, d, 'resultat.json')))
  .sort()
  .reverse(); // Nyeste først

const rapporter = datoer.map(dato => {
  const json = JSON.parse(fs.readFileSync(path.join(rapportDir, dato, 'resultat.json'), 'utf-8'));

  // Håndter både nytt format (json.totalt) og gammelt format (json.wcag o.l.)
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
    - (t.kritiske || 0) * 15
    - (t.alvorlige || 0) * 8
    - (t.moderate || 0) * 3
    - (t.mindre || 0)
    - (t.dødelenker || 0) * 5
    - (t.knappUtenLabel || 0) * 4
    - (t.bilderUtenAlt || 0) * 4
    - (t.feltUtenLabel || 0) * 4
  );
  return { dato, score, totalt: t, url: json.url };
});

// Kopier alle rapporter til docs/arkiv/
const arkivDir = path.join(docsDir, 'arkiv');
fs.mkdirSync(arkivDir, { recursive: true });

for (const { dato } of rapporter) {
  const kildedir = path.join(rapportDir, dato);
  const måldir = path.join(arkivDir, dato);
  fs.mkdirSync(måldir, { recursive: true });

  // Kopier rapport.html
  const rapportFil = path.join(kildedir, 'rapport.html');
  if (fs.existsSync(rapportFil)) {
    // Oppdater relative stier til skjermbilder i den kopierte rapporten
    let html = fs.readFileSync(rapportFil, 'utf-8');
    html = html.replace(/src="skjermbilder\//g, 'src="../' + dato + '/skjermbilder/');
    html = html.replace(/href="skjermbilder\//g, 'href="../' + dato + '/skjermbilder/');
    fs.writeFileSync(path.join(måldir, 'rapport.html'), html);
  }

  // Kopier skjermbilder
  const skjermSrc = path.join(kildedir, 'skjermbilder');
  const skjermMål = path.join(arkivDir, dato, 'skjermbilder');
  if (fs.existsSync(skjermSrc)) {
    fs.mkdirSync(skjermMål, { recursive: true });
    fs.readdirSync(skjermSrc).forEach(fil => {
      fs.copyFileSync(path.join(skjermSrc, fil), path.join(skjermMål, fil));
    });
  }
}

// Generer arkivside
function scoreKlasse(s) { return s >= 80 ? 'god' : s >= 50 ? 'middels' : 'dårlig'; }
function trend(i) {
  if (i >= rapporter.length - 1) return '';
  const diff = rapporter[i].score - rapporter[i + 1].score;
  if (diff > 0) return `<span class="trend opp">↑ +${diff}</span>`;
  if (diff < 0) return `<span class="trend ned">↓ ${diff}</span>`;
  return `<span class="trend lik">→ 0</span>`;
}

const norskDato = (dato) => {
  const d = new Date(dato);
  return d.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const arkivHTML = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UU-rapport arkiv – KS Digital</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f0f2f5; color: #1a1a2e; }
  header { background: #1a1a2e; color: white; padding: 1.5rem 2rem; }
  header h1 { font-size: 1.4rem; }
  header p { opacity: 0.6; font-size: 0.85rem; margin-top: 0.3rem; }
  header a { color: rgba(255,255,255,0.7); text-decoration: none; font-size: 0.85rem; }
  header a:hover { color: white; }
  .container { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }

  /* Trend-graf */
  .trend-graf { background: white; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .trend-graf h2 { font-size: 1rem; margin-bottom: 1rem; color: #555; }
  .graf { display: flex; align-items: flex-end; gap: 6px; height: 80px; }
  .søyle-wrapper { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .søyle { width: 100%; border-radius: 4px 4px 0 0; transition: opacity .2s; cursor: pointer; }
  .søyle:hover { opacity: 0.8; }
  .søyle.god { background: #28a745; }
  .søyle.middels { background: #ffc107; }
  .søyle.dårlig { background: #dc3545; }
  .søyle-dato { font-size: 0.6rem; color: #888; text-align: center; writing-mode: vertical-rl; transform: rotate(180deg); }

  /* Rapportliste */
  .rapport-liste { display: flex; flex-direction: column; gap: 0.8rem; }
  .rapport-rad { background: white; border-radius: 10px; padding: 1.2rem 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,.08); display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 1rem; text-decoration: none; color: inherit; border-left: 5px solid #ccc; transition: box-shadow .15s; }
  .rapport-rad:hover { box-shadow: 0 4px 16px rgba(0,0,0,.12); }
  .rapport-rad.god { border-color: #28a745; }
  .rapport-rad.middels { border-color: #ffc107; }
  .rapport-rad.dårlig { border-color: #dc3545; }
  .score-boble { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; flex-shrink: 0; }
  .score-boble.god { background: #d4edda; color: #155724; }
  .score-boble.middels { background: #fff3cd; color: #856404; }
  .score-boble.dårlig { background: #f8d7da; color: #721c24; }
  .dato-info h3 { font-size: 1rem; }
  .dato-info p { font-size: 0.8rem; color: #888; margin-top: 0.2rem; }
  .nøkkeltall { display: flex; gap: 1rem; font-size: 0.8rem; color: #555; flex-wrap: wrap; }
  .nøkkeltall span { display: flex; align-items: center; gap: 0.3rem; }
  .nøkkeltall .rød { color: #dc3545; font-weight: 600; }
  .nøkkeltall .grønn { color: #28a745; }
  .åpne-knapp { background: #1a1a2e; color: white; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; white-space: nowrap; }
  .rapport-rad:hover .åpne-knapp { background: #2d2d4e; }
  .trend { font-size: 0.8rem; font-weight: 600; }
  .trend.opp { color: #28a745; }
  .trend.ned { color: #dc3545; }
  .trend.lik { color: #888; }
  footer { text-align: center; padding: 2rem; color: #888; font-size: 0.8rem; }
</style>
</head>
<body>
<header>
  <h1>♿ UU-rapport arkiv – KS Digital</h1>
  <p><a href="index.html">← Siste rapport</a> &nbsp;·&nbsp; ${rapporter.length} rapporter totalt</p>
</header>
<div class="container">

  <!-- Trend-graf -->
  <div class="trend-graf">
    <h2>Score-utvikling over tid</h2>
    <div class="graf">
      ${[...rapporter].reverse().map(r => `
        <div class="søyle-wrapper" title="${r.dato}: ${r.score} poeng">
          <a href="arkiv/${r.dato}/rapport.html" style="width:100%;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:flex-end">
            <div class="søyle ${scoreKlasse(r.score)}" style="height:${r.score}%"></div>
          </a>
          <span class="søyle-dato">${r.dato.slice(5)}</span>
        </div>`).join('')}
    </div>
  </div>

  <!-- Rapportliste -->
  <div class="rapport-liste">
    ${rapporter.map((r, i) => `
      <a class="rapport-rad ${scoreKlasse(r.score)}" href="arkiv/${r.dato}/rapport.html">
        <div class="score-boble ${scoreKlasse(r.score)}">${r.score}</div>
        <div class="dato-info">
          <h3>${norskDato(r.dato)}</h3>
          <p>${r.dato} &nbsp; ${trend(i)}</p>
        </div>
        <div class="nøkkeltall">
          <span>${r.totalt.wcagBrudd > 0 ? `<b class="rød">♿ ${r.totalt.wcagBrudd}</b>` : '<span class="grønn">♿ 0</span>'}</span>
          <span>${r.totalt.dødelenker > 0 ? `<b class="rød">🔗 ${r.totalt.dødelenker}</b>` : '<span class="grønn">🔗 0</span>'}</span>
          <span>📄 ${r.totalt.sider} sider</span>
        </div>
        <div class="åpne-knapp">Se rapport →</div>
      </a>`).join('')}
  </div>
</div>
<footer>UU-tester · axe-core + Playwright</footer>
</body>
</html>`;

fs.writeFileSync(path.join(docsDir, 'arkiv.html'), arkivHTML);
console.log(`✅ Arkiv generert med ${rapporter.length} rapporter → docs/arkiv.html`);
