import type { GeoAnalysisInput, GeoAnalysisResult, GeoUsage } from "../types";
import { logInfo } from "../logger";
import type { GeoAnalysisOpts, GeoAnalysisProvider } from "./provider";
import { MockAnalysisProvider } from "./providers/mock";
import { ClaudeAnalysisProvider } from "./providers/claude";
import { GeoSkillAnalysisProvider } from "./providers/geo-skill";
import { probeLlmVisibility } from "./llm-visibility";
import { FactsOnlyProvider } from "./providers/facts";
import { logError } from "../logger";
import { rescore } from "./provider";
import { buildActions, deriveLegacyLists } from "./scorecard";
import { CURRENT_RUBRIC_VERSION } from "./rubric";
import { buildFactLayer } from "../facts/checks";
import { EVIDENCE, evidenceIsStale } from "../knowledge";

/**
 * Analysis provider registry + selection.
 *
 * Default (auto) selection order:
 *   1. GEO_ANALYSIS_PROVIDER env (explicit: "claude" | "geo-skill" | "mock")
 *   2. The Claude provider, which runs the NXTLI `geo-page-checker` methodology
 *      one-shot (see lib/geo/analysis/prompt.ts) — needs ANTHROPIC_API_KEY.
 *   3. The deterministic mock (always available — keeps the flow working).
 *
 * `geo-skill` (invoking the interactive geo-page-checker skill via the Messages
 * API container.skills) is registered but NOT auto-selected: that skill is
 * built for interactive Cowork use (checkpoints, human-assisted PageSpeed, no
 * container internet) and is a poor fit for a one-shot automated scan. Use it
 * only via an explicit GEO_ANALYSIS_PROVIDER=geo-skill override.
 */
const registry: Record<string, GeoAnalysisProvider> = {};

function register(provider: GeoAnalysisProvider) {
  registry[provider.id] = provider;
}

register(new GeoSkillAnalysisProvider());
register(new ClaudeAnalysisProvider());
register(new MockAnalysisProvider());
register(new FactsOnlyProvider());

export function selectProvider(): GeoAnalysisProvider {
  const explicit = process.env.GEO_ANALYSIS_PROVIDER?.trim();
  if (explicit && registry[explicit]) return registry[explicit];

  // Zonder werkend taalmodel: alleen feiten, geen geschatte score. De mock
  // draait uitsluitend op een expliciete GEO_ANALYSIS_PROVIDER=mock (lokaal).
  if (registry["claude"].isConfigured()) return registry["claude"];
  return registry["facts"];
}

/**
 * Hard wall-clock budget for the analysis step, kept under the route's
 * maxDuration (120s). If a provider blows past this we abandon it and fall back
 * to the mock, so the request always reaches a terminal state (and the scan row
 * is never left stuck on "scanning") well before the platform kills the function.
 */
const ANALYSIS_DEADLINE_MS = 230_000;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("analysis_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface RunAnalysisOutcome {
  result: GeoAnalysisResult;
  providerId: string;
  /** True when we fell back to the mock because the real engine failed. */
  degraded: boolean;
  /** Token usage for cost reporting (absent for the mock). */
  usage?: GeoUsage;
}

/**
 * Run the GEO analysis with the selected provider. On a hard failure of a
 * real provider, fall back to the mock so the visitor always gets a result —
 * the caller learns via `degraded` so it can flag a manual follow-up.
 */
export async function runGeoAnalysis(
  input: GeoAnalysisInput,
  opts?: GeoAnalysisOpts,
): Promise<RunAnalysisOutcome> {
  const provider = selectProvider();
  logInfo("analysis", `using provider "${provider.id}"`);

  // Multi-LLM visibility probe runs ALONGSIDE the analysis (best-effort,
  // time-boxed inside), so it never adds to the critical path — what each real
  // LLM (ChatGPT, Gemini, Perplexity, Grok, Claude) returns about the business is
  // grafted onto the report's comparison table afterwards.
  // Het merk op de pagina kan afwijken van de ingevulde bedrijfsnaam (bureau
  // scant de site van een product of klant). De steekproef vraagt naar het
  // merk van de pagina.
  const subject = subjectName(input);
  const probe = probeLlmVisibility({ ...input, company_name: subject }).catch(() => [] as Awaited<ReturnType<typeof probeLlmVisibility>>);

  try {
    const { result, usage } = await withDeadline(
      provider.analyze(input, opts),
      ANALYSIS_DEADLINE_MS,
    );
    finalizeAnalysis(result, input);
    await applyLlmVisibility(result, probe);
    return { result, usage, providerId: provider.id, degraded: provider.id === "facts" };
  } catch (error) {
    logError("analysis.run", error);
    if (provider.id === "mock" || provider.id === "facts") throw new Error("analysis_failed");
    // Real provider failed or exceeded the deadline — fall back to the mock so
    // the visitor still gets a (flagged degraded) report within the time budget.
    logInfo("analysis", `provider "${provider.id}" failed/timed out, alleen feiten`);
    const { result } = await registry["facts"].analyze(input);
    finalizeAnalysis(result, input);
    await applyLlmVisibility(result, probe);
    return { result, providerId: "facts", degraded: true };
  }
}

/**
 * Legt de feitenlaag over het resultaat van de provider:
 *  - technische checks en hygiëne komen uit gemeten feiten, niet uit het model
 *  - feiten beslissen de criteria die ze kunnen beslissen
 *  - een falende poortwachter topt de score af
 *  - elk verloren punt krijgt een advies met eigenaar en "klaar als"
 */
export function finalizeAnalysis(result: GeoAnalysisResult, input: GeoAnalysisInput): GeoAnalysisResult {
  const layer = buildFactLayer(input);
  result.technical_checks = layer.technical_checks;
  result.hygiene = layer.hygiene;
  result.blocked = layer.blocked;
  result.rubric_version = result.rubric_version || CURRENT_RUBRIC_VERSION;

  const fetched = Boolean(input.facts);
  result.unscored_reason = !fetched
    ? "De pagina kon niet worden opgehaald. Zonder de inhoud is er geen score."
    : result.criteria.length || result.category_scores.length
      ? null
      : result.unscored_reason || "De inhoudelijke beoordeling is niet gelukt. Er is daarom geen score.";
  const subject = subjectName(input);
  result.subject_name = subject;

  if (result.criteria.length) {
    const forced = new Map(layer.forced.map((c) => [c.id, c]));
    result.criteria = result.criteria.map((c) => forced.get(c.id) ?? c);
    for (const f of layer.forced) {
      if (!result.criteria.some((c) => c.id === f.id)) result.criteria.push(f);
    }
  }
  rescore(result);

  if (result.criteria.length) {
    result.actions = buildActions(result.criteria, result.actions, layer.gateActions);
    Object.assign(result, deriveLegacyLists(result.actions));
  } else {
    result.actions = layer.gateActions;
  }

  const nameNote =
    subject !== input.company_name
      ? [`Je vulde "${input.company_name}" in als bedrijfsnaam. De pagina hoort bij "${subject}". De beoordeling en de steekproef gaan over "${subject}".`]
      : [];
  result.scope_notes = [
    ...nameNote,
    "De score is een indicatie en een richtlijn, geen garantie. Deze scan beoordeelt of één pagina geschikt is als bron voor AI-zoekmachines. Hij meet niet hoe vaak een AI-tool het merk noemt of aanbeveelt.",
    "Gevonden worden komt vóór gekozen worden. Of een AI-tool je pagina vindt, hangt ook af van je positie in gewone zoekresultaten en je bekendheid. De adviezen in dit rapport helpen vooral bij de stap daarna: als bron gekozen worden.",
    "Aanbevolen worden hangt ook af van wat anderen over je schrijven. AI-tools gebruiken ook bronnen van derden, zoals vakmedia, reviews en vergelijkingssites, en noemen bekende merken vaker. Die vermeldingen ziet een scan van één pagina niet. Werk daar apart aan.",
    (input.buyer?.origin ?? "bezoeker") === "marketingbrein"
      ? "De klantvragen komen uit goedgekeurde kennis in het Marketingbrein."
      : "De klantvragen zijn door de aanvrager ingevuld en niet getoetst bij kopers.",
    "Ook niet gemeten: laadsnelheid en blokkades door firewall of CDN.",
    `Kennisbank ${EVIDENCE.version}, herzien op ${EVIDENCE.reviewed}.${evidenceIsStale() ? " Let op: de kennisbank is toe aan herziening." : ""}`,
  ];
  return result;
}

/**
 * De naam waar de analyse over gaat: de merknaam die de pagina zelf opgeeft
 * (og:site_name of schema), anders de ingevulde bedrijfsnaam.
 */
export function subjectName(input: GeoAnalysisInput): string {
  const site = input.facts?.siteName?.trim();
  const given = (input.company_name || "").trim();
  if (!site) return given;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!given || norm(site) === norm(given)) return given || site;
  return site;
}

/** Graft the REAL per-LLM answers onto the result's comparison table. */
async function applyLlmVisibility(
  result: GeoAnalysisResult,
  probePromise: Promise<Awaited<ReturnType<typeof probeLlmVisibility>>>,
): Promise<void> {
  try {
    const rows = await probePromise;
    if (rows.length) result.llm_visibility = rows;
  } catch {
    /* best-effort — never break the scan on the probe */
  }
}

export type { GeoAnalysisProvider };
