import Anthropic from "@anthropic-ai/sdk";
import type { ResearchInput } from "../../types";
import {
  parseResearchResult,
  researchJsonSchema,
  type ResearchOutcome,
  type ResearchProvider,
} from "../provider";
import { RESEARCH_SYSTEM_PROMPT, buildResearchPrompt } from "../prompt";
import { fetchedUrls } from "../fetch";
import { logError } from "../../../geo/logger";

/**
 * Standaardmodel voor de research. Sonnet is de bewuste keuze: het is een
 * classificatie- en samenvattingstaak op tekst die wij al hebben opgehaald, en
 * een batch van 100 bedrijven moet betaalbaar blijven. Override met
 * RADIO_RESEARCH_MODEL als een ander model gewenst of beschikbaar is.
 */
export const DEFAULT_RESEARCH_MODEL = "claude-sonnet-5";

/** Timeout per request, ruim onder het budget van de batch-runner. */
export const RESEARCH_REQUEST_TIMEOUT_MS = 90_000;

/**
 * Research via de Claude API met structured outputs.
 *
 * Werkt uitsluitend op de tekst die de fetcher heeft opgehaald: eerst
 * gestructureerde data verzamelen, dan pas AI laten analyseren. Het model krijgt
 * geen internettoegang en kan dus niets "erbij zoeken" — precies de bedoeling,
 * want daardoor is elke bron verifieerbaar.
 *
 * Vereist ANTHROPIC_API_KEY (alleen server-side).
 */
export class ClaudeResearchProvider implements ResearchProvider {
  readonly id = "claude";

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async research(input: ResearchInput): Promise<ResearchOutcome> {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: RESEARCH_REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    });
    const model = process.env.RADIO_RESEARCH_MODEL || DEFAULT_RESEARCH_MODEL;

    const params = {
      model,
      max_tokens: 8000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: researchJsonSchema },
      },
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildResearchPrompt(input) }],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = client.messages.stream(params as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await stream.finalMessage();

    if (response?.stop_reason === "refusal") {
      logError("radio.research.claude", "model gaf een refusal terug");
      throw new Error("research_refused");
    }

    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(response?.content)
      ? response.content
      : [];
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();

    if (!text) throw new Error("empty_research_response");

    const { result, rejected_sources } = parseResearchResult(
      JSON.parse(stripCodeFence(text)),
      {
        // De harde grens: alleen pagina's die we echt hebben opgehaald.
        allowedUrls: fetchedUrls(input.web),
        fallbackCompanyName: input.company_name,
      },
    );

    return {
      result,
      rejected_sources,
      usage: {
        model: typeof response?.model === "string" ? response.model : model,
        input_tokens: Number(response?.usage?.input_tokens ?? 0),
        output_tokens: Number(response?.usage?.output_tokens ?? 0),
      },
    };
  }
}

/** Wees tolerant voor een ```json-fence om de JSON. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}
