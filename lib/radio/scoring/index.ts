/**
 * De scoring-engine. Pure functies, geen I/O, geen AI.
 *
 * De research-laag levert componentscores, triggers en bewijs; hier wordt
 * gerekend. Die scheiding is opzettelijk: het model kan de schaal niet
 * verschuiven, de rekenregels zijn testbaar, en dezelfde input geeft altijd
 * dezelfde uitkomst.
 */

import type {
  Evidence,
  FitComponentScore,
  ProspectScores,
  ProspectTrigger,
  ResearchResult,
  Tier,
} from "../types";
import { FIT_COMPONENTS, FIT_MAX_SCORE, snapToAnchor } from "./rubric";
import { computeTriggerScore, type TriggerScoreResult } from "./triggers";
import { detectKnockouts } from "./knockouts";
import { computeResearchConfidence } from "./confidence";

export { FIT_COMPONENTS, FIT_MAX_SCORE, snapToAnchor, fitComponent, fitRubricPrompt } from "./rubric";
export { computeTriggerScore, TRIGGER_KIND_LABELS, normalizeTriggerKind } from "./triggers";
export { detectKnockouts, MIN_RESEARCH_CONFIDENCE } from "./knockouts";
export {
  computeResearchConfidence,
  confidenceLabel,
  LOW_CONFIDENCE_THRESHOLD,
} from "./confidence";

/** Gewichten van de Priority Score (§6 van de briefing). */
export const FIT_WEIGHT = 0.75;
export const TRIGGER_WEIGHT = 0.25;

export interface TierDef {
  tier: Tier;
  min: number;
  max: number;
  emoji: string;
  label: string;
}

export const TIERS: readonly TierDef[] = [
  { tier: "A", min: 80, max: 100, emoji: "🔥", label: "Zeer interessante prospect" },
  { tier: "B", min: 65, max: 79, emoji: "🟢", label: "Goede prospect" },
  { tier: "C", min: 50, max: 64, emoji: "🟡", label: "Alleen benaderen met relevante angle" },
  { tier: "D", min: 0, max: 49, emoji: "⚪", label: "Lage prioriteit / skip" },
] as const;

export function tierFor(priority: number): Tier {
  const match = TIERS.find((t) => priority >= t.min && priority <= t.max);
  return match?.tier ?? "D";
}

export function tierDef(tier: Tier): TierDef {
  return TIERS.find((t) => t.tier === tier) ?? TIERS[TIERS.length - 1];
}

/**
 * Normaliseer de componentscores op de canonieke rubric.
 *
 * Altijd alle tien componenten, in rubric-volgorde, geklemd op de toegestane
 * ankerwaarden. Een component die het model niet teruggaf wordt `unknown` met
 * score 0 — nooit stilzwijgend weggelaten, want dan zou de fit-score op een
 * kleinere schaal komen te staan en te hoog lijken.
 */
export function reconcileFitComponents(returned: FitComponentScore[]): FitComponentScore[] {
  return FIT_COMPONENTS.map((def) => {
    const match = returned.find((c) => c.key === def.key);
    if (!match) {
      return {
        key: def.key,
        label: def.label,
        max: def.max,
        score: 0,
        rationale: "Geen onderbouwing beschikbaar.",
        basis: "unknown" as const,
      };
    }
    // Herschaal als het model tegen een andere max scoorde, dan naar anker.
    const rescaled =
      match.max && match.max !== def.max ? (match.score / match.max) * def.max : match.score;
    return {
      key: def.key,
      label: def.label,
      max: def.max,
      score: snapToAnchor(def, rescaled),
      rationale: match.rationale?.trim() || "Geen onderbouwing beschikbaar.",
      // Een score zonder onderbouwing kan geen `fact` zijn.
      basis: match.rationale?.trim() ? match.basis : "unknown",
    };
  });
}

/** Fit-score = som van de tien genormaliseerde componenten. */
export function computeFitScore(components: FitComponentScore[]): number {
  const sum = components.reduce((total, c) => total + c.score, 0);
  return Math.max(0, Math.min(FIT_MAX_SCORE, Math.round(sum)));
}

/** Priority Score = fit × 0.75 + trigger × 0.25, afgerond op een heel getal. */
export function computePriorityScore(fit: number, trigger: number): number {
  const raw = fit * FIT_WEIGHT + trigger * TRIGGER_WEIGHT;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export interface ScoreProspectInput {
  fit_components: FitComponentScore[];
  triggers: ProspectTrigger[];
  evidence: Evidence[];
  /** Aantal pagina's dat de fetcher daadwerkelijk ophaalde. */
  fetchedSourceCount: number;
  purely_specialist_b2b?: ResearchResult["purely_specialist_b2b"];
  serves_dutch_market?: ResearchResult["serves_dutch_market"];
  appears_active?: ResearchResult["appears_active"];
  /** Onderbouwde uitzondering op een knock-out. */
  radio_use_case_override?: string | null;
  /** Referentietijd voor recency. Injecteerbaar voor tests. */
  now?: number;
}

export interface ScoreProspectResult extends ProspectScores {
  research_confidence: number;
  /** Triggers met berekend gewicht, aflopend gesorteerd. */
  triggers: ProspectTrigger[];
  primary_trigger: ProspectTrigger | null;
}

/**
 * Reken een volledige prospect door: fit, trigger, priority, tier, knock-outs
 * en research-confidence.
 */
export function scoreProspect(input: ScoreProspectInput): ScoreProspectResult {
  const components = reconcileFitComponents(input.fit_components);
  const fit_score = computeFitScore(components);

  const triggerResult: TriggerScoreResult = computeTriggerScore(
    input.triggers,
    input.now ?? Date.now(),
  );

  const research_confidence = computeResearchConfidence({
    components,
    evidence: input.evidence,
    fetchedSourceCount: input.fetchedSourceCount,
  });

  const priority_score = computePriorityScore(fit_score, triggerResult.score);
  const naturalTier = tierFor(priority_score);

  const knockouts = detectKnockouts({
    components,
    research_confidence,
    purely_specialist_b2b: input.purely_specialist_b2b,
    serves_dutch_market: input.serves_dutch_market,
    appears_active: input.appears_active,
  });

  const override = input.radio_use_case_override?.trim() || null;
  // Knock-out forceert tier D, tenzij er een onderbouwde radio-use-case is.
  const forced = knockouts.length > 0 && !override;
  const tier: Tier = forced ? "D" : naturalTier;

  return {
    fit_score,
    trigger_score: triggerResult.score,
    priority_score,
    tier,
    fit_components: components,
    knockouts,
    knockout_override: knockouts.length > 0 ? override : null,
    tier_before_knockout: forced && naturalTier !== "D" ? naturalTier : null,
    research_confidence,
    triggers: triggerResult.triggers,
    primary_trigger: triggerResult.primary,
  };
}
