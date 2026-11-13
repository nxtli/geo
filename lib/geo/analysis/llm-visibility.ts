import type { GeoAnalysisInput, LlmVisibilityRow } from "../types";
import { ANALYSIS_MODELS, PROBE_MODELS, candidates } from "../models";
import { logError } from "../logger";

/**
 * Multi-LLM visibility probe. Asks the real LLMs (ChatGPT/OpenAI, Gemini,
 * Perplexity, Grok/xAI, Claude) what they know about the business by name and captures
 * each one's answer — the raw material for the report's "wat verschillende AI's
 * over je zeggen" table.
 *
 * Each engine is independent and best-effort: it only runs when its API key is
 * set, is time-boxed, and returns null on any error (so one slow/broken engine
 * never blocks the scan). Disable the whole probe with GEO_AI_SEARCH=off.
 * De modellen staan in lib/geo/models.ts. Elke engine probeert eerst het
 * nieuwste model en valt bij een fout terug op het vorige. Een modelnaam die
 * een leverancier uitzet, breekt de regel in het rapport dus niet meteen.
 * Overschrijven kan met GEO_OPENAI_MODEL / GEO_GEMINI_MODEL /
 * GEO_PERPLEXITY_MODEL / GEO_GROK_MODEL / GEO_ANALYSIS_MODEL.
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
    probeGrok(input),
    probeClaude(input),
  ]);
  return rows.filter((r): r is LlmVisibilityRow => !!r && !!r.answer.trim());
}

/**
 * De vraag bevat bewust GEEN URL: met een domeinnaam erbij leidt een model
 * zonder zoekfunctie het antwoord af uit de naam, en dat lijkt dan op kennis.
 */
function buildPrompt(input: GeoAnalysisInput): string {
  return `Iemand vraagt jou als AI-assistent: "Wat weet je over ${input.company_name}?" Beschrijf in maximaal ~60 woorden wat dit bedrijf doet, voor wie, en waar ze bekend om staan — uitsluitend op basis van wat je daadwerkelijk weet of online vindt. Ken je het bedrijf niet of heb je geen betrouwbare informatie, zeg dat dan eerlijk in één zin. Antwoord in het Nederlands.`;
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

/**
 * Probeert de modellen op volgorde. Het eerste bruikbare antwoord telt.
 * Elke poging logt zijn eigen fout, zodat de logs laten zien welk model
 * niet (meer) werkt.
 */
async function firstAnswer(
  scope: string,
  models: string[],
  attempt: (model: string) => Promise<string | null>,
): Promise<string | null> {
  for (const model of models) {
    try {
      const text = await attempt(model);
      if (text && text.trim()) return text;
      logError(scope, `leeg antwoord (model ${model})`);
    } catch (error) {
      logError(scope, `model ${model}: ${error instanceof Error ? error.message : String(error)}`);
      // Een time-out kost al de volle wachttijd: niet nog een model proberen.
      if (error instanceof Error && error.name === "AbortError") return null;
    }
  }
  return null;
}

async function failure(res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");
  return new Error(`responded ${res.status} ${body.slice(0, 200)}`);
}

async function probeOpenAI(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const text = await firstAnswer("llm.openai", candidates("GEO_OPENAI_MODEL", PROBE_MODELS.openai), async (model) => {
    const res = await timedFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        // Nieuwe modellen redeneren eerst: die tokens tellen mee in de limiet.
        max_completion_tokens: 2000,
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });
    if (!res.ok) throw await failure(res);
    const json = await res.json();
    const out = json?.choices?.[0]?.message?.content;
    return typeof out === "string" ? out : null;
  });
  return text ? row("ChatGPT (OpenAI)", text) : null;
}

async function probeGemini(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const text = await firstAnswer("llm.gemini", candidates("GEO_GEMINI_MODEL", PROBE_MODELS.gemini), async (model) => {
    // Gemini 2.5 kent thinkingBudget, de 3-serie kent thinkingLevel. Zonder
    // rem gaat het tokenbudget op aan redeneren en blijft het antwoord leeg.
    const legacy = /^gemini-2\./.test(model);
    const generationConfig = legacy
      ? { maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
      : { maxOutputTokens: 4000, thinkingConfig: { thinkingLevel: "low" } };
    const res = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(input) }] }], generationConfig }),
      },
    );
    if (!res.ok) throw await failure(res);
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts)
      ? parts
          .filter((p: { thought?: boolean }) => !p?.thought)
          .map((p: { text?: string }) => p?.text ?? "")
          .join("")
      : null;
  });
  return text ? row("Gemini (Google)", text) : null;
}

/** Haalt de antwoordtekst uit een antwoord in het Responses-formaat. */
export function responsesOutputText(json: unknown): string {
  const j = json as { output_text?: unknown; output?: unknown };
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text;
  const items = Array.isArray(j?.output) ? j.output : [];
  return items
    .filter((i: { type?: string }) => i?.type === "message")
    .flatMap((i: { content?: unknown }) => (Array.isArray(i?.content) ? i.content : []))
    .filter((c: { type?: string }) => c?.type === "output_text")
    .map((c: { text?: string }) => c?.text ?? "")
    .join("");
}

/**
 * Perplexity. De Sonar-koppeling (chat/completions) is op 27 september 2026
 * gestopt. De opvolger is de Agent API: POST /v1/agent, met "effort" in plaats
 * van een modelnaam ("fast" is de opvolger van Sonar). De waarde "sonar" blijft
 * als laatste poging staan voor accounts waar de oude koppeling nog werkt.
 */
async function probePerplexity(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const text = await firstAnswer("llm.perplexity", candidates("GEO_PERPLEXITY_MODEL", PROBE_MODELS.perplexity), async (mode) => {
    if (mode === "sonar" || mode.startsWith("sonar-")) {
      const res = await timedFetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({ model: mode, max_tokens: 400, messages: [{ role: "user", content: buildPrompt(input) }] }),
      });
      if (!res.ok) throw await failure(res);
      const json = await res.json();
      const out = json?.choices?.[0]?.message?.content;
      return typeof out === "string" ? out : null;
    }
    const res = await timedFetch("https://api.perplexity.ai/v1/agent", {
      method: "POST",
      headers,
      body: JSON.stringify({ effort: mode, input: buildPrompt(input) }),
    });
    if (!res.ok) throw await failure(res);
    // Bronverwijzingen als [1][3] zeggen de lezer niets zonder de bronnenlijst.
    return responsesOutputText(await res.json()).replace(/\s*\[\d+\]/g, "");
  });
  return text ? row("Perplexity", text) : null;
}

/** Grok (xAI). De API volgt het OpenAI-formaat. Grok-modellen redeneren eerst: de ruime limiet voorkomt een leeg antwoord. */
async function probeGrok(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const text = await firstAnswer("llm.grok", candidates("GEO_GROK_MODEL", PROBE_MODELS.grok), async (model) => {
    const res = await timedFetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content: buildPrompt(input) }] }),
    });
    if (!res.ok) throw await failure(res);
    const json = await res.json();
    const out = json?.choices?.[0]?.message?.content;
    return typeof out === "string" ? out : null;
  });
  return text ? row("Grok (xAI)", text) : null;
}

async function probeClaude(input: GeoAnalysisInput): Promise<LlmVisibilityRow | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const text = await firstAnswer("llm.claude", candidates("GEO_ANALYSIS_MODEL", ANALYSIS_MODELS), async (model) => {
    const res = await timedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      // Ruime limiet: bij de nieuwe modellen tellen denktokens mee.
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content: buildPrompt(input) }] }),
    });
    if (!res.ok) throw await failure(res);
    const json = await res.json();
    return Array.isArray(json?.content)
      ? json.content
          .filter((b: { type?: string }) => b?.type === "text")
          .map((b: { text?: string }) => b?.text ?? "")
          .join("")
      : null;
  });
  return text ? row("Claude (Anthropic)", text) : null;
}
