# Technische GEO-checklist

De technische checks staan los van de inhoudelijke GEO-score. Ze beantwoorden ��n vraag:
**mag en kan een AI-zoekmachine deze pagina of site uberhaupt lezen, vertrouwen en snel laden?**
Een perfecte tekst is zinloos als de crawler wordt geweerd of de pagina pas na zware
JavaScript verschijnt. Loop deze checks af, rapporteer ze in een apart blok (zie SKILL.md),
en geef per punt een status: GOED, AANDACHT, of BLOKKER.

Veel van deze checks zijn van nature **site-breed** (robots.txt, llms.txt, sitemap, HTTPS gelden
voor het hele domein), een paar zijn **per pagina** (indexeerbaarheid, rendering, schema,
koppen, snelheid). Bij een check van een enkele pagina doe je alles voor die ene pagina; bij
een site-check doe je de site-brede punten een keer en de pagina-punten per gekozen pagina.

Bijna alles haal je uit drie gratis bronnen: de pagina-fetch zelf, `/robots.txt`, en
`/llms.txt`. Alleen snelheid (punt 7) gebruikt de Google PageSpeed Insights API.

---

## 1. AI-crawler toegang (robots.txt) - site-breed

Dit is de belangrijkste technische check. Fetch `https://[domein]/robots.txt` en kijk welke
AI-bots worden toegelaten of geblokkeerd. Onderscheid drie soorten:

- **Search-/retrieval-bots** - deze halen je pagina op het moment dat iemand een vraag stelt
  en bepalen of je geciteerd wordt. **Deze wil je toelaten.** De belangrijkste:
  `OAI-SearchBot` (ChatGPT search), `Claude-SearchBot` en `ClaudeBot` (Claude),
  `PerplexityBot` (Perplexity), `Googlebot` (Google AI Overviews gebruikt de gewone Googlebot).
- **Training-bots** - deze trainen toekomstige modellen: `GPTBot` (OpenAI), `CCBot` (Common
  Crawl), `Google-Extended` (Gemini-training), `Applebot-Extended` (Apple Intelligence).
  Blokkeren is een legitieme keuze en schaadt je gewone Google-ranking niet. Benoem het als
  bewuste keuze, niet als fout.
- **Agent-bots** - `ChatGPT-User`, `Claude-User`: halen een pagina op als de gebruiker er
  live om vraagt. Toelaten helpt zichtbaarheid.

Rapporteer concreet: welke search-bots zijn toegestaan, welke geblokkeerd. Een `Disallow: /`
onder `User-agent: OAI-SearchBot` of `PerplexityBot` is een BLOKKER voor GEO - dan kun je
simpelweg niet geciteerd worden. Een blok op alleen `GPTBot`/`Google-Extended`/`CCBot` is
AANDACHT/neutraal (trainingskeuze). Geen enkele AI-bot genoemd = standaard toegestaan = GOED.

## 2. Indexeerbaarheid - per pagina

Check de `meta robots`-tag in de `<head>` en - indien zichtbaar - de `X-Robots-Tag`
HTTP-header. `noindex` of `nofollow` weert zoekmachines en de meeste AI-crawlers. Dit is een
harde BLOKKER: zet hem bovenaan, want de rest heeft dan geen zin.

## 3. Content-rendering (kun je de tekst zien zonder JavaScript?) - per pagina

AI-crawlers voeren vaak geen of nauwelijks JavaScript uit. Vergelijk de **rauwe** HTML
(server-side response) met de zichtbare pagina:

- Staat de kerncontent (koppen, alinea's, prijzen) al in de HTML die de fetch teruggeeft? GOED
- Geeft de fetch alleen een lege shell, een `<div id="root">`, of "enable JavaScript"? Dan is
  de pagina client-side gerenderd en zien crawlers de inhoud niet. BLOKKER.
- Gedeeltelijk (boven de vouw server-side, rest via JS)? AANDACHT - benoem welk deel ontbreekt.

## 4. Structured data (JSON-LD) - per pagina

Let op de omgeving: in Cowork zet de fetch HTML om naar platte tekst en knipt daarbij de
`<script type="application/ld+json">`-blokken weg. Je ziet schema dus standaard NIET via een
gewone fetch, en de validators (validator.schema.org, Google Rich Results Test) zijn
JavaScript-pagina's die je via fetch evenmin kunt uitlezen. Een eigen HTTP-call (curl, script)
is niet toegestaan. Volg daarom deze routes in volgorde en gebruik de eerste die werkt:

1. **Browser verbonden (Claude in Chrome).** Open de pagina, of validator.schema.org /
   search.google.com/test/rich-results, en lees + valideer de JSON-LD zelf. Meest betrouwbaar.
2. **Geen browser.** Vraag de gebruiker welke types de validator toont, of laat hem de JSON-LD
   uit de paginabron (view-source) plakken. Werk verder op basis daarvan.
3. **Geen van beide lukt.** Markeer schema expliciet als "niet te verifiëren zonder browser",
   net zoals je snelheid eerlijk overslaat als je niet kunt meten. Zet het dan NIET als 🟠
   aandachtspunt en trek er GEEN punten voor af - onbekend is niet hetzelfde als afwezig. Gok
   nooit dat schema ontbreekt op basis van een fetch die scripts wegknipt.

Rapporteer, zodra je de data wél hebt:

- Is er schema aanwezig? Zo nee: AANDACHT (gemiste kans, geen blokker).
- Welke types? (`Organization`, `LocalBusiness`, `FAQPage`, `Article`, `Product`, `Course`...)
- Is het JSON geldig (parse-baar, geen syntaxfouten)? Ongeldig schema wordt genegeerd. BLOKKER
  voor dat blok.
- Sluit het type aan op de pagina? (Een dienstpagina zonder `Service`/`LocalBusiness` mist
  context.)

De inhoudelijke fix (schema genereren) zit al in fase 3 van de skill - hier rapporteer je
alleen de meting.

## 5. Semantische HTML & koppenstructuur - per pagina

Een `<h1>`, logische `<h2>`/`<h3>`-hierarchie, echte heading-tags (geen opgemaakte `<div>`'s).
Modellen leunen op de koppenstructuur om de pagina te begrijpen. Meerdere h1's, of alles als
div, is AANDACHT.

- **Alt-teksten & afbeeldingen.** Hebben relevante afbeeldingen een beschrijvende `alt`-tekst?
  Alt-tekst (en beschrijvende bestandsnamen/onderschriften) maakt visuele content leesbaar voor
  modellen. Ontbrekende of lege alt-attributen op inhoudelijke beelden = AANDACHT; decoratieve
  beelden mogen leeg blijven.
- **Beeldgewicht & formaat.** Zijn afbeeldingen gecomprimeerd, in een modern formaat (WebP/AVIF)
  en lazy-loaded? Zware, ongecomprimeerde beelden vertragen de pagina (slechte LCP) en worden
  minder vaak volledig gecrawld. Grote of verouderde formaten (ongecomprimeerde PNG/JPG) of
  ontbrekende lazy-load op beelden onder de vouw = AANDACHT.

## 6. Basis-hygiene - grotendeels site-breed

- **HTTPS** - laadt de pagina over `https://` met een geldig certificaat? Geen HTTPS = AANDACHT
  (vertrouwenssignaal weg).
- **Canonical** (per pagina) - staat er een `<link rel="canonical">`? Voorkomt
  dubbele-content-verwarring.
- **`llms.txt`** (site-breed) - bestaat `https://[domein]/llms.txt`? Nieuwe de-facto standaard
  die AI's een schoon overzicht van je belangrijkste pagina's geeft. Aanwezig + gevuld = GOED,
  aanwezig maar leeg = AANDACHT, afwezig = AANDACHT.
- **Sitemap** (site-breed) - verwijst `robots.txt` naar een `sitemap.xml`, of bestaat die op de
  standaardlocatie?

## 7. Snelheid & Core Web Vitals (PageSpeed Insights) - per pagina

**Doe dit als een losse stap, en als eerste binnen fase 1 - vóór de rest van de technische
check.** De technische check is namelijk pas compleet als je de snelheid weet, en de meting
kun je in Cowork niet zelf ophalen. Maak er dus een herkenbaar momentje van waarin je de
gebruiker meeneemt: leg uit dat je de laadsnelheid wilt meten, dat dat meeweegt in de score en
de eindconclusie, en dat je daar heel even hun hulp bij nodig hebt. Niet wegmoffelen tussen de
andere checks. (De plek in de flow staat beschreven in SKILL.md, Fase 1, Stap 2.)

Trage pagina's worden minder vaak volledig gecrawld en bieden een slechtere gebruikerservaring.
Meet dit met **Google PageSpeed Insights** (gratis). De data die je uitleest is altijd hetzelfde
(zie "Wat je uitleest" hieronder); alleen de manier waaróp je die ophaalt verschilt per omgeving.
Loop de methoden in volgorde af en gebruik de eerste die past.

> Let op: de directe API-aanroep (`googleapis.com/pagespeedonline/...`) werkt **niet** in de
> Cowork-omgeving - de shell heeft geen uitgaand internet en `web_fetch` geeft een lege respons
> op dat API-adres. Probeer die route dus niet; gebruik de methoden hieronder.

### Methode 1 (standaard) - de gebruiker draait de meting en plakt de result-link

Dit is de standaardroute, omdat je de gebruiker zo bewust meeneemt in de stap. Geef een
kant-en-klare link en vraag of de gebruiker 'm draait en de **afgeronde** meting terugplakt:

> "Open deze link, wacht tot de meting klaar is (~20-40 sec), klik dan op de knop
> **'kopieer link'** rechtsboven op de resultaatpagina en plak die link hier terug - dan lees
> ik de cijfers eruit:
> `https://pagespeed.web.dev/analysis?url=[URL-ENCODED-PAGINA]&form_factor=mobile`"

Cruciaal: vraag om de link uit de knop **'kopieer link' rechtsboven** op de resultaatpagina -
NIET de URL uit de adresbalk. De 'kopieer link'-knop geeft een link met analyse-ID
(`https://pagespeed.web.dev/analysis/https-.../abcdef123?form_factor=mobile`) die het klare
rapport direct laadt. De `analysis?url=`-link die je zélf aanreikt (en de adresbalk) is bedoeld
om de meting te *starten*; die opnieuw openen laat de analyse opnieuw draaien en blijft soms hangen.
URL-encode de pagina-URL in de link die je aanreikt. Krijg je de result-link terug, lees daar de
Performance-score en de Core Web Vitals (LCP, CLS, TBT/INP, FCP) uit en verwerk die in de
drempeltabel.

### Methode 2 - zelf doen via Claude in Chrome (alleen als de tools er zijn)

Zijn de Claude-in-Chrome-browsertools beschikbaar/verbonden (check desnoods met
`list_connected_browsers`)? Dan mag je aanbieden de meting zelf te draaien, zodat de gebruiker
niets hoeft te doen:

1. Navigeer naar `https://pagespeed.web.dev/analysis?url=[URL-ENCODED-PAGINA]&form_factor=mobile`.
2. Wacht tot de analyse klaar is (de score verschijnt; reken op ~30-90 sec - check een paar keer
   of `data loading` weg is). Stuit je op Google's cookie-melding, accepteer die niet namens de
   gebruiker; lukt de meting daardoor niet, val terug op methode 1.
3. Lees de paginatekst/score uit en haal de performance-score en de Core Web Vitals
   (LCP, CLS, TBT/INP, FCP) eruit.

Ook hier geldt: de **result-link** (met analyse-ID) is het betrouwbaarst om uit te lezen.

### Methode 3 (laatste backup) - overslaan

Lukt geen van beide (de gebruiker wil/kan niet plakken én geen Chrome), dan sla je snelheid over.
Meld eerlijk "snelheid niet gemeten" en benoem dat de overige technische checks (robots,
rendering, schema, llms.txt) wél staan. Gok nooit een score.

### Wat je uitleest

Ongeacht de methode rapporteer je:

- **Performance-score** (0-100) - de hoofdscore.
- **LCP** (laadtijd grootste element), **CLS** (visuele stabiliteit), **TBT/INP**
  (interactiviteit), **TTFB** (serverreactietijd) - de losse Core Web Vitals.
- Heeft de site genoeg verkeer, dan toont PageSpeed ook **veld-data** van echte bezoekers
  (FAST/AVERAGE/SLOW). Ontbreekt dat, meld je "te weinig veldverkeer, alleen lab-data" - dat is
  normaal voor kleinere sites.

### Drempels (Core Web Vitals, mobile)

| Metric | Goed | Matig | Slecht |
|---|---|---|---|
| LCP (laadtijd) | < 2,5 s | 2,5-4,0 s | > 4,0 s |
| CLS (stabiliteit) | < 0,1 | 0,1-0,25 | > 0,25 |
| INP (interactie) | < 200 ms | 200-500 ms | > 500 ms |
| TTFB (server) | < 0,8 s | 0,8-1,8 s | > 1,8 s |
| Performance-score | >= 90 | 50-89 | < 50 |

Rapporteer de score, de losse metrics met hun status, en in een zin de grootste vertrager
(meestal LCP of TTFB). Faalt de API-call (rate-limit, time-out, pagina onbereikbaar voor
Google), meld dat eerlijk en sla snelheid over in plaats van te gokken.

---

## 8. Monitoring & herhaling - site-breed

Een GEO-check is geen eenmalige actie: modellen, je eigen site en je concurrenten veranderen
continu. Adviseer een vast ritme - bijvoorbeeld een maandelijkse technische scan (robots,
rendering, schema, snelheid, llms.txt) waarbij je fixes en wijzigingen vastlegt. Zo zie je
verbetering over tijd, vang je regressies vroeg op, en houd je bij wat nog open staat. Leg per
scan kort vast: wat is veranderd, wat is gefixt, en wat staat nog open.

## Samenvattende technische status

Sluit het technische blok af met een regel: **groen** (geen blokkers, AI mag en kan de pagina
goed lezen), **oranje** (leesbaar maar met aandachtspunten, bv. trage LCP of ontbrekend
schema), of **rood** (een harde blokker: noindex, geblokkeerde search-bot, of content alleen
via JavaScript). Zet rode blokkers altijd bovenaan de verbeterpunten in fase 2 - ze maken de
inhoudelijke score irrelevant tot ze opgelost zijn.

Bij een site-check geef je deze status zowel site-breed (op basis van robots.txt/llms.txt/
sitemap/HTTPS) als per gekozen pagina (rendering/schema/snelheid).
