# Adverteren op de Radio — Prospect Finder & Scorer

Technisch plan voor de interne prospecting-tool van Eric (accountmanager).
Doel: **FIT × TIMING** — niet zo veel leads mogelijk, maar bedrijven waarbij een
gesprek over radioreclame nú commercieel logisch is.

Status: MVP geïmplementeerd in deze repository. Zie `README.md` → *Radio
Prospect Finder* voor het opstarten.

---

## 1. Waarom bovenop de bestaande app

Deze repo is een bestaande Next.js 16 / React 19 app (`geo.nxtli.com`) met
Tailwind design-tokens, `pg` voor Postgres, de Anthropic SDK, `zod` en `vitest`.
De prospect-tool sluit daarop aan in plaats van een tweede stack ernaast te
zetten:

| Laag | Hergebruikt | Nieuw |
| --- | --- | --- |
| Framework | Next.js app-router, Tailwind-tokens, `components/geo/primitives` | `app/radio/*`, `components/radio/*` |
| AI | Anthropic SDK, provider-adapterpatroon, structured outputs + zod | `lib/radio/research/*` |
| Data | `pg`-pool, idempotente migraties | `lib/radio/store/*`, `radio_prospects` |
| Test | vitest | `lib/radio/__tests__/*` |

**Nul nieuwe dependencies.** Alles wat nodig is zit al in `package.json`.

### Database: waarom geen SQLite

De opdracht noemt SQLite "als dat passend is". Dat is het hier niet:
`better-sqlite3` is een native module (compileerstap, breekt op serverless), en
de repo heeft al een werkende Postgres-laag. In plaats daarvan een
**storage-adapter met twee drivers**:

- **`file`** (default, zero config) — JSON-bestand op schijf via
  `RADIO_DATA_FILE` (default `.data/radio-prospects.json`). Nul dependencies,
  werkt direct na `npm install`, prima voor honderden prospects.
- **`postgres`** — dezelfde `pg`-pool en migratiestijl als GEO, tabel
  `radio_prospects`. Wordt automatisch gekozen zodra er een connectiestring is.

Override met `RADIO_STORE_DRIVER=file|postgres`. Beide drivers implementeren één
interface, dus de rest van de app weet niet welke actief is.

---

## 2. Scorelagen

Alle rekenwerk is **pure, deterministische TypeScript** in
`lib/radio/scoring/`. De AI levert alleen componentscores + bewijs; de engine
klemt, hercalibreert en telt op. Zelfde principe als `reconcileToRubric` in de
GEO-code: het model kan de schaal niet stilletjes verschuiven.

### Fit Score (0–100)

| | Component | Max |
| --- | --- | --- |
| A | B2C / consumentenrelevantie | 20 |
| B | Geografisch bereik | 15 |
| C | Marketing maturity | 15 |
| D | Schaal / vestigingen | 10 |
| E | Customer value | 10 |
| F | Groei / expansie | 10 |
| G | Recruitment-potentieel | 5 |
| H | Campagne / seizoen | 5 |
| I | Awareness-afhankelijkheid | 5 |
| J | Waarschijnlijk mediabudget | 5 |
| | **Totaal** | **100** |

De rubric is één bron van waarheid (`lib/radio/scoring/rubric.ts`) met per
component de toegestane ankerwaarden uit de opdracht (bijv. A: 0/5/10/15/20).
Een modelscore wordt naar de dichtstbijzijnde anker geklemd, zodat de
onderbouwing altijd op de gedefinieerde schaal ligt.

### Trigger Score (0–100)

Per trigger een basisgewicht naar soort (funding/nieuwe vestiging zwaar,
jubileum/seizoen lichter), vermenigvuldigd met:

- **recency**: ≤30d ×1.0 · ≤90d ×0.85 · ≤180d ×0.65 · ≤1j ×0.4 · ouder ×0.15 ·
  datum onbekend ×0.5
- **confidence**: high ×1.0 · medium ×0.75 · low ×0.45

Daarna aflopend gesorteerd met afnemende opbrengst (×1 · ×0.6 · ×0.4 · ×0.25 ·
rest ×0.15) en gekapt op 100. Zo domineert het sterkste, meest recente signaal
— precies de eis dat concrete signalen zwaarder wegen dan algemene informatie.
De zwaarst wegende trigger wordt `primary_trigger`.

Een trigger **zonder bewijs-URL wordt geweigerd** (zie §4).

### Priority Score & tier

```
priority = round(fit * 0.75 + trigger * 0.25)
```

Tier A 80–100 🔥 · B 65–79 🟢 · C 50–64 🟡 · D 0–49 ⚪.
Fit en Trigger blijven altijd apart zichtbaar naast Priority.

### Knock-outs

`lib/radio/scoring/knockouts.ts` levert redenen op (puur specialistisch B2B,
geen NL-markt, geen schaal, niet meer actief, te weinig betrouwbare info, …).
Bij één of meer redenen wordt de tier **geforceerd naar D** — tenzij de research
een expliciete `radio_use_case_override` met onderbouwing meelevert. Geen
absolute regel dus, conform de opdracht. Scores blijven altijd zichtbaar, de
reden wordt in de UI getoond.

---

## 3. Research-laag (AI)

`lib/radio/research/` volgt het bestaande provider-adapterpatroon:

```
ResearchProvider { id, isConfigured(), research(input) → ResearchOutcome }
```

- **`claude`** — haalt eerst *gestructureerde publieke data* op (homepage +
  kandidaat-subpagina's zoals `/over-ons`, `/vacatures`, `/nieuws`,
  `/vestigingen`, robots/sitemap-signalen), pas daarna analyseert Claude die
  tekst met **structured outputs** tegen een JSON-schema. Data eerst, AI daarna.
- **`mock`** — deterministisch, offline, label `DEMO DATA`. Zorgt dat de hele
  flow werkt zonder API-key.

Selectie: `RADIO_RESEARCH_PROVIDER` → anders `claude` als
`ANTHROPIC_API_KEY` er is → anders `mock`.

### Later aan te sluiten connectors (interface bestaat, adapter is stub)

| Connector | Waarvoor | Status |
| --- | --- | --- |
| Web search | **geïmplementeerd** — bedrijven vinden via de web-search tool van de Claude API (`lib/radio/discovery/`) |
| KVK API | vestigingen, SBI-code, actief ja/nee | idem |
| Vacature-feeds | recruitment-signaal harden | idem |
| Betaalde enrichment (Apollo/Cognism) | contactpersonen | optioneel, expliciet niet nodig voor de kern |

De kern werkt zonder betaalde bronnen; ontbreekt een bron, dan wordt het veld
`unknown` in plaats van geraden.

### LinkedIn — expliciet niet scrapen

Er zit **geen** LinkedIn-fetcher in deze codebase, en die mag er ook niet
komen. LinkedIn-URL's komen alleen binnen via handmatige invoer, CSV-import of
een andere legitieme bron. De research-provider krijgt de instructie nooit een
LinkedIn-URL te construeren, en `validateLinkedInUrl` weigert alles wat niet
letterlijk door een mens/CSV is aangeleverd.

---

## 4. Anti-hallucinatie

Vier maatregelen, waarvan drie **in code** en niet alleen in de prompt:

1. **Evidence-URL-verificatie.** Elke evidence-URL wordt gematcht tegen de set
   URL's die we daadwerkelijk hebben opgehaald. Een URL die daar niet in zit,
   wordt verworpen (en de bijbehorende trigger vervalt). Een model kan dus geen
   bron verzinnen.
2. **Claim-typing.** Elk feitelijk veld is `fact` (gevonden, met bron),
   `inference` (commerciële inschatting, gelabeld) of `unknown`. Nooit een lege
   gok. Numerieke velden (`company_size`, `number_of_locations`) worden
   weggegooid als ze niet `fact` zijn.
3. **`research_confidence` 0–100**, deterministisch berekend uit
   bewijsdekking (fact ×1.0, inference ×0.5, unknown ×0) × bronnendekking.
   Onder 40 krijgt de prospect een zichtbare waarschuwing in tabel én detail.
4. **Prompt-hardening**: verzin nooit omzet, budget, medewerkers, vestigingen,
   campagnes of contactpersonen; bij twijfel `unknown`.

Contactpersoon: als er geen betrouwbare persoon is, blijft die leeg en levert
de tool alleen `recommended_contact_role` (bijv. "Head of Marketing") met
`contact person: not yet identified`.

---

## 5. Datamodel

Tabel `radio_prospects` (Postgres) / records in de JSON-store, één rij per
bedrijf. Alle velden uit §11 van de opdracht, plus:

- `segment` — uit een uitbreidbare lijst (`lib/radio/segments.ts`, 12 segmenten
  om te beginnen, nieuwe toevoegen = één regel).
- `triggers` / `sales_angles` / `evidence` / `why_interesting` — jsonb-arrays.
- `research_confidence`, `knockouts`, `demo` (voor `DEMO DATA`-fixtures).
- `fit_components` — de tien losse componentscores met onderbouwing per stuk.

Statussen: `New · Researched · Tier A · Tier B · Tier C · Skip · Exported to
Waalaxy · Contacted · Replied · Qualified · Meeting · Won · Lost`.

---

## 6. Routes

| Route | Doel |
| --- | --- |
| `/radio` | dashboard: stats + prospect-tabel, filters, selectie, export |
| `/radio/prospects/[id]` | detailpagina |
| `/radio/import` | handmatig · CSV · batch |
| `POST /api/radio/prospects` | toevoegen |
| `POST /api/radio/prospects/[id]/research` | research & score |
| `PATCH /api/radio/prospects/[id]` | status/contact/notes bijwerken |
| `POST /api/radio/import` | CSV/batch |
| `POST /api/radio/export/waalaxy` | CSV-export van selectie |
| `POST /api/radio/migrate` | schema (secret-gated, alleen postgres-driver) |

| `/radio/zoeken` | bedrijven laten zoeken, onderzoeken en scoren |
| `GET/POST /api/radio/discover` | zoekrichtingen opvragen / bedrijven zoeken |

Batch-research draait geserialiseerd met een concurrency-cap, zodat 100
bedrijven de API-limieten niet omvergooien. De discovery-scan loopt per
zoekrichting in aparte requests, zodat een ronde van honderden bedrijven niet op
de platform-timeout stuit en tussentijds gevonden bedrijven al zijn opgeslagen.

---

## 7. Beveiliging

De tool bevat commerciële prospectdata en hoort niet publiek te zijn. Er is nu
**geen** `middleware.ts` in de repo, terwijl `app/admin/page.tsx` claimt
auth-gated te zijn en `.env.example` al `ADMIN_USERNAME`/`ADMIN_PASSWORD` heeft
— `/admin` staat dus feitelijk open. Dit plan voegt een Basic-auth
`middleware.ts` toe die **`/radio` én `/admin`** dekt, en `noindex` op alle
radio-pagina's. Zonder ingestelde credentials weigert de middleware in
productie en laat lokaal door (met waarschuwing), zodat niemand per ongeluk een
open tool deployt.

---

## 8. Bouwvolgorde

1. Architectuur + datamodel ✅
2. Storage + CRUD ✅
3. Scoring engine (+ unit tests) ✅
4. Research/AI-laag ✅
5. Dashboard + tabel + detail ✅
6. CSV/batch import ✅
7. Waalaxy-export ✅
8. Evidence/confidence in UI ✅
9. Auth, tests, foutafhandeling ✅
10. README ✅

---

## 9. Na de eerste run: kosten, regio en grootte

De eerste echte scan kostte ~$4,50. Dat kwam door drie configuratiekeuzes, niet
door de opzet:

1. **Opus 5 met `effort: "high"` voor de zoekstap.** Die stap schrijft op wat er in
   de zoekresultaten staat — extractiewerk. Het commerciële oordeel zit in de
   scoring-engine, die deterministisch is. → Sonnet 5, `effort: "low"`.
2. **Te ruim paginabudget** in de fetcher (6 pagina's × 6.000 tekens). → 4 × 3.500.
   Wat een radio-fit bepaalt staat op de homepage, over-ons en vacaturepagina; de
   staart voegt tokens toe, geen inzicht.
3. **De vaste instructie stond ná de variabele paginatekst.** Caching is
   prefix-matching, dus die ~3.000 tokens waren per bedrijf niet te cachen. →
   volledige instructie naar de systeemprompt met een cache-breakpoint, alleen
   bedrijfsnaam + paginatekst in het bericht. Vanaf het tweede bedrijf kost dat
   deel een tiende.

De grootste post bleek niet het model maar de **zoekresultaten**: die komen als
tekst in de context en tellen bij élke volgende modelturn opnieuw als input mee.
Daarom staat het zoekbudget krap (max 8 per richting) en is het model geïnstrueerd
om te zoeken op wat een *lijst* oplevert.

**Kostenmeter.** `lib/geo/pricing.ts` kende alleen input/output. Uitgebreid met
cache-write (1,25×), cache-read (0,1×) en webzoekopdrachten ($0,01). Kosten worden
**per call** berekend en daarna opgeteld, niet uit de totalen herleid — de stappen
gebruiken verschillende modellen, en cache-tokens zijn anders geprijsd.

**Run-historie.** Twee methodes op de storage-driver (`appendRun`, `listRuns`), een
`radio_runs`-tabel voor Postgres en een `runs`-array in hetzelfde JSON-bestand voor
de file-driver. Append-only. Het vastleggen faalt zacht: het logboek mag de net
gevonden prospects niet ongeldig maken.

### Regio en grootte: filters, geen scoreweging

`coverage_provinces` is het **verzorgingsgebied** (waar de klanten zitten), niet de
vestigingsplaats — voor radio koop je zenders in op waar het publiek zit. `city`
blijft er los naast staan: dat is een hard feit van de contactpagina, het
verzorgingsgebied is een inschatting en wordt in de UI ook zo gelabeld.

`size_band` is een grove klasse die de research mág inschatten, met de herkomst
erbij. De MKB-grens staat op 99 medewerkers — strakker dan de officiële 250, omdat
bij die omvang de eigenaar of één marketeer beslist.

**Beide zijn filters en wegen niet mee in de score.** De Fit-rubric uit de briefing
belóónt schaal (component D en J), terwijl de doelgroep juist MKB is. Die spanning
is echt en hoort niet stil opgelost te worden: als de rubric verbouwd wordt,
verandert de betekenis van de Fit Score zonder dat iemand dat besloot. Wil je dat
MKB ook hóger scoort, dan is dat een aparte, expliciete beslissing.

### Aanleiding optioneel

Drie standen bij het zoeken: *verplicht* (alleen bedrijven met een concrete
aanleiding), *mag maar hoeft niet* (default) en *fit is genoeg*. Bij "verplicht"
wordt een kandidaat zonder aanleiding in **code** weggegooid, niet alleen in de
prompt gevraagd.

---

## 10. De simpele route: lokaal MKB zonder AI

Na de eerste runs bleek de AI-scan het verkeerde gereedschap voor wat er
werkelijk nodig was: een bellijst van lokale MKB-zaken in branches waar de
eigenaar over het budget beslist. Twee dingen klopten niet.

**De bron.** Een websearch vindt ketens en top-10-artikelen. "Alle tuincentra in
Limburg" staat niet in een artikel, maar wél op de kaart. Openbare kaartdata
(OpenStreetMap via Overpass) is voor lokale winkels compléter én gratis: geen
API-key, geen credits. Eén verzoek per provincie met alle branches erin, met
pauzes ertussen en een eigen User-Agent — het is een vrijwilligersdienst.

**Het onderzoek.** Bij deze branches is de radio-invalshoek een eigenschap van de
BRANCHE, niet van het bedrijf: een tuincentrum heeft een voorjaarspiek, een
sportschool een januaripiek, een beddenzaak een hoge orderwaarde. Dat hoeft geen
model per bedrijf uit te zoeken — het staat als vaste regel in de branchelijst.
Scoring blijft bestaan, maar is nu optioneel: je start hem op een shortlist die je
zelf aanvinkt.

Wat er nog wél per bedrijf gebeurt is gratis: ketenfilialen eruit filteren op de
`brand`/`operator`-tag, en de bron als evidence vastleggen.

### Van bedrijf naar persoon

Het echte knelpunt was nooit de bedrijvenlijst maar de PERSOON: Waalaxy heeft een
profiel-URL nodig. LinkedIn scrapen is daarvoor de verkeerde oplossing, ook als het
mag: profielen en zoekresultaten zitten achter een auth-wall, dus het kan alleen
met de sessiecookie van hetzelfde account waar Waalaxy op draait. De prijs van
detectie is de hele outbound-pijplijn, niet een script.

De oplossing zit in hoe Waalaxy werkt: die importeert uit een LinkedIn-zoekresultaat
dat de gebruiker zelf open heeft staan. De tool bouwt dus ZOEKopdrachten —
booleaans, met beslissersrollen, branchewoorden en de regio — en nooit een
profiel-URL. Een zoeklink is geen bewering over een persoon; een verzonnen
`/in/…` is dat wel en belandt in een connectieverzoek aan de verkeerde persoon.
