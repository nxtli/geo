# NXTLI GEO Scan

A standalone Next.js app for **geo.nxtli.com** — a premium landing page where
ondernemers en marketeers een gratis AI-vindbaarheidsscan (Generative Engine
Optimization) van hun homepage laten doen, begeleid door **Brian**, de
AI-analist van NXTLI, in een chatervaring.

## Stack

| Laag | Keuze |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS + CSS-variabele design tokens (licht premium) |
| Validatie | Zod (server-side, autoritatief) |
| Database | Supabase (`@supabase/supabase-js`, service-role server-side) |
| AI-analyse | Swap-bare provider-architectuur (bestaande NXTLI-skill → Claude API → mock) |
| E-mail | Adapter (Resend by default, via fetch) |
| PDF | Adapter (HTML-rapport nu; Puppeteer/Playwright/service later) |

## Projectstructuur

```
app/
  page.tsx                     # rendert GeoLandingPage
  layout.tsx                   # metadata, fonts
  globals.css                  # BRAND TOKENS (kleuren/type) — swap hier
  api/geo/
    scan/route.ts              # POST: hele scan-orchestratie
    report/[id]/route.ts       # GET: NXTLI-rapport als HTML (download)
components/geo/                 # GeoHero, BrianChat, ChatMessage, ... (modulair)
lib/geo/
  types.ts                     # GeoLead, GeoScanRequest, GeoScanReport, GeoAnalysisResult
  validation.ts                # Zod-schema's
  brian.ts                     # Brian-persona + chatflow (config, geen UI)
  logger.ts  scrape.ts
  analysis/                    # provider-registry + claude/mock/existing-skill
  report/                      # report-service, NXTLI-template, pdf-adapter, store
  email/service.ts             # sendGeoReportEmail() adapter
  supabase/service.ts          # geoSupabaseService (server-only)
supabase/migrations/0001_geo_tables.sql
```

## Hoofdflow

1. Bezoeker klikt op **"Ja, scan mijn website"** → de Brian-chat opent (modal,
   blijft mounted zodat antwoorden behouden blijven bij sluiten/heropenen).
2. Brian stelt één vraag per keer (naam, e-mail, bedrijf, homepage-URL, aanbod,
   doelgroep, gewenste AI-zoekvragen, optioneel concurrenten). E-mail en URL
   worden gevalideerd; consent-checkbox als gate.
3. `POST /api/geo/scan`: valideert → slaat lead + scan request op → haalt de
   homepage op → roept de AI-analyse aan → bouwt het NXTLI-rapport (HTML, PDF
   via adapter) → slaat het rapport op → verstuurt de e-mail → geeft een
   preview + downloadlink terug.
4. Brian toont live de stappen (Website ophalen → Content analyseren →
   AI-vindbaarheid beoordelen → Verbeterpunten formuleren → Rapport genereren),
   daarna een preview (score + samenvatting + quick wins), een downloadknop en
   een zachte CTA voor een GEO-strategiesessie.

Alle states zijn afgehandeld: idle, asking, validating, consent, scanning,
success, error (met fallback-melding als de scan mislukt).

## Environment variables

Zie `.env.example`. Niets is verplicht om de **flow** te laten werken — zonder
config valt alles netjes terug (mock-analyse, geen persistentie, e-mail alleen
voorbereid). Voor productie:

| Var | Nodig voor | Opmerking |
|---|---|---|
| `SUPABASE_URL` | Opslag | |
| `SUPABASE_SERVICE_ROLE_KEY` | Opslag | **SERVER ONLY** — nooit client-side |
| `ANTHROPIC_API_KEY` | `geo-skill` + `claude` | SERVER ONLY — org die de skill bezit |
| `GEO_ANALYSIS_MODEL` | optioneel | default `claude-opus-4-8` |
| `GEO_ANALYSIS_PROVIDER` | optioneel | `geo-skill` \| `claude` \| `mock` |
| `GEO_SKILL_NAME` | optioneel | default `geo-page-checker` |
| `GEO_SKILL_ID` | optioneel | sla naam-lookup over |
| `GEO_SKILL_VERSION` | optioneel | default `latest` |
| `RESEND_API_KEY` + `GEO_EMAIL_FROM` | E-mail versturen | anders alleen voorbereid |
| `GEO_PDF_STRATEGY` | Echte PDF | default `none` (HTML-rapport) |
| `NEXT_PUBLIC_GEO_STRATEGY_CALL_URL` | CTA-link (client) | |
| `GEO_STRATEGY_CALL_URL` | CTA-link in e-mail | |

## Supabase

De tabellen `geo_leads`, `geo_scan_requests` en `geo_scan_reports` (RLS aan, geen
publieke policies — de app schrijft met de service-role key, die RLS omzeilt).
Schema-bron: `lib/geo/supabase/schema.ts` (gespiegeld naar
`supabase/migrations/0001_geo_tables.sql`).

Drie manieren om het schema aan te maken — kies wat past:

**1. Migratie-route (geen Supabase-login nodig).** Voor het geval de creds al in
Vercel staan (via de integratie) maar niemand in het Supabase-dashboard kan:

1. Zet in het Vercel-project een env-var **`MIGRATE_SECRET`** = een willekeurige
   string. Deploy.
2. Open eenmalig in je browser:
   `https://geo.nxtli.com/api/geo/migrate?secret=JOUW_SECRET`
   (of `POST` met header `x-migrate-secret`). De route draait het schema via de
   Postgres-connection string die de Vercel↔Supabase-integratie al heeft gezet
   (`POSTGRES_URL_NON_POOLING` / `POSTGRES_URL` / …) en geeft de aangemaakte
   tabellen terug.
3. **Verwijder `MIGRATE_SECRET`** weer — zonder die var geeft de route 404
   (uitgeschakeld). De route draait alleen vaste, idempotente DDL; geen
   user-SQL.

**2. Supabase SQL-editor.** Plak `supabase/migrations/0001_geo_tables.sql` →
Run. Idempotent, veilig om opnieuw te draaien.

**3. Supabase CLI.** `supabase db push` met het project gelinkt.

## De AI-analyse en de `geo-page-checker`-methodiek

De analyse draait via een **swap-bare provider-architectuur**
(`lib/geo/analysis/`). Auto-selectie: expliciete `GEO_ANALYSIS_PROVIDER` → de
**`claude`**-provider (mits `ANTHROPIC_API_KEY` gezet) → de mock.

**De `claude`-provider draait de NXTLI `geo-page-checker`-methodiek** als één
geautomatiseerde scan. De volledige skill staat in `skills/geo-page-checker/`
(bron-van-waarheid); de scoringsrubric (6 categorieën / 100 punten), de
technische checklist en de principes zijn verwerkt in de analyse-prompt
(`lib/geo/analysis/prompt.ts`). De homepage + `robots.txt` + `llms.txt` worden
server-side opgehaald (`scrape.ts`) en meegegeven; de output wordt op het
`GeoAnalysisResult`-schema vastgezet en gevalideerd met `parseAnalysisResult`.

Aanzetten: zet **`ANTHROPIC_API_KEY`** (server-side) van de org/workspace met
toegang. Klaar — de `claude`-provider wordt dan automatisch gekozen. Optioneel:
`GEO_ANALYSIS_MODEL` (default `claude-opus-4-8`). Zonder key valt alles terug op
de mock, zodat de flow nooit breekt.

### Waarom niet de skill zélf via de Skills-API?

`geo-page-checker` is gebouwd als **interactieve Cowork-skill**: fasen met
tussenstops, de gebruiker draait zelf PageSpeed, "welke 3 pagina's", en hij
schrijft naar een bestand. Bovendien heeft de Agent-Skills code-execution-
container **geen internet** (kan robots/PageSpeed niet ophalen). Dat past niet
in één geautomatiseerde API-call die gestructureerde JSON moet teruggeven.
Daarom nemen we de **methodiek** over in de prompt i.p.v. de interactieve skill
via `container.skills` aan te roepen.

De `geo-skill`-provider (`providers/geo-skill.ts`, die de skill wél via
`container.skills` aanroept) blijft als optie bestaan, maar wordt **niet
automatisch gekozen** — alleen via een expliciete `GEO_ANALYSIS_PROVIDER=geo-skill`.
Gebruik die alleen als de skill ooit als niet-interactieve, API-aanroepbare
custom skill wordt geregistreerd.

Input naar de analyse (`GeoAnalysisInput`): homepage_url, company_name,
offer_description, target_audience, desired_queries, competitors, en —
indien beschikbaar — page_content + metadata. Output (`GeoAnalysisResult`):
visibility_score, short_summary, what_ai_understands, likely_ai_positioning,
strengths, weaknesses, missing_signals, content_gaps, recommended_pages,
recommended_faq_questions, quick_wins, thirty_day_action_plan,
suggested_homepage_copy_improvements.

## Admin dashboard (/admin)

Een verborgen, met **HTTP Basic Auth** beveiligd overzicht op `/admin` (niet
gelinkt, `noindex`). Toont alle inzendingen (naam, e-mail, telefoon, functie,
bedrijf, homepage, status, score, model) plus de **credit-/€-kosten**, berekend
uit de opgeslagen token-usage per scan (Anthropic-prijs × tokens, omgerekend
naar €). Auth via `middleware.ts`; credentials uit env:

```
ADMIN_USERNAME=nxtli
ADMIN_PASSWORD=geochecker2026
# ADMIN_EUR_PER_USD=0.92   # USD→EUR koers voor de kostenweergave
```

Zonder die env-vars is `/admin` op slot (503). Kosten worden gemeten vanaf de
invoering van usage-logging; oudere scans tonen geen tokens. De nieuwe kolommen
(`model`, `input_tokens`, `output_tokens`, `visibility_score` op
`geo_scan_requests`) worden toegevoegd door de migratie-route opnieuw te draaien
(idempotent `add column if not exists`).

## Brand / styling aanpassen

Alle brand-tokens staan in **`app/globals.css`** (`:root`) en worden via
`tailwind.config.ts` als Tailwind-tokens gemapt. De live NXTLI-brand kon niet
automatisch worden opgehaald (de omgeving blokkeert `nxtli.com`); het huidige
licht-premium palet is een nette default. Swap de waarden van `--brand`,
`--accent`, `--ink`, etc. (en `--font-display`/`--font-sans`) om de echte brand
in te laden — één plek, de hele app volgt.

## PDF

Standaard wordt het rapport als **self-contained HTML** geserveerd
(`/api/geo/report/[id]`), wat de bezoeker via "Print → Opslaan als PDF" kan
downloaden. Voor een echte PDF: implementeer in `lib/geo/report/pdf.ts` één van
de strategieën (Playwright/Puppeteer `page.pdf()`, of een externe
PDF-service die de file in Supabase Storage zet) en zet `GEO_PDF_STRATEGY`.
De rest van de app verandert niet.

## Deployment & DNS (geo.nxtli.com)

Deze repo is een **standalone Next.js app**, bedoeld als het eigen project voor
`geo.nxtli.com` (geen subdomain-routing in een bestaande app nodig).

1. **Vercel-project**: koppel deze repo. Root Directory = `./` (de
   `package.json` staat in de root). Framework = Next.js (auto-detect).
2. **Env vars**: zet bovenstaande variabelen in het Vercel-project
   (Production + Preview).
3. **Domein**: voeg `geo.nxtli.com` toe als custom domain in het Vercel-project.
4. **DNS** (bij je DNS-provider voor `nxtli.com`): voeg een **CNAME** toe:
   `geo` → `cname.vercel-dns.com` (Vercel toont de exacte waarde). Of een
   A/ALIAS-record als je provider geen CNAME op subdomeinen toestaat.
5. Wacht op DNS-propagatie + automatisch SSL-certificaat van Vercel.

> Als geo.nxtli.com later tóch binnen een bestaande NXTLI-app moet draaien via
> subdomain-routing, kan dat met Next.js middleware (rewrite op
> `host === "geo.nxtli.com"` naar deze routes). Dat is nu niet nodig en niet
> ingericht — deze app draait standalone.

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # optioneel — werkt ook zonder
npm run dev                  # http://localhost:3000
npm run build && npm start   # productie-build
npm run typecheck
```

Zonder env vars: de scan draait op de **mock-provider**, slaat niets op en
bereidt de e-mail alleen voor — handig om de hele flow lokaal te testen.

## Security / privacy

- Alle secrets blijven server-side. De service-role key staat alleen in de
  server-only `lib/geo/supabase/service.ts`; de client importeert die nooit.
- Input wordt server-side gevalideerd (Zod) in de API-route.
- Consent-microcopy + checkbox vóór verzending.
- Technische fouten worden alleen server-side gelogd; de bezoeker ziet
  uitsluitend nette, niet-technische meldingen.
