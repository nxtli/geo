/**
 * The geo-page-checker scoring rubric — single source of truth for the six
 * categories (with max points) and the technical-check items. Used by the
 * prompt (to instruct the model), the mock provider, validation and the report
 * so the breakdown is consistent everywhere and always sums to 100.
 */
export const GEO_CATEGORIES = [
  { key: "vindbaarheid_techniek", label: "Vindbaarheid & techniek", max: 20 },
  { key: "extraheerbare_antwoorden", label: "Extraheerbare antwoorden", max: 25 },
  { key: "vraaggerichte_structuur", label: "Vraaggerichte structuur", max: 20 },
  { key: "concrete_feiten", label: "Concrete feiten", max: 15 },
  { key: "entiteit_vertrouwen", label: "Entiteit & vertrouwen", max: 10 },
  { key: "bewijs_bronnen", label: "Bewijs, bronnen & actualiteit", max: 10 },
] as const;

/** Total possible points across the rubric (100). */
export const GEO_MAX_SCORE = GEO_CATEGORIES.reduce((s, c) => s + c.max, 0);

/** The technical-check items reported as a separate layer (status per item). */
export const GEO_TECHNICAL_CHECKS = [
  "AI-crawler-toegang (robots.txt)",
  "Indexeerbaarheid (noindex/nofollow)",
  "Content-rendering (zonder JavaScript leesbaar)",
  "Structured data (schema / JSON-LD)",
  "Semantische HTML (koppenstructuur)",
  "llms.txt",
] as const;
