/**
 * Optionele databron-connectors — interface nu, implementatie later.
 *
 * De MVP werkt volledig zonder betaalde bronnen (§20 van de briefing). Deze
 * module legt vast HOE een extra bron wordt aangesloten, zodat dat later een
 * losse adapter is en geen verbouwing van de research-laag.
 *
 * Het contract is met opzet smal: een connector levert EXTRA `FetchedSource`s
 * op. Die komen in dezelfde lijst als de opgehaalde website-pagina's terecht en
 * lopen daarmee automatisch door dezelfde bronverificatie — een connector kan
 * dus nooit een onverifieerbare bewering binnensmokkelen.
 *
 * ┌──────────────────────┬────────────────────────────────┬──────────────────────────────┐
 * │ Connector            │ Wat het toevoegt               │ Env var                      │
 * ├──────────────────────┼────────────────────────────────┼──────────────────────────────┤
 * │ Web search           │ nieuwsberichten → triggers      │ RADIO_SEARCH_API_KEY         │
 * │ (Brave / Serper /    │ met datum: nieuwe vestiging,    │ RADIO_SEARCH_PROVIDER        │
 * │  Bing)               │ funding, overname, rebranding   │                              │
 * ├──────────────────────┼────────────────────────────────┼──────────────────────────────┤
 * │ KVK API              │ vestigingen, SBI-code, actief   │ RADIO_KVK_API_KEY            │
 * │                      │ ja/nee → hardere D- en          │                              │
 * │                      │ knock-outsignalen               │                              │
 * ├──────────────────────┼────────────────────────────────┼──────────────────────────────┤
 * │ Vacaturefeed         │ aantal open vacatures →         │ RADIO_JOBS_API_KEY           │
 * │                      │ component G met `fact`          │                              │
 * ├──────────────────────┼────────────────────────────────┼──────────────────────────────┤
 * │ Enrichment           │ contactpersonen (optioneel,     │ RADIO_ENRICHMENT_API_KEY     │
 * │ (Apollo / Cognism)   │ betaald, niet nodig voor kern)  │                              │
 * └──────────────────────┴────────────────────────────────┴──────────────────────────────┘
 *
 * Een connector toevoegen:
 *   1. Implementeer `ResearchConnector` in lib/radio/research/connectors/<naam>.ts.
 *   2. Registreer hem in `CONNECTORS` hieronder.
 *   3. Klaar — `gatherConnectorSources()` wordt al door de research-laag
 *      aangeroepen en de nieuwe bronnen lopen mee in prompt én verificatie.
 *
 * LinkedIn is expliciet GEEN connector en mag dat ook niet worden: er wordt in
 * deze codebase niets van LinkedIn opgehaald of gescraped.
 */

import type { FetchedSource } from "../types";

export interface ConnectorInput {
  company_name: string;
  website: string | null;
}

export interface ResearchConnector {
  readonly id: string;
  /** Beschrijving voor de diagnostiekpagina. */
  readonly description: string;
  /** Welke env var deze connector nodig heeft. */
  readonly envVar: string;
  isConfigured(): boolean;
  /** Extra bronnen. Mag nooit gooien — geef bij twijfel een lege lijst. */
  collect(input: ConnectorInput): Promise<FetchedSource[]>;
}

/**
 * Nog geen enkele connector geïmplementeerd — de kern werkt zonder. Voeg hier
 * een instantie toe zodra er één is.
 */
export const CONNECTORS: readonly ResearchConnector[] = [];

/** Status van alle connectors, voor de diagnostiekpagina. */
export function connectorStatus(): Array<{
  id: string;
  description: string;
  envVar: string;
  configured: boolean;
}> {
  return CONNECTORS.map((c) => ({
    id: c.id,
    description: c.description,
    envVar: c.envVar,
    configured: c.isConfigured(),
  }));
}

/**
 * Verzamel extra bronnen van alle geconfigureerde connectors.
 * Een falende connector wordt overgeslagen, nooit doorgegeven als fout.
 */
export async function gatherConnectorSources(
  input: ConnectorInput,
): Promise<FetchedSource[]> {
  const active = CONNECTORS.filter((c) => c.isConfigured());
  if (active.length === 0) return [];

  const results = await Promise.all(
    active.map((connector) => connector.collect(input).catch(() => [] as FetchedSource[])),
  );
  return results.flat();
}
