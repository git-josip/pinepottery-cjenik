# Cjenik — Pine Pottery

Dnevna objava cjenika robe prema **Pravilniku o načinu objave cjenika proizvoda** i **Pravilniku o isticanju bazne cijene proizvoda** (oba NN 132/2026, na snazi od 17. 11. 2026.). Ti pravilnici su zamijenili Odluke iz NN 101/2026 i 110/2026, koje su istog dana prestale važiti.

Skripta povuče aktivne proizvode iz Shopifyja, zapiše `cjenik.csv` i `cjenik.xml` u `public/`, arhivira imenovanu kopiju i commita promjenu. Isti workflow onda objavi `public/` na GitHub Pages.

Adresa: <https://cjenik.pinepottery.art/> (webshop: <https://www.pinepottery.art>)

Nije pravni savjet — za granične slučajeve konzultirati knjigovođu ili HOK.

## Što sadrži cjenik

Stupci idu redoslijedom iz čl. 3. st. 2. Pravilnika, a taj je redoslijed obvezan (st. 4.): `naziv_robe`, `sifra_robe`, `marka_robe`, `neto_kolicina`, `jedinica_mjere`, `maloprodajna_cijena`, `poseban_oblik_prodaje` (DA/NE), `cijena_za_jedinicu_mjere`, `barkod`, `ean_barkod`, `bazna_cijena`. Nazive stupaca Pravilnik ne propisuje. Neto količina ostaje prazna, jer se traži samo za robu kojoj je posebnim propisom propisana cijena za jedinicu mjere.

CSV je razdvojen točka-zarezom (čl. 6. st. 7.) i kodiran u UTF-8 **bez BOM-a** (st. 6.). Decimale su sa zarezom, bez oznake valute. Excel bez BOM-a može krivo prikazati dijakritiku; u tom slučaju datoteku otvori preko Podaci → Iz teksta/CSV-a, s kodiranjem UTF-8.

## Postavljanje (jednokratno)

### 1. Shopify aplikacija i vjerodajnice

Od 1. 1. 2026. Shopify više ne dopušta stvaranje custom aplikacija iz admina, pa ide preko Dev Dashboarda: **Create app** → naziv `Pine Pottery cjenik` → dodaj opseg **`read_products`** (i ništa drugo) → **Release a version** → **Install** na trgovinu.

U postavkama aplikacije kopiraj **Client ID** i **Client secret**.

Trajnih tokena više nema. Skripta pri svakom pokretanju razmijeni ID i secret za pristupni token koji vrijedi 24 sata. Token se nigdje ne zapisuje ni ne commita.

Uvjet: aplikacija i trgovina moraju biti u istoj Shopify organizaciji, inače ta razmjena ne radi.

### 2. GitHub secrets

Repozitorij → Settings → Secrets and variables → Actions → New repository secret:

| Ime | Vrijednost |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | `<trgovina>.myshopify.com` (ne `pinepottery.art`) |
| `SHOPIFY_CLIENT_ID` | Client ID iz koraka 1 |
| `SHOPIFY_CLIENT_SECRET` | Client secret iz koraka 1 |

### 3. GitHub Pages

Repozitorij mora biti **public** — Pages na besplatnom planu ne radi za privatne repozitorije.

Settings → Pages → Source: **GitHub Actions**. Ništa više; objavu radi workflow, korakom `upload-pages-artifact` + `deploy-pages`.

### 4. Poddomena

1. Kod registrara (name.com) CNAME zapis `cjenik` → `git-josip.github.io`.
2. Settings → Pages → Custom domain → `cjenik.pinepottery.art` → Save.
3. Kad certifikat izađe, uključi *Enforce HTTPS*.

Redoslijed je bitan: postavljanje domene prije nego DNS zapis proradi obori postojeću adresu.

### 5. Link na webshopu

U podnožje Shopify teme dodaj vidljiv link **Cjenik**, dostupan bez prijave.

### 6. Prva objava

Actions → *Objava cjenika* → Run workflow. Provjeri da se datoteke pojave i da se `cjenik.csv` otvara u anonimnom prozoru.

## Raspored

Dva crona (UTC): glavna objava `30 3 * * *` (5:30 ljeti, 4:30 zimi) i kontrolna `30 4 * * *` (6:30 ljeti, 5:30 zimi). Pravilnik traži da izmijenjeni cjenik bude objavljen najkasnije do 11:00 na dan izmjene (čl. 3. st. 5.), i to vrijedi i vikendom. GitHubov raspoređivač zna kasniti i po pola sata, a rijetko i preskočiti pokretanje.

Zakazano pokretanje ne objavljuje ako u arhivi već postoji današnja datoteka, pa kontrolna objavi samo kad glavna nije prošla. Ručno pokretanje uvijek objavljuje.

### Vanjski okidač (cron-job.org)

GitHubov `schedule` od 26. 8. 2026. u mnogim repozitorijima ne okida ili kasni satima (community discussions #206019, #207346; bez odgovora GitHuba). Zato objavu pokreće i cron-job.org preko API-ja:

- POST `https://api.github.com/repos/git-josip/pinepottery-cjenik/actions/workflows/cjenik.yml/dispatches`
- zaglavlja `Authorization: Bearer <PAT>` i `Accept: application/vnd.github+json`
- tijelo `{"ref":"main","inputs":{"rezerva":"true"}}`
- svaki dan u 5:30 i 6:30, vremenska zona Europe/Zagreb (u cron-job.org prebaciti s pon–pet na svaki dan)
- uspjeh = HTTP 204

PAT je fine-grained, samo za ovaj repozitorij, s dozvolom **Actions: Read and write**. Vrijedi godinu dana — obnoviti ga prije isteka, inače okidač tiho prestaje raditi.

S `rezerva=true` run ne objavljuje ako je danas već objavljeno, pa se GitHubov cron i vanjski okidač ne sudaraju.

Objava ide svaki dan, i vikendom, jer bi i subotnja izmjena cijene morala izaći do 11:00 istog dana.

## Arhiva

Imamo jedno prodajno mjesto (webshop), pa se naziv datoteke slaže po čl. 6. st. 4.: matični broj obrta (MBO, ne OIB), `ZA_SVA_PRODAJNA_MJESTA`, vrsta cjenika, broj pohrane i vrijeme `GGGGMMDD_SSMM`. Aktualna datoteka stoji u korijenu `public/`, a prethodna se s tog mjesta uklanja (st. 2.). Kopija svake objave ide u `public/arhiva/`. Ista aktualna datoteka objavljuje se i pod stalnim imenom `cjenik.csv`/`cjenik.xml`, a naslovnica u bloku `<!-- AKTUALNO -->` vodi na datoteku s propisanim nazivom.

```
98311158_ZA_SVA_PRODAJNA_MJESTA_ROBA_<broj-pohrane>_<GGGGMMDD_SSMM>.csv
```

Broj pohrane raste monotono i čuva se u `public/arhiva/stanje.json`. Datoteke starije od 31 dana se brišu. Pravilnik traži 15 dana od zamjene novim cjenikom, a mi čuvamo s velikom zalihom. Datoteke sa starim nazivom (`internetska-trgovina_…`, do 17. 11. 2026.) sama arhiva još prepoznaje i briše ih kad isteknu. Uz to, svaka objava je i zaseban git commit — povijest repozitorija je dokaz što je i kada bilo objavljeno.

Vrijeme objave se za starenje i za prikaz čita **iz naziva datoteke**, ne iz vremena zadnje izmjene. Na GitHub Actionsu se repozitorij svaki put iznova klonira, pa sve arhivirane datoteke dobiju vrijeme checkouta — po njemu bi izgledale kao da su nastale jutros i čišćenje se nikad ne bi okinulo.

`public/arhiva/index.html` je popis arhive koji generator prepiše pri svakoj objavi. GitHub Pages ne radi automatski popis direktorija, pa bi `/arhiva/` bez njega vraćao 404.

Workflow radi uz `TZ: Europe/Zagreb`. Runner je inače u UTC-u, pa bi vrijeme u nazivu datoteke bilo sat-dva ranije od stvarnog vremena objave.

## Bazna (sidrena) cijena

Bazna cijena, ranije zvana sidrena, živi u Shopifyju kao metafield proizvoda **`custom.sidrena_cijena`** (tip: decimalni broj). Metafield je zadržao staro ime, a u cjeniku je stupac `bazna_cijena`. Ista vrijednost hrani i prikaz na stranici proizvoda i ovaj cjenik, pa postoji samo jedan izvor istine.

Vrijednost je cijena zatečena **10. 9. 2026.** i **ne mijenja se** kad se promijeni prodajna cijena. Za proizvod uveden nakon tog datuma upisuje se cijena prvog uvrštenja u prodaju (vidi „Kad dodaš novi proizvod”); prazno polje skripta izvijesti kao upozorenje, a stupac u cjeniku ostaje prazan.

## Barkod

Stupac `barkod` puni se iz Shopify polja *Barcode* varijante. Ručno izrađena keramika u pravilu nema GTIN/EAN oznake, pa stupac ostaje prazan. Stupac `ean_barkod` se popunjava samo kada je barkod EAN-8 ili EAN-13 (8 ili 13 znamenki). Pravilnik traži stupac "ako je primjenjivo", a on postoji i ostaje prazan jer podatka nema. Upisivanje izmišljene oznake bilo bi netočno, pa se ne radi.

Ako se jednom uvedu EAN oznake, dovoljno ih je upisati u Shopify i sljedeća objava ih pokupi bez ikakve izmjene skripte.

## Napomena o `public/_headers`

Ta datoteka je iz Cloudflare Pages postavljanja i na GitHub Pagesu **ne radi ništa** — GitHub ne dopušta vlastita zaglavlja. Nije problem: GitHub sam servira `.csv` kao `text/csv`, `.xml` kao XML, i na sve odgovore šalje `Access-Control-Allow-Origin: *`, pa automatizirano preuzimanje s drugih domena radi. Datoteka ostaje u repozitoriju za slučaj da se jednom prijeđe na Cloudflare.

## Održavanje

Skripta prekida rad ako se prijava na Shopify ne uspije ili ako Shopify vrati nula proizvoda, da se ne objavi prazan cjenik. Workflow tada padne i GitHub pošalje mail.

Na kraju svakog izvođenja ispisuje upozorenja za proizvode bez bazne cijene, bez šifre i bez barkoda — vrijedi ih povremeno pogledati u logu.

### Kad dodaš novi proizvod

1. Postavi mu `custom.sidrena_cijena`: ako je bio u prodaji 10. 9. 2026., cijena toga dana; ako je nov, **cijena prvog uvrštenja u prodaju** (Pojašnjenja MINGO 22. 9. 2026., „Novoulistani proizvodi”: dodatna cijena je cijena primijenjena prilikom prvog uvrštenja, uz naznaku datuma – tema na webu uz nju ispisuje datum objave proizvoda). Pri kloniranju proizvoda polje se kopira – **uvijek ga provjeri** (6. 11. 2026. tri klonirana proizvoda imala su krivu vrijednost).
2. Provjeri ima li šifru (SKU) — obvezan je stupac.
3. Sljedeća objava ga pokupi sama.

## Lokalno pokretanje

```bash
export SHOPIFY_STORE_DOMAIN=<trgovina>.myshopify.com
export SHOPIFY_CLIENT_ID=...
export SHOPIFY_CLIENT_SECRET=...
npm run generate
```

## Stanje

Postavljeno 29. 9. 2026.: objava na `cjenik.pinepottery.art`, glavni i kontrolni cron te input `rezerva` za vanjski okidač.
