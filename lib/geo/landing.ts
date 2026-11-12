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
export const DIMENSION_COUNT = 8;

/** Punten per onderdeel van de scorecard. */
export const DIMENSION_POINTS: Record<string, number> = {
  "Aansluiting op de vraag": 26,
  "Concrete, controleerbare informatie": 18,
  "Citeerbare antwoorden": 13,
  "Eigen inbreng": 10,
  "Bewijs en bronnen": 10,
  "Entiteit en vertrouwen": 10,
  Paginabasis: 8,
  Actualiteit: 5,
};

const points = (label: string) => DIMENSION_POINTS[label] ?? 0;

const count = ["nul", "één", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien"];
const word = (n: number) => count[n] ?? String(n);

export const HERO = {
  title: "Gratis GEO-scan: is jouw pagina geschikt voor",
  titleAccent: "AI-zoekmachines?",
  lede: "Jouw klant stelt zijn vraag aan ChatGPT, Gemini of Perplexity. De AI-tool geeft één antwoord en haalt daarbij een paar pagina's aan. Charlie beoordeelt of jouw pagina daar geschikt voor is en schrijft de verbeteringen voor je uit.",
  bullets: [
    `Een score tot 100, opgebouwd uit ${CRITERIA_COUNT} criteria`,
    "Per advies: wat er nu staat en een tekstvoorstel om te plakken",
    "Wat ChatGPT, Gemini, Perplexity, Grok en Claude over je merk zeggen",
  ],
  cta: "Scan mijn pagina gratis",
  secondary: "Bekijk wat je krijgt",
  trust: "Gratis. Ongeveer vijf minuten. Je rapport staat direct in de chat en in je mail.",
};

export const SOURCES = {
  tian: {
    label: "Tian e.a., Diagnosing and Repairing Citation Failures in GEO (2026)",
    url: "https://arxiv.org/abs/2603.09296",
  },
  ahrefs: { label: "Ahrefs, schema en AI-citaties", url: "https://ahrefs.com/blog/schema-ai-citations/" },
  seranking: { label: "SE Ranking, llms.txt-studie", url: "https://seranking.com/blog/llms-txt/" },
  survey: { label: "Critical Survey of GEO (2023-2026)", url: "https://arxiv.org/abs/2607.14035" },
};

export const PROBLEM = {
  eyebrow: "Waarom dit telt",
  title: "Waarom haalt een AI-tool de ene pagina aan en de andere niet?",
  intro:
    "Een AI-tool haalt een pagina aan als die pagina de vraag van de gebruiker concreet beantwoordt. Een hoge positie in Google is daarvoor niet genoeg.",
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
    "In een analyse van 949 gemiste citaties paste bij 62,2% de inhoud niet bij de vraag. Bij 10,1% lukte het ophalen of ontleden van de pagina niet. De onderzoekers maten in een testopstelling, niet bij live AI-tools.",
  source: SOURCES.tian,
};

export const FEATURES = {
  eyebrow: "De criteria",
  title: "Wat beoordeelt de GEO-scan?",
  intro: `De scan beoordeelt één pagina op ${CRITERIA_COUNT} criteria in ${word(DIMENSION_COUNT)} onderdelen. Samen tellen de onderdelen op tot 100 punten. Het onderdeel met het sterkste bewijs weegt het zwaarst.`,
  items: [
    {
      label: "Aansluiting op de vraag",
      body: "Beantwoordt de pagina de vragen van jouw klant? Staat erbij voor wie het aanbod is?",
    },
    {
      label: "Concrete, controleerbare informatie",
      body: "Staan de prijs, de voorwaarden en een vergelijking met alternatieven op de pagina?",
    },
    {
      label: "Citeerbare antwoorden",
      body: "Staat het antwoord vooraan en is het los leesbaar? Is de taal stellig en onderbouwd?",
    },
    {
      label: "Eigen inbreng",
      body: "Bevat de pagina eigen cijfers, ervaring uit de praktijk of een eigen methode?",
    },
    {
      label: "Bewijs en bronnen",
      body: "Hebben cijfers een bron? Staat er een citaat van een klant of expert met naam?",
    },
    {
      label: "Entiteit en vertrouwen",
      body: "Is duidelijk wie het aanbiedt? Staat er een expert met naam en functie?",
    },
    {
      label: "Paginabasis",
      body: "Heeft de pagina één h1, logische koppen, een duidelijke titel en beschrijvende links?",
    },
    {
      label: "Actualiteit",
      body: "Toont de pagina een datum met jaartal? Zijn de gegevens actueel?",
    },
  ].map((i) => ({ ...i, points: points(i.label) })),
  gates:
    "Vooraf toetst de scan drie blokkades. Mogen AI-zoekbots de pagina ophalen? Is de pagina indexeerbaar? Staat de kerntekst in de HTML? Faalt er één, dan topt de scan je score af, hoe goed de tekst ook is.",
};

export const LIMITS = {
  eyebrow: "Eerlijk over de grenzen",
  title: "Wat meet de GEO-scan niet?",
  intro:
    "De scan meet hoe geschikt je pagina is. De scan meet niet hoe vaak een AI-tool je merk noemt, en belooft geen plek in een antwoord.",
  items: [
    {
      title: "Eén AI-antwoord zegt weinig",
      body: "AI-antwoorden verschillen per keer en per tool. Een betrouwbare meting vraagt zeven tot acht herhalingen per vraag.",
      source: SOURCES.survey,
    },
    {
      title: "Schema-code geeft geen punten",
      body: "Ahrefs testte 1.885 pagina's. JSON-LD toevoegen gaf geen meetbare stijging van AI-citaties. Schema blijft nuttig voor gewone zoekresultaten.",
      source: SOURCES.ahrefs,
    },
    {
      title: "Een llms.txt-bestand ook niet",
      body: "SE Ranking onderzocht circa 300.000 domeinen. Een llms.txt-bestand had geen aantoonbaar effect op AI-citaties.",
      source: SOURCES.seranking,
    },
  ],
  closing:
    "Wat wel werkt, is een gerichte reparatie. In het onderzoek van Tian e.a. wijzigde de beste aanpak ongeveer 5% van de tekst. Daarom krijg je per advies één concrete wijziging en geen herschreven pagina.",
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
      body: "De scan haalt je pagina op, meet de techniek en beoordeelt de inhoud per criterium.",
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
    "Je krijgt een score tot 100, de opbouw per onderdeel en de adviezen op volgorde van belang. Elk advies laat zien wat er nu staat en geeft een voorstel dat je direct plakt.",
  exampleNote: "Voorbeeld met verzonnen gegevens. Jouw rapport gaat over jouw pagina.",
  example: {
    domain: "jouwbedrijf.nl/dienst",
    score: 52,
    bars: [
      { label: "Aansluiting op de vraag", got: 15, max: points("Aansluiting op de vraag") },
      { label: "Concrete, controleerbare informatie", got: 5, max: points("Concrete, controleerbare informatie") },
      { label: "Entiteit en vertrouwen", got: 10, max: points("Entiteit en vertrouwen") },
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
    "De adviezen op volgorde van belang, met punten en inspanning",
    "Per advies: de huidige tekst en een voorstel",
    "De antwoorden van vijf AI-tools op de vraag wat zij over je merk weten",
  ],
};

export const FINAL_CTA = {
  title: "Zie in vijf minuten waar je pagina punten laat liggen",
  body: `Charlie beoordeelt je pagina op ${CRITERIA_COUNT} criteria en schrijft per advies een voorstel. Gratis, één scan per e-mailadres.`,
  cta: "Scan mijn pagina gratis",
  trust: "Geen technische kennis nodig. Je rapport staat direct in de chat en in je mail.",
};

export function faqs(brandName: string): Array<{ q: string; a: string }> {
  return [
    {
      q: "Wat is GEO?",
      a: "GEO staat voor Generative Engine Optimization. Je maakt een pagina geschikt om door AI-zoekmachines gevonden, begrepen en aangehaald te worden. Voorbeelden van AI-zoekmachines zijn ChatGPT, Gemini, Perplexity, Claude en de AI-overzichten van Google.",
    },
    {
      q: "Wat kost de GEO-scan?",
      a: `De GEO-scan is gratis. Je krijgt één scan per e-mailadres. Wil je meer pagina's laten beoordelen, plan dan een demo van ${brandName}.`,
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
      a: "De scan vraagt aan ChatGPT, Gemini, Perplexity, Grok en Claude wat zij over je merk weten. Je leest hun antwoorden in het rapport. De paginascore zelf geldt voor alle AI-zoekmachines.",
    },
    {
      q: "Is een hoge score een garantie dat AI mij noemt?",
      a: "Nee. De score zegt hoe geschikt je pagina is. Of een AI-tool je noemt, hangt ook af van de vraag, de concurrentie en hoe vaak je merk buiten je eigen site voorkomt.",
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
  responsible: "Verantwoordelijk voor deze pagina: Michiel Schoonhoven, managing partner en mede-oprichter van NXTLI B.V.",
  updated: `Laatst bijgewerkt: ${LANDING_UPDATED.label}`,
};
