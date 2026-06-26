import Anthropic from "@anthropic-ai/sdk";
import type { GeoAnalysisInput } from "../../types";
import {
  geoAnalysisJsonSchema,
  parseAnalysisResult,
  type GeoAnalysisOpts,
  type GeoAnalysisOutcome,
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

  async analyze(
    input: GeoAnalysisInput,
    opts?: GeoAnalysisOpts,
  ): Promise<GeoAnalysisOutcome> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Default to the fast Sonnet model: a public scan must finish well within
    // the serverless timeout, and this scoring task doesn't need Opus depth.
    // Override with GEO_ANALYSIS_MODEL. No extended thinking + low effort keeps
    // latency low; streaming avoids SDK request timeouts.
    const model = process.env.GEO_ANALYSIS_MODEL || "claude-sonnet-4-6";

    const params = {
      model,
      max_tokens: 6000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: geoAnalysisJsonSchema },
      },
      system: GEO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAnalysisPrompt(input) }],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = client.messages.stream(params as any);

    // Report live progress from the streamed tokens (fraction 0..1, throttled).
    if (opts?.onProgress) {
      let chars = 0;
      let last = 0;
      // ~4500 chars is a typical full report; cap at 0.95 until completion.
      stream.on("text", (delta: string) => {
        chars += delta.length;
        const frac = Math.min(0.95, chars / 4500);
        if (frac - last >= 0.02) {
          last = frac;
          opts.onProgress?.(frac);
        }
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await stream.finalMessage();

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

    const result = parseAnalysisResult(JSON.parse(stripCodeFence(text)));
    const usage = {
      model: typeof response?.model === "string" ? response.model : model,
      input_tokens: Number(response?.usage?.input_tokens ?? 0),
      output_tokens: Number(response?.usage?.output_tokens ?? 0),
    };
    return { result, usage };
  }
}

/** Be tolerant of a stray ```json fence around the JSON. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}
