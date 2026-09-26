# Google organic search — testovací úloha

Malá aplikace: HTML/CSS/JavaScript + Node.js, bez externích npm závislostí.
Frontend posílá GET s parametrem q na vlastní server.
Server posílá dotaz do Serper Google Search API; prohlížeč dostává pouze
organické výsledky a umožňuje stáhnout jejich JSON.

## Spuštění

1. Nainstalujte Node.js 24 (na této hlavní verzi je projekt ověřen).
2. Zkopírujte `.env.example` do `.env`.
3. Vytvořte účet na https://serper.dev a vložte svůj klíč do `SERPER_API_KEY` v `.env`.
4. Spusťte `npm start` a otevřete http://localhost:3000.

Žádné `npm install` není potřeba. Pro vývoj použijte `npm run dev`.
Klíč nepatří do HTML, klientského JavaScriptu, Gitu ani ZIP souboru.

## Formulář a HTTP API

Design vychází z dodaného HTML: tmavé pozadí, animovaný svítící rámeček,
jedno pole `id="search-input"`, `name="q"`, tlačítko Vyhledat.
Dokument používá `lang="cs"`. CSS je v `public/style.css`, protože CSP
serveru nepovoluje vložené styly. Preferenci omezeného pohybu respektuje CSS.

Formulář má `action="/api/search" method="get"`.
JavaScript zachytí submit a zavolá stejný endpoint:

```text
GET /api/search?q=kav%C3%A1rny+Praha
```

Parametry kóduje `URL.searchParams`, takže diakritika, &, + a # zůstávají
součástí dotazu. `q` musí být uvedeno právě jednou; po trim má 1–200 znaků.
Server vrátí JSON s query, engine, provider, page, country, language, results.
Každý výsledek má position, title, link, description.
POST na tento endpoint vrací 405 a hlavičku Allow: GET.

Bez JavaScriptu nativní formulář otevře odpověď API přímo jako JSON.
S JavaScriptem zůstává uživatel na stránce, vidí stav načítání, výsledky
nebo srozumitelnou chybu a může stáhnout JSON bez dalšího API požadavku.
Export je dostupný i pro úspěšný prázdný seznam. Nové hledání vždy zruší
předchozí export. Seznam vzniká přes DOM a textContent, nikoli innerHTML.
Klíč je pouze na serveru. Požadavek server → Serper stále používá POST.

GET obsahuje dotaz v URL: může se objevit v přístupových logách hostingu;
při nativním odeslání bez JavaScriptu také v historii prohlížeče.
Odpovědi API mají Cache-Control: no-store a Referrer-Policy: no-referrer.

## Testy

```sh
npm test
```

Testy používají vestavěné `node:test` a `node:assert/strict`.
Ověřují přesný obsah výstupu, vynechání reklam a dalších bloků,
chybějící popis, prázdné výsledky, neplatná data, validaci dotazu,
parametry první stránky, JSON export, chybové stavy, GET parametr q včetně
diakritiky a speciálních znaků, chybnou konfiguraci a limit požadavků.
Celkem 10 testových bloků: jednotkové a integrační HTTP testy.
API je v testech nahrazeno řízenou odpovědí: testy nepotřebují klíč,
nespotřebovávají kredit a nejsou závislé na proměnlivém pořadí Google.
Zelené testy samy o sobě nepotvrzují dostupnost skutečného API.

## Co znamená první stránka

Jeden požadavek na `https://google.serper.dev/search` s `page: 1`, `num: 10`,
`gl: "cz"`, `hl: "cs"`. Žádné další stránky se nestahují.
Zpracovává se pouze pole `organic`; počet výsledků může být menší než deset.
Pořadí a pozice se přebírají od poskytovatele. Chybějící snippet se exportuje
jako prázdný řetězec. Prázdné pole organic je platný výsledek; chybějící nebo
poškozené pole je chyba kontraktu, nikoli úspěšné vyhledání bez výsledků.
Výsledky se mohou lišit od osobního prohlížeče podle času a lokalizace.
Oficiální ukázka struktury: https://serper.dev/.

## Soubory

- `src/search.js`: validace, volání poskytovatele, výběr a normalizace výsledků.
- `src/server.js`: HTTP server, API a explicitní seznam veřejných souborů.
- `src/export.js`: serializace JSON společná pro prohlížeč a testy.
- `public/app.js`: formulář, zobrazení výsledků pomocí textContent, stažení přes Blob.
- `test/search.test.js`: jednotkové testy a integrační kontrola HTTP.

Výstup obsahuje query, engine, provider, page, country, language a results.
Každý výsledek obsahuje position, title, link, description.
Stažení exportuje již zobrazená data a nevolá API znovu.

## Stav ověření této verze

Všech 10 automatických testových bloků prošlo na Node.js 24.
Živé vyhledávání vyžaduje vlastní klíč Serper a v této verzi nebylo ověřeno.
Vizuální kontrolu a stažení v opravdovém prohlížeči se v prostředí přípravy
nepodařilo spustit (nebyl dostupný prohlížeč). Před odevzdáním ověřte
Enter i tlačítko, mobilní vzhled, stažený JSON a chybu nového vyhledávání.
Aplikace není tímto archivem zveřejněna na internetu.

## Docker Compose — lokální vývoj

Nejprve vytvořte `.env`, poté:

```sh
docker compose up --build
docker compose exec app npm test
docker compose down
```

Zdrojové adresáře jsou připojené jako volumes a Node běží v režimu watch.
Image neobsahuje `.env`; proměnné se předávají za běhu.
Docker nebyl v prostředí přípravy tohoto archivu spuštěn.

## Nasazení

Aplikace potřebuje hosting s běžícím Node.js serverem nebo Docker kontejnerem.
Pouhý statický hosting nestačí. Příkaz: `npm start`; nastavte tajnou proměnnou
`SERPER_API_KEY` a port `PORT`, pokud jej hosting vyžaduje. Server naslouchá na
0.0.0.0. Použijte HTTPS terminované hostingem. Frontend a API mají stejný origin.

Před odesláním ověřte na veřejné adrese skutečný dotaz, otevření odkazu,
stažení JSON a shodu JSON se zobrazenými výsledky. Ověřte, že příjemce
adresu otevře bez vašeho účtu. Tento archiv sám o sobě není nasazení.

Jednoduchý globální limit je 20 požadavků/minutu na proces. Chrání demo jen
částečně: restart jej resetuje, více instancí limit nesdílí a útočník může
vyčerpat kvótu ostatním. Před veřejným provozem nastavte rozpočtový limit
u poskytovatele a podle hostingu přidejte trvalý rate limit.

## Video a odevzdání

Video musí autor nahrát vlastními slovy. Doporučené pořadí:
1. Zadat dotaz na veřejné stránce a ukázat výsledky.
2. Stáhnout a otevřít JSON.
3. Vysvětlit tok formulář → server → Serper → organic → prohlížeč.
4. Ukázat, kde server čte klíč, bez zobrazení skutečné hodnoty.
5. Vysvětlit extractOrganic a test s reklamou ve vstupních datech.
6. Spustit npm test a ukázat úspěšné testy.
7. Vysvětlit omezení a proč testy nevolají živé API.

K odevzdání je potřeba veřejný odkaz, vlastní video a ZIP bez `.env`.
Kód vytvořený s pomocí asistenta si projděte a upravte podle svých znalostí.
Neprezentujte pomoc jako samostatnou práci, pokud by to odporovalo pravidlům výběru.
