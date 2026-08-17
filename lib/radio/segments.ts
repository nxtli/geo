/**
 * Segmenten voor de prospect-tool.
 *
 * Een nieuw segment toevoegen = één regel in RADIO_SEGMENTS. De `hint` is
 * bedoeld voor de research-prompt (helpt het model consistent classificeren) en
 * `typical_customer_value` is een startpunt voor component E (customer value)
 * dat de research met echte signalen mag overschrijven.
 */

export interface RadioSegment {
  key: string;
  label: string;
  /** Korte omschrijving die meegaat in de research-prompt. */
  hint: string;
  /**
   * Indicatie van klantwaarde in dit segment (0–10 schaal van component E).
   * Alleen een startpunt/sanity-check — nooit een vervanging voor bewijs.
   */
  typical_customer_value: number;
}

export const RADIO_SEGMENTS: readonly RadioSegment[] = [
  {
    key: "retail",
    label: "Retail",
    hint: "Winkelketens, supermarkten, non-food retail, franchiseformules.",
    typical_customer_value: 4,
  },
  {
    key: "automotive",
    label: "Automotive",
    hint: "Autodealers, occasionplatforms, leasemaatschappijen, garageketens.",
    typical_customer_value: 10,
  },
  {
    key: "recruitment",
    label: "Recruitment",
    hint: "Uitzenders, detacheerders, werving & selectie, employer branding.",
    typical_customer_value: 7,
  },
  {
    key: "leisure_events",
    label: "Leisure & Events",
    hint: "Attractieparken, bioscopen, festivals, evenementen, horecaformules.",
    typical_customer_value: 4,
  },
  {
    key: "travel",
    label: "Travel",
    hint: "Reisorganisaties, touroperators, vakantieparken, vliegmaatschappijen.",
    typical_customer_value: 10,
  },
  {
    key: "ecommerce",
    label: "Consumer e-commerce",
    hint: "Landelijke webshops en D2C-merken met consumentendoelgroep.",
    typical_customer_value: 4,
  },
  {
    key: "fitness",
    label: "Fitness",
    hint: "Sportschoolketens, fitnessapps, abonnementsmodellen sport.",
    typical_customer_value: 7,
  },
  {
    key: "education",
    label: "Education",
    hint: "Opleiders, hogescholen, cursusaanbieders, bijlesorganisaties.",
    typical_customer_value: 10,
  },
  {
    key: "home_living",
    label: "Home & Living",
    hint: "Woninginrichting, keukens, meubels, tuin, verbouwing, installatie.",
    typical_customer_value: 10,
  },
  {
    key: "energy",
    label: "Energy",
    hint: "Energieleveranciers, zonnepanelen, warmtepompen, verduurzaming.",
    typical_customer_value: 10,
  },
  {
    key: "telecom",
    label: "Telecom",
    hint: "Providers, mobiele abonnementen, internet, TV-pakketten.",
    typical_customer_value: 10,
  },
  {
    key: "financial",
    label: "Financial consumer services",
    hint: "Verzekeraars, banken, hypotheken, leningen, pensioen.",
    typical_customer_value: 10,
  },
] as const;

const BY_KEY = new Map(RADIO_SEGMENTS.map((s) => [s.key, s]));
const BY_LABEL = new Map(
  RADIO_SEGMENTS.map((s) => [s.label.toLowerCase(), s]),
);

/** Zoek een segment op key of label (case-insensitive). Null als onbekend. */
export function findSegment(value: string | null | undefined): RadioSegment | null {
  if (!value) return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return BY_KEY.get(needle) ?? BY_LABEL.get(needle) ?? null;
}

/**
 * Normaliseer een segmentwaarde naar een bekende key, of null.
 * Onbekende segmenten worden bewust NIET verzonnen of gefabriceerd.
 */
export function normalizeSegment(value: string | null | undefined): string | null {
  return findSegment(value)?.key ?? null;
}

/** Label voor weergave; valt terug op de ruwe waarde als het segment onbekend is. */
export function segmentLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return findSegment(value)?.label ?? value;
}

/** Compacte segmentlijst voor de research-prompt. */
export function segmentPromptList(): string {
  return RADIO_SEGMENTS.map((s) => `- ${s.key} (${s.label}): ${s.hint}`).join("\n");
}
