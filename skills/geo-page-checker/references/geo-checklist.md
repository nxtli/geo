<!-- Gegenereerd uit lib/geo/knowledge/*.json. Niet met de hand wijzigen. -->

# Scorecard GEO (versie 2)

Beoordeel elk criterium met **voldoet**, **deels**, **niet** of **niet te beoordelen**. Gok niet: wat je niet kunt zien, is niet te beoordelen en telt niet mee. Geef bij elk oordeel een letterlijk citaat van de pagina.

## Poortwachters (geen punten)

Faalt er één, dan is de score hooguit 20 en begint het advies hier.

- **P1. AI-zoekbots mogen de pagina ophalen.** Klaar als: robots.txt bevat geen Disallow voor deze pagina bij OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot en Bingbot. (E-BOTS)
- **P2. Pagina is indexeerbaar en mag in snippets.** Klaar als: Geen noindex, nosnippet of max-snippet:0 in de meta-robots-tag of de X-Robots-Tag-header. (E-INDEX)
- **P3. Kerntekst staat in de HTML.** Klaar als: De koppen en de kerntekst staan in de HTML die de server teruggeeft, zonder JavaScript. (E-RENDER)

## Aansluiting op de vraag (30 punten)

| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |
|---|---|---|---|---|---|---|
| A1 | De pagina beantwoordt de opgegeven klantvragen | 8 | E-RELEVANCE (sterk), E-BUYER (zwak) | Martine (tekst) | Geef per onbeantwoorde vraag een antwoord van twee tot vier zinnen. De eerste zin beantwoordt de vraag volledig. | Elke opgegeven klantvraag heeft op de pagina een antwoord dat los leesbaar is. |
| A2 | De begrippen uit de vraag staan vroeg op de pagina | 8 | E-RELEVANCE (sterk), E-DEPTH (middel) | Martine (tekst) | Zet het onderwerp en het aanbod in de woorden van de klant in de h1 en de eerste alinea. | De h1 en de eerste 100 woorden noemen het aanbod en het onderwerp van de belangrijkste klantvraag. |
| A3 | De pagina zegt voor wie het aanbod is | 6 | E-RELEVANCE (sterk), E-BUYER (zwak) | Martine (tekst) | Noem het publiek en de situatie in de eerste alinea, zo concreet als de eigen kennis toelaat. | De eerste alinea noemt het publiek en de situatie waarin het aanbod past. |
| A4 | De pagina behandelt de keuzecriteria van de koper | 4 | E-BUYER (zwak), E-DEPTH (middel) | Martine (tekst) | Behandel per keuzecriterium wat het aanbod biedt, met een feit of een getal. | Elk bekend keuzecriterium komt op de pagina terug met een concreet antwoord. |
| A5 | Taal en regio passen bij de vraag | 4 | E-RELEVANCE (sterk) | Martine (tekst) | Schrijf in de taal van het publiek en noem het werkgebied. | Taal, valuta en werkgebied passen bij het publiek. |

## Concrete, controleerbare informatie (20 punten)

| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |
|---|---|---|---|---|---|---|
| B1 | De prijs staat expliciet op de pagina | 7 | E-PRICE (sterk) | Marketeer | Zet een prijs, een vanaf-prijs of een prijsvoorbeeld op de pagina, met wat inbegrepen is. Wil je geen prijs noemen, leg dan uit waar de prijs van afhangt. | De pagina noemt een bedrag of legt in één alinea uit waar de prijs van afhangt. |
| B2 | Specificaties en voorwaarden zijn concreet | 6 | E-PRICE (sterk) | Martine (tekst) | Vervang bijvoeglijke naamwoorden door getallen: duur, aantallen, levertijd, wat inbegrepen is. | Duur, omvang en inbegrepen onderdelen staan er als feitelijke zinnen met getallen. |
| B3 | Het onderwerp is diepgaand behandeld | 5 | E-DEPTH (middel) | Martine (tekst) | Werk het proces, de werking of de aanpak uit in stappen. | Een lezer zonder voorkennis begrijpt wat er gebeurt na de eerste stap. |
| B4 | De pagina vergelijkt met alternatieven | 2 | E-DEPTH (middel) | Martine (tekst) | Voeg een korte, eerlijke vergelijking toe met het meest voor de hand liggende alternatief. | De pagina noemt minstens één alternatief en het verschil. |

## Citeerbare antwoorden (15 punten)

| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |
|---|---|---|---|---|---|---|
| C1 | Het antwoord staat eerst en is los leesbaar | 6 | E-RELEVANCE (sterk), E-TARGETED (middel) | Martine (tekst) | Herschrijf openingszinnen die terugverwijzen (Dat, Daarom, Hier) tot zinnen die zonder de vorige alinea kloppen. | De eerste zin onder elke kop klopt zonder de rest van de pagina. |
| C2 | De taal is stellig en onderbouwd | 4 | E-CONFIDENT (middel) | Martine (tekst) | Vervang voorbehouden (kan, mogelijk, vaak) door een feit met een getal of een bron. | Kernclaims bevatten geen voorbehoud zonder onderbouwing. |
| C3 | De pagina spreekt zichzelf niet tegen | 5 | E-CONFIDENT (middel) | Marketeer | Maak prijzen, namen en cijfers op de hele pagina gelijk. | Elk feit komt op de pagina maar in één versie voor. |

## Bewijs en bronnen (10 punten)

| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |
|---|---|---|---|---|---|---|
| D1 | Cijfers hebben een bron | 4 | E-EVIDENCE (middel) | Martine (tekst) | Zet bij elk cijfer de bron en het jaar. | Elk cijfer heeft een bron of een toelichting hoe het gemeten is. |
| D2 | Er staat een citaat van een klant of expert met naam | 3 | E-EVIDENCE (middel) | Marketeer | Plaats een echte quote met naam, functie en organisatie. | Minstens één quote met naam, functie en organisatie. |
| D3 | Claims zijn controleerbaar | 3 | E-EVIDENCE (middel), E-CONFIDENT (middel) | Martine (tekst) | Onderbouw superlatieven met een bron of schrap ze. | Geen claim als beste of meest gekozen zonder bron. |

## Actualiteit (5 punten)

| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |
|---|---|---|---|---|---|---|
| E1 | De pagina toont een datum van laatste wijziging met jaartal | 3 | E-RECENCY (sterk) | Webbouwer | Toon op de pagina de datum van de laatste wijziging, met dag, maand en jaar. | De datum staat zichtbaar op de pagina en klopt met de laatste inhoudelijke wijziging. |
| E2 | De gegevens zijn actueel | 2 | E-RECENCY (sterk) | Marketeer | Werk prijzen, jaartallen en regelingen bij. | Geen verlopen data, prijzen of regelingen. |

## Entiteit en vertrouwen (10 punten)

| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |
|---|---|---|---|---|---|---|
| F1 | Duidelijk wie het aanbiedt, wat en waar | 4 | E-ENTITY (zwak), E-RELEVANCE (sterk) | Martine (tekst) | Noem de organisatie, het aanbod en de vestigingsplaats of het werkgebied in één zin. | Eén zin op de pagina zegt wie wat aanbiedt en waar. |
| F2 | Er is een auteur of expert met naam en functie | 3 | E-ENTITY (zwak) | Marketeer | Toon wie verantwoordelijk is voor de inhoud, met naam en functie. | Naam en functie van een verantwoordelijke staan op de pagina. |
| F3 | Het merk wordt buiten de eigen site genoemd | 3 | E-ENTITY (zwak) | Marketeer | Lever feiten, prijzen en voorbeelden aan bij vakmedia en vergelijkingssites in jouw markt. | Minstens drie onafhankelijke sites noemen het merk met juiste feiten. |

## Paginabasis (10 punten)

| Id | Criterium | Punten | Bewijs | Wie | Advies | Klaar als |
|---|---|---|---|---|---|---|
| G1 | Eén h1 en logische koppen | 3 | E-PAGEBASE (richtlijn) | Webbouwer | Gebruik één h1 en daaronder h2 en h3 in echte heading-tags. | Precies één h1 en geen overgeslagen kopniveaus. |
| G2 | Titel en beschrijving zeggen wat de pagina biedt | 2 | E-PAGEBASE (richtlijn) | Martine (tekst) | Noem in de title en de meta description het aanbod en het publiek. | Title en description noemen het aanbod en voor wie het is. |
| G3 | Interne links hebben een beschrijvende ankertekst | 2 | E-PAGEBASE (richtlijn) | Martine (tekst) | Vervang lees meer en klik hier door een tekst die het doel van de link beschrijft. | Geen link met alleen lees meer, klik hier of meer info. |
| G4 | Pagina-ervaring: snel, mobiel, toegankelijk | 3 | E-PAGEBASE (richtlijn) | Webbouwer | Comprimeer afbeeldingen, vul alt-teksten in en meet de Core Web Vitals. | LCP onder 2,5 seconde op mobiel en een alt-tekst bij elke inhoudelijke afbeelding. |

## Hygiëne (melden, geen punten)

- **Structured data (JSON-LD)**: Het toevoegen van JSON-LD gaf geen meetbare stijging van AI-citaties: +2,4% in AI Mode, +2,2% in ChatGPT, -4,6% in AI Overviews. Google vraagt geen speciale schema voor AI-functies.
- **llms.txt**: llms.txt heeft geen aantoonbaar effect op AI-citaties. Google noemt zulke bestanden onnodig.
- **Canonical**: Semantische HTML, goede pagina-ervaring en weinig dubbele inhoud blijven de basis. Google behandelt optimalisatie voor AI-functies als onderdeel van SEO.

## Rekenregels

- Voldoet = alle punten, deels = de helft, niet = nul.
- Niet te beoordelen telt niet mee. De score wordt berekend over de rest.
- Prioriteit van een advies = verloren punten × bewijskracht (feit en sterk 1,0, middel 0,7, richtlijn 0,5, zwak 0,4).
- De score meet de geschiktheid van de pagina. Hij zegt niet hoe vaak een AI-tool het merk noemt of aanbeveelt.

## Vorm van een advies

Elk advies heeft zeven onderdelen:

1. **Actie**: de handeling, specifiek voor deze pagina.
2. **Waarom**: wat je zag.
3. **Waar**: de kop of alinea.
4. **Nu**: de huidige tekst, letterlijk.
5. **Voorstel**: plak-klare tekst. Ontbrekende feiten als `[invullen: ...]`. Verzin geen feiten.
6. **Wie**: de eigenaar uit de tabel.
7. **Klaar als**: de toets uit de tabel.
