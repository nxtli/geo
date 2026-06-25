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

Draai `supabase/migrations/0001_geo_tables.sql` in de Supabase SQL-editor (of via
de Supabase CLI). Het maakt `geo_leads`, `geo_scan_requests` en
`geo_scan_reports`, met RLS aan en geen publieke policies — de app schrijft met
de service-role key (server-side), die RLS omzeilt. Zet daarna `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`.

## De gedeelde Claude-skill `geo-page-checker` koppelen

De analyse draait via een **swap-bare provider-architectuur**
(`lib/geo/analysis/`). Volgorde van selectie: expliciete
`GEO_ANALYSIS_PROVIDER` → de gedeelde org-skill (`geo-skill`) → de directe
Claude API (`claude`) → de mock.

De primaire engine is de **gedeelde organisatie-skill `geo-page-checker`**. Die
wordt aangeroepen via de Claude **Agent Skills**-surface op de Messages API
(`lib/geo/analysis/providers/geo-skill.ts`):

```
client.beta.messages.create({
  model: "claude-opus-4-8",
  container: { skills: [{ type: "custom", skill_id, version: "latest" }] },
  tools:     [{ type: "code_execution_20260521", name: "code_execution" }],
  betas:     ["code-execution-2025-08-25", "skills-2025-10-02"],
  system, messages,
})
```

De skill (de `SKILL.md`) bepaalt **hoe** de homepage beoordeeld wordt; onze
prompt pint de **output** vast op het `GeoAnalysisResult`-schema, dat we daarna
valideren met `parseAnalysisResult` (coerce't loszittende output netjes).

Aanzetten:

1. Zet **`ANTHROPIC_API_KEY`** van de Anthropic-org/workspace die de skill bezit.
   (Server-side; nooit client-side.)
2. Dat is alles — de provider zoekt de skill automatisch op naam op
   (`GEO_SKILL_NAME`, default `geo-page-checker`) via `GET /v1/skills` en cachet
   het `skill_id`. Wil je de lookup overslaan, zet dan `GEO_SKILL_ID` direct.
3. Optioneel: `GEO_SKILL_VERSION` (default `latest`), `GEO_ANALYSIS_MODEL`
   (default `claude-opus-4-8`).

> De homepage-inhoud wordt server-side opgehaald (`scrape.ts`) en in de prompt
> meegegeven, omdat de code-execution-container van Agent Skills geen internet
> heeft. De skill analyseert dus de meegeleverde content (of, als ophalen
> mislukt, de antwoorden van de ondernemer).

Als de skill faalt of niet gevonden wordt, valt de analyse netjes terug op de
mock (de bezoeker krijgt altijd een resultaat; `degraded` markeert dat voor een
handmatige follow-up).

Input naar de analyse (`GeoAnalysisInput`): homepage_url, company_name,
offer_description, target_audience, desired_queries, competitors, en —
indien beschikbaar — page_content + metadata. Output (`GeoAnalysisResult`):
visibility_score, short_summary, what_ai_understands, likely_ai_positioning,
strengths, weaknesses, missing_signals, content_gaps, recommended_pages,
recommended_faq_questions, quick_wins, thirty_day_action_plan,
suggested_homepage_copy_improvements.

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
