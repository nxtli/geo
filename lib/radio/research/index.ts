/**
 * Research-registry en orkestratie.
 *
 * De volgorde is opzettelijk: eerst GESTRUCTUREERDE publieke data ophalen, dan
 * pas de AI erop laten kijken, dan DETERMINISTISCH rekenen. Elke stap kan apart
 * falen zonder de andere mee te sleuren.
 *
 * Providerkeuze:
 *   1. RADIO_RESEARCH_PROVIDER ("claude" | "heuristic") — expliciet.
 *   2. "claude" als ANTHROPIC_API_KEY aanwezig is.
 *   3. anders "heuristic", zodat de tool ook zonder API-key werkt.
 */

import type {
  Prospect,
  ProspectStatus,
  ResearchResult,
  ResearchUsage,
  RunRecord,
} from "../types";
import { confidenceLabel, scoreProspect } from "../scoring";
import { getProspect, recordRun, updateProspect } from "../store";
import { callCostUsd } from "../../geo/pricing";
import { fetchCompanyWebData } from "./fetch";
import { gatherConnectorSources } from "./connectors";
import type { ResearchProvider } from "./provider";
import { ClaudeResearchProvider } from "./providers/claude";
import { HeuristicResearchProvider } from "./providers/heuristic";
import { logError, logInfo } from "../../geo/logger";

export type { ResearchProvider, ResearchOutcome } from "./provider";
export { parseResearchResult, researchJsonSchema } from "./provider";
export { fetchCompanyWebData } from "./fetch";

const registry: Record<string, ResearchProvider> = {};

function register(provider: ResearchProvider): void {
  registry[provider.id] = provider;
}

register(new ClaudeResearchProvider());
register(new HeuristicResearchProvider());

export function selectResearchProvider(): ResearchProvider {
  const explicit = process.env.RADIO_RESEARCH_PROVIDER?.trim();
  if (explicit && registry[explicit]) return registry[explicit];
  if (registry.claude.isConfigured()) return registry.claude;
  return registry.heuristic;
}

/** Beschrijf de actieve provider voor de UI. */
export function describeResearchProvider(): { id: string; ai: boolean } {
  const provider = selectResearchProvider();
  return { id: provider.id, ai: provider.id !== "heuristic" };
}

/* -------------------------------------------------------------------------- */
/* Eén prospect onderzoeken                                                   */
/* -------------------------------------------------------------------------- */

export interface ResearchProspectResult {
  prospect: Prospect;
  providerId: string;
  /** True als we op de heuristiek zijn teruggevallen na een AI-fout. */
  degraded: boolean;
  /** Aantal pagina's dat is opgehaald. */
  sourceCount: number;
  /** Bronnen die de AI noemde maar die niet verifieerbaar waren. */
  rejectedSources: string[];
  usage?: ResearchUsage;
  /** Gebruikersveilige melding als er iets niet lukte. */
  warning?: string;
}

/** Statussen die de research mag overschrijven (pre-triage). */
const AUTO_STATUS_OVERRIDABLE: ReadonlySet<ProspectStatus> = new Set<ProspectStatus>([
  "New",
  "Researched",
  "Tier A",
  "Tier B",
  "Tier C",
  "Skip",
]);

/**
 * Onderzoek en score één prospect, en schrijf het resultaat weg.
 *
 * Faalt de AI-provider, dan valt hij terug op de heuristiek: Eric krijgt dan een
 * (gemarkeerd) resultaat in plaats van niets.
 */
export async function researchProspect(id: string): Promise<ResearchProspectResult | null> {
  const existing = await getProspect(id);
  if (!existing) return null;

  // 1. Publieke data ophalen: eigen website + eventuele connectors. Connector-
  // bronnen komen in dezelfde lijst en lopen dus door dezelfde bronverificatie.
  const web = await fetchCompanyWebData(existing.website);
  const connectorSources = await gatherConnectorSources({
    company_name: existing.company_name,
    website: existing.website,
  });
  if (connectorSources.length > 0) {
    web.sources = [...web.sources, ...connectorSources];
  }
  const sourceCount = web.sources.length;

  const input = {
    company_name: existing.company_name,
    website: existing.website,
    hints: {
      industry: existing.industry,
      city: existing.city,
      segment: existing.segment,
      notes: existing.notes,
    },
    web,
  };

  // 2. Analyseren.
  const provider = selectResearchProvider();
  let result: ResearchResult;
  let usage: ResearchUsage | undefined;
  let rejectedSources: string[] = [];
  let providerId = provider.id;
  let degraded = false;
  let warning: string | undefined;

  try {
    const outcome = await provider.research(input);
    result = outcome.result;
    usage = outcome.usage;
    rejectedSources = outcome.rejected_sources;
  } catch (error) {
    logError("radio.research", error);
    if (provider.id === "heuristic") {
      return {
        prospect: existing,
        providerId: provider.id,
        degraded: false,
        sourceCount,
        rejectedSources: [],
        warning: "De analyse is mislukt. Probeer het opnieuw.",
      };
    }
    // Terugvallen op de heuristiek zodat er wél een beoordeling komt.
    logInfo("radio.research", `provider "${provider.id}" faalde — terug naar heuristiek`);
    const fallback = await registry.heuristic.research(input);
    result = fallback.result;
    rejectedSources = fallback.rejected_sources;
    providerId = "heuristic";
    degraded = true;
    warning =
      "De AI-analyse lukte niet; dit resultaat komt uit de trefwoord-heuristiek en is minder nauwkeurig.";
  }

  if (sourceCount === 0) {
    warning =
      warning ??
      "Er is geen publieke website-informatie opgehaald. Zonder bron kan dit bedrijf niet betrouwbaar beoordeeld worden.";
  }

  // 3. Deterministisch rekenen.
  const scores = scoreProspect({
    fit_components: result.fit_components,
    triggers: result.triggers,
    evidence: result.evidence,
    fetchedSourceCount: sourceCount,
    purely_specialist_b2b: result.purely_specialist_b2b,
    serves_dutch_market: result.serves_dutch_market,
    appears_active: result.appears_active,
    radio_use_case_override: result.radio_use_case_override,
  });

  // De providers leveren hun angles al op sterkte gesorteerd (zie
  // parseResearchResult), dus de eerste is de primaire.
  const primaryAngle = result.sales_angles[0] ?? null;

  // 4. Contactpersoon: alleen aanvullen wat nog leeg is. Een handmatig of via
  // CSV aangeleverde contactpersoon (en zeker een LinkedIn-URL) blijft staan.
  const contact = { ...existing.contact };
  if (!contact.first_name && result.contact_person) {
    contact.first_name = result.contact_person.first_name;
    contact.last_name = result.contact_person.last_name;
    contact.title = result.contact_person.title;
    contact.source = result.contact_person.source_url;
    contact.confidence = result.contact_person.confidence;
    // linkedin_url wordt hier bewust NIET gezet.
  }

  const patch: Partial<Prospect> = {
    industry: result.industry ?? existing.industry,
    segment: result.segment ?? existing.segment,
    description: result.description ?? existing.description,
    city: result.city ?? existing.city,
    country: result.country ?? existing.country,
    company_size: result.company_size.value ?? existing.company_size,
    number_of_locations: result.number_of_locations.value ?? existing.number_of_locations,

    fit_score: scores.fit_score,
    trigger_score: scores.trigger_score,
    priority_score: scores.priority_score,
    tier: scores.tier,
    fit_components: scores.fit_components,
    knockouts: scores.knockouts,
    knockout_override: scores.knockout_override,

    why_interesting: result.why_interesting,

    triggers: scores.triggers,
    primary_trigger: scores.primary_trigger?.label ?? null,
    trigger_date: scores.primary_trigger?.date ?? null,

    sales_angles: result.sales_angles,
    primary_sales_angle: primaryAngle?.angle ?? null,
    angle_strength: primaryAngle?.strength ?? null,

    recommended_contact_role: result.recommended_contact_role,
    contact,
    personalization: result.personalization,

    evidence: result.evidence,
    research_confidence: scores.research_confidence,
    confidence: confidenceLabel(scores.research_confidence),
    date_researched: new Date().toISOString(),
    research_provider: providerId,
  };

  // 5. Status bijwerken — maar nooit Eric's eigen voortgang overschrijven.
  if (AUTO_STATUS_OVERRIDABLE.has(existing.status)) {
    patch.status = statusForTier(scores.tier);
  }

  const updated = await updateProspect(id, patch);
  if (!updated) return null;

  logInfo(
    "radio.research",
    `${existing.company_name}: fit ${scores.fit_score}, trigger ${scores.trigger_score}, priority ${scores.priority_score} (tier ${scores.tier}) via ${providerId}, ${sourceCount} bron(nen)`,
  );

  return {
    prospect: updated,
    providerId,
    degraded,
    sourceCount,
    rejectedSources,
    usage,
    warning,
  };
}

/** Tier → status. Tier D landt op Skip (§4: automatisch LOW PRIORITY / SKIP). */
export function statusForTier(tier: Prospect["tier"]): ProspectStatus {
  switch (tier) {
    case "A":
      return "Tier A";
    case "B":
      return "Tier B";
    case "C":
      return "Tier C";
    case "D":
      return "Skip";
    default:
      return "Researched";
  }
}

/* -------------------------------------------------------------------------- */
/* Batch                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hoeveel bedrijven tegelijk. Laag gehouden: elk bedrijf doet meerdere
 * HTTP-requests plus een modelcall, en een batch van 100 mag geen rate limits
 * of timeouts uitlokken. Override met RADIO_RESEARCH_CONCURRENCY.
 */
export const DEFAULT_CONCURRENCY = 3;

export interface BatchResearchSummary {
  researched: number;
  failed: number;
  /** Per bedrijf een korte uitkomst, voor de UI. */
  results: Array<{
    id: string;
    company_name: string;
    ok: boolean;
    priority_score?: number | null;
    tier?: Prospect["tier"];
    warning?: string;
  }>;
  totalUsage: ResearchUsage | null;
  /** Kosten van deze batch in USD, per call berekend en opgeteld. */
  costUsd: number;
}

/**
 * Onderzoek meerdere prospects met een concurrency-cap.
 *
 * Één falend bedrijf stopt de batch niet — dat is het hele punt van een batch
 * van 100 websites.
 */
export async function researchMany(
  ids: string[],
  concurrency = Number(process.env.RADIO_RESEARCH_CONCURRENCY) || DEFAULT_CONCURRENCY,
): Promise<BatchResearchSummary> {
  const startedAt = new Date().toISOString();
  const summary: BatchResearchSummary = {
    researched: 0,
    failed: 0,
    results: [],
    totalUsage: null,
    costUsd: 0,
  };
  const limit = Math.max(1, Math.min(10, concurrency));
  const queue = [...ids];

  const usageTotals: ResearchUsage = {
    model: "",
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let sawUsage = false;
  const companyNames: string[] = [];

  const worker = async (): Promise<void> => {
    for (;;) {
      const id = queue.shift();
      if (!id) return;
      try {
        const outcome = await researchProspect(id);
        if (!outcome) {
          summary.failed++;
          summary.results.push({ id, company_name: id, ok: false, warning: "Niet gevonden." });
          continue;
        }
        summary.researched++;
        summary.results.push({
          id,
          company_name: outcome.prospect.company_name,
          ok: true,
          priority_score: outcome.prospect.priority_score,
          tier: outcome.prospect.tier,
          warning: outcome.warning,
        });
        companyNames.push(outcome.prospect.company_name);
        if (outcome.usage) {
          sawUsage = true;
          // Kosten per call: de cache-velden zijn anders geprijsd, dus dit kan
          // niet uit de totalen worden herleid.
          summary.costUsd += callCostUsd(outcome.usage);
          usageTotals.model = outcome.usage.model;
          usageTotals.input_tokens += outcome.usage.input_tokens;
          usageTotals.output_tokens += outcome.usage.output_tokens;
          usageTotals.cache_creation_input_tokens =
            (usageTotals.cache_creation_input_tokens ?? 0) +
            (outcome.usage.cache_creation_input_tokens ?? 0);
          usageTotals.cache_read_input_tokens =
            (usageTotals.cache_read_input_tokens ?? 0) +
            (outcome.usage.cache_read_input_tokens ?? 0);
        }
      } catch (error) {
        logError("radio.research.batch", error);
        summary.failed++;
        summary.results.push({
          id,
          company_name: id,
          ok: false,
          warning: "Analyse mislukt.",
        });
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  if (sawUsage) summary.totalUsage = usageTotals;

  await recordRun(researchRunRecord(summary, startedAt, companyNames));
  return summary;
}

/** Zet de batch-uitkomst om in een regel voor de run-historie. */
function researchRunRecord(
  summary: BatchResearchSummary,
  startedAt: string,
  companyNames: string[],
): RunRecord {
  const usage = summary.totalUsage;
  return {
    id: crypto.randomUUID(),
    kind: "research",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    settings: `${summary.researched + summary.failed} bedrijven onderzocht via ${selectResearchProvider().id}`,
    targets: companyNames,
    added: summary.researched,
    duplicates: 0,
    skipped: summary.failed,
    searches: 0,
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
    cost_usd: summary.costUsd,
    model: usage?.model ?? "",
    warnings: summary.results.filter((r) => !r.ok).map((r) => `${r.company_name}: ${r.warning ?? "mislukt"}`),
  };
}
