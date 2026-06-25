import type { GeoAnalysisInput, GeoAnalysisResult } from "../../types";
import { parseAnalysisResult, type GeoAnalysisProvider } from "../provider";
import { buildAnalysisPrompt } from "../prompt";
import { logError } from "../../logger";

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  INTEGRATION SEAM — the existing NXTLI Claude skill plugs in HERE.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * This provider is intentionally a thin, well-typed adapter. When the exact
 * contract of the existing NXTLI GEO analysis skill is known, implement the
 * call inside `analyze()` and map its response onto `GeoAnalysisResult`.
 *
 * It is wired so that swapping in the real skill requires no changes anywhere
 * else: set GEO_SKILL_ENDPOINT (+ optional GEO_SKILL_API_KEY) and select it
 * with GEO_ANALYSIS_PROVIDER=existing-skill (or let the registry auto-pick it
 * once GEO_SKILL_ENDPOINT is present).
 *
 * The default implementation below assumes a simple HTTP skill endpoint that
 * accepts the GeoAnalysisInput (plus a rendered prompt) and returns JSON
 * matching the analysis schema. Adjust the request/response mapping to match
 * the real skill — e.g. a Claude Agent Skill invocation, an internal NXTLI
 * service, or a queue. `parseAnalysisResult` will coerce/validate the output,
 * so the skill output only needs to be close to the schema.
 */
export class ExistingSkillAnalysisProvider implements GeoAnalysisProvider {
  readonly id = "existing-skill";

  isConfigured(): boolean {
    return Boolean(process.env.GEO_SKILL_ENDPOINT);
  }

  async analyze(input: GeoAnalysisInput): Promise<GeoAnalysisResult> {
    const endpoint = process.env.GEO_SKILL_ENDPOINT;
    if (!endpoint) throw new Error("existing_skill_not_configured");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.GEO_SKILL_API_KEY) {
      headers.Authorization = `Bearer ${process.env.GEO_SKILL_API_KEY}`;
    }

    try {
      // TODO(NXTLI): replace this request/response mapping with the real skill
      // contract. The shape below is a sensible default for an HTTP skill.
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          input,
          prompt: buildAnalysisPrompt(input),
        }),
      });

      if (!res.ok) {
        throw new Error(`skill responded ${res.status}`);
      }

      const json = await res.json();
      // The skill may wrap the result; accept either the bare result or {result}.
      const candidate = json?.result ?? json;
      return parseAnalysisResult(candidate);
    } catch (error) {
      logError("analysis.existing-skill", error);
      throw error instanceof Error ? error : new Error("existing_skill_failed");
    }
  }
}
