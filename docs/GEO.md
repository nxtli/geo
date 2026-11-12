# NXTLI GEO Scan

A standalone Next.js app for **geo.nxtli.com** — a premium landing page where
ondernemers en marketeers een gratis AI-vindbaarheidsscan (Generative Engine
Optimization) van hun homepage laten doen, begeleid door **Charlie**, de
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
components/geo/                 # GeoHero, CharlieChat, ChatMessage, ... (modulair)
lib/geo/
  types.ts                     # GeoLead, GeoScanRequest, GeoScanReport, GeoAnalysisResult
  validation.ts                # Zod-schema's
  charlie.ts                     # Charlie-persona + chatflow (config, geen UI)
  logger.ts  scrape.ts
  analysis/                    # provider-registry + claude/mock/existing-skill
  report/                      # report-service, NXTLI-template, pdf-adapter, store
  email/service.ts             # sendGeoReportEmail() adapter
  supabase/service.ts          # geoSupabaseService (server-only)
supabase/migrations/0001_geo_tables.sql
```

## Hoofdflow

1. Bezoeker klikt op **"Ja, scan mijn website"** → de Charlie-chat opent (modal,
   blijft mounted zodat antwoorden behouden blijven bij sluiten/heropenen).
2. Charlie stelt één vraag per keer (naam, e-mail, bedrijf, homepage-URL, aanbod,
   doelgroep, gewenste AI-zoekvragen, optioneel concurrenten). E-mail en URL
   worden gevalideerd; consent-checkbox als gate.
3. `POST /api/geo/scan`: valideert → slaat lead + scan request op → haalt de
   homepage op → roept de AI-analyse aan → bouwt het NXTLI-rapport (HTML, PDF
   via adapter) → slaat het rapport op → verstuurt de e-mail → geeft een
   preview + downloadlink terug.
4. Charlie toont live de stappen (Website ophalen → Content analyseren →
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
| `GEO_ANALYSIS_MODEL` | optioneel | default `claude-sonnet-4-6` |
| `GEO_ANALYSIS_PROVIDER` | optioneel | `geo-skill` \| `claude` \| `mock` |
| `OPENAI_API_KEY` | Multi-LLM tabel | ChatGPT-rij in "Wat AI over je zegt"; anders overgeslagen |
| `GEMINI_API_KEY` | Multi-LLM tabel | Gemini-rij; anders overgeslagen |
| `PERPLEXITY_API_KEY` | Multi-LLM tabel | Perplexity-rij; anders overgeslagen |
| `XAI_API_KEY` | Multi-LLM tabel | Grok-rij; anders overgeslagen |
| `GEO_AI_SEARCH` | optioneel | `off` = zet de HELE multi-LLM probe uit |
| `GEO_OPENAI_MODEL` / `GEO_GEMINI_MODEL` / `GEO_PERPLEXITY_MODEL` / `GEO_GROK_MODEL` | optioneel | defaults `gpt-4o-mini` / `gemini-2.5-flash` / `sonar` / `grok-4` |
| `GEO_SKILL_NAME` | optioneel | default `geo-page-checker` |
| `GEO_SKILL_ID` | optioneel | sla naam-lookup over |
| `GEO_SKILL_VERSION` | optioneel | default `latest` |
| `RESEND_API_KEY` + `GEO_EMAIL_FROM` | E-mail versturen | anders alleen voorbereid |
| `HUBSPOT_TOKEN` | Lead → HubSpot CRM | Private App token (`crm.objects.contacts.write`); anders overgeslagen. Schrijft ook de custom properties `geoscore` (Number), `geoscore_rapport` (tekst) en `geoscanpagina` (tekst) — maak die aan in HubSpot |
| `GEO_PDF_STRATEGY` | Echte PDF | default `none` (HTML-rapport) |
| `NEXT_PUBLIC_GEO_STRATEGY_CALL_URL` | "Plan een sessie"-knoppen (chat) | default `…/michiel-schoonhoven-agenda/` |
| `GEO_STRATEGY_CALL_URL` | CTA-link in rapport + e-mail | default `…/michiel-schoonhoven-agenda/` |

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

## De analyse in drie lagen

De scan scheidt wat gemeten is van wat een aanname is.

**1. Feiten (`lib/geo/facts/`).** Door code gemeten, zonder taalmodel:
- `robots.ts`: parser voor robots.txt. Bepaalt per AI-bot of de pagina opgehaald mag worden en
  scheidt zoekbots (OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, Bingbot) van
  trainingsbots (GPTBot, ClaudeBot, ...) en gebruikersbots.
- `page.ts`: noindex en nosnippet (meta-tag en header), koppen, title, description, canonical,
  JSON-LD-typen, zichtbare datum, eurobedragen, interne links en ankerteksten, alt-teksten,
  detectie van een lege JavaScript-shell.
- `checks.ts`: maakt hiervan de technische checks, de drie poortwachters, de hygiëne en de
  adviezen die direct uit een feit volgen (bijvoorbeeld een plak-klaar robots.txt-blok).

**2. Aannames (`lib/geo/knowledge/`).** Twee databestanden, één bron voor app, prompt en skill:
- `evidence.json`: elke aanname met bewijskracht (feit, sterk, middel, zwak, richtlijn,
  ontkracht), voorbehoud en bron. Heeft een datum `review_before`.
- `scorecard.json`: de criteria met punten, eigenaar, standaardadvies en "klaar als".

Aanscherpen: wijzig de JSON, werk `reviewed` bij, draai `npm test` en `npm run build:skill`.
De tests bewaken dat de punten optellen tot 100, dat elk criterium een aanname met bron heeft
en dat geen criterium alleen op een ontkrachte aanname steunt. `build:skill` schrijft
`skills/geo-page-checker/references/bewijsbasis.md` en `geo-checklist.md`.

**3. Oordeel (`lib/geo/analysis/`).** Het taalmodel beoordeelt alleen de inhoud, per criterium
(voldoet, deels, niet, niet te beoordelen) met een citaat van de pagina. De code rekent de
punten uit (`scorecard.ts`), laat feiten vóór het model gaan en bouwt de adviezen
(`finalizeAnalysis` in `index.ts`). Elk advies heeft: actie, waarom, waar, nu, voorstel,
eigenaar, inspanning, klaar als, punten en bron.

Regels:
- Een falende poortwachter topt de score af op 20.
- "Niet te beoordelen" telt niet mee. Snelheid en vermeldingen buiten de site zijn dat altijd.
- Is de pagina niet opgehaald, dan is er geen score.
- Schema en llms.txt worden gemeld en geven geen punten.
- Opgeslagen resultaten hebben een `rubric_version`. Rapporten van vóór deze versie blijven op
  de oude rubric ("1").

**Marketingbrein (`lib/geo/brain.ts`).** `buyerFromBrain()` zet de uitvoer van
`get_marketing_brain` om naar koperskennis (`GeoAnalysisInput.buyer`): publieken, klantvragen
met K-nummer, aanbod, keuzecriteria, concurrenten. Alleen goedgekeurde kennis telt;
`initialProfile` wordt niet gebruikt. Zonder brein gebruikt de scan de chatvelden en meldt het
rapport dat de klantvragen niet getoetst zijn.

De `claude`-provider wordt gekozen zodra `ANTHROPIC_API_KEY` is gezet. Zonder key, of als de
aanroep faalt, toont het rapport alleen de gemeten feiten en geen score (`providers/facts.ts`).
De oorzaak staat in de logs onder `analysis.run`. De mock draait alleen nog met een expliciete
`GEO_ANALYSIS_PROVIDER=mock`, voor lokaal testen.

De beoordeling gaat over het merk dat de pagina zelf opgeeft (`og:site_name` of schema). Wijkt
dat af van de ingevulde bedrijfsnaam, dan meldt het rapport dat.

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
rubric_version, visibility_score, category_scores, criteria, actions, blocked, technical_checks, hygiene, scope_notes, short_summary, what_ai_understands, likely_ai_positioning,
ai_answer_comparison (het ideale antwoord volgens de GEO-rubriek), llm_visibility
(wat elke echte LLM teruggeeft — zie hieronder), strengths, weaknesses,
missing_signals, content_gaps, recommended_pages, recommended_faq_questions,
quick_wins, thirty_day_action_plan, suggested_homepage_copy_improvements.

### Charlie beantwoordt vragen in de chat

De vragenlijst is vast (`lib/geo/charlie.ts`). Stelt een bezoeker in een antwoord
zelf een vraag, of vraagt die om suggesties, dan haalt de chat een echt antwoord op
via `POST /api/geo/charlie` (`lib/geo/charlie-reply.ts`). Het model geeft terug wat
Charlie zegt, de opgeschoonde waarde voor het veld en of de stap klaar is. Legt
Charlie een keuze voor, dan blijft de stap open, maximaal drie keer per stap.

Het eindpunt gebruikt `ANTHROPIC_API_KEY` en het model uit `GEO_CHAT_MODEL`
(standaard `claude-haiku-4-5`). Zonder sleutel, bij een fout of na 12 seconden
valt de chat terug op het vaste antwoord. Het eindpunt accepteert alleen verzoeken
van de eigen site, maximaal 600 tekens per bericht en 25 verzoeken per 10 minuten
per IP-adres.

### Multi-LLM zichtbaarheid ("Wat AI over je zegt")

Naast de analyse vraagt de scan de échte LLM's (ChatGPT/OpenAI, Gemini/Google,
Perplexity, Grok/xAI, Claude/Anthropic) wat zij op basis van de bedrijfsnaam teruggeven
(`lib/geo/analysis/llm-visibility.ts`). Elk systeem draait alleen als zijn key is
gezet (`OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY` /
`XAI_API_KEY` / `ANTHROPIC_API_KEY`), is best-effort en time-boxed (18s), en loopt PARALLEL aan de
analyse — nooit op het kritieke pad. De antwoorden komen in het rapport in een
tabel; eronder toont het "improved"-blok van `ai_answer_comparison` het ideale
antwoord volgens de GEO-methodiek. `GEO_AI_SEARCH=off` schakelt de hele probe uit.

## Admin dashboard (/admin)

Een verborgen, met **HTTP Basic Auth** beveiligd overzicht op `/admin` (niet
gelinkt, `noindex`). Toont alle inzendingen (naam, e-mail, telefoon, functie,
bedrijf, homepage, status, score, model) plus de **credit-/€-kosten**, berekend
uit de opgeslagen token-usage per scan (Anthropic-prijs × tokens, omgerekend
naar €). Auth via `middleware.ts`; credentials uit env:

```
ADMIN_USERNAME=CHANGE_ME   # kies een eigen gebruikersnaam
ADMIN_PASSWORD=CHANGE_ME   # kies een sterk, uniek wachtwoord — nooit een waarde uit de repo hergebruiken
# ADMIN_EUR_PER_USD=0.92   # USD→EUR koers voor de kostenweergave
```

Zonder die env-vars is `/admin` op slot (503). Kosten worden gemeten vanaf de
invoering van usage-logging; oudere scans tonen geen tokens. De nieuwe kolommen
(`model`, `input_tokens`, `output_tokens`, `visibility_score` op
`geo_scan_requests`) worden toegevoegd door de migratie-route opnieuw te draaien
(idempotent `add column if not exists`).

## Twee afzenders: NXTLI en Marketing AI Team

Eén codebase bedient `geo.nxtli.com` en `geo.marketingaiteam.com`. De afzender bepaalt logo,
kleuren, lettertype, de rol van Charlie, de vervolgstap, het rapport en de e-mail.

- Instelling: `lib/geo/brand.ts` (teksten, logo, vervolgstap, rapportkleuren).
- Stijl: `app/globals.css` onder `[data-brand="mat"]` (kleuren en lettertype van marketingaiteam.com).
- Keuze per verzoek, in deze volgorde: env `GEO_BRAND`, cookie `geo_brand`, hostnaam.
  Een host met `marketingaiteam` krijgt de stijl van Marketing AI Team.
- Testen op een testadres: open `/?brand=mat` of `/?brand=nxtli`.
- Leads krijgen het domein van de afzender als `source`.
- Het logo en het portret van Charlie voor Marketing AI Team laden nu vanaf marketingaiteam.com.
  Zet ze in `public/` en pas de paden in `brand.ts` aan om dat los te koppelen.

Domein koppelen: voeg `geo.marketingaiteam.com` toe aan het Vercel-project en zet bij de
DNS-beheerder van marketingaiteam.com een CNAME `geo` naar de waarde die Vercel toont. Voor e-mail
vanaf dit domein: voeg het domein toe in Resend en zet `GEO_EMAIL_FROM` per omgeving.

## Brand / styling aanpassen

Alle brand-tokens staan in **`app/globals.css`** (`:root`) en worden via
`tailwind.config.ts` als Tailwind-tokens gemapt. De live NXTLI-brand kon niet
automatisch worden opgehaald (de omgeving blokkeert `nxtli.com`); het huidige
licht-premium palet is een nette default. Swap de waarden van `--brand`,
`--accent`, `--ink`, etc. (en `--font-display`/`--font-sans`) om de echte brand
in te laden — één plek, de hele app volgt.

## PDF

Standaard wordt het rapport als **self-contained HTML** geserveerd
(`/<id>` (kort) en `/api/geo/report/[id]` (oud, blijft werken)), wat de bezoeker via "Print → Opslaan als PDF" kan
downloaden. Voor een echte PDF: implementeer in `lib/geo/report/pdf.ts` één van
de strategieën (Playwright/Puppeteer `page.pdf()`, of een externe
PDF-service die de file in Supabase Storage zet) en zet `GEO_PDF_STRATEGY`.
De rest van de app verandert niet.

## Deployment & DNS (geo.nxtli.com)

Deze repo is een **standalone Next.js app**, bedoeld als het eigen project voor
`geo.nxtli.com` (geen subdomain-routing in een bestaande app nodig).

1. **Vercel-project**: koppel deze repo. Root Directory = `./` (de
   `package.json` staat in de root). Framework = Next.js (auto-detect).
2. **Env vars**: zet onderstaande variabelen in het Vercel-project
   (Production + Preview) — zie de secrets-checklist.
3. **Domein**: voeg `geo.nxtli.com` toe als custom domain in het Vercel-project.
4. **Web-DNS** (bij de DNS-provider voor `nxtli.com`, bijv. YourHosting):

   | Type | Naam | Waarde |
   |------|------|--------|
   | CNAME | `geo` | `cname.vercel-dns.com` (neem de exacte waarde die Vercel toont) |

   Staat je provider geen CNAME op een subdomein toe → A-record `geo` →
   `76.76.21.21`. Achter Cloudflare: zet het record op **DNS only** (geen proxy).
5. **E-mail-DNS** (Resend, nodig omdat rapporten van `charlie@geo.nxtli.com`
   komen): voeg `geo.nxtli.com` toe in Resend → Domains en neem de getoonde
   records exact over. Ze hebben deze vorm:

   | Type | Naam | Waarde |
   |------|------|--------|
   | TXT (SPF) | `send.geo` | `v=spf1 include:amazonses.com ~all` |
   | MX | `send.geo` | `feedback-smtp.<regio>.amazonses.com` (prio 10) |
   | TXT (DKIM) | `resend._domainkey.geo` | `p=…` (lange sleutel uit Resend) |
   | TXT (DMARC, aanbevolen) | `_dmarc.geo` | `v=DMARC1; p=none;` |

6. Wacht op DNS-propagatie + automatisch SSL van Vercel; klik "Verify" in Resend.

### Secrets-checklist (Vercel env vars)

| Variabele | Verplicht? | Let op |
|-----------|-----------|--------|
| `ANTHROPIC_API_KEY` | ja | zonder key draait elke scan op de mock |
| Postgres-connectie (`POSTGRES_URL` e.d.) | ja | via de Vercel↔Supabase-integratie |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | ja | **sterk & uniek** — nooit de `CHANGE_ME`/repo-waarde |
| `RESEND_API_KEY` + `GEO_EMAIL_FROM` | voor e-mail | anders wordt de mail alleen voorbereid |
| `NEXT_PUBLIC_SITE_URL` | aanbevolen | `https://geo.nxtli.com` |
| `SLACK_WEBHOOK_URL`, `GEO_MAX_SCANS_PER_DAY`, `MIGRATE_SECRET`, `GEO_DIAG_SECRET` | optioneel | zie `.env.example` |

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
