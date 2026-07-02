import Anthropic from "@anthropic-ai/sdk";
import type { GeoAnalysisInput } from "../types";
import { DEFAULT_ANALYSIS_MODEL } from "./providers/claude";
import { logError, logInfo } from "../logger";

/**
 * Live AI-visibility probe. Runs a real Claude query WITH the web_search tool,
 * so we capture how an AI search assistant *actually* answers about the business
 * right now (grounded in the live web) — not an estimate. Feeds the "hoe het nu
 * staat" side of the report's before/after.
 *
 * Best-effort: needs ANTHROPIC_API_KEY, is time-boxed, and returns null on any
 * failure so the scan never depends on it. Disable with GEO_AI_SEARCH=off.
 */
export interface AiSearchResult {
  /** The AI search assistant's real, web-grounded answer. */
  answer: string;
  /** Whether the business appears to be mentioned/found in that answer. */
  found: boolean;
  /** The query that was asked. */
  query: string;
}

const PROBE_TIMEOUT_MS = 22_000;

export async function runAiVisibilityProbe(
  input: GeoAnalysisInput,
): Promise<AiSearchResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.GEO_AI_SEARCH === "off") return null;

  const query = pickQuery(input);
  try {
    const client = new Anthropic({ apiKey, timeout: PROBE_TIMEOUT_MS, maxRetries: 0 });
    const model = process.env.GEO_ANALYSIS_MODEL || DEFAULT_ANALYSIS_MODEL;

    const prompt = `Je bent een AI-zoekassistent met live webtoegang (zoals ChatGPT Search, Perplexity of Google AI Overviews). Een gebruiker stelt je deze vraag:

"${query}"

Zoek op het web en beantwoord de vraag zoals jij dat normaal zou doen. Noem concreet welke bedrijven, aanbieders of oplossingen je zou aanraden. Vertel daarna expliciet: kom je ${input.company_name} (${input.homepage_url}) tegen bij deze vraag — en zo ja, hóe beschrijf je ze en met welke feiten? Als je ${input.company_name} niet vindt of niet zou noemen, zeg dat dan eerlijk en duidelijk.

Antwoord in het Nederlands, kort en feitelijk (max ~120 woorden), uitsluitend op basis van wat je online daadwerkelijk vindt. Verzin niets.`;

    const params = {
      model,
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: prompt }],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.messages.create(params as any);
    const text = (Array.isArray(res?.content) ? res.content : [])
      .filter((b: { type?: string; text?: string }) => b?.type === "text" && typeof b.text === "string")
      .map((b: { text?: string }) => b.text as string)
      .join("")
      .trim();

    if (!text) return null;
    const notFound =
      /niet gevonden|niet (kunnen |te )?vind|niet tegengekomen|geen (informatie|resultaten|vermelding)|niet noemen|kom ik .*niet tegen|niet aangetroffen/i.test(
        text,
      );
    logInfo("ai-visibility", `probe done for "${query}" (found=${!notFound})`);
    return { answer: text, found: !notFound, query };
  } catch (error) {
    logError("ai-visibility.probe", error);
    return null;
  }
}

/** The most relevant thing to test: the visitor's own desired AI query. */
function pickQuery(input: GeoAnalysisInput): string {
  const first = (input.desired_queries || "")
    .split(/[\n,;•·]+/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return first || `Wat is ${input.company_name} en wat bieden ze aan?`;
}
