import type { GeoAnalysisResult } from "../types";

/**
 * De criteria hebben intern een code (A1, B2, U3). Die code zegt de lezer
 * niets en staat nergens uitgelegd. Dit haalt verwijzingen ernaar uit alle
 * teksten die de lezer ziet, ook uit rapporten die al zijn opgeslagen.
 */
const CODE = "[A-HPU][1-5]";
const CODE_LIST = `${CODE}(?:\\s*(?:,|/|en|t/m|tot en met)\\s*${CODE})*`;
const PAREN_RE = new RegExp(`\\s*\\((?:criteri(?:um|a)\\s+)?${CODE_LIST}\\)`, "g");
const WORD_RE = new RegExp(`\\s*\\b(?:bij |voor |van )?criteri(?:um|a)\\s+${CODE_LIST}\\b`, "gi");

export function stripCriterionCodes(text: string): string {
  return text
    .replace(PAREN_RE, "")
    .replace(WORD_RE, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Velden met een code die de code zelf nodig heeft. */
const KEEP = new Set(["criterion", "id", "rubric_version"]);

function walk<T>(value: T): T {
  if (typeof value === "string") return stripCriterionCodes(value) as T;
  if (Array.isArray(value)) return value.map(walk) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = KEEP.has(k) ? v : walk(v);
    return out as T;
  }
  return value;
}

export function cleanForReader(analysis: GeoAnalysisResult): GeoAnalysisResult {
  return walk(analysis);
}
