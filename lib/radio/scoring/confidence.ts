/**
 * research_confidence (§23 van de briefing) — deterministisch, niet door de AI
 * bepaald.
 *
 * Twee factoren die elkaar vermenigvuldigen:
 *
 *  1. BEWIJSDEKKING — welk deel van de fit-componenten rust op gevonden feiten?
 *     Gewogen naar het gewicht van de component, want een `fact` op de
 *     20-punts-component zegt meer dan op een 5-punter.
 *       fact ×1.0 · inference ×0.5 · unknown ×0
 *
 *  2. BRONDEKKING — hoeveel echte bronnen hebben we? Zonder opgehaalde pagina's
 *     kan een hoge bewijsdekking niet waar zijn.
 *       0 bronnen ×0.25 · 1 ×0.6 · 2 ×0.8 · 3 ×0.9 · 4+ ×1.0
 *
 * Zo kan een prospect nooit "zeker" lijken op basis van niets.
 */

import type { ClaimKind, Confidence, Evidence, FitComponentScore } from "../types";
import { FIT_MAX_SCORE, fitComponent } from "./rubric";

const BASIS_WEIGHT: Record<ClaimKind, number> = {
  fact: 1,
  inference: 0.5,
  unknown: 0,
};

function sourceCoverageFactor(sourceCount: number): number {
  if (sourceCount <= 0) return 0.25;
  if (sourceCount === 1) return 0.6;
  if (sourceCount === 2) return 0.8;
  if (sourceCount === 3) return 0.9;
  return 1;
}

export interface ConfidenceInput {
  components: FitComponentScore[];
  evidence: Evidence[];
  /** Aantal pagina's dat we daadwerkelijk hebben kunnen ophalen. */
  fetchedSourceCount: number;
}

/** Bereken research_confidence (0–100). */
export function computeResearchConfidence(input: ConfidenceInput): number {
  const { components, evidence, fetchedSourceCount } = input;

  // 1. Bewijsdekking, gewogen naar componentgewicht.
  let weightedBasis = 0;
  let totalWeight = 0;
  for (const component of components) {
    const def = fitComponent(component.key);
    const weight = def?.max ?? 0;
    totalWeight += weight;
    weightedBasis += weight * (BASIS_WEIGHT[component.basis] ?? 0);
  }
  // Ontbrekende componenten tellen als `unknown`: deel altijd door het volledige
  // rubric-gewicht, niet alleen door wat het model terugstuurde.
  const denominator = Math.max(totalWeight, FIT_MAX_SCORE);
  const evidenceCoverage = denominator > 0 ? weightedBasis / denominator : 0;

  // 2. Brondekking. Unieke evidence-URL's tellen mee als extra bevestiging,
  // maar het aantal ECHT opgehaalde pagina's is de bovengrens.
  const uniqueEvidenceUrls = new Set(evidence.map((e) => e.url)).size;
  const effectiveSources = Math.min(
    Math.max(fetchedSourceCount, 0),
    Math.max(uniqueEvidenceUrls, fetchedSourceCount),
  );
  const coverage = sourceCoverageFactor(effectiveSources);

  return Math.max(0, Math.min(100, Math.round(evidenceCoverage * coverage * 100)));
}

/** Samenvattend label bij een confidence-score. */
export function confidenceLabel(score: number | null): Confidence | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** Onder deze grens toont de UI een expliciete waarschuwing. */
export const LOW_CONFIDENCE_THRESHOLD = 40;
