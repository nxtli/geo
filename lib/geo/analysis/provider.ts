import { z } from "zod";
import type { GeoAnalysisInput, GeoAnalysisResult, GeoUsage } from "../types";

/** What a provider returns: the result plus optional token usage for costing. */
export interface GeoAnalysisOutcome {
  result: GeoAnalysisResult;
  usage?: GeoUsage;
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
  analyze(input: GeoAnalysisInput): Promise<GeoAnalysisOutcome>;
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

/**
 * Validates and normalizes whatever a provider returns into the canonical
 * GeoAnalysisResult. Coerces loose shapes (string vs array) so a provider
 * can be a little sloppy without breaking the pipeline.
 */
export const geoAnalysisResultSchema = z.object({
  visibility_score: z.coerce
    .number()
    .transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
  short_summary: z.string(),
  what_ai_understands: z.string().default(""),
  likely_ai_positioning: z.string().default(""),
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
  return geoAnalysisResultSchema.parse(value) as GeoAnalysisResult;
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
    visibility_score: { type: "integer" },
    short_summary: { type: "string" },
    what_ai_understands: { type: "string" },
    likely_ai_positioning: { type: "string" },
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
    quick_wins: { type: "array", items: { type: "string" } },
    thirty_day_action_plan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          why: { type: "string" },
          effort: { type: "string", enum: ["laag", "midden", "hoog"] },
        },
        required: ["title", "why", "effort"],
      },
    },
    suggested_homepage_copy_improvements: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "visibility_score",
    "short_summary",
    "what_ai_understands",
    "likely_ai_positioning",
    "strengths",
    "weaknesses",
    "missing_signals",
    "content_gaps",
    "recommended_pages",
    "recommended_faq_questions",
    "quick_wins",
    "thirty_day_action_plan",
    "suggested_homepage_copy_improvements",
  ],
} as const;
