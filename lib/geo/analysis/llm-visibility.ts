import type { GeoAnalysisInput, LlmVisibilityRow } from "../types";
import { DEFAULT_ANALYSIS_MODEL } from "./providers/claude";
import { logError } from "../logger";

/**
 * Multi-LLM visibility probe. Asks the real LLMs (ChatGPT/OpenAI, Gemini,
 * Perplexity, Claude) what they know about the business by name and captures
 * each one's answer — the raw material for the report's "wat verschillende AI's
 * over je zeggen" table.
 *
 * Each engine is independent and best-effort: it only runs when its API key is
 * set, is time-boxed, and returns null on any error (so one slow/broken engine
 * never blocks the scan). Disable the whole probe with GEO_AI_SEARCH=off.
 * Model ids are overridable via GEO_OPENAI_MODEL / GEO_GEMINI_MODEL /
 * GEO_PERPLEXITY_MODEL / GEO_ANALYSIS_MODEL.
 */
const TIMEOUT_MS = 18_000;

export async function probeLlmVisibility(
  input: GeoAnalysisInput,
): Promise<LlmVisibilityRow[]> {
  if (process.env.GEO_AI_SEARCH === "off") return [];
  const rows = await Promise.all([
    probeOpenAI(input),
    probeGemini(input),
    probePerplexity(input),
    probeClaude(input),
  ]);
  return rows.filter((r): r is LlmVisibilityRow => !!r && !!r.answer.trim());
}

function buildPrompt(input: GeoAnalysisInput): string {
  const site = input.homepage_url ? ` (website: ${input.homepage_url})` : "";
  return `Iemand vraagt jou als AI-assistent: "Wat weet je over ${input.company_name}?"${site}. Beschrijf in maximaal ~60 woorden wat dit bedrijf doet, voor wie, en waar ze bekend om staan — uitsluitend op basis van wat je daadwerkelijk weet of online vindt. Ken je het bedrijf niet of heb je geen betrouwbare informatie, zeg dat dan eerlijk in één zin. Antwoord in het Nederlands.`;
}

/** Rough heuristic: did the model actually recognise the business? */
function detectFound(text: string): boolean {
  return !/geen (betrouwbare |specifieke )?(informatie|gegevens|kennis)|niet bekend|ken ik niet|weet ik niet|kan ik .*niet (vind|achterhal)|geen (resultaten|vermelding)|no (reliable )?information|not familiar|couldn't find|don't have (any )?(information|data)/i.test(
    text,
  );
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

function row(engine: string, text: string): LlmVisibilityRow {
  return { engine, answer: text.trim(), found: detectFound(text) };
}

async function probeOpenAI(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.GEO_OPENAI_MODEL || "gpt-4o-mini";
  try {
    const res = await timedFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 320,
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });
    if (!res.ok) {
      logError("llm.openai", `responded ${res.status}`);
      return null;
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? row("ChatGPT (OpenAI)", text) : null;
  } catch (error) {
    logError("llm.openai", error);
    return null;
  }
}

async function probeGemini(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEO_GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const res = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
          // Disable "thinking" — the 2.5 Flash models otherwise spend the token
          // budget on reasoning and can return empty text for a task this small.
          generationConfig: { maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logError("llm.gemini", `responded ${res.status} ${body.slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p?.text ?? "").join("")
      : "";
    return text.trim() ? row("Gemini (Google)", text) : null;
  } catch (error) {
    logError("llm.gemini", error);
    return null;
  }
}

async function probePerplexity(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  const model = process.env.GEO_PERPLEXITY_MODEL || "sonar";
  try {
    const res = await timedFetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });
    if (!res.ok) {
      logError("llm.perplexity", `responded ${res.status}`);
      return null;
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? row("Perplexity", text) : null;
  } catch (error) {
    logError("llm.perplexity", error);
    return null;
  }
}

async function probeClaude(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.GEO_ANALYSIS_MODEL || DEFAULT_ANALYSIS_MODEL;
  try {
    const res = await timedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });
    if (!res.ok) {
      logError("llm.claude", `responded ${res.status}`);
      return null;
    }
    const json = await res.json();
    const text = Array.isArray(json?.content)
      ? json.content
          .filter((b: { type?: string }) => b?.type === "text")
          .map((b: { text?: string }) => b?.text ?? "")
          .join("")
      : "";
    return text.trim() ? row("Claude (Anthropic)", text) : null;
  } catch (error) {
    logError("llm.claude", error);
    return null;
  }
}
