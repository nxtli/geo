<!-- Gegenereerd uit lib/geo/knowledge/*.json. Niet met de hand wijzigen. -->

# Bewijsbasis GEO

Versie 2026.11. Herzien op 2026-11-09. Volgende herziening voor 2027-02-09.

Elke aanname in de scan staat hier, met bewijskracht, voorbehoud en bron. Een advies mag niet stelliger zijn dan zijn bewijskracht. Noem in adviezen geen percentages of beloofde stijgingen.

## Bewijskracht

- **feit**: Vastgelegd in documentatie van de aanbieder. Door code te controleren.
- **sterk**: Meerdere onafhankelijke studies of een grote gecontroleerde test wijzen dezelfde kant op.
- **middel**: Eén goede studie, of een effect dat alleen in een testopstelling is gemeten.
- **zwak**: Observatie of praktijkervaring zonder gecontroleerde test.
- **richtlijn**: Advies van de aanbieder zelf (bijvoorbeeld Google), zonder gepubliceerde meting.
- **ontkracht**: Onderzocht en geen effect gevonden. Geeft geen punten.

## Aannames

### E-BOTS (feit)

Zoekbots bepalen of een AI-tool een pagina mag ophalen voor antwoorden: OAI-SearchBot (ChatGPT), Claude-SearchBot (Claude), PerplexityBot (Perplexity), Googlebot (AI Overviews en AI Mode), Bingbot (Copilot). Trainingsbots (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended) staan daar los van. Blokkeren van een trainingsbot is een keuze en geen fout.

Voorbehoud: Bots die een pagina op verzoek van een gebruiker ophalen (ChatGPT-User, Perplexity-User) volgen robots.txt niet altijd. Een firewall of CDN kan een bot weren die robots.txt toelaat. Dat ziet de scan niet.

Herzien als: Een aanbieder wijzigt de namen of het gedrag van zijn bots in de documentatie.

- [OpenAI, Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots), 2026
- [Perplexity, crawlerdocumentatie](https://docs.perplexity.ai/guides/bots), 2026
- [The Rank Masters, overzicht van AI-crawlers met verwijzing naar de documentatie van Anthropic](https://www.therankmasters.com/insights/service-playbooks/ai-crawlers-robots-txt-claudebot-gptbot-perplexitybot), 2026

### E-INDEX (richtlijn)

Een pagina verschijnt alleen in de AI-functies van Google als hij geïndexeerd is en in snippets mag verschijnen.

Voorbehoud: Geldt voor Google. Andere engines publiceren geen vergelijkbare eis.

Herzien als: Google wijzigt de eisen voor opname in AI-functies.

- [Google, Optimizing your website for generative AI features on Google Search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), 2026

### E-RENDER (middel)

Pagina's die niet goed op te halen of te ontleden zijn (JavaScript-rendering, blokkades, rommelige HTML) worden niet geciteerd. In een analyse van 949 gemiste citaties verklaarde dit 10,1%.

Voorbehoud: Gemeten in een testopstelling (GEO-Bench), niet op live engines.

Herzien als: Onderzoek toont dat de grote AI-crawlers JavaScript volledig uitvoeren.

- [Tian e.a., Diagnosing and Repairing Citation Failures in GEO](https://arxiv.org/abs/2603.09296), 2026

### E-RELEVANCE (sterk)

Aansluiting op de vraag is de belangrijkste factor. Bij 62,2% van de gemiste citaties paste de inhoud niet bij de vraag (verkeerde intentie, ontbrekende begrippen, verouderd, verkeerde regio). In 252.000 directe vergelijkingen was onderwerpmatch een van de vier doorslaggevende factoren bij alle zes geteste modellen.

Voorbehoud: Beide studies werken met vaste sets documenten. Ze meten niet welke pagina's een live engine ophaalt.

Herzien als: Een studie op live engines vindt geen verband tussen vraagaansluiting en citatie.

- [Tian e.a., Diagnosing and Repairing Citation Failures in GEO](https://arxiv.org/abs/2603.09296), 2026
- [Vishwakarma, What Gets Cited: Competitive GEO in AI Answer Engines (SIGIR 2026)](https://arxiv.org/abs/2605.25517), 2026

### E-PRICE (sterk)

Een expliciete prijs en concrete specificaties vergroten de kans dat een bron als eerste geciteerd wordt.

Voorbehoud: Getest met twee geanonimiseerde bronnen per vraag. Het effect van merkbekendheid is niet meegenomen.

Herzien als: Een studie met echte merken en meer dan twee bronnen vindt geen effect van een expliciete prijs.

- [Vishwakarma, What Gets Cited](https://arxiv.org/abs/2605.25517), 2026

### E-DEPTH (middel)

Diepgang, dekking van de begrippen uit de vraag en een vergelijking met alternatieven helpen. De grootte van het effect verschilt sterk per model.

Voorbehoud: Zelfde testopstelling als E-PRICE. Inhoudelijke armoede verklaarde in een andere studie een deel van 27,1% gemiste citaties.

Herzien als: Een replicatie op live engines vindt geen effect van diepgang of vergelijking.

- [Vishwakarma, What Gets Cited](https://arxiv.org/abs/2605.25517), 2026
- [Tian e.a., Diagnosing and Repairing Citation Failures in GEO](https://arxiv.org/abs/2603.09296), 2026

### E-UNIQUE (richtlijn)

Inhoud die iets toevoegt aan wat al bekend is, heeft de voorkeur: eigen onderzoek, eigen data, ervaring uit klantgesprekken en cases, een eigen methode of standpunt. Google noemt dit 'non-commodity content' en zet het bovenaan zijn advies voor AI-functies. Een taalmodel kan algemene kennis zelf formuleren en heeft daar geen bron voor nodig. Voor informatie die nergens anders staat, is de pagina de enige bron.

Voorbehoud: Er is geen gepubliceerde meting van het effect op citaties. De redenering is logisch en sluit aan op onderzoek naar diepgang en inhoudelijke armoede (E-DEPTH), maar is niet los getest. Eigen inbreng telt alleen als de herkomst erbij staat. Een AI-collega mag deze inhoud nooit zelf verzinnen: de organisatie levert haar aan.

Herzien als: Een studie meet het effect van unieke informatie op citaties, of de eigen proef toont dat pagina's met eigen data niet vaker worden aanbevolen.

- [Google, Optimizing your website for generative AI features on Google Search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), 2026
- [Search Engine Journal over de Google-gids](https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/), 2026

### E-CONFIDENT (middel)

Stellige taal met onderbouwing wint van taal vol voorbehouden. Inhoud zonder tegenstrijdigheden wint van inhoud die zichzelf tegenspreekt.

Voorbehoud: Zelfde testopstelling als E-PRICE.

Herzien als: Een replicatie vindt geen effect, of een nadelig effect van stellige taal op vertrouwen.

- [Vishwakarma, What Gets Cited](https://arxiv.org/abs/2605.25517), 2026

### E-EVIDENCE (middel)

Claims met bewijs winnen van claims zonder. Citaten en cijfers met bron vergrootten in de eerste GEO-studie het aandeel van een bron in het antwoord.

Voorbehoud: De cijfers uit de eerste studie (Aggarwal e.a.) zijn gemeten met GPT-3.5 in een vaste set van vijf documenten. Een replicatie op live engines ontbreekt. Noem daarom geen percentages in adviezen.

Herzien als: Een replicatie op live engines bevestigt of weerlegt het effect van citaten en cijfers.

- [Aggarwal e.a., GEO: Generative Engine Optimization (KDD 2024)](https://arxiv.org/abs/2311.09735), 2024
- [Vishwakarma, What Gets Cited](https://arxiv.org/abs/2605.25517), 2026
- [Critical Survey of GEO (2023-2026)](https://arxiv.org/abs/2607.14035), 2026

### E-RECENCY (sterk)

Een recente datum wint van een oude datum. Het effect is het grootst bij vragen waar actualiteit telt (prijzen, regels, vergelijkingen).

Voorbehoud: Bij tijdloze uitleg is het effect kleiner.

Herzien als: Onderzoek toont dat engines zichtbare datums negeren of valse datums afstraffen.

- [Vishwakarma, What Gets Cited](https://arxiv.org/abs/2605.25517), 2026
- [Critical Survey of GEO (2023-2026)](https://arxiv.org/abs/2607.14035), 2026

### E-ENTITY (zwak)

AI-tools halen aanbevelingen vaak uit bronnen van derden. Een merk dat buiten de eigen site genoemd wordt, komt vaker in antwoorden voor.

Voorbehoud: Observationeel en deels door de sector zelf betaald. Het toont geen oorzaak aan.

Herzien als: Een gecontroleerde test toont wel of geen oorzakelijk effect van vermeldingen bij derden.

- [Chen e.a., Generative Engine Optimization: How to Dominate AI Search](https://arxiv.org/abs/2509.08919), 2025

### E-PAGEBASE (richtlijn)

Semantische HTML, goede pagina-ervaring en weinig dubbele inhoud blijven de basis. Google behandelt optimalisatie voor AI-functies als onderdeel van SEO.

Herzien als: Google wijzigt zijn gids voor AI-functies.

- [Google, Optimizing your website for generative AI features on Google Search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), 2026

### E-FORMAT (zwak)

Opmaak alleen (lijstjes, blokken van vaste lengte) heeft weinig tot geen effect op citaties. Opknippen van tekst voor AI is volgens Google niet nodig.

Voorbehoud: Opmaak helpt de lezer wel. Daarom hoort het bij de lezer-lens, niet bij de score.

Herzien als: Een studie op live engines toont een duidelijk effect van opmaak op citaties.

- [Vishwakarma, What Gets Cited](https://arxiv.org/abs/2605.25517), 2026
- [Search Engine Journal over de Google-gids](https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/), 2026

### E-SCHEMA (ontkracht)

Het toevoegen van JSON-LD gaf geen meetbare stijging van AI-citaties: +2,4% in AI Mode, +2,2% in ChatGPT, -4,6% in AI Overviews. Google vraagt geen speciale schema voor AI-functies.

Voorbehoud: Getest op pagina's die al geciteerd werden. Schema blijft nuttig voor gewone zoekresultaten.

Herzien als: Een gecontroleerde studie toont een stijging van citaties na het toevoegen van schema, of een engine bevestigt het gebruik.

- [Ahrefs, schema en AI-citaties (1.885 pagina's)](https://ahrefs.com/blog/schema-ai-citations/), 2026

### E-LLMSTXT (ontkracht)

llms.txt heeft geen aantoonbaar effect op AI-citaties. Google noemt zulke bestanden onnodig.

Voorbehoud: Het bestand kost weinig en schaadt niet.

Herzien als: Een grote engine bevestigt dat hij llms.txt gebruikt, of een studie toont effect.

- [SE Ranking, llms.txt-studie (circa 300.000 domeinen)](https://seranking.com/blog/llms-txt/), 2025

### E-FAQRICH (feit)

Google toont sinds 7 mei 2026 geen FAQ-rich-results meer. FAQPage blijft een geldig schema-type.

Voorbehoud: Een vraag-en-antwoordblok op de pagina kan nog steeds helpen om klantvragen te beantwoorden. Dat telt mee onder aansluiting op de vraag, niet als opmaak.

Herzien als: Google herintroduceert FAQ-rich-results.

- [Google, FAQPage structured data](https://developers.google.com/search/docs/appearance/structured-data/faqpage), 2026

### E-VARIANCE (sterk)

AI-antwoorden verschillen per run en per engine. Eén run zegt weinig. Reken met 7 tot 8 herhalingen per vraag en meet het aandeel runs waarin het merk voorkomt.

Herzien als: Engines gaan vaste antwoorden geven of publiceren zelf cijfers over vermeldingen.

- [Critical Survey of GEO (2023-2026), met Schulte e.a. 2026](https://arxiv.org/abs/2607.14035), 2026
- [SparkToro en Gumshoe, AIs are highly inconsistent when recommending brands](https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/), 2026

### E-SCORELIMIT (middel)

Een paginascore zonder meting bij een engine is geen kans op citatie. Het bewijs dat citaties klikken of omzet voorspellen is zeer zwak.

Herzien als: Eigen proef: de paginascore voorspelt aanbeveling op 20 tot 30 pagina's van drie merken.

- [Scoring With the Engine: Limits of Engine-Agnostic GEO Scores](https://arxiv.org/abs/2609.22655), 2026
- [Critical Survey of GEO (2023-2026)](https://arxiv.org/abs/2607.14035), 2026

### E-TARGETED (middel)

Gerichte reparaties na een diagnose werken beter dan generieke herschrijfregels. De beste aanpak wijzigde ongeveer 5% van de tekst. Generieke regels schaadden gespecialiseerde pagina's.

Voorbehoud: Testopstelling.

Herzien als: Een studie op live engines toont dat volledig herschrijven beter werkt dan gericht repareren.

- [Tian e.a., Diagnosing and Repairing Citation Failures in GEO](https://arxiv.org/abs/2603.09296), 2026

### E-BUYER (zwak)

Een zinvolle audit begint bij de koper: de aanleiding, de keuzecriteria en de vragen in eigen woorden. Vragen die uit de eigen website zijn afgeleid, meten niet of de inhoud bij het publiek past.

Voorbehoud: Praktijkonderzoek van een bureau onder 100 audits.

Herzien als: Eigen proef: vragen uit klantgesprekken leveren dezelfde uitkomst als vragen afgeleid van de website.

- [Orbit Media, We Audited 100 AI Visibility Audits](https://www.orbitmedia.com/blog/ai-visibility-audits), 2026

## Aanscherpen

1. Wijzig `lib/geo/knowledge/evidence.json` (aanname, bewijskracht, bron).
2. Pas zo nodig punten of criteria aan in `scorecard.json`. Verhoog dan `version`.
3. Zet `reviewed` en `review_before` op de nieuwe data.
4. Draai `npm test` en `npm run build:skill`.
