# Cjenik — Pine Pottery

Dnevna objava cjenika proizvoda prema **Odluci o objavi cjenika proizvoda i usluga kao mjeri izravne kontrole cijena** i **Odluci o isticanju dodatne cijene** (obje NN 101/2026, primjena od 1. 10. 2026.).

Skripta povuče aktivne proizvode iz Shopifyja, zapiše `cjenik.csv` i `cjenik.xml` u `public/`, arhivira imenovanu kopiju i commita promjenu. Isti workflow onda objavi `public/` na GitHub Pages.

Adresa: <https://cjenik.pinepottery.art/> (webshop: <https://www.pinepottery.art>)

Nije pravni savjet — za granične slučajeve konzultirati knjigovođu ili HOK.

## Što sadrži cjenik

Jedanaest stupaca propisanih točkom III. Odluke: naziv, šifra, marka, jedinica mjere, cijena za jedinicu mjere, maloprodajna cijena, je li primijenjen poseban oblik prodaje i koji, sidrena cijena, barkod, dostupnost.

CSV je razdvojen točka-zarezom, u UTF-8 s BOM-om, s decimalnim zarezom i bez oznake valute — otvara se ispravno u hrvatskim postavkama Excela.

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

Dva crona (UTC): glavna objava `30 3 * * 1-5` (5:30 ljeti, 4:30 zimi) i kontrolna `30 4 * * 1-5` (6:30 ljeti, 5:30 zimi). Rok iz Odluke je 8:00. GitHubov raspoređivač zna kasniti i po pola sata, a rijetko i preskočiti pokretanje.

Zakazano pokretanje ne objavljuje ako u arhivi već postoji današnja datoteka, pa kontrolna objavi samo kad glavna nije prošla. Ručno pokretanje uvijek objavljuje.

Vikendom se ne izvodi jer Odluka traži objavu svakog **radnog** dana. Ako želiš i vikende, u oba crona zamijeni `1-5` sa `*`.

## Arhiva

Svaka objava zapisuje datoteku u `public/arhiva/` pod imenom propisanim točkom VI.:

```
internetska-trgovina_<adresa>_<oznaka-objekta>_<broj-pohrane>_<YYYYMMDD-HHmm>.csv
```

Broj pohrane raste monotono i čuva se u `public/arhiva/stanje.json`. Datoteke starije od 45 dana se brišu (Odluka traži najmanje 30). Uz to, svaka objava je i zaseban git commit — povijest repozitorija je dokaz što je i kada bilo objavljeno.

Vrijeme objave se za starenje i za prikaz čita **iz naziva datoteke**, ne iz vremena zadnje izmjene. Na GitHub Actionsu se repozitorij svaki put iznova klonira, pa sve arhivirane datoteke dobiju vrijeme checkouta — po njemu bi izgledale kao da su nastale jutros i čišćenje se nikad ne bi okinulo.

`public/arhiva/index.html` je popis arhive koji generator prepiše pri svakoj objavi. GitHub Pages ne radi automatski popis direktorija, pa bi `/arhiva/` bez njega vraćao 404.

Workflow radi uz `TZ: Europe/Zagreb`. Runner je inače u UTC-u, pa bi vrijeme u nazivu datoteke bilo sat-dva ranije od stvarnog vremena objave.

## Sidrena cijena

Sidrena cijena živi u Shopifyju kao metafield proizvoda **`custom.sidrena_cijena`** (tip: decimalni broj). Ista vrijednost hrani i prikaz na stranici proizvoda i ovaj cjenik, pa postoji samo jedan izvor istine.

Vrijednost je cijena zatečena **10. 9. 2026.** i **ne mijenja se** kad se promijeni prodajna cijena. Za proizvod uveden nakon tog datuma polje ostaje prazno; skripta ga tada izvijesti kao upozorenje, a stupac u cjeniku ostaje prazan.

## Barkod

Stupac `barkod` puni se iz Shopify polja *Barcode* varijante. Ručno izrađena keramika u pravilu nema GTIN/EAN oznake, pa stupac ostaje prazan. Odluka traži da stupac postoji, a on postoji i ostaje prazan jer podatka nema. Upisivanje izmišljene oznake bilo bi netočno, pa se ne radi.

Ako se jednom uvedu EAN oznake, dovoljno ih je upisati u Shopify i sljedeća objava ih pokupi bez ikakve izmjene skripte.

## Napomena o `public/_headers`

Ta datoteka je iz Cloudflare Pages postavljanja i na GitHub Pagesu **ne radi ništa** — GitHub ne dopušta vlastita zaglavlja. Nije problem: GitHub sam servira `.csv` kao `text/csv`, `.xml` kao XML, i na sve odgovore šalje `Access-Control-Allow-Origin: *`, pa automatizirano preuzimanje s drugih domena radi. Datoteka ostaje u repozitoriju za slučaj da se jednom prijeđe na Cloudflare.

## Održavanje

Skripta prekida rad ako se prijava na Shopify ne uspije ili ako Shopify vrati nula proizvoda, da se ne objavi prazan cjenik. Workflow tada padne i GitHub pošalje mail.

Na kraju svakog izvođenja ispisuje upozorenja za proizvode bez sidrene cijene, bez šifre i bez barkoda — vrijedi ih povremeno pogledati u logu.

### Kad dodaš novi proizvod

1. Postavi mu `custom.sidrena_cijena` ako je bio u prodaji 10. 9. 2026. Ako nije, ostavi prazno i zabilježi zašto.
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
