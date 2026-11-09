import { z } from "zod";
import type { GeoAnalysisInput, GeoAnalysisResult, GeoUsage } from "../types";
import { CURRENT_RUBRIC_VERSION, GEO_MAX_SCORE, LEGACY_RUBRIC_VERSION, rubricFor, type RubricCategory } from "./rubric";
import { normalizeCriteria, scoreFromCriteria } from "./scorecard";
import { SCORECARD } from "../knowledge";

type CategoryScore = GeoAnalysisResult["category_scores"][number];

/**
 * Force the returned breakdown onto the canonical rubric (six categories whose
 * maxes sum to GEO_MAX_SCORE = 100), so the headline is ALWAYS a true /100 and
 * the displayed breakdown always sums to it. A model that returns a different
 * category set, wrong maxes, or a different count can no longer silently shift
 * the scale. Scores are matched by key, then by label, then by position, and
 * rescaled if the model used a different max for a category.
 */
function reconcileToRubric(returned: CategoryScore[], GEO_CATEGORIES: RubricCategory[]): CategoryScore[] {
  // Consume each returned entry AT MOST ONCE so no model category is counted in
  // two rubric slots (which would inflate the total / misattribute scores).
  const used = new Array(returned.length).fill(false);
  const take = (pred: (c: CategoryScore) => boolean): number => {
    for (let i = 0; i < returned.length; i++) {
      if (!used[i] && pred(returned[i])) {
        used[i] = true;
        return i;
      }
    }
    return -1;
  };

  const matchIdx = GEO_CATEGORIES.map(() => -1);
  // Pass 1: exact key match for ALL categories first (so a real match always
  // wins over a positional fallback for some other category).
  GEO_CATEGORIES.forEach((cat, gi) => {
    matchIdx[gi] = take((c) => !!c.key && c.key === cat.key);
  });
  // Pass 2: label match for the still-unmatched categories.
  GEO_CATEGORIES.forEach((cat, gi) => {
    if (matchIdx[gi] < 0) {
      matchIdx[gi] = take(
        (c) => !!c.label && c.label.trim().toLowerCase() === cat.label.toLowerCase(),
      );
    }
  });
  // Pass 3: positional fallback only when the count matches — assign each
  // leftover model entry (in order) to a leftover rubric slot.
  if (returned.length === GEO_CATEGORIES.length) {
    GEO_CATEGORIES.forEach((_, gi) => {
      if (matchIdx[gi] < 0) matchIdx[gi] = take(() => true);
    });
  }

  return GEO_CATEGORIES.map((cat, gi) => {
    const match = matchIdx[gi] >= 0 ? returned[matchIdx[gi]] : undefined;
    let score = match ? match.score : 0;
    // Rescale if the model scored this category against a different max.
    if (match && match.max && match.max !== cat.max) {
      score = Math.round((score / match.max) * cat.max);
    }
    score = Math.max(0, Math.min(cat.max, score));
    return { key: cat.key, label: cat.label, max: cat.max, score, summary: match?.summary ?? "" };
  });
}

/** What a provider returns: the result plus optional token usage for costing. */
export interface GeoAnalysisOutcome {
  result: GeoAnalysisResult;
  usage?: GeoUsage;
}

/** Options passed to a provider, e.g. a live-progress callback (0..1). */
export interface GeoAnalysisOpts {
  /** Called with the analysis-generation fraction (0..1) as tokens stream in. */
  onProgress?: (fraction: number) => void;
}

/**
 * The analysis provider contract.
 *
 * Any analysis backend — the direct Claude API call (running the
 * geo-page-checker methodology), the interactive skill, or a deterministic
 * mock — implements this interface. The registry in ./index.ts selects one at
 * runtime, so swapping or extending the engine never touches the API or UI.
 */
export interface GeoAnalysisProvider {
  /** Stable identifier, also used to select via GEO_ANALYSIS_PROVIDER. */
  readonly id: string;
  /** True when this provider has the config/credentials it needs to run. */
  isConfigured(): boolean;
  /** Produce a validated analysis result (+ usage). May throw on hard failure. */
  analyze(input: GeoAnalysisInput, opts?: GeoAnalysisOpts): Promise<GeoAnalysisOutcome>;
}

const priorityActionSchema = z.object({
  title: z.string(),
  why: z.string(),
  effort: z.enum(["laag", "midden", "hoog"]).catch("midden"),
});

const faqSchema = z.object({
  question: z.string(),
  why: z.string().default(""),
});

const aiAnswerSideSchema = z.object({
  answer: z.string().default(""),
  tags: z.array(z.string()).default([]),
});

const emptyAnswerComparison = {
  current: { answer: "", tags: [] as string[] },
  improved: { answer: "", tags: [] as string[] },
};

/**
 * Validates and normalizes whatever a provider returns into the canonical
 * GeoAnalysisResult. Coerces loose shapes (string vs array) so a provider
 * can be a little sloppy without breaking the pipeline.
 */
const categoryScoreSchema = z.object({
  key: z.string().default(""),
  label: z.string(),
  score: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  max: z.coerce.number().transform((n) => Math.max(1, Math.round(n))),
  summary: z.string().default(""),
});

const technicalCheckSchema = z.object({
  label: z.string(),
  status: z.enum(["goed", "aandacht", "blokker", "onbekend"]).catch("onbekend"),
  detail: z.string().default(""),
});

const criterionSchema = z.object({
  id: z.string(),
  verdict: z.enum(["voldoet", "deels", "niet", "nvt"]).catch("nvt"),
  finding: z.string().default(""),
  quote: z.string().default(""),
});

const actionSchema = z.object({
  title: z.string().default(""),
  criterion: z.string().default(""),
  why: z.string().default(""),
  where: z.string().default(""),
  before: z.string().default(""),
  after: z.string().default(""),
  owner: z.string().default(""),
  effort: z.enum(["laag", "midden", "hoog"]).catch("midden"),
  done_when: z.string().default(""),
  points: z.coerce.number().catch(0).default(0),
  evidence_grade: z.string().default(""),
  source: z.string().default(""),
});

export const geoAnalysisResultSchema = z.object({
  rubric_version: z.string().optional(),
  criteria: z.array(criterionSchema).default([]),
  actions: z.array(actionSchema).default([]),
  blocked: z.boolean().catch(false).default(false),
  unscored_reason: z.string().nullable().catch(null).default(null),
  hygiene: z.array(z.object({ label: z.string(), status: z.enum(["goed", "aandacht", "blokker", "onbekend"]).catch("onbekend"), detail: z.string().default("") })).default([]),
  scope_notes: z.array(z.string()).default([]),
  visibility_score: z.coerce
    .number()
    .catch(0)
    .default(0)
    .transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
  category_scores: z.array(categoryScoreSchema).default([]),
  technical_checks: z.array(technicalCheckSchema).default([]),
  short_summary: z.string(),
  what_ai_understands: z.string().default(""),
  likely_ai_positioning: z.string().default(""),
  ai_answer_comparison: z
    .object({ current: aiAnswerSideSchema, improved: aiAnswerSideSchema })
    .default(emptyAnswerComparison),
  // Filled by our multi-LLM probe (not the analysis model), persisted with the
  // result and re-read when a report is rendered live.
  llm_visibility: z
    .array(
      z.object({
        engine: z.string(),
        answer: z.string().default(""),
        found: z.boolean().catch(false),
      }),
    )
    .default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  missing_signals: z.array(z.string()).default([]),
  content_gaps: z.array(z.string()).default([]),
  recommended_pages: z.array(z.string()).default([]),
  recommended_faq_questions: z.array(faqSchema).default([]),
  quick_wins: z.array(z.string()).default([]),
  thirty_day_action_plan: z.array(priorityActionSchema).default([]),
  suggested_homepage_copy_improvements: z.array(z.string()).default([]),
});

export function parseAnalysisResult(value: unknown): GeoAnalysisResult {
  const parsed = geoAnalysisResultSchema.parse(value) as GeoAnalysisResult;
  // Versie: expliciet opgeslagen, anders "2" als er oordelen per criterium zijn,
  // anders de oude rubric (resultaten van vóór de versie-invoering).
  parsed.rubric_version =
    parsed.rubric_version || (parsed.criteria.length ? CURRENT_RUBRIC_VERSION : LEGACY_RUBRIC_VERSION);
  return rescore(parsed);
}

/**
 * Leidt de punten af. Bij rubric 2 komen ze uit de oordelen per criterium (het
 * taalmodel rekent niet zelf). De kop is altijd de som van de dimensies, met een
 * plafond zodra een poortwachter faalt.
 */
export function rescore(parsed: GeoAnalysisResult): GeoAnalysisResult {
  if (parsed.rubric_version === CURRENT_RUBRIC_VERSION && parsed.criteria.length) {
    parsed.criteria = normalizeCriteria(parsed.criteria);
    parsed.category_scores = scoreFromCriteria(parsed.criteria).category_scores;
  }
  if (parsed.category_scores.length > 0) {
    parsed.category_scores = reconcileToRubric(parsed.category_scores, rubricFor(parsed.rubric_version));
    const sum = parsed.category_scores.reduce((s, c) => s + c.score, 0);
    parsed.visibility_score = Math.max(0, Math.min(GEO_MAX_SCORE, sum));
  }
  if (parsed.blocked) {
    parsed.visibility_score = Math.min(parsed.visibility_score, SCORECARD.blocked_cap);
  }
  if (parsed.unscored_reason) parsed.visibility_score = 0;
  return parsed;
}

/**
 * JSON Schema handed to Claude's structured-output `output_config.format`.
 * Deliberately avoids unsupported constraints (minLength/maximum/etc.) and
 * sets additionalProperties:false on every object, per the structured-outputs
 * limitations.
 */
export const geoAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["voldoet", "deels", "niet", "nvt"] },
          finding: { type: "string" },
          quote: { type: "string" },
        },
        required: ["id", "verdict", "finding", "quote"],
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          criterion: { type: "string" },
          why: { type: "string" },
          where: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          effort: { type: "string", enum: ["laag", "midden", "hoog"] },
        },
        required: ["title", "criterion", "why", "where", "before", "after", "effort"],
      },
    },
    short_summary: { type: "string" },
    what_ai_understands: { type: "string" },
    likely_ai_positioning: { type: "string" },
    ai_answer_comparison: {
      type: "object",
      additionalProperties: false,
      properties: {
        current: {
          type: "object",
          additionalProperties: false,
          properties: {
            answer: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["answer", "tags"],
        },
        improved: {
          type: "object",
          additionalProperties: false,
          properties: {
            answer: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["answer", "tags"],
        },
      },
      required: ["current", "improved"],
    },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    missing_signals: { type: "array", items: { type: "string" } },
    content_gaps: { type: "array", items: { type: "string" } },
    recommended_pages: { type: "array", items: { type: "string" } },
    recommended_faq_questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          why: { type: "string" },
        },
        required: ["question", "why"],
      },
    },
    suggested_homepage_copy_improvements: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "criteria",
    "actions",
    "short_summary",
    "what_ai_understands",
    "likely_ai_positioning",
    "ai_answer_comparison",
    "strengths",
    "weaknesses",
    "missing_signals",
    "content_gaps",
    "recommended_pages",
    "recommended_faq_questions",
    "suggested_homepage_copy_improvements",
  ],
} as const;
