# Plan: GEO-module v2

Status: voorstel, 9 november 2026. Prototype: `prototype/index.html`.

## Doel

De GEO-module doet drie dingen voor elk merk in het Marketing AI Team:

1. **Meten** hoe vindbaar het merk nu is in AI-tools.
2. **Beoordelen** hoe geschikt een of meer pagina's zijn om gevonden en geciteerd te worden.
3. **Verbeteren** met gerichte adviezen en herschreven tekst.

De module gebruikt het Marketingbrein als bron. Het brein levert het publiek, de veelgestelde vragen, het aanbod en de positionering. De module schrijft de uitkomst terug als voorstel.

## Uitgangspunten

- **Elk advies heeft een bron en een bewijskracht.** Sterk, middel, richtlijn of ontkracht. Adviezen zonder bewijs krijgen geen punten.
- **Een paginascore is geen kans op citatie.** De scorecard meet geschiktheid. De zichtbaarheidsmeting meet het resultaat. De module rapporteert die twee apart.
- **Diagnose voor herschrijven.** Eerst vaststellen bij welke vraag de pagina tekortschiet, daarna gericht repareren. Geen generieke herschrijfregels.
- **Eén methode, drie afnemers.** De skill, de app op geo.nxtli.com en het Marketing AI Team gebruiken dezelfde scorecard en dezelfde bewijsbasis.

## Wat verandert ten opzichte van v1

| Onderdeel | v1 | v2 |
|---|---|---|
| Score | 6 categorieën, techniek 20 punten | 3 poortwachters zonder punten, 7 dimensies, vraagaansluiting 30 punten |
| Bewijs | Princeton-cijfers als vaste waarheid | Bewijsbasis met bron, jaar en bewijskracht per criterium |
| llms.txt, schema, FAQ-opmaak | Tellen mee | Hygiëne zonder punten |
| AI-bots | ClaudeBot als zoekbot | Zoekbots, trainingsbots en gebruikersbots gescheiden, door een parser beoordeeld |
| Meting | Eén merkvraag per LLM, één keer | Promptset uit het brein, 8 herhalingen, vermeldingspercentage en citaties per engine |
| Invoer | Zes vragen in de chat | Marketingbrein, met de chatvragen als terugval |
| Werkwijze | Interactief met verplichte tussenstops | Draait in één keer, tussenstops optioneel |
| Uitvoer | HTML-rapport | Scorecard-object, adviezen met K-nummers, voorstel voor het brein |

## Paginapraktijken die de module meeneemt

Deze praktijken horen bij goede webpagina's in het algemeen. De module weegt ze naar bewijs voor AI-vindbaarheid.

**Met punten (dimensie Paginabasis, 10 punten)**

- Eén h1 en een logische koppenstructuur in echte heading-tags.
- Titel en beschrijving zeggen wat de pagina biedt en voor wie.
- Interne links met beschrijvende ankertekst naar verwante pagina's.
- Pagina-ervaring: laadsnelheid (Core Web Vitals), mobiel bruikbaar, toegankelijk. Browseragents lezen de DOM en de toegankelijkheidsboom.

**Als poortwachter (geen punten, wel een plafond op de score)**

- AI-zoekbots mogen de pagina ophalen.
- De pagina is indexeerbaar en mag in snippets verschijnen.
- De kerntekst staat in de HTML, ook zonder JavaScript.

**Als lezer-lens (apart gerapporteerd, door Martine)**

- Herkenning, belofte, bewijs, één duidelijke actie, B1-taal. Deze punten dienen de bezoeker en de conversie. Botst een punt met de scorecard, dan kiest de module een vorm die beide dient.

**Als hygiëne (gemeld, geen punten)**

- Geldige JSON-LD, sitemap, canonical, alt-teksten, llms.txt.

## Scorecardmodel

Het model staat als data in de code. Elk criterium heeft: punten, bewijskracht, bron, koppeling met het brein en een eigenaar.

| Dimensie | Punten | Bewijskracht | Voedt uit het brein |
|---|---|---|---|
| A. Aansluiting op de vraag | 30 | Sterk | Veelgestelde vragen, publieken |
| B. Concrete, controleerbare informatie | 20 | Sterk | Producten en aanbod |
| C. Citeerbare antwoorden | 15 | Middel | Positionering |
| D. Bewijs en bronnen | 10 | Middel | Cases, cijfers |
| E. Actualiteit | 5 | Sterk bij tijdgevoelige vragen | Key Moment roadmap |
| F. Entiteit en vertrouwen | 10 | Middel | Positionering, storytellers |
| G. Paginabasis | 10 | Richtlijn | Geen |

Regels:

- Elk criterium krijgt een oordeel: voldoet, deels, voldoet niet, of niet te beoordelen.
- "Niet te beoordelen" telt niet mee. De score wordt herberekend over de rest.
- Faalt een poortwachter, dan is de score hooguit 20 en krijgt de pagina de status "geblokkeerd".
- Prioriteit van een advies = verloren punten × gewicht van de bewijskracht (sterk 1,0, middel 0,7, richtlijn 0,5).
- Het model heeft een versienummer. Oude rapporten houden hun eigen versie.

## Koppeling met het Marketingbrein

**Lezen.** De module haalt het brein op via `get_marketing_brain`. Die geeft per bouwsteen de goedgekeurde kennis (`present`, met K-nummer) en de gaten (`missing`).

| Uit het brein | Gebruik in de module |
|---|---|
| Veelgestelde vragen | Promptset voor de meting. Toets per vraag of de pagina antwoord geeft. |
| Publieken | Formulering van de prompts. Toets of de pagina zegt voor wie het aanbod is. |
| Producten en aanbod | Toets of prijs, voorwaarden en specificaties uit het brein op de pagina staan. |
| Positionering | Toets op tegenstrijdigheden tussen pagina en brein. |
| Concurrenten | Vergelijking in de meting. |
| Tone of voice, verhaal | Stijl voor de herschreven tekst. |

**Omgaan met gaten.** Ontbreekt kennis, dan meldt de module dat en zet het criterium op "niet te beoordelen". `initialProfile` geldt als ongecontroleerde hint, nooit als feit.

**Schrijven.** De module schrijft niets rechtstreeks. De uitkomst gaat als voorstel naar een mens: het GEO-profiel (scorecard, promptset, nulmeting, open acties) en nieuwe kennis die de analyse opleverde. Pas na goedkeuring krijgt die kennis een K-nummer.

**Open punt.** Onder welke bouwsteen het GEO-profiel als module komt. Voorstel: Meten & Bijsturen.

## Rolverdeling

| Wie | Taak |
|---|---|
| Charlie | Brein ophalen, pagina's beoordelen, meting draaien, adviezen prioriteren |
| Martine | Tekst herschrijven volgens advies en tone of voice, lezer-lens |
| Brian | Verkeer en conversie uit AI-bronnen (GA4, Search Console) als effectmeting |
| Mens | Pagina's kiezen, adviezen goedkeuren, voorstel voor het brein goedkeuren |

De rollen van Charlie, Martine en Brian zijn aannames. Controleer ze tegen de rolbeschrijvingen in het platform.

## Fasering

**Fase 1. Methode (skill en bewijsbasis)**
- `references/bewijsbasis.md`: per criterium bron, jaar, bewijskracht.
- `references/scorecard.md` vervangt `geo-checklist.md`.
- `references/zichtbaarheidsmeting.md` en `references/pagina-optimalisatie.md`.
- `references/marketingbrein.md`: lees- en schrijfcontract.
- `SKILL.md` herschreven: drie werkwijzen, rolverdeling, geen verplichte tussenstops.
- Fouten herstellen: ClaudeBot, Princeton-cijfers, llms.txt, FAQ-claim.

**Fase 2. Kern in code**
- `lib/geo/scorecard/`: model als data, scorefunctie, tests.
- `lib/geo/robots.ts`: parser voor AI-bots, tests.
- `lib/geo/scrape.ts`: koppen behouden, JSON-LD-typen, canonical, datum, detectie van lege JavaScript-shell.
- Rubric-versie in opgeslagen resultaten, zodat oude rapporten kloppen.

**Fase 3. Zichtbaarheidsmeting**
- `lib/geo/visibility/`: promptset uit brein of chat, herhalingen, vermeldingspercentage, citaties per domein, concurrenten.
- Aanroepen met webzoekfunctie per engine. Uitkomst "geen zoekactie" telt als uitkomst.
- Draait buiten het kritieke pad van de gratis scan, vanwege kosten en looptijd.

**Fase 4. Marketing AI Team**
- Adapter voor het brein (lezen) en het voorstel (schrijven).
- Module als tool in de gateway, zodat Charlie en Martine hem aanroepen.
- Herhaalmeting per maand, met vergelijking tegen de nulmeting.

**Fase 5. App geo.nxtli.com**
- Rapport en chat tonen de nieuwe scorecard.
- Blok `GeoSocialProof` met verzonnen testimonials verwijderen of vervangen door echte.

## Risico's

- **Kosten van de meting.** 6 prompts × 4 engines × 8 herhalingen = 192 aanroepen per meting. Begrens per abonnement.
- **API's van engines wijken af van de consumentenapp.** De meting benadert wat een gebruiker ziet. Meld dat in het rapport.
- **Onderzoek veroudert snel.** Elke regel in de bewijsbasis krijgt een datum. Herzie per kwartaal.
- **Schijnprecisie.** Rapporteer vermeldingspercentages met het aantal runs erbij.
