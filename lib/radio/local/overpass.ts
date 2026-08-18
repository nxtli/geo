/**
 * OpenStreetMap als bedrijvenbron, via de Overpass API.
 *
 * Waarom deze bron en niet een websearch: voor "alle tuincentra in Limburg" is
 * openbare kaartdata compléter én gratis. Een websearch vindt ketens en
 * top-10-artikelen; de kaart heeft de zelfstandige zaak op de hoek. Geen
 * API-key, geen credits — de kosten van deze route zijn nul.
 *
 * Wat er WEL beperkt is: de kaart is door mensen ingevoerd. Naam en plaats staan
 * er bijna altijd, een website bij een deel. Dat is precies genoeg om iemand op
 * LinkedIn te kunnen zoeken, en een ontbrekende website wordt gerapporteerd in
 * plaats van verzonnen.
 *
 * ── Netiquette ────────────────────────────────────────────────────────────
 * Overpass is een gratis dienst van vrijwilligers. Daarom: één request per
 * provincie (niet per branche), een pauze tussen requests, een eigen
 * User-Agent zodat we identificeerbaar zijn, en een harde timeout. Als de
 * dienst nee zegt, stoppen we — geen retry-storm.
 */

import type { LocalVertical, OsmSelector } from "./verticals";
import { provinceIso, provinceLabel } from "../provinces";
import { normalizeWebsite, truncate } from "../validation";
import { logError, logInfo } from "../../geo/logger";

/** Publieke Overpass-instantie. Te vervangen door een mirror via de omgeving. */
export const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Overpass vraagt om een identificeerbare client. */
const USER_AGENT =
  "AdverterenOpDeRadio-ProspectFinder/1.0 (intern prospecting-hulpmiddel; +https://adverterenopderadio.nl)";

/** Serverzijdige rekentijd die we mogen vragen. */
const QUERY_TIMEOUT_S = 90;
/** Hoe lang we op het antwoord wachten voordat we opgeven. */
const REQUEST_TIMEOUT_MS = 120_000;
/** Pauze tussen twee provincie-requests. */
const PAUSE_BETWEEN_MS = 1_200;

/** Eén gevonden vestiging uit de kaartdata. */
export interface OsmPlace {
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  name: string;
  city: string | null;
  street: string | null;
  postcode: string | null;
  website: string | null;
  phone: string | null;
  /**
   * Is dit een vestiging van een keten? De kaart tagt dat met `brand` of
   * `operator`. Niet waterdicht, maar wél gratis en verrassend bruikbaar om
   * filialen van zelfstandige zaken te scheiden.
   */
  chain: string | null;
  /** Permalink naar het kaartobject — de verifieerbare bron. */
  source_url: string;
}

export function overpassUrl(): string {
  return process.env.RADIO_OVERPASS_URL?.trim() || DEFAULT_OVERPASS_URL;
}

/**
 * Bouw de Overpass-query voor één provincie en een set branches.
 *
 * Alle branches in één query: dat is één request in plaats van vijfentwintig,
 * en het antwoord bevat de tags waarmee we per object alsnog de branche kunnen
 * bepalen.
 */
export function buildQuery(provinceKey: string, verticals: readonly LocalVertical[]): string {
  const iso = provinceIso(provinceKey);
  if (!iso) throw new Error(`onbekende_provincie:${provinceKey}`);

  const selectors = dedupeSelectors(verticals.flatMap((v) => v.osm));
  if (selectors.length === 0) throw new Error("geen_branches");

  const clauses = selectors
    .map((s) => `  nwr["${s.key}"="${s.value}"](area.zoekgebied);`)
    .join("\n");

  // `out center tags` geeft van een vlak (way/relation) één coördinaat plus alle
  // tags — genoeg voor naam, adres en website, zonder de hele geometrie.
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];
area["ISO3166-2"="${iso}"]->.zoekgebied;
(
${clauses}
);
out center tags;`;
}

/** Ontdubbel selectors; twee branches mogen dezelfde tag gebruiken. */
function dedupeSelectors(selectors: OsmSelector[]): OsmSelector[] {
  const seen = new Set<string>();
  const out: OsmSelector[] = [];
  for (const selector of selectors) {
    const id = `${selector.key}=${selector.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(selector);
  }
  return out;
}

/**
 * Zet een Overpass-antwoord om in vestigingen.
 *
 * Objecten zonder naam vallen weg: zonder naam kun je niemand opzoeken. Alles
 * wat er verder ontbreekt (website, telefoon) blijft leeg — niet aangevuld.
 */
export function parseOverpass(payload: unknown): OsmPlace[] {
  const elements = (payload as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const places: OsmPlace[] = [];
  const seen = new Set<string>();

  for (const raw of elements) {
    const element = raw as {
      type?: string;
      id?: number;
      tags?: Record<string, string>;
    };
    const type = element.type;
    if (type !== "node" && type !== "way" && type !== "relation") continue;
    const id = Number(element.id);
    if (!Number.isFinite(id)) continue;

    const tags = element.tags ?? {};
    const name = (tags.name ?? tags["name:nl"] ?? "").trim();
    if (!name) continue;

    const key = `${type}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    places.push({
      osm_type: type,
      osm_id: id,
      name: truncate(name, 120),
      city: pick(tags, ["addr:city", "addr:place", "addr:suburb"]),
      street: pick(tags, ["addr:street"]),
      postcode: pick(tags, ["addr:postcode"]),
      website: normalizeWebsite(pick(tags, ["website", "contact:website", "url"])),
      phone: pick(tags, ["phone", "contact:phone"]),
      chain: pick(tags, ["brand", "operator"]),
      source_url: `https://www.openstreetmap.org/${type}/${id}`,
    });
  }

  return places;
}

function pick(tags: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return null;
}

/** Behoud de tags per object, zodat de branche bepaald kan worden. */
export function tagsByElement(payload: unknown): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  const elements = (payload as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return out;
  for (const raw of elements) {
    const element = raw as { type?: string; id?: number; tags?: Record<string, string> };
    if (!element.type || !Number.isFinite(Number(element.id))) continue;
    out.set(`${element.type}/${element.id}`, element.tags ?? {});
  }
  return out;
}

export interface OverpassResult {
  places: OsmPlace[];
  tags: Map<string, Record<string, string>>;
  /** Gebruikersveilige melding als het niet lukte. */
  error?: string;
}

/**
 * Vraag één provincie op.
 *
 * Faalt nooit hard: een onbereikbare of overbelaste dienst levert een lege lijst
 * met een uitlegbare melding, zodat de andere provincies gewoon doorgaan.
 */
export async function fetchProvince(
  provinceKey: string,
  verticals: readonly LocalVertical[],
): Promise<OverpassResult> {
  let query: string;
  try {
    query = buildQuery(provinceKey, verticals);
  } catch (error) {
    logError("radio.local.overpass", error);
    return { places: [], tags: new Map(), error: "Kon de zoekopdracht niet opbouwen." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(overpassUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 429 en 504 zijn de normale "te druk"-antwoorden van Overpass.
      const busy = response.status === 429 || response.status === 504;
      return {
        places: [],
        tags: new Map(),
        error: busy
          ? `De kaartdienst is nu te druk (${response.status}). Probeer het over een paar minuten opnieuw.`
          : `De kaartdienst antwoordde met ${response.status}.`,
      };
    }

    const payload = (await response.json()) as unknown;
    const places = parseOverpass(payload);
    logInfo(
      "radio.local.overpass",
      `${provinceLabel(provinceKey)}: ${places.length} vestiging(en) uit de kaartdata`,
    );
    return { places, tags: tagsByElement(payload) };
  } catch (error) {
    logError("radio.local.overpass", error);
    const aborted = (error as { name?: string }).name === "AbortError";
    return {
      places: [],
      tags: new Map(),
      error: aborted
        ? "De kaartdienst reageerde niet binnen twee minuten."
        : "De kaartdienst was niet bereikbaar.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Nette pauze tussen twee requests naar een gratis dienst. */
export function pause(ms = PAUSE_BETWEEN_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
