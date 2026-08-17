/**
 * Discovery-contract: kandidaat-bedrijven vinden op basis van een zoekrichting.
 *
 * Dezelfde waarheidsregels als de research-laag, maar met een extra stap. Bij
 * research kennen we de bron (de website die we ophaalden); bij discovery komt de
 * bron uit een zoekresultaat. Daarom:
 *
 *  1. De URL's uit de ECHTE zoekresultaten vormen de toegestane bronnenset. Een
 *     kandidaat met een bron die daar niet in zit, wordt verworpen.
 *  2. De opgegeven bedrijfswebsite wordt daarna DAADWERKELIJK opgehaald
 *     (lib/radio/discovery/index.ts). Bestaat die niet, dan valt de kandidaat af.
 *     Een verzonnen bedrijf overleeft dat niet.
 *
 * Een kandidaat is dus pas een prospect als er een werkende website achter zit.
 */

import { z } from "zod";
import type { Confidence } from "../types";
import { normalizeSegment } from "../segments";
import { canonicalUrl, normalizeWebsite, truncate } from "../validation";
import { logInfo } from "../../geo/logger";

/** Eén gevonden bedrijf, nog niet onderzocht of gescoord. */
export interface DiscoveredCandidate {
  company_name: string;
  website: string;
  /** Segment uit de vaste lijst, of null. */
  segment: string | null;
  /** Waarom dit bedrijf mogelijk bij radio past — één of twee regels. */
  why: string;
  /**
   * De aanleiding die in het zoekresultaat stond, als die er was. Levert straks
   * een trigger op met datum.
   */
  signal: string | null;
  /** ISO-datum van het signaal, indien het zoekresultaat een datum noemde. */
  signal_date: string | null;
  /** Bron-URL uit de zoekresultaten — geverifieerd tegen de echte resultaten. */
  source_url: string;
  confidence: Confidence;
}

export interface DiscoveryInput {
  /** Menselijke omschrijving van de zoekrichting. */
  label: string;
  /** Concrete zoektermen die de provider mag gebruiken. */
  searches: string[];
  /** Segment waar we op mikken, of null. */
  segment: string | null;
  /** Bedrijven die we al hebben — niet opnieuw aandragen. */
  known_companies: string[];
  /** Hoeveel kandidaten we maximaal willen. */
  limit: number;
}

export interface DiscoveryOutcome {
  candidates: DiscoveredCandidate[];
  /** Bron-URL's die het model noemde maar die niet in de zoekresultaten stonden. */
  rejected_sources: string[];
  /** Aantal zoekopdrachten dat de provider daadwerkelijk uitvoerde. */
  searches_run: number;
  usage?: { model: string; input_tokens: number; output_tokens: number };
  /** Gebruikersveilige melding als er iets niet lukte. */
  warning?: string;
}

export interface DiscoveryProvider {
  readonly id: string;
  isConfigured(): boolean;
  discover(input: DiscoveryInput): Promise<DiscoveryOutcome>;
}

/* -------------------------------------------------------------------------- */
/* Validatie                                                                  */
/* -------------------------------------------------------------------------- */

const candidateSchema = z.object({
  company_name: z.string().default(""),
  website: z.string().default(""),
  segment: z.string().nullable().default(null),
  why: z.string().default(""),
  signal: z.string().nullable().default(null),
  signal_date: z.string().nullable().default(null),
  source_url: z.string().default(""),
  confidence: z.enum(["high", "medium", "low"]).catch("low"),
});

export const discoveryResultSchema = z.object({
  candidates: z.array(candidateSchema).default([]),
});

export interface ParseDiscoveryOptions {
  /** URL's die echt in de zoekresultaten voorkwamen. */
  allowedUrls: string[];
  /** Bedrijven die we al hebben (genormaliseerd op naam). */
  knownCompanies: string[];
  limit: number;
}

export interface ParsedDiscovery {
  candidates: DiscoveredCandidate[];
  rejected_sources: string[];
}

/**
 * Valideer de modeloutput en gooi weg wat niet klopt:
 *  - kandidaat zonder naam of zonder bruikbare website
 *  - bron-URL die niet in de echte zoekresultaten voorkwam
 *  - bedrijf dat we al in de lijst hebben
 *  - dubbele kandidaten binnen dezelfde ronde
 */
export function parseDiscoveryResult(
  value: unknown,
  options: ParseDiscoveryOptions,
): ParsedDiscovery {
  const raw = discoveryResultSchema.parse(value);

  const allowed = new Set<string>();
  for (const url of options.allowedUrls) {
    const key = canonicalUrl(url);
    if (key) allowed.add(key);
    // Ook het domein zelf toestaan: een zoekresultaat op /nieuws/x rechtvaardigt
    // een bron op datzelfde domein, en zoekmachines geven vaak de canonieke
    // pagina terug terwijl het model de sectie noemt.
    try {
      allowed.add(new URL(url).hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      /* geen geldige URL — negeren */
    }
  }

  const known = new Set(
    options.knownCompanies.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  const seenName = new Set<string>();
  const seenSite = new Set<string>();
  const rejected: string[] = [];
  const candidates: DiscoveredCandidate[] = [];

  for (const item of raw.candidates) {
    const name = item.company_name.trim();
    const website = normalizeWebsite(item.website);
    if (!name || !website) continue;

    // Bron verifiëren tegen de echte zoekresultaten.
    const rawSource = item.source_url.trim();
    let source: string | null = null;
    if (rawSource) {
      const key = canonicalUrl(rawSource);
      let host: string | null = null;
      try {
        host = new URL(rawSource).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        host = null;
      }
      if ((key && allowed.has(key)) || (host && allowed.has(host))) {
        source = rawSource;
      } else {
        rejected.push(rawSource);
      }
    }
    // Geen verifieerbare bron → kandidaat valt af. Zonder bron weten we niet
    // waar dit bedrijf vandaan komt.
    if (!source) continue;

    const nameKey = name.toLowerCase();
    const siteKey = canonicalUrl(website);
    if (known.has(nameKey)) continue;
    if (seenName.has(nameKey)) continue;
    if (siteKey && seenSite.has(siteKey)) continue;
    seenName.add(nameKey);
    if (siteKey) seenSite.add(siteKey);

    candidates.push({
      company_name: truncate(name, 120),
      website,
      segment: normalizeSegment(item.segment),
      why: truncate(item.why.trim(), 400),
      signal: item.signal?.trim() ? truncate(item.signal.trim(), 240) : null,
      signal_date: normalizeSignalDate(item.signal_date),
      source_url: source,
      confidence: item.confidence as Confidence,
    });

    if (candidates.length >= options.limit) break;
  }

  const uniqueRejected = [...new Set(rejected)];
  if (uniqueRejected.length > 0) {
    logInfo(
      "radio.discovery.validate",
      `${uniqueRejected.length} kandidaat-bron(nen) verworpen: niet in de zoekresultaten`,
    );
  }

  return { candidates, rejected_sources: uniqueRejected };
}

/** Hergebruik de datumnormalisatie, maar houd hem lokaal leesbaar. */
function normalizeSignalDate(value: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  if (date.getUTCFullYear() < 1990) return null;
  if (parsed > Date.now() + 730 * 86_400_000) return null;
  return date.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* JSON Schema voor structured outputs                                        */
/* -------------------------------------------------------------------------- */

export const discoveryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company_name: { type: "string" },
          website: { type: "string" },
          segment: { type: ["string", "null"] },
          why: { type: "string" },
          signal: { type: ["string", "null"] },
          signal_date: { type: ["string", "null"] },
          source_url: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: [
          "company_name",
          "website",
          "segment",
          "why",
          "signal",
          "signal_date",
          "source_url",
          "confidence",
        ],
      },
    },
  },
  required: ["candidates"],
} as const;
