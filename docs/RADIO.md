# Adverteren op de Radio — Prospect Finder & Scorer

Interne prospecting-tool voor accountmanager Eric: Nederlandse bedrijven vinden
en prioriteren voor outbound via LinkedIn/Waalaxy.

Het uitgangspunt is **FIT × TIMING**, niet volume. De tool beantwoordt twee
vragen per bedrijf: *past radio hierbij?* (Fit Score) en *is er nú een
aanleiding?* (Trigger Score).

Leeft op de route **`/radio`** binnen deze Next.js-app. Zie
[`../PLAN.md`](../PLAN.md) voor de architectuurkeuzes.

---

## 1. Snel starten

```bash
npm install
npm run dev
# → http://localhost:3000/radio
```

Dat is alles. Zonder configuratie gebruikt de tool:

- een **JSON-bestand** als database (`.data/radio-prospects.json`, wordt
  automatisch aangemaakt en is git-ignored);
- de **trefwoord-heuristiek** als research-engine (geen API-key nodig).

Lokaal is `/radio` niet met een wachtwoord beveiligd; je krijgt daarover een
waarschuwing in de serverlog. In productie is het scherm zónder
`ADMIN_USERNAME`/`ADMIN_PASSWORD` geblokkeerd.

### Even proberen zonder echte bedrijven

Klik op **Demo-data laden** op het dashboard. Dat plaatst vier fictieve
prospects (Tier A t/m D, één met knock-out) waarmee je de tabel, filters,
scoreopbouw en de Waalaxy-export kunt bekijken. Ze zijn onmiskenbaar nep:
de naam begint met `DEMO —`, alle URL's staan op het gereserveerde
`.invalid`-domein, en ze dragen een DEMO-badge. **Demo-data wissen** haalt ze
weer weg.

### AI-analyse aanzetten (aanbevolen)

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Herstart de dev-server. Het dashboard laat onderaan zien welke engine actief is.
Werkt jouw key niet met het standaardmodel (`claude-sonnet-5`), zet dan
`RADIO_RESEARCH_MODEL` op een model dat je wél hebt — anders valt de research
terug op de heuristiek en zie je dat als waarschuwing in de UI.

### Op Postgres in plaats van een bestand

Is er een `POSTGRES_URL` of `DATABASE_URL` (bijv. via de Vercel↔Supabase-
integratie), dan kiest de tool automatisch Postgres en migreert de tabel
`radio_prospects` zichzelf bij het eerste gebruik. Forceren kan met
`RADIO_STORE_DRIVER=postgres` of `=file`.

Handmatig migreren: `POST /api/radio/migrate?secret=$MIGRATE_SECRET`.
Het SQL-schema staat in [`../supabase/migrations/0002_radio_prospects.sql`](../supabase/migrations/0002_radio_prospects.sql).

---

## 2. De workflow

```
bedrijven vinden of toevoegen → publieke data ophalen → scoren
                              → angle + rol bepalen → contact aanvullen
                              → selecteren → Waalaxy-CSV
```

### Bedrijven laten zoeken (`/radio/zoeken`)

De tool kan zelf Nederlandse bedrijven vinden. Vul een doelaantal in (default 300
— wat Waalaxy per maand aan contacten toelaat), kies eventueel een segment, en
klik **Scan**. De tool loopt dan door de zoekrichtingen, en per richting:

1. **zoekt op het web** via de web-search van de Claude API — dus met dezelfde
   `ANTHROPIC_API_KEY`, geen aparte zoekdienst nodig;
2. **verifieert de bron**: alleen URL's die echt in de zoekresultaten stonden
   worden geaccepteerd;
3. **verifieert de website**: het domein wordt daadwerkelijk opgehaald. Bestaat
   het niet, dan valt de kandidaat af — een verzonnen bedrijf heeft geen werkend
   domein. Deze afwijzingen worden apart gerapporteerd;
4. **slaat op** als prospect met status `New` en het zoeksignaal als evidence;
5. **onderzoekt en scoort** ze daarna met de gewone research-pipeline.

De rangschikking komt dus altijd uit de scoring-engine, nooit uit de zoekmachine.

**Zoekrichtingen** staan in `lib/radio/discovery/queries.ts` en zijn van twee
soorten. *Timing*-richtingen ("bedrijven die nieuwe vestigingen openen", "veel
vacatures", "recente investeringen") leveren bedrijven met een actuele aanleiding
en krijgen automatisch voorrang. *Fit*-richtingen ("Nederlandse retailketens",
"landelijke e-commerce merken", per segment) leveren bedrijven die structureel bij
radio passen. Een richting toevoegen is één item in die lijst.

**Tempo en kosten.** Reken op ~1 minuut per zoekrichting en een halve tot hele
minuut per bedrijf om te onderzoeken. 300 bedrijven is een klus van uren, niet
minuten — werk in porties van 50 en kijk tussendoor wat de scores doen. Elke
gevonden lichting is al opgeslagen, dus onderbreken kost niets.

> **Flessenhals verderop:** de scan vult je lijst met *bedrijven*. Waalaxy heeft
> per prospect een *LinkedIn-profiel van een persoon* nodig, en dat verzint deze
> tool nooit. 300 gescoorde bedrijven is dus geen 300 Waalaxy-contacten — kijk op
> het dashboard naar **Ready for Waalaxy** voor het echte aantal.

### Bedrijven zelf toevoegen — drie manieren (`/radio/import`)

| Manier | Wanneer |
| --- | --- |
| **Eén bedrijf** | naam + website; optioneel meteen contactpersoon en LinkedIn-URL |
| **CSV-import** | een lijst uit Excel of een andere bron |
| **Batch** | een lijst losse websites, één per regel (bijv. 100 stuks) |

CSV-kolommen: minimaal `company_name` **of** `website`. Verder optioneel
`linkedin_url`, `contact_first_name`, `contact_last_name`, `contact_title`,
`city`, `industry`, `segment`, `notes`.

Puntkomma's (Nederlands Excel), tabs en komma's worden alle drie herkend, net
als Nederlandse kolomnamen (`bedrijfsnaam`, `voornaam`, `achternaam`, `functie`,
`plaats`, `branche`, `notities`). Regels die niet gelezen kunnen worden, worden
mét regelnummer en reden gerapporteerd in plaats van stil overgeslagen.

Bij een batch mag een regel `website` of `Naam, website` zijn.

**Importeren en onderzoeken zijn gescheiden.** Je ziet eerst wat er binnenkwam
en wat er dubbel was, en start de analyse daarna zelf — anders veroorzaakt één
plakactie van 100 regels meteen 100 modelcalls.

Dubbele bedrijven worden herkend op genormaliseerde website (host + pad, dus
`www.` en trailing slash maken niet uit) en anders op bedrijfsnaam. Een import
met contactgegevens **vult een bestaande prospect aan** in plaats van een tweede
rij te maken; bestaande waarden worden nooit overschreven.

### Onderzoeken en scoren

Per bedrijf, of in batch via **Onderzoek N nieuwe** op het dashboard. Een grote
batch wordt automatisch in rondes van 25 verwerkt, zodat de request niet op een
platform-timeout stuit.

Wat er gebeurt:

1. **Publieke data ophalen** — de homepage plus maximaal vijf relevante
   subpagina's (vacatures, nieuws, vestigingen, over-ons, acties), gekozen op
   basis van de links op de homepage.
2. **Analyseren** — de opgehaalde tekst gaat naar de research-provider, die
   componentscores, triggers, angles en bewijs teruggeeft.
3. **Rekenen** — de scoring-engine klemt, normaliseert en telt op. Het model
   bepaalt geen totalen.

### Exporteren naar Waalaxy

Vink prospects aan in de tabel en klik **Export Waalaxy CSV**. Je krijgt eerst
te zien hoeveel er klaar zijn en **wie er niet mee kan**, met de reden erbij.
Daarna download je de CSV. Optioneel zet je de geëxporteerde prospects in één
klik op status `Exported to Waalaxy` — alleen degenen die er echt in zaten.

Kolommen: `first_name`, `last_name`, `company_name`, `job_title`,
`linkedin_url`, `tier`, `fit_score`, `trigger_score`, `priority_score`,
`primary_sales_angle`, `personalization_context`.

---

## 3. Hoe de scores werken

### Fit Score (0–100)

Tien componenten waarvan de maxima optellen tot exact 100:

| | Component | Max | Toegestane waarden |
| --- | --- | --- | --- |
| A | B2C / consumentenrelevantie | 20 | 0 · 5 · 10 · 15 · 20 |
| B | Geografisch bereik | 15 | 0 · 3 · 8 · 12 · 15 |
| C | Marketing maturity | 15 | 0 · 5 · 10 · 15 |
| D | Schaal / vestigingen | 10 | 0 · 2 · 5 · 8 · 10 |
| E | Customer value | 10 | 0 · 1 · 4 · 7 · 10 |
| F | Groei / expansie | 10 | 0 · 5 · 10 |
| G | Recruitment-potentieel | 5 | 0 · 3 · 5 |
| H | Campagne / seizoen | 5 | 0 · 3 · 5 |
| I | Awareness-afhankelijkheid | 5 | 0 · 3 · 5 |
| J | Waarschijnlijk mediabudget | 5 | 0 · 1 · 3 · 5 |

Een score buiten de toegestane waarden wordt naar het dichtstbijzijnde anker
geklemd; bij gelijke afstand naar beneden. Een component die de provider niet
teruggaf krijgt score 0 met herkomst `unknown` — nooit stilzwijgend weggelaten,
want dan zou de fit-score op een kleinere schaal komen te staan en te hoog
lijken.

De rubric staat op één plek (`lib/radio/scoring/rubric.ts`) en wordt ook gebruikt
om de research-prompt te genereren. Aanpassen doe je daar, en de prompt volgt.

### Trigger Score (0–100)

Per trigger: `basisgewicht(soort) × recency × confidence`.

- **Recency** — ≤30d ×1,0 · ≤90d ×0,85 · ≤180d ×0,65 · ≤1j ×0,4 · ouder ×0,15 ·
  **datum onbekend ×0,5**. Een aangekondigd toekomstig moment (opening,
  festival) geldt als ×1,0.
- **Confidence** — high ×1,0 · medium ×0,75 · low ×0,45.

Daarna aflopend gesorteerd met afnemende opbrengst (×1 · ×0,6 · ×0,4 · ×0,25 ·
rest ×0,15) en gekapt op 100. Eén sterk, recent signaal weegt dus zwaarder dan
een stapel vage signalen — precies de bedoeling.

**Een trigger zonder verifieerbare bron-URL wordt verwijderd.** "Waarom nu" mag
niet op een verzonnen nieuwsbericht rusten.

### Priority Score en tier

```
priority = round(fit × 0,75 + trigger × 0,25)
```

| Tier | Priority | |
| --- | --- | --- |
| A | 80–100 | 🔥 Zeer interessante prospect |
| B | 65–79 | 🟢 Goede prospect |
| C | 50–64 | 🟡 Alleen benaderen met relevante angle |
| D | 0–49 | ⚪ Lage prioriteit / skip |

Fit en Trigger blijven altijd apart zichtbaar naast Priority.

### Knock-outs

Redenen om een bedrijf op lage prioriteit te zetten: puur specialistisch B2B,
bedient de Nederlandse markt niet, niet meer actief, consumenten vrijwel nooit
doelgroep, nauwelijks schaal, extreem klein lokaal bedrijf, of te weinig
betrouwbare informatie (research-confidence < 25).

Eén of meer redenen forceren **tier D** — tenzij de research een onderbouwde
`radio_use_case_override` meegeeft (bijvoorbeeld: specialistisch B2B, maar met
veertig technische vacatures is er wél een recruitmentcase). De scores blijven
altijd zichtbaar, net als de reden en de tier die het zonder knock-out geweest
zou zijn.

Let op: alleen een *expliciet vastgesteld* "nee" is een knock-out. `unknown`
telt niet mee — dat wordt hooguit afgestraft via de confidence.

---

## 4. Anti-hallucinatie

Dit is het belangrijkste onderdeel. Drie van de vier maatregelen zitten **in
code**, niet in de prompt.

### Bronverificatie

Elke bron-URL die de research teruggeeft wordt gematcht tegen de set pagina's
die we daadwerkelijk hebben opgehaald (op genormaliseerde vorm, dus `www.`,
trailing slash en `?utm_...` maken niet uit).

- Bewijs met een niet-opgehaalde URL → **verwijderd**.
- Trigger met een niet-opgehaalde bron → **verwijderd**.
- Contactpersoon zonder verifieerbare bron → **null**.

Het aantal verworpen bronnen wordt na elke research in de UI gemeld. Een model
kan dus geen bron verzinnen, hoe plausibel die ook klinkt.

### Herkomst per claim

Elk feitelijk veld draagt `fact` (staat letterlijk in de opgehaalde tekst),
`inference` (commerciële inschatting) of `unknown`. In de UI staat dat als badge
naast elke componentscore.

`company_size` en `number_of_locations` worden **weggegooid als ze geen `fact`
zijn** — een geschat aantal vestigingen is erger dan geen aantal.

### research_confidence (0–100)

Deterministisch berekend, niet door de AI:

```
bewijsdekking (fact ×1,0 · inference ×0,5 · unknown ×0, gewogen naar
componentgewicht)  ×  brondekking (0 bronnen ×0,25 · 1 ×0,6 · 2 ×0,8 ·
3 ×0,9 · 4+ ×1,0)
```

Zo kan een prospect nooit "zeker" lijken op basis van niets. Onder 40 krijgt de
prospect een zichtbare waarschuwing in de tabel én op de detailpagina.

### Contactpersonen

Nooit gokken. Is er geen betrouwbare persoon, dan toont de tool:

```
Contact person: not yet identified
Recommended role: Head of Marketing
```

Een persoon wordt alleen overgenomen als die letterlijk met naam op een
opgehaalde pagina staat, mét bron-URL.

---

## 5. LinkedIn

**Er wordt niets van LinkedIn opgehaald of gescraped.** LinkedIn staat op de
blocklist van de fetcher, ook als een website ernaartoe linkt.

LinkedIn-URL's komen uitsluitend van buiten:

- handmatig ingevuld op de detailpagina of bij het toevoegen;
- via CSV-import;
- vanuit een andere legitieme databron.

Elke URL wordt gevalideerd: alleen `linkedin.com/in/…`, `/company/…`, `/school/…`
of `/showcase/…` wordt geaccepteerd en gecanoniseerd (tracking-parameters eraf).
Een onbruikbare URL wordt geweigerd met uitleg — liever leeg dan een kapotte URL
die een Waalaxy-import laat mislukken.

Voor de export is een **persoonsprofiel** (`/in/…`) nodig; een bedrijfspagina is
niet genoeg, want daar kan Waalaxy geen connectieverzoek naartoe sturen.

---

## 6. Nette fetcher

De fetcher gedraagt zich als een nette bezoeker, geen crawler:

- **robots.txt wordt gerespecteerd** — een `Disallow`-pad wordt niet opgehaald.
- **Eigen User-Agent** met verwijzing, zodat een beheerder ons kan herkennen.
- **Maximaal 6 pagina's** per bedrijf, harde timeouts per pagina en een
  wandklokbudget van 25 seconden voor het geheel.
- **Alleen same-origin** links, alleen HTML/tekst, geen bestanden of media.
- **Socials geblokkeerd** (LinkedIn, Facebook, Instagram, X, TikTok, YouTube).

Wat niet lukt komt in `failed_urls` terecht, zodat de research kan zien dat er
iets ontbreekt in plaats van het aan te vullen.

---

## 7. Research-providers

| Provider | Wanneer actief | Karakter |
| --- | --- | --- |
| `claude` | `ANTHROPIC_API_KEY` aanwezig | AI-analyse van de opgehaalde tekst, met structured outputs tegen een JSON-schema |
| `heuristic` | altijd beschikbaar (fallback) | trefwoordanalyse, geen AI, volledig deterministisch |

Forceren met `RADIO_RESEARCH_PROVIDER`.

De heuristiek is er zodat de tool zonder API-key werkt. Hij is bewust
terughoudend: **hij kan de hoogste ankerwaarde van een component niet claimen**,
omdat trefwoorden tellen "duidelijk volwassen adverteerder" niet kan
onderbouwen. Daardoor komt hij maximaal op fit 69, en dus tot Tier B. Een
Tier A-kwalificatie vraagt de AI-provider of het oordeel van Eric zelf.

Faalt de AI-provider, dan valt de tool terug op de heuristiek en wordt dat
gemeld — een gemarkeerd resultaat is beter dan geen resultaat.

### Later een databron aansluiten

`lib/radio/research/connectors.ts` legt het contract vast. Een connector levert
extra `FetchedSource`s op; die komen in dezelfde lijst als de website-pagina's
en lopen dus automatisch door dezelfde bronverificatie. Een connector kan dus
geen onverifieerbare bewering binnensmokkelen.

| Connector | Voegt toe | Env var |
| --- | --- | --- |
| Web search (Brave/Serper/Bing) | nieuwsberichten → triggers mét datum | `RADIO_SEARCH_API_KEY` |
| KVK API | vestigingen, SBI-code, actief ja/nee | `RADIO_KVK_API_KEY` |
| Vacaturefeed | recruitment-signaal als `fact` | `RADIO_JOBS_API_KEY` |
| Enrichment (Apollo/Cognism) | contactpersonen (betaald) | `RADIO_ENRICHMENT_API_KEY` |

Toevoegen: implementeer `ResearchConnector`, registreer in `CONNECTORS`, klaar.
`gatherConnectorSources()` wordt al aangeroepen.

De kern werkt zonder betaalde bronnen. Ontbreekt een bron, dan wordt een veld
`unknown` in plaats van geraden.

---

## 8. Segmenten

Twaalf segmenten om te beginnen: Retail, Automotive, Recruitment,
Leisure & Events, Travel, Consumer e-commerce, Fitness, Education, Home & Living,
Energy, Telecom, Financial consumer services.

Een segment toevoegen is één regel in `lib/radio/segments.ts`. De
research-prompt en de filters volgen automatisch.

---

## 9. Statusworkflow

`New` → `Researched` → `Tier A` / `Tier B` / `Tier C` / `Skip` →
`Exported to Waalaxy` → `Contacted` → `Replied` → `Qualified` → `Meeting` →
`Won` / `Lost`

Na research wordt de status automatisch op de tier gezet (tier D → `Skip`),
**maar alleen als hij nog in de triage-fase staat**. Heb je een prospect al op
`Contacted` of verder gezet, dan blijft die status staan bij een nieuwe analyse.

---

## 10. Routes

| Route | Doel |
| --- | --- |
| `/radio` | dashboard: statistieken, "bel deze eerst", filters, prospect-tabel, export |
| `/radio/zoeken` | bedrijven laten zoeken, onderzoeken en scoren |
| `/radio/prospects/[id]` | detailpagina |
| `/radio/import` | toevoegen: handmatig · CSV · batch |
| `GET/POST /api/radio/prospects` | lijst / toevoegen |
| `PATCH/DELETE /api/radio/prospects/[id]` | bijwerken / verwijderen |
| `POST /api/radio/prospects/[id]/research` | research & score |
| `POST /api/radio/research/batch` | batch (max 25 per aanroep) |
| `GET/POST /api/radio/discover` | zoekrichtingen opvragen / bedrijven zoeken |
| `POST /api/radio/import` | CSV of batch |
| `POST /api/radio/export/waalaxy` | export van een selectie |
| `POST/DELETE /api/radio/demo` | demo-data plaatsen / wissen |
| `POST /api/radio/migrate` | schema forceren (vereist `MIGRATE_SECRET`) |

---

## 11. Projectstructuur

```
app/radio/                     dashboard, detail, import
app/api/radio/                 API-routes
components/radio/              UI (tabel, filters, formulieren)
lib/radio/
  types.ts                     domeintypes
  segments.ts  roles.ts        uitbreidbare lijsten
  validation.ts                URL/datum-normalisatie, LinkedIn-regels
  csv.ts                       CSV lezen/schrijven, Waalaxy-export
  filters.ts  query.ts         filteren, sorteren, statistieken
  demo.ts                      DEMO DATA-fixtures
  discovery/
    queries.ts                 zoekrichtingen (§18) — fit en timing
    provider.ts                contract + bronverificatie op zoekresultaten
    providers/claude-search.ts Claude + web-search tool
    index.ts                   zoeken → website verifiëren → opslaan
  scoring/
    rubric.ts                  de tien componenten (bron van waarheid)
    triggers.ts                trigger-gewichten en -score
    knockouts.ts               knock-outcriteria
    confidence.ts              research_confidence
    index.ts                   de engine
  research/
    fetch.ts                   nette publieke-webfetcher
    prompt.ts                  prompts (gegenereerd uit de rubric)
    provider.ts                contract + validatie + bronverificatie
    providers/claude.ts        AI-analyse
    providers/heuristic.ts     trefwoordanalyse
    connectors.ts              contract voor extra databronnen
    index.ts                   registry en orkestratie
  store/
    driver.ts                  storage-interface
    file-driver.ts             JSON-bestand (default)
    postgres-driver.ts         Postgres
    schema.ts  serialize.ts    SQL-schema en conversies
  __tests__/                   228 tests
```

---

## 12. Tests

```bash
npm test          # vitest, 228 tests
npm run typecheck # tsc --noEmit
npm run build     # productiebuild
```

De tests dekken vooral de dingen die stil fout kunnen gaan: de scoreformules en
tiergrenzen, de bronverificatie, CSV-eigenaardigheden (puntkomma's, BOM,
aanhalingstekens, regeleindes in velden), gelijktijdige writes naar het
JSON-bestand, en de Waalaxy-splitsing op ontbrekende LinkedIn-profielen.

---

## 13. Beperkingen en vervolgstappen

Eerlijk over wat de MVP niet doet:

- **De scan vindt alleen wat het web prijsgeeft.** Vraag je 300 bedrijven, dan is
  dat een bovengrens, geen belofte: de zoekrichtingen kunnen uitgeput raken.
  Nieuwe richtingen toevoegen (`lib/radio/discovery/queries.ts`) is de manier om
  meer te vinden.
- **Zoeksignalen worden geen triggers.** Een zoekresultaat wordt opgeslagen als
  evidence, niet als trigger, want een trigger hoort bij een bron die we zelf
  hebben opgehaald. De Trigger Score komt dus altijd uit de research op de eigen
  website — met als gevolg dat aanleidingen uit nieuwsberichten nog niet
  meewegen in de score, alleen in de context die Eric ziet.
- **Contactpersonen blijven handwerk.** Er zit geen enrichment in, dus de
  LinkedIn-URL's die Waalaxy nodig heeft vul je zelf aan of importeer je via CSV.
- **Filteren gebeurt in het geheugen**, niet in SQL. Prima tot enkele duizenden
  prospects; daarboven is `listAll()` in de Postgres-driver de plek om een
  `WHERE`/`ORDER BY` toe te voegen.
- **Triggers uit de heuristiek hebben geen datum**, want een trefwoord zegt niets
  over wanneer. Ze wegen daardoor automatisch lichter.
- **Geen authenticatie per gebruiker** — één set Basic Auth-credentials voor het
  hele team.
- **Geen geschiedenis van scoreverloop.** Een nieuwe analyse overschrijft de
  vorige; er is geen tijdlijn van "was Tier C, nu Tier A".
