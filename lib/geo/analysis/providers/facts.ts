import type { GeoAnalysisInput, GeoAnalysisResult } from "../../types";
import type { GeoAnalysisOutcome, GeoAnalysisProvider } from "../provider";
import { CURRENT_RUBRIC_VERSION } from "../rubric";

/**
 * Resultaat zonder inhoudelijk oordeel. Wordt gebruikt als het taalmodel niet
 * beschikbaar is of faalt. Het rapport toont dan alleen wat gemeten is (de
 * feitenlaag wordt er in finalizeAnalysis overheen gelegd) en geen score: een
 * geschat cijfer zou iets suggereren dat niet beoordeeld is.
 */
export const NO_JUDGEMENT_REASON =
  "De inhoudelijke beoordeling is niet gelukt. Er is daarom geen score. De technische checks hieronder zijn wel gemeten.";

export function factsOnlyResult(_input: GeoAnalysisInput): GeoAnalysisResult {
  return {
    rubric_version: CURRENT_RUBRIC_VERSION,
    visibility_score: 0,
    category_scores: [],
    criteria: [],
    actions: [],
    blocked: false,
    unscored_reason: NO_JUDGEMENT_REASON,
    technical_checks: [],
    hygiene: [],
    scope_notes: [],
    short_summary:
      "De inhoudelijke beoordeling van je pagina is deze keer niet gelukt. Hieronder zie je de technische checks, die zijn wel gemeten. We kijken handmatig mee en sturen je het volledige rapport na.",
    what_ai_understands: "",
    likely_ai_positioning: "",
    ai_answer_comparison: { current: { answer: "", tags: [] }, improved: { answer: "", tags: [] } },
    llm_visibility: [],
    strengths: [],
    weaknesses: [],
    missing_signals: [],
    content_gaps: [],
    recommended_pages: [],
    recommended_faq_questions: [],
    quick_wins: [],
    thirty_day_action_plan: [],
    suggested_homepage_copy_improvements: [],
  };
}

export class FactsOnlyProvider implements GeoAnalysisProvider {
  readonly id = "facts";
  isConfigured(): boolean {
    return true;
  }
  async analyze(input: GeoAnalysisInput): Promise<GeoAnalysisOutcome> {
    return { result: factsOnlyResult(input) };
  }
}
