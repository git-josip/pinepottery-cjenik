#!/usr/bin/env node
/**
 * Generira cjenik proizvoda prema Odluci o objavi cjenika proizvoda i usluga
 * kao mjeri izravne kontrole cijena (NN 101/2026), uz sidrenu cijenu iz
 * Odluke o isticanju dodatne cijene (NN 101/2026).
 *
 * Izvor podataka: Shopify Admin GraphQL API.
 * Izlaz: public/cjenik.csv, public/cjenik.xml (uvijek najnovija verzija)
 *        public/arhiva/<naziv-po-odluci>.csv|.xml (trajni zapis svake objave)
 *        public/arhiva/index.html (popis arhive; GitHub Pages ne generira
 *        automatski popis direktorija, pa ga pisemo sami)
 *
 * Pokretanje: node scripts/generate-cjenik.mjs
 * Potrebne varijable okoline:
 *   SHOPIFY_STORE_DOMAIN   npr. tvoja-trgovina.myshopify.com
 *   SHOPIFY_CLIENT_ID      Client ID aplikacije iz Dev Dashboarda
 *   SHOPIFY_CLIENT_SECRET  Client secret iste aplikacije
 *
 * Od 1. 1. 2026. Shopify vise ne izdaje trajne tokene za custom aplikacije.
 * Skripta pri svakom pokretanju razmijeni ID i secret za pristupni token
 * koji vrijedi 24 sata (client credentials grant). Token nigdje ne zapisujemo.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));

const STORE = process.env.SHOPIFY_STORE_DOMAIN;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = CONFIG.shopifyApiVersion;

// Podaci o trgovcu su obvezni u objavi. Ne objavljujemo s nepopunjenim configom.
if (Object.values(CONFIG.trgovac).some((v) => !v || v === 'TODO')) {
  console.error('config.json: popuni trgovac.naziv, trgovac.oib i trgovac.adresa.');
  process.exit(1);
}

if (!STORE || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Nedostaje SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID ili SHOPIFY_CLIENT_SECRET.');
  process.exit(1);
}

/* ---------- pristupni token (client credentials grant) ---------- */

async function dohvatiToken() {
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    // Shopify razlog vraca u JSON-u ili u <title> HTML stranice
    // (npr. "Oauth error application_cannot_be_found"). Tijelo ne sadrzi tajne.
    const tijelo = await res.text();
    const razlog = tijelo.match(/<title>([^<]*)<\/title>/)?.[1] ?? tijelo.slice(0, 200);
    throw new Error(`Neuspjesna prijava na Shopify (HTTP ${res.status}: ${razlog.trim()}). ` +
      'Provjeri Client ID i secret te je li aplikacija instalirana na trgovinu ' +
      'i pripada li istoj Shopify organizaciji.');
  }
  const json = await res.json();
  if (!json.access_token) throw new Error('Shopify nije vratio pristupni token.');
  return json.access_token;
}

const TOKEN = await dohvatiToken();

/* ---------- dohvat iz Shopifyja ---------- */

const QUERY = `
query Cjenik($cursor: String) {
  products(first: 100, after: $cursor, query: "status:active", sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        title
        vendor
        sidrena: metafield(namespace: "custom", key: "sidrena_cijena") { value }
        variants(first: 100) {
          edges {
            node {
              title
              sku
              barcode
              price
              compareAtPrice
              inventoryQuantity
              availableForSale
            }
          }
        }
      }
    }
  }
}`;

async function shopify(query, variables) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function dohvatiProizvode() {
  const redovi = [];
  let cursor = null;
  do {
    const data = await shopify(QUERY, { cursor });
    for (const { node: p } of data.products.edges) {
      for (const { node: v } of p.variants.edges) {
        const naziv = v.title && v.title !== 'Default Title' ? `${p.title} - ${v.title}` : p.title;
        const cijena = Number(v.price);
        const usporedna = v.compareAtPrice ? Number(v.compareAtPrice) : null;
        const akcija = usporedna !== null && usporedna > cijena;
        redovi.push({
          naziv,
          sifra: v.sku || '',
          marka: p.vendor || CONFIG.zadanaMarka,
          jedinicaMjere: CONFIG.zadanaJedinicaMjere,
          cijenaPoJedinici: cijena,
          maloprodajnaCijena: cijena,
          posebanOblikProdaje: akcija,
          nazivPosebnogOblikaProdaje: akcija ? CONFIG.nazivPosebnogOblikaProdaje : '',
          sidrenaCijena: p.sidrena?.value != null ? Number(p.sidrena.value) : null,
          barkod: v.barcode || '',
          dostupnost: v.inventoryQuantity > 0
            ? CONFIG.oznakaNaZalihi
            : (v.availableForSale ? CONFIG.oznakaPoNarudzbi : CONFIG.oznakaNedostupno),
        });
      }
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return redovi;
}

/* ---------- formatiranje ---------- */

const novac = (n) => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','));

const STUPCI = [
  'naziv_proizvoda',
  'sifra_proizvoda',
  'marka',
  'neto_kolicina_jedinica_mjere',
  'cijena_za_jedinicu_mjere',
  'maloprodajna_cijena',
  'poseban_oblik_prodaje',
  'naziv_posebnog_oblika_prodaje',
  'sidrena_cijena',
  'barkod',
  'dostupnost',
];

function csvPolje(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function uCsv(redovi) {
  const linije = [STUPCI.join(';')];
  for (const r of redovi) {
    linije.push([
      r.naziv,
      r.sifra,
      r.marka,
      r.jedinicaMjere,
      novac(r.cijenaPoJedinici),
      novac(r.maloprodajnaCijena),
      r.posebanOblikProdaje ? 'DA' : 'NE',
      r.nazivPosebnogOblikaProdaje,
      novac(r.sidrenaCijena),
      r.barkod,
      r.dostupnost,
    ].map(csvPolje).join(';'));
  }
  // BOM zbog ispravnog prikaza dijakritike u Excelu
  return '﻿' + linije.join('\r\n') + '\r\n';
}

const xmlEscape = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function uXml(redovi, meta) {
  const stavke = redovi.map((r) => `  <proizvod>
    <naziv_proizvoda>${xmlEscape(r.naziv)}</naziv_proizvoda>
    <sifra_proizvoda>${xmlEscape(r.sifra)}</sifra_proizvoda>
    <marka>${xmlEscape(r.marka)}</marka>
    <neto_kolicina_jedinica_mjere>${xmlEscape(r.jedinicaMjere)}</neto_kolicina_jedinica_mjere>
    <cijena_za_jedinicu_mjere>${novac(r.cijenaPoJedinici)}</cijena_za_jedinicu_mjere>
    <maloprodajna_cijena>${novac(r.maloprodajnaCijena)}</maloprodajna_cijena>
    <poseban_oblik_prodaje>${r.posebanOblikProdaje ? 'DA' : 'NE'}</poseban_oblik_prodaje>
    <naziv_posebnog_oblika_prodaje>${xmlEscape(r.nazivPosebnogOblikaProdaje)}</naziv_posebnog_oblika_prodaje>
    <sidrena_cijena>${novac(r.sidrenaCijena)}</sidrena_cijena>
    <barkod>${xmlEscape(r.barkod)}</barkod>
    <dostupnost>${xmlEscape(r.dostupnost)}</dostupnost>
  </proizvod>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<cjenik>
  <trgovac>
    <naziv>${xmlEscape(CONFIG.trgovac.naziv)}</naziv>
    <oib>${xmlEscape(CONFIG.trgovac.oib)}</oib>
    <adresa>${xmlEscape(CONFIG.trgovac.adresa)}</adresa>
  </trgovac>
  <objava>
    <oblik_prodajnog_objekta>${xmlEscape(CONFIG.oblikProdajnogObjekta)}</oblik_prodajnog_objekta>
    <oznaka_objekta>${xmlEscape(CONFIG.oznakaObjekta)}</oznaka_objekta>
    <broj_pohrane>${meta.brojPohrane}</broj_pohrane>
    <datum_vrijeme>${meta.iso}</datum_vrijeme>
  </objava>
${stavke}
</cjenik>
`;
}

/* ---------- imenovanje datoteka i arhiva ---------- */

const slug = (s) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function vremenskaOznaka(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function sljedeciBrojPohrane(putanjaStanja) {
  let stanje = { brojPohrane: 0 };
  try { stanje = JSON.parse(readFileSync(putanjaStanja, 'utf8')); } catch { /* prvi put */ }
  stanje.brojPohrane = (stanje.brojPohrane || 0) + 1;
  writeFileSync(putanjaStanja, JSON.stringify(stanje, null, 2) + '\n');
  return stanje.brojPohrane;
}

/**
 * Vrijeme objave citamo iz naziva datoteke (_YYYYMMDD-HHmm), ne iz mtime-a.
 * Na GitHub Actionsu se repozitorij svaki put iznova klonira, pa svi arhivirani
 * zapisi dobiju vrijeme checkouta - po mtime-u bi izgledali kao da su svi
 * nastali jutros, cisscenje se nikad ne bi okinulo, a popis bi pokazivao
 * pogresne datume. Naziv datoteke je jedini pouzdan izvor.
 */
const VREMENSKI_UZORAK = /_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.(?:csv|xml)$/;

function brojPohraneIzNaziva(ime) {
  const m = ime.match(/_(\d+)_\d{8}-\d{4}\.(?:csv|xml)$/);
  return m ? Number(m[1]) : 0;
}

function vrijemeIzNaziva(ime) {
  const m = ime.match(VREMENSKI_UZORAK);
  if (!m) return null;
  const [, g, mj, d, h, min] = m;
  return new Date(Number(g), Number(mj) - 1, Number(d), Number(h), Number(min));
}

function ocistiArhivu(dir, danaZadrzati) {
  const granica = Date.now() - danaZadrzati * 24 * 60 * 60 * 1000;
  for (const ime of readdirSync(dir)) {
    if (ime === '.gitkeep' || ime === 'stanje.json' || ime === 'index.html') continue;
    const vrijeme = vrijemeIzNaziva(ime);
    // Datoteku bez prepoznatljivog vremena radije zadrzimo nego obrisemo.
    if (vrijeme && vrijeme.getTime() < granica) unlinkSync(join(dir, ime));
  }
}

const htmlEscape = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * GitHub Pages ne generira popis direktorija, pa bi /arhiva/ inace vracao 404.
 * Nakon svake objave prepisemo popis onoga sto je stvarno u mapi.
 */
function zapisiPopisArhive(dir) {
  const datoteke = readdirSync(dir)
    .filter((ime) => ime.endsWith('.csv') || ime.endsWith('.xml'))
    .map((ime) => ({
      ime,
      vrsta: ime.endsWith('.csv') ? 'csv' : 'xml',
      vrijeme: vrijemeIzNaziva(ime),
      brojPohrane: brojPohraneIzNaziva(ime),
      velicina: statSync(join(dir, ime)).size,
    }));

  // CSV i XML iste objave dijele naziv bez ekstenzije, pa ih spajamo u jedan red.
  const objave = new Map();
  for (const d of datoteke) {
    const kljuc = d.ime.replace(/\.(csv|xml)$/, '');
    if (!objave.has(kljuc)) objave.set(kljuc, { vrijeme: d.vrijeme, brojPohrane: d.brojPohrane });
    objave.get(kljuc)[d.vrsta] = d;
  }
  // Najnovije gore; unutar iste minute presudi redni broj pohrane.
  const redovi = [...objave.values()].sort((a, b) =>
    (b.vrijeme?.getTime() ?? 0) - (a.vrijeme?.getTime() ?? 0) || b.brojPohrane - a.brojPohrane);

  const dvije = (n) => String(n).padStart(2, '0');
  const poveznica = (d, oznaka) => d
    ? `<a href="${htmlEscape(d.ime)}" title="${htmlEscape(d.ime)}">${oznaka}</a> <span class="velicina">${Math.max(1, Math.round(d.velicina / 1024))} kB</span>`
    : '<span class="fali">&mdash;</span>';

  const stavke = redovi.map((r, i) => {
    const v = r.vrijeme;
    const dan = v ? `${v.getDate()}. ${v.getMonth() + 1}. ${v.getFullYear()}.` : 'nepoznato';
    const sat = v ? `${dvije(v.getHours())}:${dvije(v.getMinutes())}` : '';
    const oznaka = i === 0 ? ' <span class="aktualni">aktualni</span>' : '';
    return `      <tr>
        <th scope="row">${dan}${oznaka}</th>
        <td class="vrijeme">${sat}</td>
        <td>${poveznica(r.csv, 'CSV')}</td>
        <td>${poveznica(r.xml, 'XML')}</td>
        <td class="broj">${r.brojPohrane || ''}</td>
      </tr>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arhiva cjenika — Pine Pottery</title>
<link rel="icon" type="image/png" href="../favicon.png">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Halant:wght@400;600&family=Open+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="../stil.css">
</head>
<body>
<main>
  <header class="zaglavlje">
    <a href="https://www.pinepottery.art"><img src="../logo.png" alt="Pine Pottery" width="395" height="320"></a>
  </header>

  <h1>Arhiva cjenika</h1>
  <p class="lead">Objavljeni cjenici u strojno čitljivom obliku, dostupni najmanje 30 dana od objave, prema Odluci o objavi cjenika proizvoda i usluga (NN 101/2026).</p>
  <p class="danas">Aktualni cjenik: <a href="../cjenik.csv">CSV</a> &middot; <a href="../cjenik.xml">XML</a> &middot; <a href="../">naslovnica</a></p>

  <div class="tablica">
  <table>
    <thead>
      <tr><th scope="col">Dan</th><th scope="col">Vrijeme</th><th scope="col">CSV</th><th scope="col">XML</th><th scope="col" class="broj">Br. pohrane</th></tr>
    </thead>
    <tbody>
${stavke}
    </tbody>
  </table>
  </div>

  <footer>
    Naziv svake datoteke sadrži oblik prodajnog objekta, adresu, oznaku objekta, broj pohrane
    i vrijeme objave, prema točki VI. Odluke. Prikazano vrijeme je vrijeme objave očitano iz
    naziva datoteke. Puni naziv datoteke vidi se zadržavanjem pokazivača na poveznici.
    <br><a class="natrag" href="https://www.pinepottery.art">&larr; Natrag na webshop</a>
  </footer>
</main>
</body>
</html>
`;
  writeFileSync(join(dir, 'index.html'), html);
  return datoteke.length;
}

/* ---------- glavni tok ---------- */

const sada = new Date();
const publicDir = join(ROOT, 'public');
const arhivaDir = join(publicDir, 'arhiva');
mkdirSync(arhivaDir, { recursive: true });

const brojPohrane = sljedeciBrojPohrane(join(arhivaDir, 'stanje.json'));
const osnova = [
  slug(CONFIG.oblikProdajnogObjekta),
  slug(CONFIG.trgovac.adresa),
  slug(CONFIG.oznakaObjekta),
  String(brojPohrane),
  vremenskaOznaka(sada),
].join('_');

const redovi = await dohvatiProizvode();
if (redovi.length === 0) throw new Error('Shopify nije vratio nijedan aktivan proizvod - prekidam da ne objavim prazan cjenik.');

const meta = { brojPohrane, iso: sada.toISOString() };
const csv = uCsv(redovi);
const xml = uXml(redovi, meta);

writeFileSync(join(publicDir, 'cjenik.csv'), csv);
writeFileSync(join(publicDir, 'cjenik.xml'), xml);
writeFileSync(join(arhivaDir, `${osnova}.csv`), csv);
writeFileSync(join(arhivaDir, `${osnova}.xml`), xml);

ocistiArhivu(arhivaDir, CONFIG.danaArhive);
const uArhivi = zapisiPopisArhive(arhivaDir);

const bezSidrene = redovi.filter((r) => r.sidrenaCijena === null);
const bezSifre = redovi.filter((r) => !r.sifra);
const bezBarkoda = redovi.filter((r) => !r.barkod);

console.log(`Cjenik objavljen: ${redovi.length} stavki, broj pohrane ${brojPohrane}, datoteka ${osnova}`);
console.log(`Arhiva: ${uArhivi} datoteka.`);
if (bezSidrene.length) console.warn(`UPOZORENJE: bez sidrene cijene (${bezSidrene.length}): ${bezSidrene.map((r) => r.naziv).join(', ')}`);
if (bezSifre.length) console.warn(`UPOZORENJE: bez sifre (${bezSifre.length}): ${bezSifre.map((r) => r.naziv).join(', ')}`);
if (bezBarkoda.length) console.warn(`Napomena: bez barkoda (${bezBarkoda.length}).`);
