/**
 * Lokale MKB-lijst: kaartdata → prospects, zonder AI en zonder credits.
 *
 * De simpele route naast de bestaande scan. Verschil in één zin: de scan zoekt
 * uit wélke bedrijven interessant zijn, deze route weet dat al — je kiest een
 * branche en een provincie, en krijgt de lijst.
 *
 * Wat er NIET gebeurt: geen modelcall, geen fit- of trigger-score, geen
 * website-analyse. De prospects komen binnen met status `New` en zonder score.
 * Wil je er alsnog een score bij, dan selecteer je ze op het dashboard en start
 * je de gewone research — maar voor bellen en connecten heb je die niet nodig.
 *
 * Wat er wél gebeurt: per bedrijf een LinkedIn-ZOEKLINK naar de beslisser. Dat
 * is de brug naar een persoon, en de enige die geen scraping en geen verzonnen
 * profiel-URL vereist.
 */

import type { RunRecord } from "../types";
import { addProspect, listProspects, recordRun, updateProspect } from "../store";
import { provinceLabel, normalizeProvinces } from "../provinces";
import { ownerSearchUrl } from "../linkedin-search";
import {
  LOCAL_VERTICALS,
  findVertical,
  normalizeVerticals,
  verticalForTags,
  type LocalVertical,
} from "./verticals";
import { fetchProvince, pause, type OsmPlace } from "./overpass";
import { logError, logInfo } from "../../geo/logger";

export { LOCAL_VERTICALS, findVertical, normalizeVerticals } from "./verticals";
export type { LocalVertical } from "./verticals";
export { DEFAULT_OVERPASS_URL, overpassUrl } from "./overpass";

export interface LocalSourceOptions {
  /** Branche-keys uit LOCAL_VERTICALS. Leeg = alle branches. */
  verticals?: string[];
  /** Provincies. Minimaal één — een landelijke query is te zwaar voor de dienst. */
  provinces?: string[];
  /**
   * Vestigingen van ketens overslaan (default: ja).
   *
   * De kaart tagt een filiaal met `brand` of `operator`. Bij een keten beslist
   * het hoofdkantoor over het mediabudget, en dan is de hele reden om deze
   * branches te bellen weg.
   */
  excludeChains?: boolean;
  /** Alleen vestigingen met een website in de kaartdata. */
  requireWebsite?: boolean;
  /** Bovengrens op het aantal nieuwe prospects in deze ronde. */
  limit?: number;
}

export interface LocalSourceSummary {
  added: Array<{
    id: string;
    company_name: string;
    city: string | null;
    website: string | null;
    vertical: string;
    province: string;
    linkedin_search_url: string;
  }>;
  /** Stond al in de lijst. */
  duplicates: number;
  /** Overgeslagen als filiaal van een keten, met de ketennaam. */
  chains: string[];
  /** Overgeslagen omdat er geen website in de kaartdata stond. */
  withoutWebsite: number;
  /** Per branche + provincie hoeveel er gevonden en toegevoegd zijn. */
  perVertical: Array<{
    vertical: string;
    label: string;
    province: string;
    found: number;
    added: number;
  }>;
  warnings: string[];
  /** Deze route doet geen modelcalls. Staat er expliciet in, ter contrast. */
  costUsd: 0;
}

/** Ruime bovengrens per ronde; twaalf provincies × alle branches is veel. */
const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 2_000;

/**
 * Haal de lokale bedrijven op en sla ze op als prospect.
 *
 * Per provincie één request naar de kaartdienst, met alle gekozen branches in
 * één query. Faalt een provincie, dan gaan de andere door.
 */
export async function sourceLocalProspects(
  options: LocalSourceOptions = {},
): Promise<LocalSourceSummary> {
  const startedAt = new Date().toISOString();
  const summary: LocalSourceSummary = {
    added: [],
    duplicates: 0,
    chains: [],
    withoutWebsite: 0,
    perVertical: [],
    warnings: [],
    costUsd: 0,
  };

  const verticalKeys = normalizeVerticals(options.verticals ?? []);
  const verticals: LocalVertical[] =
    verticalKeys.length > 0
      ? verticalKeys.map((k) => findVertical(k)!).filter(Boolean)
      : [...LOCAL_VERTICALS];

  // Landelijk bestaat hier niet: één query over heel Nederland loopt bij de
  // gratis kaartdienst tegen de timeout aan. Kies provincies, desnoods alle twaalf.
  const provinces = normalizeProvinces(options.provinces ?? []).filter((p) => p !== "landelijk");
  if (provinces.length === 0) {
    summary.warnings.push("Kies minstens één provincie.");
    return summary;
  }

  const excludeChains = options.excludeChains !== false;
  const requireWebsite = options.requireWebsite === true;
  const limit = Math.max(1, Math.min(MAX_LIMIT, options.limit ?? DEFAULT_LIMIT));

  // Bestaande namen vooraf ophalen: dat scheelt een store-lookup per vestiging.
  const existing = await listProspects();
  const known = new Set(existing.map((p) => p.company_name.trim().toLowerCase()));

  for (const [index, province] of provinces.entries()) {
    if (summary.added.length >= limit) break;
    if (index > 0) await pause();

    const result = await fetchProvince(province, verticals);
    if (result.error) {
      summary.warnings.push(`${provinceLabel(province)}: ${result.error}`);
      continue;
    }

    const counts = new Map<string, { found: number; added: number }>();

    for (const place of result.places) {
      if (summary.added.length >= limit) break;

      const tags = result.tags.get(`${place.osm_type}/${place.osm_id}`) ?? {};
      const vertical = verticalForTags(tags, verticals);
      if (!vertical) continue;

      const count = counts.get(vertical.key) ?? { found: 0, added: 0 };
      count.found++;
      counts.set(vertical.key, count);

      if (excludeChains && place.chain) {
        summary.chains.push(`${place.name} (${place.chain})`);
        continue;
      }
      if (requireWebsite && !place.website) {
        summary.withoutWebsite++;
        continue;
      }

      const nameKey = place.name.trim().toLowerCase();
      if (known.has(nameKey)) {
        summary.duplicates++;
        continue;
      }

      try {
        const stored = await storePlace(place, vertical, province);
        if (stored === "duplicate") {
          summary.duplicates++;
        } else {
          count.added++;
          summary.added.push(stored);
        }
        known.add(nameKey);
      } catch (error) {
        logError("radio.local.store", error);
        summary.warnings.push(`${place.name}: opslaan mislukt.`);
      }
    }

    for (const [key, count] of counts) {
      summary.perVertical.push({
        vertical: key,
        label: findVertical(key)?.label ?? key,
        province,
        found: count.found,
        added: count.added,
      });
    }

    logInfo(
      "radio.local",
      `${provinceLabel(province)}: ${result.places.length} op de kaart, ${summary.added.length} toegevoegd`,
    );
  }

  summary.chains = [...new Set(summary.chains)];
  await recordRun(buildRunRecord(summary, startedAt, provinces, verticals, excludeChains));
  return summary;
}

type StoredPlace = LocalSourceSummary["added"][number];

/** Sla één vestiging op als prospect, met de kaartbron als evidence. */
async function storePlace(
  place: OsmPlace,
  vertical: LocalVertical,
  province: string,
): Promise<StoredPlace | "duplicate"> {
  const linkedInSearch = ownerSearchUrl(place.name, { city: place.city });

  const notes = [
    `Branche: ${vertical.label}. Gevonden in openbare kaartdata (OpenStreetMap), ${provinceLabel(province)}.`,
    place.street || place.postcode
      ? `Adres: ${[place.street, place.postcode, place.city].filter(Boolean).join(", ")}`
      : null,
    place.phone ? `Telefoon: ${place.phone}` : null,
    `Radio-invalshoek: ${vertical.angle}`,
    `Beslisser opzoeken op LinkedIn: ${linkedInSearch}`,
    `Bron: ${place.source_url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { prospect, duplicate } = await addProspect({
    company_name: place.name,
    website: place.website,
    city: place.city,
    industry: vertical.label,
    segment: vertical.segment,
    notes,
    contact_source: "openstreetmap",
  });

  if (duplicate) return "duplicate";

  // Verzorgingsgebied: een lokale vestiging bedient zijn eigen provincie. Dat is
  // een gevolgtrekking uit de vindplaats, geen vastgesteld feit — en precies
  // waarvoor de basis-aanduiding bestaat.
  try {
    await updateProspect(prospect.id, {
      coverage_provinces: [province],
      why_interesting: [vertical.angle],
      evidence: [
        {
          url: place.source_url,
          title: `OpenStreetMap — ${place.name}`,
          fact: `${vertical.label} in ${place.city ?? provinceLabel(province)}, opgenomen in openbare kaartdata.`,
          date: null,
          confidence: "high",
        },
      ],
    });
  } catch (error) {
    logError("radio.local.enrich", error);
  }

  return {
    id: prospect.id,
    company_name: prospect.company_name,
    city: prospect.city,
    website: prospect.website,
    vertical: vertical.key,
    province,
    linkedin_search_url: linkedInSearch,
  };
}

function buildRunRecord(
  summary: LocalSourceSummary,
  startedAt: string,
  provinces: string[],
  verticals: LocalVertical[],
  excludeChains: boolean,
): RunRecord {
  const settings = [
    verticals.length === LOCAL_VERTICALS.length
      ? "alle branches"
      : verticals.map((v) => v.label).join(", "),
    provinces.map(provinceLabel).join(", "),
    excludeChains ? "ketens uitgesloten" : "ketens meegenomen",
    "kaartdata, geen AI",
  ].join(" · ");

  return {
    id: crypto.randomUUID(),
    kind: "local",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    settings,
    targets: verticals.map((v) => v.label),
    added: summary.added.length,
    duplicates: summary.duplicates,
    skipped: summary.chains.length + summary.withoutWebsite,
    searches: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cost_usd: 0,
    model: "openstreetmap",
    warnings: summary.warnings,
  };
}
