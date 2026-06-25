---
name: geo-page-checker
description: >
  Scant een webpagina of hele website op vindbaarheid in AI-zoekmachines (GEO -
  Generative Engine Optimization) en levert een score, een technische check,
  geprioriteerde verbeterpunten en kant-en-klare fixes (FAQ-tekst en JSON-LD schema).
  Werkt voor een enkele pagina of een hele site (techniek site-breed plus inhoudelijke
  check op de belangrijkste pagina's). Gebruik deze skill ALTIJD wanneer iemand een URL
  geeft met de vraag die te checken, te verbeteren of te optimaliseren voor AI, GEO, AEO,
  AI-zichtbaarheid, ChatGPT/Gemini/AI Overviews, of "vindbaar in AI". Ook triggeren bij:
  "wat zou je aanpassen aan deze pagina voor GEO", "check deze landingspagina", "check
  mijn website", "is mijn site klaar voor AI", "GEO-tips voor deze URL", "hoe scoort deze
  pagina op GEO", "maak deze pagina beter vindbaar in ChatGPT", "doe een technische
  GEO-check", of wanneer iemand pagina-content deelt en vraagt of die geschikt is om
  geciteerd te worden door AI. Werkt voor elke pagina en elk merk.
---

# GEO Page Checker

Deze skill beoordeelt hoe goed een pagina of website vindbaar en citeerbaar is voor
generatieve AI-zoekmachines (ChatGPT, Gemini, Perplexity, Google AI Overviews) en geeft
concreet advies om dat te verbeteren. GEO (Generative Engine Optimization) verschilt van
klassieke SEO: het draait er niet om hoog ranken op een lijst met blauwe links, maar om door
een taalmodel begrepen, vertrouwd en letterlijk geciteerd te worden in een gegenereerd antwoord.

De skill heeft twee lagen die je los van elkaar rapporteert:

1. **Technische GEO-check** - mag en kan een AI de pagina/site uberhaupt lezen, vertrouwen en
   snel laden? (robots.txt, indexeerbaarheid, rendering, schema, llms.txt, snelheid). Zie
   `references/technische-checklist.md`.
2. **Inhoudelijke GEO-score** - is de content zelf citeerbaar en vraaggericht? (score op 100).
   Zie `references/geo-checklist.md`.

## Waarom dit anders is dan SEO

Een AI-model leest een pagina, knipt er stukjes uit en gebruikt die om een antwoord te
formuleren. Het kiest het liefst tekst die: zelfstandig leesbaar is (een zin die ook
buiten zijn context klopt), feitelijk en concreet is, en duidelijk gekoppeld aan een
herkenbare vraag of entiteit. Veel pagina's die prima scoren op SEO falen op GEO omdat
hun sterkste content in sfeervolle, niet-extraheerbare taal verstopt zit. Het doel van
deze skill is die kloof zichtbaar maken en dichten.

---

## Eerst: kies de modus (1 pagina of hele site)

Bepaal aan het begin of de gebruiker een **enkele pagina** of een **hele website** wil checken.
Vaak blijkt dat uit de vraag (een losse landingspagina-URL = enkele pagina; "check mijn site"
of een kale domeinnaam = hele site). Twijfel je, vraag het kort.

### Modus A - Enkele pagina (standaard)

Werk de drie fasen hieronder af voor die ene URL: technische check + inhoudelijke score + tips
+ fixes. Dit is het standaardgedrag.

**Maak de scope expliciet.** Benoem in de resultaten duidelijk dat je alléén deze ene pagina
hebt gecheckt, niet de hele website - met de volledige URL erbij. Anders denkt een gebruiker
al snel dat de hele site beoordeeld is. Begin het rapport met de pagina-URL en een regel als
"Scope: alleen deze pagina gecheckt, niet de hele site." Wil de gebruiker meer pagina's of de
hele site, bied dan modus B aan (site-breed + de belangrijkste pagina's).

### Modus B - Hele website

Bij een site-check splits je het werk zo:

1. **Techniek site-breed.** De site-brede technische checks (robots.txt + AI-bot toegang,
   llms.txt, sitemap, HTTPS) doe je een keer voor het hele domein. Dit is meestal de grootste
   en snelste winst: een geblokkeerde search-bot of ontbrekende llms.txt raakt de hele site.
2. **Vraag om de 3 belangrijkste pagina's.** Een volledige inhoudelijke analyse van elke
   pagina is traag en zelden nodig. Vraag de gebruiker daarom: "Welke 3 pagina's zijn voor
   jou het belangrijkst - bijvoorbeeld waar de meeste omzet of leads vandaan komen?" Op die
   pagina's doe je de volledige technische check per pagina (rendering, schema, koppen,
   snelheid) en de inhoudelijke GEO-score.
3. **Rapporteer per laag.** Een site-brede technische status, plus per gekozen pagina een
   eigen mini-rapport (score + belangrijkste bevinding). Daarna kan de gebruiker per pagina
   kiezen of je de tips en fixes uitwerkt - net als in modus A.

Gebruik gezond verstand bij het aantal: vraagt iemand expliciet om meer of minder pagina's,
volg dat. Bij een heel kleine site (een handvol pagina's) mag je aanbieden ze allemaal te doen.

---

## Werkwijze: drie fasen met tussenstops

Deze skill werkt in drie fasen, en je stopt na elke fase om de gebruiker te laten kiezen of
je doorgaat. Dit is bewust: het houdt het behapbaar, geeft de gebruiker controle, en
voorkomt dat je werk genereert (zoals een FAQ) dat misschien niet aansluit. Dump dus nooit
alles in een keer.

De drie fasen:

1. **Analyse** - eerst de snelheidsmeting (een losse stap die je samen met de gebruiker doet), dan de technische check + score en bevindingen. Daarna stoppen en vragen of je doorgaat naar de tips.
2. **Verbeterpunten** - geprioriteerde tips. Daarna stoppen en vragen of je de fixes genereert.
3. **Fixes** - FAQ en schema-markup, en oplevering in een bestand.

Respecteer de checkpoints strikt. Als de gebruiker bij een checkpoint iets anders vraagt
(bijvoorbeeld "alleen de FAQ" of "sla de tips over"), volg je dat - de stops zijn er voor
de gebruiker, niet andersom. Geeft de gebruiker bij de eerste vraag al aan "doe maar alles
in een keer", dan mag je de tussenstops overslaan.

---

## Fase 1 - Analyse

### Stap 1 - Haal de pagina('s) op

Fetch de opgegeven URL (of, in site-modus, robots.txt/llms.txt voor het domein plus de
gekozen pagina's). Let bij het lezen niet alleen op de zichtbare tekst, maar ook op
de `<head>`: de `meta robots`-tag, de meta description, en de title. Als de fetch alleen
een lege shell of "enable JavaScript" teruggeeft, is de pagina client-rendered - meld dat
(het is ook meteen een technische bevinding) en vraag of de gebruiker de zichtbare tekst
wil plakken, of gebruik een browser-tool als die beschikbaar is.

Als de gebruiker geen URL maar geplakte tekst aanlevert, sla je het ophalen over en werk
je met de tekst. Je kunt dan geen technische checks doen (robots, schema, snelheid) - benoem dat.

### Stap 2 - Snelheidsmeting (eerst, en als losse stap met de gebruiker)

De snelheidsmeting is een **aparte stap die je vóór de technische check zet**, en die je
**bewust samen met de gebruiker doet**. Reden: de technische check is pas compleet als je de
snelheid weet, en die kun je in Cowork niet zelf ophalen - de omgeving kan Google PageSpeed
Insights niet rechtstreeks aanroepen. Dus zet je hier even een stap stil en neem je de
gebruiker mee in wat er gaat gebeuren en waarom. Dump dit niet als losse zin tussen de andere
checks; maak er een herkenbaar momentje van.

Leg het zo uit (in je eigen woorden, vriendelijk en kort):

> "Voor de techniek wil ik ook de laadsnelheid meten - dat weegt mee in de score en bepaalt
> mede de eindconclusie. Dat kan ik hier niet zelf doen, dus heb ik jou heel even nodig.
> Open deze link, wacht tot de meting klaar is (~20-40 sec), klik dan rechtsboven op
> **'Link kopiëren'** en plak die link hier terug - dan lees ik de cijfers eruit:
> `https://pagespeed.web.dev/analysis?url=[URL-ENCODED-PAGINA]&form_factor=mobile`"

Belangrijk: vraag specifiek om de **'Link kopiëren'-link rechtsboven** (de afgeronde meting,
met een analyse-ID in de URL, bijv. `.../analysis/https-.../abcdef123`), niet om de
`analysis?url=`-link zelf - die start de meting opnieuw en laadt traag. URL-encode de
pagina-URL in de link die je aanreikt. Krijg je de result-link terug, lees daar de
Performance-score en de Core Web Vitals (LCP, CLS, TBT/INP, FCP) uit en verwerk die in de
drempeltabel.

**Wacht op de gebruiker** voordat je naar de technische check gaat. Heb je de
Claude-in-Chrome-tools beschikbaar, dan mag je aanbieden het zelf te doen (de result-link
openen en uitlezen) - maar de standaard is: vraag het de gebruiker en neem 'm mee. Wil of kan
de gebruiker niet meten, dan sla je snelheid eerlijk over ("snelheid niet gemeten") en ga je
door met de rest. Gok nooit een score. De volledige werkwijze en de drempels staan in
`references/technische-checklist.md` (punt 7).

### Stap 3 - Technische GEO-check

Loop de technische checklist af uit `references/technische-checklist.md` (lees dat bestand
eerst). Dit is een aparte laag, los van de inhoudelijke score. Voer de checks uit en neem de
snelheidsmeting uit stap 2 hierin mee. Presenteer een kort, scanbaar technisch blok met per
check een status (groen/oranje/rood of goed/aandacht/blokker) en een samenvattende technische
status.

Het allerbelangrijkste technische punt is AI-crawler toegang in robots.txt: als de
search-bots (OAI-SearchBot, ClaudeBot, PerplexityBot) geweerd worden, kan de pagina simpelweg
niet geciteerd worden - dat is een harde blokker die boven alles uit gaat.

### Stap 4 - Scoor de inhoud

Beoordeel de pagina op de criteria in `references/geo-checklist.md`. Lees dat bestand
voordat je scoort. Geef per categorie een score en een totaalscore op 100. Wees eerlijk
en concreet: een hoge score zonder onderbouwing helpt niemand. Koppel elk afgetrokken
punt aan een waarneembaar gebrek op de pagina.

Gebruik deze categorieen en weging:

| Categorie | Punten | Kern |
|---|---|---|
| Vindbaarheid & techniek | 20 | Mag een crawler/AI de pagina uberhaupt zien? (robots, indexeerbaarheid, schema aanwezig) |
| Extraheerbare antwoorden | 25 | Staan er zelfstandige, citeerbare zinnen en een directe samenvatting? |
| Vraaggerichte structuur | 20 | Matchen koppen en FAQ met echte zoekvragen? |
| Concrete feiten | 15 | Prijs, datum, locatie, duur, specs - expliciet en vindbaar? |
| Entiteit & vertrouwen | 10 | Is duidelijk wie/wat/waar? Auteur met bio/credentials, organisatie, expertise, interne samenhang? |
| Bewijs, bronnen & actualiteit | 10 | Statistieken, expertcitaten en bronvermelding (sterke GEO-hefboom), reviews als tekst, datums met jaartal? |

De technische check (stap 3) en de categorie "Vindbaarheid & techniek" overlappen deels:
gebruik de meting uit stap 2 om die categorie te onderbouwen, maar houd de uitgebreide
technische bevindingen in het aparte technische blok.

Naast deze zes scorecategorieen kent de checklist een **lezer-lens (CRO)** die je niet meetelt in
de 100 punten maar wel apart rapporteert (herkenning, urgentie, belofte, actie/CTA, overtuiging,
eenvoud) - zie `references/geo-checklist.md`. De technische check omvat naast snelheid ook
beeldoptimalisatie (compressie/WebP/lazy-load) en een advies voor maandelijkse monitoring; zie
`references/technische-checklist.md`.

Open dit blok in enkele-pagina-modus met de gecheckte URL en de scope-regel ("alleen deze
pagina, niet de hele site"), zodat meteen helder is wat wel en niet beoordeeld is. Presenteer
in deze fase verder **alleen** het technische blok, de score, de scoretabel, en een alinea
met de belangrijkste conclusie (de grootste hefboom). Benoem eventuele blokkers (zoals een
`noindex` of een geblokkeerde search-bot) hier kort, want die bepalen of de rest zin heeft.
Houd de details van de oplossingen nog achter - die komen in fase 2. In site-modus geef je het
site-brede technische blok een keer, en daarna per gekozen pagina een eigen score + conclusie.

### Checkpoint 1 - vraag of je doorgaat

Sluit fase 1 af met een korte vraag, bijvoorbeeld: "Wil je dat ik de verbeterpunten
uitwerk?" Wacht op antwoord voordat je verder gaat. Ga pas door naar fase 2 als de
gebruiker dat bevestigt.

---

## Fase 2 - Verbeterpunten

### Stap 4 - Geef geprioriteerde tips

Lever de verbeterpunten op volgorde van impact, niet op volgorde van de checklist. Begin
met blokkers (bijvoorbeeld een `noindex` of een geblokkeerde search-bot - dan heeft de rest
geen zin). Maak elke tip concreet en toegepast op deze pagina: niet "voeg een FAQ toe" maar
"voeg een FAQ toe met deze 5 vragen die jouw bezoekers echt stellen: ...". Geef waar nuttig
een herschreven voorbeeld van een kop of zin, zodat het verschil meteen voelbaar is.

Technische tips horen er ook bij: een concreet robots.txt-blok dat de search-bots toelaat,
een voorbeeld-llms.txt, of "je LCP is 5,2s door een ongecomprimeerde hero-afbeelding".

Houd rekening met conversie. GEO en CRO botsen soms: een droge feitenalinea pal onder de
headline is goed voor AI maar slecht voor de bezoeker. Bied in zulke gevallen een oplossing
die beide dient (bijvoorbeeld feiten in een apart "in het kort"-blok verderop, of een
neutrale subkop onder een wervende kop). Forceer de gebruiker nooit te kiezen tussen mens
en machine als het allebei kan.

### Checkpoint 2 - vraag of je de fixes genereert

Sluit fase 2 af met een vraag in de geest van: "Zal ik de FAQ en schema-markup voor je
genereren?" Twee fixes lenen zich voor automatische generatie: de FAQ-tekst en het JSON-LD
schema. Bied ze aan en laat de gebruiker kiezen of het allebei moet, of maar een van de
twee. Wacht op antwoord voordat je genereert.

---

## Fase 3 - Fixes

### Stap 5 - Maak de fixes

Genereer de twee fixes die het meeste werk uit handen nemen:

1. **FAQ-tekst.** Schrijf 8-12 veelgestelde vragen met antwoorden. Elke vraag is een kop;
   elk antwoord begint met een zelfstandige zin die de vraag volledig beantwoordt (de zin
   die AI eruit knipt), gevolgd door 1-2 zinnen context. Baseer de vragen op wat een echte
   bezoeker zou typen, en op de feiten die je op de pagina vond. Verzin geen feiten -
   gebruik wat er staat, en markeer met `[invullen: ...]` wat ontbreekt.

2. **JSON-LD schema-markup.** Genereer geldige schema die in de pagina geplakt kan worden.
   Kies het juiste type op basis van de pagina; zie `references/schema-templates.md` voor
   de templates en wanneer je welke gebruikt. Vul de templates met de echte gegevens van de
   pagina. Combineer types waar relevant (bijvoorbeeld `FAQPage` + `Course` op een
   cursuspagina).

   **Valideren vóór plaatsing.** Wijs de gebruiker er bij de oplevering altijd op het schema
   te valideren met Google's Rich Results Test (`https://search.google.com/test/rich-results`)
   voordat het live gaat: plak de URL of de schema-code, en controleer dat er geen fouten of
   waarschuwingen zijn. Schema met een tikfout wordt door zoekmachines en AI stil genegeerd,
   dus deze stap voorkomt dat de fix ongemerkt niets doet. Type-naslag staat op `schema.org`.
   Heb je de Claude-in-Chrome-tools, dan kun je de validatie ook zelf doen: open de Rich
   Results Test, plak de code en lees het resultaat uit.

Stem de toon van de FAQ af op de pagina. Als er een merk-/schrijfstijlskill beschikbaar is
voor dit merk, gebruik die voor de tekst. Anders spiegel je de toon die je op de pagina ziet.

### Stap 6 - Lever op

Schrijf het resultaat naar een bestand in de werkmap van de gebruiker en presenteer het.
Gebruik de structuur uit "Outputformat" hieronder. Sla de FAQ en het schema als losse,
plak-klare blokken op zodat de gebruiker ze direct kan overnemen. Eindig met een korte
vervolgvraag (bijvoorbeeld of de gebruiker wil dat je een specifieke fix verder uitwerkt).

## Outputformat

Tijdens de gesprekfasen toon je de inhoud in de chat. Bij oplevering (na fase 3, of zodra
de gebruiker zegt te willen stoppen) bundel je alles wat tot dan toe is gemaakt in een
bestand in de werkmap. Bevat het gesprek bijvoorbeeld alleen fase 1 en 2, dan bevat het
bestand alleen de technische check, de score en de tips. Gebruik deze structuur voor het
gebundelde rapport (enkele pagina):

```
# GEO-check: [paginanaam]

**Gecheckte pagina:** [volledige URL]
**Scope:** alleen deze pagina gecheckt, niet de hele website.

## Technische check: [groen/oranje/rood]
[Per check een regel met status. Blokkers bovenaan.]

## Inhoudelijke score: [X]/100
[Een alinea: de belangrijkste conclusie. Wat is de grootste hefboom?]

[Scoretabel per categorie]

## Wat als eerste moet (blokkers)
[Alleen als er blokkers zijn, zoals noindex of geblokkeerde search-bot]

## Verbeterpunten (op impact)
[Geprioriteerde lijst, concreet en toegepast op deze pagina, met herschreven voorbeelden]

## Fix 1: FAQ (plak-klaar)
[8-12 vragen met antwoorden]

## Fix 2: Schema-markup (plak-klaar)
[JSON-LD blok(ken)]
```

Voor een site-check gebruik je deze structuur:

```
# GEO-check site: [domein]

## Technische check site-breed: [groen/oranje/rood]
[robots.txt + AI-bot toegang, llms.txt, sitemap, HTTPS. Blokkers bovenaan.]

## Pagina 1: [naam] - score [X]/100
[Technische status pagina + inhoudelijke conclusie + verbeterpunten + fixes]

## Pagina 2: [naam] - score [X]/100
...

## Pagina 3: [naam] - score [X]/100
...
```

## Belangrijke principes

- **Verzin nooit feiten.** Prijzen, datums en namen komen van de pagina. Wat ontbreekt,
  markeer je als in te vullen - dat is zelf al een verbeterpunt.
- **Wees concreet, niet generiek.** Adviezen die op elke pagina passen, passen op geen
  enkele goed. Verwijs naar wat je daadwerkelijk op de pagina zag.
- **Leg het waarom uit.** De gebruiker leert ervan en kan zo zelf betere keuzes maken -
  zeker als dit gebruikt wordt in een training of door een agency voor klanten.
- **Techniek voor inhoud.** Een harde technische blokker (noindex, geweerde search-bot,
  content alleen via JavaScript) maakt de inhoudelijke score irrelevant - los die eerst op.
- **Eerlijk over wat je niet kunt meten.** Faalt een fetch of de PageSpeed-call, of werk je
  met geplakte tekst, benoem dat in plaats van te gokken.
