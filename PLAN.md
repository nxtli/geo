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
| Web search (Brave/Bing/Serper) | triggers uit nieuwsberichten | interface + stub, gedocumenteerd |
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

Batch-research draait geserialiseerd met een concurrency-cap, zodat 100
bedrijven de API-limieten niet omvergooien.

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
2. Storage + CRUD
3. Scoring engine (+ unit tests)
4. Research/AI-laag
5. Dashboard + tabel + detail
6. CSV/batch import
7. Waalaxy-export
8. Evidence/confidence in UI
9. Auth, tests, foutafhandeling
10. README
