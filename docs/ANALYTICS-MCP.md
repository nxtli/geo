# Analytics-koppelingen: GA4 en Meta Ads

Read-only toegang tot Google Analytics 4 en Meta Ads vanuit Claude, zodat
rapportages en analyses direct op de brondata gedraaid kunnen worden in plaats
van op handmatige exports.

Read-only is hier geen aanname maar een instelling: bij GA4 via de
API-scope + de rol van het service-account, bij Meta via de rol op het
advertentieaccount. Zie per onderdeel de sectie "Read-only borgen".

## 1. Meta Ads

Meta heeft een eigen, gehoste MCP-server. Je hebt dus **geen** developer-app,
API-sleutel of self-hosting nodig — alleen de URL en een Meta-account met
toegang tot het advertentieaccount.

**Endpoint:** `https://mcp.facebook.com/ads`

Geverifieerd (augustus 2026):

| | |
|---|---|
| Authorization endpoint | `https://www.facebook.com/v26.0/dialog/oauth` |
| Token endpoint | `https://graph.facebook.com/v26.0/oauth/access_token` |
| Client registration | `https://mcp.facebook.com/.well-known/register/ads` (dynamisch) |
| PKCE | S256 |
| Scopes | `ads_management`, `ads_read`, `catalog_management`, `business_management`, `pages_show_list`, `instagram_basic`, `ads_mcp_management` |

Omdat de server dynamische client-registratie ondersteunt, is de URL genoeg —
er hoeft niets vooraf aangemeld te worden bij Meta.

### Toevoegen

1. claude.ai → Settings → Connectors → **Add custom connector**
2. URL: `https://mcp.facebook.com/ads`
3. Inloggen met het Meta-account dat toegang heeft tot het advertentieaccount
4. Connector aanzetten voor de betreffende chat

### Read-only borgen

De OAuth-flow vraagt óók schrijfrechten aan (`ads_management`,
`catalog_management`); dat is niet per connector uit te zetten. De begrenzing
loopt daarom via de **rol in Meta Business Manager**: een gebruiker met
alleen analistenrechten op het advertentieaccount kan via de MCP-server niets
wijzigen, ongeacht de gevraagde scopes. Koppel dus met een account dat
bewust op leestoegang staat.

Aanvullend: campagnes die via de MCP-server worden aangemaakt komen standaard
**paused** binnen en gaan nooit vanzelf live.

### Zwart scherm bij het koppelen

Het OAuth-venster laadt `facebook.com/v26.0/dialog/oauth`. Een zwart of leeg
scherm daar komt vrijwel altijd door één van deze vier, in volgorde van hoe
vaak het voorkomt:

1. **Adblocker / tracking-bescherming** — `facebook.com/dialog/*` staat op veel
   blocklists (uBlock, AdGuard, Brave Shields, Ghostery). Het venster opent,
   maar de inhoud wordt geblokkeerd → lege zwarte frame. Zet de blocker uit
   voor `claude.ai` én `facebook.com` en probeer opnieuw.
2. **Third-party cookies geblokkeerd** — Safari (ITP), Firefox strict, of
   Chrome met "block third-party cookies". De dialog heeft Facebook-cookies
   nodig in een embedded context.
3. **Niet ingelogd bij Facebook in die browser**, of ingelogd met een
   privé-account zonder Business-toegang.
4. **Popup geblokkeerd** — venster opent wel, laadt niets.

Snelste route om te testen: een schoon Chrome-profiel, eerst inloggen op
`business.facebook.com` met het juiste account, adblocker uit, dan pas de
connector toevoegen.

## 2. Google Analytics 4

Google's officiële server: [`googleanalytics/google-analytics-mcp`](https://github.com/googleanalytics/google-analytics-mcp).
Read-only van ontwerp (scope `analytics.readonly`), gemarkeerd als
experimenteel, draait als lokale stdio-server — dus niet toe te voegen als
claude.ai custom connector, wél in Claude Code.

De configuratie staat in [`.mcp.json`](../.mcp.json) in de repo-root en start
via `uvx`, zodat er niets globaal geïnstalleerd hoeft te worden.

Beschikbare tools: `get_account_summaries`, `get_property_details`,
`list_google_ads_links`, `list_property_annotations`,
`get_custom_dimensions_and_metrics`, `run_report`, `run_realtime_report`,
`run_funnel_report`, `run_conversions_report`.

### Zonder Google Cloud: via Google Sheets

De GA4 Data API vraagt hoe dan ook OAuth-credentials, en die horen bij een
Cloud-project — van jezelf, of van een derde partij die de server host. Wil je
geen Cloud-project aanmaken, dan is de praktische route om GA4 niet via de API
te ontsluiten maar via Sheets:

1. Google Sheets → Extensies → Add-ons → **GA4 Reports Builder for Google
   Analytics** installeren (officieel van Google, gratis)
2. Rapport definiëren: property, periode, dimensies, metrics
3. **Scheduled report** aanzetten (uur / dag / week / maand)
4. De sheet in de AODR-map in Drive zetten

De data ververst zichzelf en is via de Drive-connector direct leesbaar. Geen
Cloud-project, geen sleutelbeheer, en de autorisatie loopt gewoon via het
Google-account dat al toegang tot de property heeft.

Beperking: je leest wat het rapport bevat, niet de hele API. Voor ad-hoc
vragen buiten de gedefinieerde dimensies moet het rapport aangepast worden.

### Credentials voor de MCP-server

Wil je wél de volledige API (elke dimensie/metric, ad hoc), dan verwacht de
server Application Default Credentials.

**Lokaal (eigen machine):**

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform
```

**Headless / remote sessies** (geen browser beschikbaar) — een service-account:

1. Google Cloud → nieuw service-account, sleutel downloaden als JSON
2. API's aanzetten: **Google Analytics Data API** en **Google Analytics Admin API**
3. GA4 → Beheer → Property-toegangsbeheer → het service-account-e-mailadres
   toevoegen met rol **Viewer**
4. `GOOGLE_APPLICATION_CREDENTIALS` in de omgeving laten wijzen naar het pad
   van de sleutel

Bewaar de sleutel nooit in de repo. Voor remote sessies: zet de inhoud als
environment-secret in de omgevingsinstellingen en schrijf hem bij sessiestart
naar een bestand buiten de working tree.

Let op: `.mcp.json` zet zelf géén `env`-blok met `${GOOGLE_APPLICATION_CREDENTIALS}`.
Een niet-gezette variabele wordt daar letterlijk doorgegeven, waarna de server
klaagt over een bestand met de naam `${GOOGLE_APPLICATION_CREDENTIALS}`. De
server erft nu gewoon de omgeving en volgt de normale ADC-zoekvolgorde.

### Read-only borgen

Twee lagen: de scope `analytics.readonly` staat schrijfacties niet toe, en de
rol **Viewer** op de property doet dat evenmin. De server zelf heeft geen
enkele schrijf-tool.

De Sheets-route is read-only van nature: de add-on leest rapporten uit en
schrijft alleen naar het spreadsheet, nooit terug naar de property.

## 3. AODR — vindplaatsen

Van `adverterenopderadio.nl` (geverifieerd op de live homepage):

- **GA4 measurement ID:** `G-1XXCF037HS`
- **Google Tag Manager:** `GTM-NKFPDDR`
- **Meta Pixel:** niet hardcoded in de HTML — die loopt via de GTM-container.
  Het pixel-ID is dus alleen in GTM of via de Meta-connector te bevestigen,
  niet uit de paginabron.

Let op: het measurement ID (`G-…`) is niet hetzelfde als het **property ID**
(een getal) dat de GA4-tools verwachten. Het property ID komt uit
`get_account_summaries` zodra de credentials staan.
