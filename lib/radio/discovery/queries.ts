/**
 * Zoekstrategieën voor het ontdekken van nieuwe bedrijven (§18 van de briefing).
 *
 * Twee soorten zoekopdrachten, want ze vinden verschillende dingen:
 *
 *  - FIT-queries vinden bedrijven die structureel bij radio passen ("Nederlandse
 *    retailketens", "landelijke e-commerce merken").
 *  - TIMING-queries vinden bedrijven met een actuele aanleiding ("bedrijven
 *    openen nieuwe vestiging", "veel vacatures"). Die leveren meteen een
 *    gedateerde trigger op en zijn daarom waardevoller per gevonden bedrijf.
 *
 * De queries staan hier als data, niet in de prompt: een zoekrichting toevoegen
 * is één regel, en de UI kan de lijst tonen zodat Eric ziet waarop gezocht wordt.
 */

export type QueryKind = "fit" | "timing";

export interface DiscoveryQuery {
  key: string;
  /** De zoekrichting in het Nederlands, zoals Eric hem zou uitspreken. */
  label: string;
  kind: QueryKind;
  /** Segment waar deze zoekrichting bij hoort, of null voor segment-breed. */
  segment: string | null;
  /**
   * Concrete zoektermen die de AI mag gebruiken. Meerdere varianten, want één
   * zoekterm levert vaak één lijstje op en daarmee steeds dezelfde bedrijven.
   */
  searches: string[];
}

export const DISCOVERY_QUERIES: readonly DiscoveryQuery[] = [
  /* ---------------------------------------------------------------- FIT --- */
  {
    key: "retail_chains",
    label: "Nederlandse retailketens",
    kind: "fit",
    segment: "retail",
    searches: [
      "grootste winkelketens Nederland aantal vestigingen",
      "Nederlandse retailformules overzicht filialen",
      "franchiseformules Nederland winkels",
    ],
  },
  {
    key: "ecommerce_brands",
    label: "Landelijke consumer e-commerce merken",
    kind: "fit",
    segment: "ecommerce",
    searches: [
      "grootste webshops Nederland consumenten",
      "Nederlandse D2C merken bekend",
      "snelst groeiende webshops Nederland",
    ],
  },
  {
    key: "automotive_retail",
    label: "Automotive retailers en dealergroepen",
    kind: "fit",
    segment: "automotive",
    searches: [
      "grootste autodealergroepen Nederland vestigingen",
      "occasionplatform Nederland landelijk",
      "leasemaatschappij particulier Nederland",
    ],
  },
  {
    key: "travel_orgs",
    label: "Reisorganisaties en vakantieparken",
    kind: "fit",
    segment: "travel",
    searches: [
      "grootste reisorganisaties Nederland",
      "vakantieparken Nederland keten",
      "touroperator Nederland consumenten",
    ],
  },
  {
    key: "fitness_chains",
    label: "Fitnessketens en sportabonnementen",
    kind: "fit",
    segment: "fitness",
    searches: [
      "grootste sportschoolketens Nederland vestigingen",
      "fitnessketen Nederland abonnement",
    ],
  },
  {
    key: "education",
    label: "Opleiders en cursusaanbieders",
    kind: "fit",
    segment: "education",
    searches: [
      "particuliere opleiders Nederland cursussen",
      "opleidingsinstituut Nederland landelijk",
    ],
  },
  {
    key: "home_living",
    label: "Woninginrichting, keukens en verbouwing",
    kind: "fit",
    segment: "home_living",
    searches: [
      "keukenketens Nederland vestigingen",
      "woonwinkels Nederland keten",
      "badkamerspecialist Nederland landelijk",
    ],
  },
  {
    key: "energy",
    label: "Energie en verduurzaming",
    kind: "fit",
    segment: "energy",
    searches: [
      "energieleveranciers Nederland consumenten",
      "zonnepanelen installateur Nederland landelijk",
      "warmtepomp aanbieder Nederland consument",
    ],
  },
  {
    key: "telecom",
    label: "Telecom en providers",
    kind: "fit",
    segment: "telecom",
    searches: ["telecomproviders Nederland consumenten", "internetprovider Nederland aanbod"],
  },
  {
    key: "financial",
    label: "Financiële consumentendiensten",
    kind: "fit",
    segment: "financial",
    searches: [
      "hypotheekadviseurs Nederland landelijk keten",
      "verzekeraars Nederland particulier",
    ],
  },
  {
    key: "leisure_events",
    label: "Leisure, attracties en events",
    kind: "fit",
    segment: "leisure_events",
    searches: [
      "attractieparken Nederland bezoekers",
      "festivals Nederland organisatie",
      "bioscoopketen Nederland vestigingen",
    ],
  },
  {
    key: "recruitment",
    label: "Uitzenders en recruitmentbureaus",
    kind: "fit",
    segment: "recruitment",
    searches: [
      "grootste uitzendbureaus Nederland vestigingen",
      "detacheerder Nederland landelijk",
    ],
  },

  /* ------------------------------------------------------------- TIMING --- */
  {
    key: "new_locations",
    label: "Bedrijven die nieuwe vestigingen openen",
    kind: "timing",
    segment: null,
    searches: [
      "opent nieuwe vestiging Nederland winkel",
      "nieuwe filiaal geopend Nederland keten",
      "breidt uit met vestigingen Nederland",
    ],
  },
  {
    key: "hiring_surge",
    label: "Bedrijven met veel openstaande vacatures",
    kind: "timing",
    segment: null,
    searches: [
      "zoekt tientallen medewerkers Nederland vacatures",
      "personeelstekort bedrijf Nederland werft",
    ],
  },
  {
    key: "growth_expansion",
    label: "Snelgroeiende consumentenmerken",
    kind: "timing",
    segment: null,
    searches: [
      "snelgroeiend Nederlands consumentenmerk",
      "groeit hard Nederland omzet consumenten",
      "FD Gazellen consumentenmerk",
    ],
  },
  {
    key: "funding",
    label: "Recente investeringen en overnames",
    kind: "timing",
    segment: null,
    searches: [
      "haalt investering op Nederlands consumentenmerk",
      "overname Nederlandse retailketen",
    ],
  },
  {
    key: "product_launch",
    label: "Nieuwe productlanceringen",
    kind: "timing",
    segment: null,
    searches: [
      "lanceert nieuw product Nederland consumenten",
      "introduceert nieuwe dienst Nederland consument",
    ],
  },
  {
    key: "rebranding",
    label: "Rebranding en nieuwe campagnes",
    kind: "timing",
    segment: null,
    searches: [
      "nieuwe huisstijl Nederlands merk",
      "start campagne Nederlands consumentenmerk",
    ],
  },
] as const;

const BY_KEY = new Map(DISCOVERY_QUERIES.map((q) => [q.key, q]));

export function findQuery(key: string): DiscoveryQuery | null {
  return BY_KEY.get(key) ?? null;
}

/** Alle zoekrichtingen voor een segment, plus de segment-brede timing-queries. */
export function queriesForSegment(segment: string | null): DiscoveryQuery[] {
  if (!segment) return [...DISCOVERY_QUERIES];
  return DISCOVERY_QUERIES.filter((q) => q.segment === segment || q.segment === null);
}

/** Alleen de timing-queries — die leveren de sterkste aanleidingen op. */
export function timingQueries(): DiscoveryQuery[] {
  return DISCOVERY_QUERIES.filter((q) => q.kind === "timing");
}
