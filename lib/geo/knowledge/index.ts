import evidenceJson from "./evidence.json";
import scorecardJson from "./scorecard.json";

/**
 * Kennisbank van de GEO-scan. Twee databestanden, één bron voor de app, de
 * prompt en de skill:
 *  - evidence.json   de aannames, elk met bewijskracht, bron en voorbehoud
 *  - scorecard.json  de criteria, punten, eigenaar en "klaar als"
 *
 * Aanscherpen = deze twee bestanden wijzigen, `reviewed` bijwerken en
 * `npm run build:skill` draaien. De tests bewaken de samenhang.
 */
export type EvidenceGrade = "feit" | "sterk" | "middel" | "zwak" | "richtlijn" | "ontkracht";
export type OwnerRole = "schrijver" | "developer" | "mens";

export interface EvidenceItem {
  id: string;
  grade: EvidenceGrade;
  claim: string;
  caveat: string;
  /** Bij welke uitkomst de bewijskracht wordt herzien. */
  revise_if: string;
  sources: Array<{ title: string; url: string; year: number }>;
}
export interface Criterion {
  id: string;
  name: string;
  max: number;
  evidence: string[];
  owner: OwnerRole;
  fix: string;
  done_when: string;
  /** Wat de scan extra nodig heeft om dit te beoordelen (anders: niet te beoordelen). */
  needs?: string;
}
export interface Dimension {
  key: string;
  label: string;
  criteria: Criterion[];
}
export interface Gate {
  id: string;
  name: string;
  evidence: string[];
  owner: OwnerRole;
  done_when: string;
}

export const EVIDENCE = evidenceJson as unknown as {
  version: string;
  reviewed: string;
  review_before: string;
  grades: Record<EvidenceGrade, string>;
  items: EvidenceItem[];
};
export const SCORECARD = scorecardJson as unknown as {
  version: string;
  blocked_cap: number;
  verdict_values: Record<"voldoet" | "deels" | "niet", number>;
  gates: Gate[];
  dimensions: Dimension[];
  hygiene: Array<{ id: string; name: string; evidence: string[] }>;
};

/** Gewicht van de bewijskracht bij het prioriteren van adviezen. */
export const GRADE_WEIGHT: Record<EvidenceGrade, number> = {
  feit: 1,
  sterk: 1,
  middel: 0.7,
  richtlijn: 0.5,
  zwak: 0.4,
  ontkracht: 0,
};

/** Wie een advies oppakt in het Marketing AI Team. */
export const OWNER_LABEL: Record<OwnerRole, string> = {
  schrijver: "Tekstschrijver",
  developer: "Webbouwer",
  mens: "Marketeer",
};

const evidenceById = new Map(EVIDENCE.items.map((e) => [e.id, e]));
export function getEvidence(id: string): EvidenceItem | undefined {
  return evidenceById.get(id);
}

const criterionById = new Map(
  SCORECARD.dimensions.flatMap((d) => d.criteria.map((c) => [c.id, { ...c, dimension: d.key }] as const)),
);
export function getCriterion(id: string) {
  return criterionById.get(id.trim().toUpperCase());
}

/** Sterkste bewijskracht onder de aannames van een criterium. */
export function criterionWeight(c: Criterion): number {
  return Math.max(0, ...c.evidence.map((id) => GRADE_WEIGHT[getEvidence(id)?.grade ?? "zwak"]));
}

/** True als de kennisbank over de herzieningsdatum heen is. */
export function evidenceIsStale(today = new Date()): boolean {
  return today.toISOString().slice(0, 10) > EVIDENCE.review_before;
}
