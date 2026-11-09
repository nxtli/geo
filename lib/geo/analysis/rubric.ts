import { SCORECARD } from "../knowledge";

/**
 * Rubric per versie. Opgeslagen resultaten onthouden met welke versie ze zijn
 * gemaakt (`rubric_version`), zodat een oud rapport nooit langs een nieuwe
 * rubric wordt gelegd.
 *
 *  - "1": de zes categorieën van de eerste scan (alleen nog voor oude rapporten)
 *  - "2": de zeven dimensies uit lib/geo/knowledge/scorecard.json
 */
export interface RubricCategory {
  key: string;
  label: string;
  max: number;
}

const RUBRIC_V1: RubricCategory[] = [
  { key: "vindbaarheid_techniek", label: "Vindbaarheid & techniek", max: 20 },
  { key: "extraheerbare_antwoorden", label: "Extraheerbare antwoorden", max: 25 },
  { key: "vraaggerichte_structuur", label: "Vraaggerichte structuur", max: 20 },
  { key: "concrete_feiten", label: "Concrete feiten", max: 15 },
  { key: "entiteit_vertrouwen", label: "Entiteit & vertrouwen", max: 10 },
  { key: "bewijs_bronnen", label: "Bewijs, bronnen & actualiteit", max: 10 },
];

const RUBRIC_V2: RubricCategory[] = SCORECARD.dimensions.map((d) => ({
  key: d.key,
  label: d.label,
  max: d.criteria.reduce((s, c) => s + c.max, 0),
}));

export const GEO_RUBRICS: Record<string, RubricCategory[]> = { "1": RUBRIC_V1, "2": RUBRIC_V2 };
export const CURRENT_RUBRIC_VERSION = SCORECARD.version;
export const LEGACY_RUBRIC_VERSION = "1";

export function rubricFor(version: string | null | undefined): RubricCategory[] {
  return GEO_RUBRICS[version ?? ""] ?? RUBRIC_V1;
}

/** De huidige rubric (versie 2). */
export const GEO_CATEGORIES = RUBRIC_V2;
export const GEO_MAX_SCORE = GEO_CATEGORIES.reduce((s, c) => s + c.max, 0);
