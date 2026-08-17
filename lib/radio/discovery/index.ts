/**
 * Discovery-orkestratie: zoeken → verifiëren → opslaan.
 *
 * De laag die §18 van de briefing waarmaakt zonder een scraper te bouwen. Het
 * zoeken gebeurt via de web-search tool van de Claude API; het beoordelen en
 * rangschikken doet de bestaande scoring-engine. Discovery levert dus alleen
 * KANDIDATEN aan — de top 10 rolt daarna uit het gewone research- en
 * scoringsproces, niet uit de mening van een zoekmachine.
 *
 * Drie filters tussen "gevonden" en "prospect":
 *  1. bron-URL moet in de echte zoekresultaten staan (provider.ts);
 *  2. de website moet daadwerkelijk bestaan (websiteResolves);
 *  3. het bedrijf mag nog niet in de lijst staan (dedupe in de store).
 */

import type { Prospect } from "../types";
import { addProspect, listProspects, updateProspect } from "../store";
import { websiteResolves } from "../research/fetch";
import { findQuery, queriesForSegment, timingQueries, type DiscoveryQuery } from "./queries";
import type { DiscoveredCandidate, DiscoveryProvider } from "./provider";
import { ClaudeSearchDiscoveryProvider } from "./providers/claude-search";
import { logError, logInfo } from "../../geo/logger";

export type { DiscoveredCandidate, DiscoveryProvider } from "./provider";
export { DISCOVERY_QUERIES, queriesForSegment, timingQueries } from "./queries";
export type { DiscoveryQuery } from "./queries";

const provider: DiscoveryProvider = new ClaudeSearchDiscoveryProvider();

/** Is discovery beschikbaar? Vereist een API-key met web-search. */
export function isDiscoveryAvailable(): boolean {
  return provider.isConfigured();
}

export function describeDiscoveryProvider(): { id: string; available: boolean } {
  return { id: provider.id, available: provider.isConfigured() };
}

/* -------------------------------------------------------------------------- */
/* Eén zoekronde                                                              */
/* -------------------------------------------------------------------------- */

export interface DiscoverOptions {
  /** Specifieke zoekrichtingen (keys uit queries.ts). Leeg = kies automatisch. */
  queryKeys?: string[];
  /** Beperk tot één segment. */
  segment?: string | null;
  /** Maximaal aantal nieuwe prospects per zoekrichting. */
  perQuery?: number;
  /** Maximaal aantal zoekrichtingen in deze ronde. */
  maxQueries?: number;
}

export interface DiscoverySummary {
  /** Nieuw toegevoegde prospects. */
  added: Array<{ id: string; company_name: string; website: string | null; query: string }>;
  /** Kandidaten die al in de lijst stonden. */
  duplicates: string[];
  /** Kandidaten waarvan de website niet bestond — bewust niet opgeslagen. */
  unreachable: string[];
  /** Bron-URL's die niet in de zoekresultaten voorkwamen. */
  rejectedSources: string[];
  /** Welke zoekrichtingen zijn gebruikt. */
  queriesUsed: Array<{ key: string; label: string; found: number; searches: number }>;
  totalUsage: { model: string; input_tokens: number; output_tokens: number } | null;
  warnings: string[];
}

/**
 * Standaard aantal kandidaten per zoekrichting.
 *
 * Ruim genomen: de tool moet de lijst kunnen vullen, en één zoekrichting levert
 * vaak een overzichtsartikel op waar tientallen bedrijven in staan. De rem zit
 * niet hier maar in de kwaliteitsfilters — bron moet echt zijn, website moet
 * bestaan — en in de scoring, die de kaf er daarna uit haalt.
 */
const DEFAULT_PER_QUERY = 25;
/** Bovengrens per zoekrichting. */
export const MAX_PER_QUERY = 40;
/**
 * Zoekrichtingen per API-aanroep. Laag: elke richting doet meerdere
 * webzoekopdrachten plus twee modelcalls, en een request moet binnen de
 * platform-timeout blijven. De UI loopt zelf door alle richtingen heen.
 */
const DEFAULT_MAX_QUERIES = 2;
export const MAX_QUERIES_PER_CALL = 4;

/**
 * Zoek nieuwe bedrijven en sla de bruikbare kandidaten op als prospect
 * (status `New`, nog niet gescoord).
 *
 * Faalt nooit hard op één zoekrichting: wat misgaat komt in `warnings` terecht en
 * de rest gaat door.
 */
export async function discoverProspects(
  options: DiscoverOptions = {},
): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = {
    added: [],
    duplicates: [],
    unreachable: [],
    rejectedSources: [],
    queriesUsed: [],
    totalUsage: null,
    warnings: [],
  };

  if (!provider.isConfigured()) {
    summary.warnings.push(
      "Zoeken naar bedrijven vereist een ANTHROPIC_API_KEY. Zet die eerst in .env.local.",
    );
    return summary;
  }

  const perQuery = Math.max(1, Math.min(MAX_PER_QUERY, options.perQuery ?? DEFAULT_PER_QUERY));
  const maxQueries = Math.max(
    1,
    Math.min(MAX_QUERIES_PER_CALL, options.maxQueries ?? DEFAULT_MAX_QUERIES),
  );
  const queries = selectQueries(options, maxQueries);

  if (queries.length === 0) {
    summary.warnings.push("Geen bruikbare zoekrichting gevonden.");
    return summary;
  }

  // Bestaande bedrijven meegeven zodat het model niet opnieuw aandraagt wat we
  // al hebben — dat scheelt zoekopdrachten én afgekeurde kandidaten.
  const existing = await listProspects();
  const knownCompanies = existing.map((p) => p.company_name);

  const usage = { model: "", input_tokens: 0, output_tokens: 0 };
  let sawUsage = false;

  for (const query of queries) {
    try {
      const outcome = await provider.discover({
        label: query.label,
        searches: query.searches,
        segment: options.segment ?? query.segment,
        known_companies: knownCompanies,
        limit: perQuery,
      });

      if (outcome.usage) {
        sawUsage = true;
        usage.model = outcome.usage.model;
        usage.input_tokens += outcome.usage.input_tokens;
        usage.output_tokens += outcome.usage.output_tokens;
      }
      if (outcome.warning) summary.warnings.push(`${query.label}: ${outcome.warning}`);
      summary.rejectedSources.push(...outcome.rejected_sources);

      let stored = 0;
      for (const candidate of outcome.candidates) {
        const result = await storeCandidate(candidate, query);
        if (result === "added") {
          stored++;
          knownCompanies.push(candidate.company_name);
        } else if (result === "duplicate") {
          summary.duplicates.push(candidate.company_name);
          knownCompanies.push(candidate.company_name);
        } else {
          summary.unreachable.push(`${candidate.company_name} (${candidate.website})`);
        }
      }

      // De net toegevoegde prospects ophalen voor de samenvatting.
      const after = await listProspects();
      for (const candidate of outcome.candidates) {
        const match = after.find(
          (p) => p.company_name.toLowerCase() === candidate.company_name.toLowerCase(),
        );
        if (match && match.fit_score === null && !summary.added.some((a) => a.id === match.id)) {
          summary.added.push({
            id: match.id,
            company_name: match.company_name,
            website: match.website,
            query: query.label,
          });
        }
      }

      summary.queriesUsed.push({
        key: query.key,
        label: query.label,
        found: stored,
        searches: outcome.searches_run,
      });

      logInfo(
        "radio.discovery",
        `"${query.label}": ${stored} nieuw, ${outcome.candidates.length} kandidaten`,
      );
    } catch (error) {
      logError("radio.discovery", error);
      summary.warnings.push(`${query.label}: zoeken mislukt.`);
      summary.queriesUsed.push({ key: query.key, label: query.label, found: 0, searches: 0 });
    }
  }

  summary.rejectedSources = [...new Set(summary.rejectedSources)];
  if (sawUsage) summary.totalUsage = usage;
  return summary;
}

/**
 * Sla één kandidaat op.
 *
 * De website wordt eerst opgehaald. Bestaat die niet, dan slaan we niets op — een
 * verzonnen bedrijf heeft geen werkend domein, en een prospect zonder website is
 * voor Eric toch onbruikbaar.
 */
async function storeCandidate(
  candidate: DiscoveredCandidate,
  query: DiscoveryQuery,
): Promise<"added" | "duplicate" | "unreachable"> {
  const reachable = await websiteResolves(candidate.website);
  if (!reachable) return "unreachable";

  const notes = [
    `Gevonden via zoekrichting "${query.label}".`,
    candidate.why,
    candidate.signal
      ? `Signaal: ${candidate.signal}${candidate.signal_date ? ` (${candidate.signal_date})` : ""}`
      : null,
    `Bron: ${candidate.source_url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { prospect, duplicate } = await addProspect({
    company_name: candidate.company_name,
    website: candidate.website,
    segment: candidate.segment,
    notes,
    contact_source: "discovery",
  });

  if (duplicate) return "duplicate";

  // Het gevonden signaal als voorlopige aanleiding vastleggen, met de bron uit
  // de zoekresultaten. De research-laag kan dit later aanvullen of overschrijven.
  if (candidate.signal) {
    await seedSignal(prospect, candidate);
  }

  return "added";
}

/**
 * Leg het zoeksignaal vast als evidence op de nieuwe prospect.
 *
 * Bewust GEEN trigger: een trigger hoort bij een bron die we zelf hebben
 * opgehaald, en dit is een zoekresultaat. Als evidence blijft het zichtbaar voor
 * Eric zonder de Trigger Score te beïnvloeden — die komt uit de research.
 */
async function seedSignal(prospect: Prospect, candidate: DiscoveredCandidate): Promise<void> {
  try {
    await updateProspect(prospect.id, {
      evidence: [
        {
          url: candidate.source_url,
          title: `Zoekresultaat — ${candidate.company_name}`,
          fact: candidate.signal ?? candidate.why,
          date: candidate.signal_date,
          confidence: candidate.confidence,
        },
      ],
    });
  } catch (error) {
    logError("radio.discovery.seed", error);
  }
}

/**
 * Kies de zoekrichtingen voor deze ronde.
 *
 * Zonder expliciete keuze krijgen TIMING-richtingen voorrang: die leveren
 * bedrijven met een actuele aanleiding, en dat is precies waar de Trigger Score
 * op scherpstelt.
 */
function selectQueries(options: DiscoverOptions, maxQueries: number): DiscoveryQuery[] {
  if (options.queryKeys?.length) {
    return options.queryKeys
      .map((key) => findQuery(key))
      .filter((q): q is DiscoveryQuery => q !== null)
      .slice(0, maxQueries);
  }

  const pool = options.segment ? queriesForSegment(options.segment) : null;
  if (pool) return pool.slice(0, maxQueries);

  // Automatisch: timing eerst, dan aanvullen met fit-richtingen.
  const timing = timingQueries();
  const fit = queriesForSegment(null).filter((q) => q.kind === "fit");
  return [...timing, ...fit].slice(0, maxQueries);
}
