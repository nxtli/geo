# GEO-checklist

De criteria waarop je een pagina beoordeelt. Per categorie staan de checkpunten en waar je
op let. Gebruik dit om te scoren én om de tips te onderbouwen. Tel niet mechanisch af -
weeg of het gebrek een AI-model echt zou hinderen bij het begrijpen of citeren van de pagina.

## 1. Vindbaarheid & techniek (20 punten)

Als een AI de pagina niet mag of kan lezen, is al het andere zinloos. Check eerst dit. De
volledige technische meting (AI-bot toegang, rendering, snelheid/Core Web Vitals) staat in
`technische-checklist.md` en rapporteer je in een apart blok; gebruik die bevindingen om deze
categorie te onderbouwen.

- **Indexeerbaarheid.** Staat er `noindex` of `nofollow` in de meta robots-tag of in de
  HTTP-header? Dat blokkeert zoekmachines én veel AI-crawlers. Dit is een harde blokker -
  trek hier fors af en zet het bovenaan de tips.
- **Schema aanwezig.** Heeft de pagina al JSON-LD structured data? Schema helpt een model de
  pagina ondubbelzinnig te interpreteren (dit is een cursus, dit is de prijs, dit is de
  aanbieder). Afwezigheid is een gemiste kans, geen blokker.
  Let op: kun je schema niet inzien (geen browser, fetch knipt scripts weg), markeer het dan
  als "niet te verifiëren" en trek er GEEN punten voor af - zie punt 4 van de technische
  checklist. Onbekend is niet hetzelfde als afwezig.
- **Crawlbaarheid van content.** Is de kerncontent in de HTML aanwezig, of pas na het
  uitvoeren van JavaScript? Content die alleen client-side verschijnt, zien veel crawlers niet.
- **Semantische HTML.** Echte koppen (h1/h2/h3) in logische hiërarchie, niet alles als
  opgemaakte div. Modellen leunen op koppenstructuur om de pagina te begrijpen.
- **Bonus (sitebreed, buiten de pagina-score):** bestaat er een `llms.txt`, een sitemap, en
  zijn AI-crawlers toegestaan in `robots.txt`?

## 2. Extraheerbare antwoorden (25 punten)

Het zwaarst wegende onderdeel. AI citeert zinnen die ook los van hun context kloppen.

- **Directe samenvatting.** Staat er ergens één alinea die zelfstandig uitlegt wat dit is,
  voor wie en wat het kost/oplevert? Dit blok wordt vaak letterlijk overgenomen.
- **Zelfstandige zinnen.** Beginnen alinea's met een complete bewering, of met "Dat", "Hier",
  "Daarom" die terugverwijst naar iets eerders? Verwijzende openingen zijn niet citeerbaar.
- **Antwoord-eerst.** Komt het antwoord vóór de uitleg, of moet de lezer eerst een verhaal
  door? AI pakt graag de eerste zin onder een kop.
- **Definities en kernbegrippen.** Worden belangrijke termen expliciet en kort uitgelegd?
- **Niet verstopt in sfeer.** Zit de feitelijke kern verstopt in wervende of metaforische
  taal? Mooi voor de mens, onbruikbaar voor het model. Let op de balans met conversie:
  adviseer een vorm die beide dient.
- **Chunkbaarheid (KHK - korter, helderder, in chunks).** Staan de kernpunten in zelfstandige
  blokken van ongeveer 40-120 woorden? Modellen knippen content in chunks; een alinea die in
  een hap een vraag volledig beantwoordt is makkelijker te citeren dan een lange, vervlochten
  lap tekst. Te lange of versnipperde alinea's = aandachtspunt.
- **Semantic triplets (onderwerp - relatie - feit).** Bevatten zinnen een expliciete drieslag,
  bijvoorbeeld "[De leergang] (onderwerp) duurt (relatie) zes weken (feit)"? Zulke complete,
  feitelijke zinnen zijn voor een model eenduidig te interpreteren en te citeren; vooral sterk
  in FAQ-antwoorden. Vage of onvolledige beweringen ("dat regelen wij") missen die structuur.

## 3. Vraaggerichte structuur (20 punten)

AI koppelt content aan de vraag van de gebruiker. Hoe dichter je koppen bij echte vragen
staan, hoe makkelijker dat matchen gaat.

- **FAQ aanwezig.** Is er een vraag-en-antwoordsectie? Dit is het sterkste GEO-format dat er
  is. Ontbreekt die, dan is dat bijna altijd de tip met de hoogste impact.
- **Vraaggerichte koppen.** Matchen koppen met hoe mensen zoeken ("Wat kost X?", "Voor wie is
  X?") of zijn ze puur wervend ("Dit verandert alles")? Wervend mag blijven als de FAQ het
  vraagwerk doet - adviseer dan eventueel een neutrale subkop eronder.
- **Scanbaarheid.** Korte alinea's, duidelijke tussenkoppen, eventueel lijstjes bij
  opsombare info (stappen, wat-zit-erin). Helpt zowel mens als model de structuur te pakken.
- **Logische opbouw.** Volgt de pagina een begrijpelijke lijn (wat → voor wie → hoe → bewijs
- **Interne links & topical authority.** Linkt de pagina naar gerelateerde, ondersteunende
  content (andere diensten, uitleg, cases)? Een pagina die deel is van een samenhangend cluster
  overtuigt een model meer van je autoriteit op het onderwerp dan een losse, geisoleerde pagina.
  Let op echte, beschrijvende ankerteksten (niet "lees meer").
  → prijs → actie)?
- **Taalniveau (B1).** Is de tekst op B1-niveau geschreven: actief, menselijk, korte zinnen,
  zonder vakjargon of wollige formuleringen? Eenvoudige, eenduidige taal is voor zowel de lezer
  als het model makkelijker te verwerken en te citeren. Veel jargon of lijdende vorm = aandachtspunt.
- **Eén taak & duidelijke CTA.** Heeft de pagina één heldere hoofdtaak met een ondubbelzinnige
  call-to-action (aanmelden, aanvragen, bellen)? Te veel concurrerende acties maken voor zowel de
  bezoeker als het model onduidelijk wat de pagina wil - dat verzwakt de conversie en het signaal.

## 4. Concrete feiten (15 punten)

Modellen vertrouwen en citeren pagina's met harde, specifieke gegevens.

- **Prijs.** Staat de prijs er expliciet (incl./excl. btw, bijkomende kosten)? Verstopte of
  ontbrekende prijzen zijn een gemiste citatiekans.
- **Tijd, plaats, duur.** Datum, locatie, duur, tijdsbeslag, groepsgrootte - alles wat een
  concrete vraag beantwoordt.
- **Specificaties.** Wat zit erin, wat krijg je, wat is inbegrepen. Concreet, niet vaag.
- **Getallen boven bijvoeglijke naamwoorden.** "Max. 8 deelnemers" is sterker dan "kleine
  groep"; "4.8 op 234 reviews" sterker dan "veel tevreden klanten".

## 5. Entiteit & vertrouwen (10 punten)

AI bouwt een beeld van wie achter de content zit. Duidelijke entiteiten worden eerder
vertrouwd en herkend.

- **Wie/wat/waar.** Is duidelijk welke organisatie dit aanbiedt, waar ze zit, en wie
  eventueel de trainer/auteur/expert is?
- **Expertise-signalen.** Wordt onderbouwd waarom deze aanbieder geloofwaardig is (ervaring,
- **Auteur & E-E-A-T.** Staat er een herkenbare auteur of verantwoordelijke met een korte bio
  en relevante credentials (ervaring, functie, certificering)? Een byline, een gevulde
  over-pagina en idealiter `Person`-schema laten een model zien dat er een geloofwaardige
  menselijke bron achter de content zit. Anonieme content wordt minder vertrouwd en geciteerd.
  klanten, certificering)?
- **Koppeling aan bekende entiteiten.** Worden namen van mensen, organisaties of locaties
  genoemd die een model kan herkennen en koppelen?
- **Consistentie.** Geen tegenstrijdige of dubbele/foutieve labels (bijvoorbeeld twee
  verschillende dingen met dezelfde kop) - dat ondermijnt het vertrouwen.
- **Unieke invalshoek.** Heeft de pagina een eigen visie, een herkenbaar eigen model, of een
  onderscheidende term/aanpak die alleen deze aanbieder gebruikt? Originele content (een eigen
  raamwerk, een eigen benaming, een uitgesproken standpunt) wordt door modellen eerder als bron
  herkend en geciteerd dan inwisselbare, generieke tekst die overal terugkomt.

## 6. Bewijs, bronnen & actualiteit (10 punten)

Een van de sterkst onderbouwde GEO-hefbomen. Het Princeton GEO-onderzoek (KDD 2024) liet zien
dat het toevoegen van statistieken (+41% zichtbaarheid), expertcitaten (+28%) en bronvermelding
(tot +115% voor lager-rankende content) de kans om geciteerd te worden meetbaar verhoogt. Weeg
deze punten daarom zwaar, ook al telt de categorie formeel 10 punten.

- **Statistieken & cijfers.** Staan er concrete, controleerbare getallen in de tekst (percentages,
  aantallen, onderzoeksuitkomsten)? Modellen citeren graag harde cijfers - mits onderbouwd.
- **Citaten van experts.** Worden uitspraken van een expert, klant of bron letterlijk geciteerd
  (met naam en functie)? Een citaat is een zelfstandig, citeerbaar tekstblok.
- **Bronvermelding.** Worden claims gekoppeld aan een herkenbare bron (onderzoek, organisatie,
  publicatie), idealiter met een link? Dit verhoogt vertrouwen en citeerbaarheid sterk.

- **Reviews als tekst.** Staan er volledige quotes (met naam, functie, organisatie), of alleen
  een kaal cijfer? Tekst kan geciteerd worden, een los cijfer nauwelijks.
- **Cijfers met bron.** Worden claims onderbouwd met getallen, en idealiter een bron?
- **Datums met jaartal.** "Dinsdag 9 juni" zonder jaar leest een model mogelijk als verlopen.
  Zet het jaartal erbij en geef aan of iets herhaaldelijk plaatsvindt.
- **Versheidssignalen.** Een zichtbare publicatie- of update-datum helpt het model inschatten
  of de info actueel is.
- **Externe bevestiging (off-page, buiten de pagina-score).** Wordt het merk ook buiten de eigen
  site genoemd: citaties, vermeldingen, reviews op platforms, gastbijdragen, vakbronnen? Dit is
  een sterk GEO-signaal (sociale autoriteit), maar het valt buiten een on-page check. Rapporteer
  het als aandachtspunt/signaal, tel het niet mee in de pagina-score, en verwijs voor structurele
  meting naar de GEO-meter/monitoring.

## Lezer-lens (CRO) - naast de GEO-score, niet meegeteld

GEO maakt een pagina citeerbaar voor het model; deze lens checkt of de pagina ook de mens
overtuigt (de lezerskolom uit Martin's criteria). Niet meegeteld in de 100 punten, maar wel
apart rapporteren. Botst een CRO-punt met een GEO-punt, adviseer dan een vorm die beide dient.

- **Herkenning.** Ziet de lezer in de eerste regels direct dat dit over hem en zijn situatie gaat?
- **Urgentie.** Wordt een concrete behoefte of probleem benoemd waar de lezer iets mee moet?
- **Heldere belofte.** Weet de lezer binnen een paar seconden wat hij krijgt of wat het oplevert?
- **Bewijs.** Maken reviews, cases of cijfers de belofte geloofwaardig? (overlapt met categorie 6)
- **Actie.** Is de volgende stap duidelijk en laagdrempelig? (overlapt met "Een taak & CTA")
- **Overtuigingsprincipes.** Worden sociale bewijskracht, autoriteit of schaarste ingezet,
  zonder te overdrijven?
- **Scanbaarheid & eenvoud.** Is de tekst kort, actief en makkelijk te verwerken? (overlapt met B1)
