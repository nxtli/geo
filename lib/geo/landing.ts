/**
 * Alle teksten van de landingspagina op één plek.
 *
 * De pagina volgt de eigen scorecard van de scan: elke sectie beantwoordt één
 * lezersvraag, het antwoord staat eerst, cijfers hebben een bron en er staat
 * een datum op.
 *
 * De aantallen hieronder (criteria, onderdelen, punten) staan er letterlijk in,
 * zodat de kennisbank niet mee hoeft naar de browser. De test
 * landing.test.ts bewaakt dat ze gelijk blijven aan de scorecard.
 *
 * Pas je een feit aan (duur, aantal vragen, AI-tools), pas dan ook
 * LANDING_UPDATED aan. Verzin geen klantcitaten of aantallen.
 */
export const LANDING_UPDATED = { iso: "2026-11-12", label: "12 november 2026" };

export const CRITERIA_COUNT = 27;
export const DIMENSION_COUNT = 7;

/** Punten per onderdeel van de scorecard. */
export const DIMENSION_POINTS: Record<string, number> = {
  Paginabasis: 8,
  Actualiteit: 5,
  "Afzender en vertrouwen": 10,
  "Aansluiting op de vraag": 26,
  "Eigen, concrete informatie": 28,
  "Citeerbare antwoorden": 13,
  "Bewijs en bronnen": 10,
};

const points = (label: string) => DIMENSION_POINTS[label] ?? 0;

/**
 * De pagina toont het gewicht van een onderdeel in drie gradaties. De exacte
 * punten staan in het rapport. Een getal op twee cijfers suggereert hier meer
 * zekerheid dan het onderzoek biedt.
 */
export function weightLabel(pts: number): "Weegt zwaar" | "Weegt gemiddeld" | "Weegt licht" {
  if (pts >= 15) return "Weegt zwaar";
  if (pts >= 10) return "Weegt gemiddeld";
  return "Weegt licht";
}

const count = ["nul", "één", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien"];
const word = (n: number) => count[n] ?? String(n);

export const HERO = {
  title: "Gratis GEO-scan: hoe geschikt is jouw pagina voor",
  titleAccent: "AI-zoekmachines?",
  lede: "Steeds meer mensen stellen hun vragen aan ChatGPT, Claude of Gemini. Zo'n AI-tool geeft één antwoord en vermeldt daarbij een aantal bronnen. Met de GEO-scan zie je of jouw pagina geschikt is om als bron getoond te worden, en wat beter kan.",
  bullets: [
    `Een score tot 100, opgebouwd uit ${CRITERIA_COUNT} criteria`,
    "Bij elk advies zie je wat er nu staat en krijg je een tekstvoorstel",
    "Je leest wat ChatGPT, Claude, Gemini, Perplexity en Grok over je merk zeggen",
  ],
  cta: "Scan mijn pagina gratis",
  secondary: "Bekijk wat je krijgt",
  trust: "Gratis. Ongeveer vijf minuten. Je rapport staat direct in de chat en in je mail.",
};

export const SOURCES = {
  tian: {
    label: "Tian e.a. (Virginia Tech en Zhejiang University), Diagnosing and Repairing Citation Failures in GEO, voorpublicatie maart 2026",
    url: "https://arxiv.org/abs/2603.09296",
  },
  ahrefs: { label: "Ahrefs, We Tracked 1,885 Pages Adding Schema, mei 2026", url: "https://ahrefs.com/blog/schema-ai-citations/" },
  seranking: { label: "SE Ranking, onderzoek naar llms.txt onder 300.000 domeinen", url: "https://seranking.com/blog/llms-txt/" },
  survey: { label: "Martinez, A Critical Survey of Generative Engine Optimization, voorpublicatie juli 2026", url: "https://arxiv.org/abs/2607.14035" },
  chen: {
    label: "Chen e.a. (University of Toronto), Generative Engine Optimization: How to Dominate AI Search, voorpublicatie september 2025",
    url: "https://arxiv.org/abs/2509.08919",
  },
  kumar: {
    label: "Kumar (Ranqo), Measuring Brand Visibility Across AI Search Engines, voorpublicatie juni 2026",
    url: "https://arxiv.org/abs/2606.20065",
  },
};

export const PROBLEM = {
  eyebrow: "Waarom dit telt",
  title: "Waarom kiest een AI-tool de ene pagina als bron en de andere niet?",
  intro:
    "Een AI-tool kiest een pagina als bron als die pagina de vraag van de gebruiker concreet beantwoordt. Een hoge positie in Google is daarvoor niet genoeg.",
  cards: [
    {
      title: "In Google sta je in een lijst",
      body: "De zoeker ziet tien resultaten en kiest zelf. Sta je op de eerste pagina, dan maak je kans op de klik.",
    },
    {
      title: "Een AI-tool geeft één antwoord",
      body: "De tool leest pagina's, schrijft zelf het antwoord en noemt een paar bronnen. Staat jouw pagina daar niet bij, dan ziet de vrager je niet.",
    },
  ],
  evidence:
    "Onderzoekers bekeken 949 gevallen waarin een AI-systeem een pagina niet als bron koos en een andere pagina wel. In 62% van die gevallen paste de pagina niet goed bij de vraag. In 10% lukte het niet om de pagina goed op te halen of te lezen. Ze maten dit in een testopstelling, niet bij ChatGPT of Gemini zelf.",
  source: SOURCES.tian,
};

const feature = (label: string, body: string) => ({ label, body, points: points(label), weight: weightLabel(points(label)) });

export const FEATURES = {
  eyebrow: "De criteria",
  title: "Wat beoordeelt de GEO-scan?",
  intro: `De scan beoordeelt één pagina op ${CRITERIA_COUNT} criteria in ${word(DIMENSION_COUNT)} onderdelen. Die volgen twee stappen. Eerst moet een AI-tool je pagina vinden. Daarna kiest hij welke pagina's hij als bron gebruikt.`,
  steps: [
    {
      step: 1,
      title: "Zorg dat een AI-tool je pagina vindt",
      intro: "Een AI-tool gebruikt alleen pagina's die hij vindt en kan lezen.",
      items: [
        feature("Afzender en vertrouwen", "Is duidelijk welk bedrijf het aanbiedt? Staat er een deskundige met naam en functie?"),
        feature("Paginabasis", "Heeft de pagina één hoofdkop, logische tussenkoppen, een duidelijke titel en links met een heldere tekst?"),
        feature("Actualiteit", "Toont de pagina een datum met jaartal? Zijn de gegevens actueel?"),
      ],
    },
    {
      step: 2,
      title: "Zorg dat je pagina als bron wordt gekozen en gebruikt",
      intro: "Hier zit het zwaartepunt van de score.",
      items: [
        feature("Eigen, concrete informatie", "Staat er informatie die alleen jij hebt? Denk aan je prijs, je voorwaarden, eigen cijfers, ervaring uit de praktijk en je eigen methode."),
        feature("Aansluiting op de vraag", "Beantwoordt de pagina de vragen van jouw klant? Staat erbij voor wie het aanbod is?"),
        feature("Citeerbare antwoorden", "Staat het antwoord vooraan? Begrijp je het ook zonder de rest van de pagina te lezen?"),
        feature("Bewijs en bronnen", "Hebben cijfers een bron? Staat er een citaat van een klant of expert met naam?"),
      ],
    },
  ],
  gates:
    "Vooraf controleert de scan drie dingen. Mogen de zoekrobots van AI-tools je pagina ophalen? Mag de pagina in zoekresultaten staan? Staat de tekst in de pagina zelf, en niet alleen in een script? Gaat er één mis, dan blijft je score laag, hoe goed de tekst ook is.",
  weighting:
    "Het gewicht volgt het onderzoek. Prijs, specificaties en aansluiting op de vraag zijn in experimenten getest. Dat eigen inhoud zwaar telt, is ons standpunt. Google noemt unieke inhoud de belangrijkste factor, maar een experiment daarover bestaat nog niet.",
  weightingSource: {
    label: "Google, Optimizing your website for generative AI features on Google Search",
    url: "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
  },
};

export const LIMITS = {
  eyebrow: "Eerlijk over de grenzen",
  title: "Wat meet de GEO-scan niet?",
  intro:
    "GEO is een jong vakgebied. Veel is nog niet bewezen. De scan beoordeelt daarom alleen waar onderzoek voor bestaat. Je score is een indicatie en een richtlijn, geen garantie. De scan meet niet hoe vaak een AI-tool je merk noemt of aanbeveelt.",
  items: [
    {
      title: "Eén AI-antwoord zegt weinig",
      body: "AI-antwoorden verschillen per keer en per tool. Voor een betrouwbaar beeld stel je dezelfde vraag meerdere keren. Een overzicht van 45 studies noemt zeven tot acht keer als startpunt.",
      sources: [SOURCES.survey],
    },
    {
      title: "Gevonden worden komt vóór gekozen worden",
      body: "De scan beoordeelt of je pagina geschikt is als bron. Of een AI-tool je pagina vindt, hangt ook af van je positie in gewone zoekresultaten en je bekendheid. Hetzelfde overzicht vond geen techniek die de vindbaarheid op alle AI-tools blijvend verbetert.",
      sources: [SOURCES.survey],
    },
    {
      title: "Genoemd worden is nog geen aanbeveling",
      body: "Je wilt dat een AI-tool je aanbeveelt. Dat hangt ook af van je bekendheid en van wat anderen over je schrijven. In ruim 100.000 AI-antwoorden stonden wereldmerken in 73% van de relevante antwoorden en kleine merken in 11%. Van alle bronvermeldingen ging 2,9% naar de eigen site van het merk. Een andere studie zag hetzelfde patroon: AI-tools kiezen vaak bronnen van derden. Beide studies komen van partijen die zelf GEO-diensten verkopen. Een scan van één pagina ziet dit niet.",
      sources: [SOURCES.chen, SOURCES.kumar],
    },
    {
      title: "Extra code voor zoekmachines geeft geen punten",
      body: "Ahrefs volgde 1.885 pagina's die schema-code kregen. Dat is code die een zoekmachine vertelt wat er op een pagina staat. De pagina's werden daarna niet meetbaar vaker als bron gekozen. Voor een llms.txt-bestand, een wegwijzer voor AI-tools, vond SE Ranking onder bijna 300.000 websites ook geen verband.",
      sources: [SOURCES.ahrefs, SOURCES.seranking],
    },
  ],
  closing:
    "Wat in onderzoek wel werkte, is een gerichte verbetering. De beste aanpak in de studie van Tian e.a. wijzigde ongeveer 5% van de tekst. Daarom krijg je bij elk advies één concrete wijziging en geen herschreven pagina. Verschijnt er nieuw, betrouwbaar onderzoek, dan passen we de scan aan.",
  closingSource: SOURCES.tian,
};

export const HOW = {
  eyebrow: "Hoe het werkt",
  title: "Hoe werkt de GEO-scan?",
  intro:
    "Je beantwoordt negen korte vragen in de chat. Daarna voert Charlie de scan uit. De scan zelf duurt één tot twee minuten.",
  steps: [
    {
      n: "01",
      title: "Open de chat",
      body: "Charlie vraagt je naam, je e-mailadres en de pagina die je wilt laten scannen.",
    },
    {
      n: "02",
      title: "Vertel wat je aanbiedt en aan wie",
      body: "Je noemt je aanbod, je doelgroep en de vragen waarop je gevonden wilt worden. Weet je het niet, dan doet Charlie suggesties.",
    },
    {
      n: "03",
      title: "Charlie beoordeelt je pagina",
      body: "De scan haalt je pagina op, controleert de techniek en beoordeelt de tekst op elk criterium.",
    },
    {
      n: "04",
      title: "Je krijgt je rapport",
      body: "Je ziet de score direct in de chat. Het volledige rapport staat op een eigen link en in je mail.",
    },
  ],
};

export const REPORT = {
  eyebrow: "Het rapport",
  title: "Wat staat er in het rapport?",
  intro:
    "Je krijgt een score tot 100, de opbouw per onderdeel en de adviezen in twee stappen. Elk advies laat zien wat er nu staat en geeft een tekstvoorstel dat je direct overneemt.",
  exampleNote: "Voorbeeld met verzonnen gegevens. Jouw rapport gaat over jouw pagina.",
  example: {
    domain: "jouwbedrijf.nl/dienst",
    score: 52,
    bars: [
      { label: "Aansluiting op de vraag", got: 15, max: points("Aansluiting op de vraag") },
      { label: "Eigen, concrete informatie", got: 9, max: points("Eigen, concrete informatie") },
      { label: "Afzender en vertrouwen", got: 10, max: points("Afzender en vertrouwen") },
    ],
    action: {
      title: "Zet onder de kop 'Tarieven' het bedrag per maand",
      chips: ["4,5 punten", "Marketeer", "Inspanning: laag"],
      now: "Vraag een offerte aan voor een prijs op maat.",
      proposal: "Het pakket kost [invullen: bedrag] per maand, exclusief btw. Je zegt per maand op.",
      done: "De pagina noemt een bedrag of een prijsopbouw.",
    },
  },
  includes: [
    "De score en de opbouw per onderdeel",
    "De adviezen in twee stappen: eerst gevonden worden, dan als bron gekozen worden",
    "Bij elk advies de huidige tekst en een voorstel",
    "De antwoorden van vijf AI-tools op de vraag wat zij over je merk weten",
  ],
};

export const FINAL_CTA = {
  title: "Zie in vijf minuten waar je pagina punten laat liggen",
  body: `Charlie beoordeelt je pagina op ${CRITERIA_COUNT} criteria en schrijft bij elk advies een voorstel. De scan is gratis en beoordeelt één pagina.`,
  more: "Wil je meer pagina's laten scannen of je site laten herschrijven?",
  waitlist: { label: "Meld je aan voor de wachtlijst", url: "https://marketingaiteam.com/#aanmelden" },
  cta: "Scan mijn pagina gratis",
  trust: "Geen technische kennis nodig. Je rapport staat direct in de chat en in je mail.",
};

export function faqs(brandName: string): Array<{ q: string; a: string }> {
  return [
    {
      q: "Wat is GEO?",
      a: "GEO staat voor Generative Engine Optimization. Je maakt een pagina geschikt om door AI-zoekmachines gevonden, begrepen, als bron vermeld en aanbevolen te worden. Voorbeelden van AI-zoekmachines zijn ChatGPT, Claude, Gemini, Perplexity en de AI-overzichten van Google.",
    },
    {
      q: "Wat kost de GEO-scan?",
      a: `De GEO-scan is gratis. Je laat één pagina beoordelen per e-mailadres. Wil je meer pagina's laten scannen of je site laten herschrijven, meld je dan aan voor de wachtlijst van ${brandName} of vraag een demo aan.`,
    },
    {
      q: "Hoe lang duurt de scan?",
      a: "Reken op ongeveer vijf minuten. De negen vragen in de chat kosten twee tot drie minuten. De scan zelf duurt één tot twee minuten.",
    },
    {
      q: "Welke pagina laat ik scannen?",
      a: "Kies de pagina waarmee je gevonden wilt worden. Vaak is dat een product- of dienstpagina en niet je homepage. De scan beoordeelt één pagina per keer.",
    },
    {
      q: "Welke AI-tools neemt de scan mee?",
      a: "De scan vraagt aan ChatGPT, Claude, Gemini, Perplexity en Grok wat zij over je merk weten. Je leest hun antwoorden in het rapport. De paginascore zelf geldt voor alle AI-zoekmachines.",
    },
    {
      q: "Is een hoge score een garantie dat AI mij aanbeveelt?",
      a: "Nee. De score is een indicatie en een richtlijn, geen garantie. De score zegt hoe geschikt je pagina is als bron, volgens het onderzoek van nu. Of een AI-tool je aanbeveelt, hangt ook af van de vraag, de concurrentie, je bekendheid en wat anderen over je schrijven.",
    },
    {
      q: "Wat gebeurt er met mijn gegevens?",
      a: "NXTLI B.V. gebruikt je gegevens om de scan uit te voeren en je het rapport te sturen. Je gegevens komen in het klantsysteem van NXTLI. Je rapport staat op een eigen link die alleen naar jouw e-mailadres gaat.",
    },
  ];
}

export const FAQ_HEADING = { eyebrow: "Veelgestelde vragen", title: "Veelgestelde vragen over de GEO-scan" };

export const FOOTER = {
  privacy: "NXTLI B.V. gebruikt je gegevens om je scan uit te voeren en je rapport te sturen.",
  updated: `Laatst bijgewerkt: ${LANDING_UPDATED.label}`,
};
