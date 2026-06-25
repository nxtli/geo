import Anthropic from "@anthropic-ai/sdk";
import type { GeoAnalysisInput, GeoAnalysisResult } from "../../types";
import {
  geoAnalysisJsonSchema,
  parseAnalysisResult,
  type GeoAnalysisProvider,
} from "../provider";
import { GEO_SYSTEM_PROMPT, buildAnalysisPrompt } from "../prompt";
import { logError } from "../../logger";

/**
 * Direct Claude API analysis provider.
 *
 * Uses the Anthropic Messages API with structured outputs so the model is
 * constrained to the GEO analysis JSON schema. Default model is
 * claude-opus-4-8; override with GEO_ANALYSIS_MODEL.
 *
 * Requires ANTHROPIC_API_KEY (server-side only — never expose to the client).
 *
 * Request params are built untyped and cast at the call boundary: adaptive
 * thinking and output_config are recent API additions that may not be present
 * in the installed SDK's static types, but the SDK forwards the body as-is.
 */
export class ClaudeAnalysisProvider implements GeoAnalysisProvider {
  readonly id = "claude";

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async analyze(input: GeoAnalysisInput): Promise<GeoAnalysisResult> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.GEO_ANALYSIS_MODEL || "claude-opus-4-8";

    const params = {
      model,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: geoAnalysisJsonSchema },
      },
      system: GEO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAnalysisPrompt(input) }],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await client.messages.create(params as any);

    if (response?.stop_reason === "refusal") {
      logError("analysis.claude", "model returned refusal stop_reason");
      throw new Error("analysis_refused");
    }

    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(
      response?.content,
    )
      ? response.content
      : [];
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();

    if (!text) throw new Error("empty_analysis_response");

    return parseAnalysisResult(JSON.parse(stripCodeFence(text)));
  }
}

/** Be tolerant of a stray ```json fence around the JSON. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}
