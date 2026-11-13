/**
 * Huisstijl per domein. Eén codebase bedient twee afzenders:
 *  - "nxtli": geo.nxtli.com
 *  - "mat":   geo.marketingaiteam.com (stijl en teksten van marketingaiteam.com)
 *
 * Keuze, in deze volgorde: env GEO_BRAND, cookie geo_brand (gezet via
 * ?brand=mat, handig op een testadres), de hostnaam. Kleuren en lettertype
 * staan in app/globals.css onder [data-brand].
 */
export type BrandId = "nxtli" | "mat";

export interface Brand {
  id: BrandId;
  /** Afzender in lopende tekst. */
  name: string;
  /** Naam van de scan, voor kopjes en titels. */
  product: string;
  domain: string;
  siteUrl: string;
  logo: { src: string; alt: string };
  /** Tekst naast het logo in de navigatie. */
  logoSuffix: string;
  charlie: { role: string; avatar: string; intro: string };
  cta: { label: string; url: string; chatLine: string; errorLabel: string; again: string };
  consentLabel: string;
  why: { eyebrow: string; title: string; body: string; points: string[]; tiles: Array<{ k: string; v: string }> };
  footer: { copyright: string; poweredBy: string | null };
  report: { colors: { brand: string; accent: string; ink: string; muted: string; soft: string }; ctaTitle: string; ctaBody: string; ctaButton: string; foot: string };
  email: { subject: string; signoff: string; ctaLine: string; color: string };
  meta: { title: string; description: string };
}

const NXTLI_CALL = "https://nxtli.com/michiel-schoonhoven-agenda/";

export const BRANDS: Record<BrandId, Brand> = {
  nxtli: {
    id: "nxtli",
    name: "NXTLI",
    product: "NXTLI GEO Scan",
    domain: "geo.nxtli.com",
    siteUrl: "https://geo.nxtli.com",
    logo: { src: "/nxtli-logo.png", alt: "NXTLI" },
    logoSuffix: "GEO Scan",
    charlie: {
      role: "AI-analist bij NXTLI",
      avatar: "/charlie.jpg",
      intro:
        "Hoi, ik ben Charlie, AI-analist bij NXTLI. Ik bekijk in een paar stappen hoe geschikt je pagina is voor AI-zoekmachines.",
    },
    cta: {
      label: "Plan een sessie",
      url: NXTLI_CALL,
      chatLine: "Wil je dat we dit voor je verbeteren? Plan een korte GEO-strategiesessie met NXTLI.",
      errorLabel: "Neem contact op met NXTLI",
      again: "plan een korte sessie met NXTLI",
    },
    consentLabel:
      "Ik ga akkoord dat NXTLI mijn gegevens gebruikt om de scan uit te voeren en het rapport toe te sturen.",
    why: {
      eyebrow: "Waarom NXTLI",
      title: "Jouw website begrijpelijk voor mensen én AI, zo bouw je aan blijvende vindbaarheid",
      body: "NXTLI is een AI-first studio en automation-partner. We helpen ondernemers en marketeers met AI-first websites, automations, contentstructuur en slimme systemen, niet alleen mooi, maar ook begrijpelijk voor mensen én AI.",
      points: [
        "AI-first websites die mensen én AI begrijpen",
        "Slimme automations en content­structuur",
        "Systemen die meegroeien met je bedrijf",
      ],
      tiles: [
        { k: "AI-first", v: "Jouw website begrepen door mens én AI" },
        { k: "Automation", v: "Meer output, minder handmatig werk" },
        { k: "Structuur", v: "Content die AI citeert en klanten overtuigt" },
        { k: "Resultaat", v: "Vaker gevonden. Vaker gekozen." },
      ],
    },
    footer: { copyright: "© 2026 NXTLI. Alle rechten voorbehouden.", poweredBy: null },
    report: {
      colors: { brand: "#0c90a1", accent: "#03b2b8", ink: "#0f172a", muted: "#475569", soft: "#e0f6f7" },
      ctaTitle: "Wil je dat NXTLI dit voor je uitwerkt?",
      ctaBody: "Plan een korte GEO-strategiesessie. We bouwen websites en systemen die niet alleen mooi zijn, maar ook begrijpelijk voor mensen én AI.",
      ctaButton: "Plan een sessie →",
      foot: "Dit rapport is automatisch gegenereerd door Charlie, de AI-analist van NXTLI, op basis van je homepage en aangeleverde gegevens. © NXTLI.",
    },
    email: {
      subject: "Je NXTLI GEO Scan is klaar",
      signoff: "NXTLI",
      ctaLine: "Wil je dat we met je meekijken? Plan een korte GEO-strategiesessie",
      color: "#0c90a1",
    },
    meta: {
      title: "NXTLI GEO Scan: Word jij gevonden in AI-zoekresultaten?",
      description:
        "Ontdek gratis hoe geschikt jouw website is voor ChatGPT, Claude en andere AI-antwoorden, en wat je kunt verbeteren om vaker genoemd te worden.",
    },
  },
  mat: {
    id: "mat",
    name: "Marketing AI Team",
    product: "GEO-scan",
    domain: "geo.marketingaiteam.com",
    siteUrl: "https://geo.marketingaiteam.com",
    logo: { src: "https://marketingaiteam.com/marketing-ai-team-logo.png", alt: "Marketing AI Team" },
    logoSuffix: "GEO-scan",
    charlie: {
      role: "CRO-specialist in het Marketing AI Team",
      avatar: "/charlie-mat.jpg",
      intro:
        "Hoi, ik ben Charlie, CRO-specialist in het Marketing AI Team. Ik bekijk in een paar stappen hoe geschikt je pagina is voor AI-zoekmachines.",
    },
    cta: {
      label: "Plan een demo",
      url: "https://marketingaiteam.com/#demo",
      chatLine: "Wil je zien hoe het Marketing AI Team dit structureel voor je oppakt? Plan een demo.",
      errorLabel: "Plan een demo",
      again: "plan een demo van het Marketing AI Team",
    },
    consentLabel:
      "Ik ga akkoord dat NXTLI B.V., het bedrijf achter Marketing AI Team, mijn gegevens gebruikt om de scan uit te voeren en het rapport toe te sturen.",
    why: {
      eyebrow: "",
      title: "Wie maakt de GEO-scan?",
      body: "Het Marketing AI Team maakt de GEO-scan. Marketing AI Team is een platform van NXTLI B.V., een marketing AI-bureau dat sinds 2017 bestaat. In het platform werken mensen en AI-collega's vanuit één Marketingbrein. Charlie beoordeelt je pagina's, Martine schrijft de verbeteringen en Brian meet het effect.",
      points: [
        "Eén Marketingbrein met je publieken, klantvragen en aanbod",
        "AI-collega's met elk een eigen specialisme",
        "Werkt volgens het Content Impact Model",
      ],
      tiles: [
        { k: "Charlie", v: "CRO-specialist. Beoordeelt pagina's en zet adviezen op volgorde." },
        { k: "Martine", v: "Neurocopywriter. Schrijft de voorstellen in jouw tone of voice." },
        { k: "Brian", v: "Data-analist. Meet verkeer en conversie uit AI-tools." },
        { k: "Marketingbrein", v: "Eén bron voor publieken, vragen en aanbod." },
      ],
    },
    footer: { copyright: "© 2026 NXTLI B.V. Alle rechten voorbehouden.", poweredBy: "Powered by NXTLI" },
    report: {
      colors: { brand: "#1767f2", accent: "#17c8cf", ink: "#082552", muted: "#5d708e", soft: "#edf4ff" },
      ctaTitle: "Wil je dit structureel aanpakken?",
      ctaBody: "Plan een demo van het Marketing AI Team. Je ziet hoe het Marketingbrein, Charlie en de andere AI-collega's voor jouw organisatie samenwerken.",
      ctaButton: "Plan een demo →",
      foot: "Dit rapport is gemaakt door Charlie, CRO-specialist in het Marketing AI Team, op basis van je pagina en aangeleverde gegevens. © NXTLI B.V.",
    },
    email: {
      subject: "Je GEO-scan van het Marketing AI Team is klaar",
      signoff: "Charlie, Marketing AI Team",
      ctaLine: "Wil je zien hoe het Marketing AI Team dit structureel oppakt? Plan een demo",
      color: "#1767f2",
    },
    meta: {
      title: "Gratis GEO-scan: hoe geschikt is je pagina voor AI-zoekmachines?",
      description:
        "Gratis GEO-scan van het Marketing AI Team. Zie in vijf minuten of je pagina geschikt is als bron voor ChatGPT, Claude en Gemini, en wat beter kan.",
    },
  },
};

export const BRAND_COOKIE = "geo_brand";

export function isBrandId(v: unknown): v is BrandId {
  return v === "nxtli" || v === "mat";
}

export function resolveBrandId(input: { env?: string | null; cookie?: string | null; host?: string | null }): BrandId {
  if (isBrandId(input.env)) return input.env;
  if (isBrandId(input.cookie)) return input.cookie;
  return /marketingaiteam/i.test(input.host ?? "") ? "mat" : "nxtli";
}
