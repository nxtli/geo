/**
 * Storage-selectie + prospect-CRUD.
 *
 * Driverkeuze:
 *   1. RADIO_STORE_DRIVER ("file" | "postgres") — expliciet.
 *   2. postgres als er een connectiestring is (dezelfde als de GEO-app).
 *   3. anders het JSON-bestand, zodat de tool altijd werkt.
 */

import type { Prospect, ProspectInput, ProspectStatus } from "../types";
import type { RadioStoreDriver } from "./driver";
import { FileStoreDriver } from "./file-driver";
import { PostgresStoreDriver } from "./postgres-driver";
import { createProspect } from "./serialize";
import { canonicalUrl } from "../validation";
import { logError } from "../../geo/logger";

export type { RadioStoreDriver } from "./driver";
export { flattenProspect, componentScore, createProspect, formatPersonalization, FIT_SCORE_COLUMNS } from "./serialize";

let driver: RadioStoreDriver | null = null;

export function getStore(): RadioStoreDriver {
  if (driver) return driver;

  const explicit = process.env.RADIO_STORE_DRIVER?.trim().toLowerCase();
  if (explicit === "file") {
    driver = new FileStoreDriver();
  } else if (explicit === "postgres") {
    driver = new PostgresStoreDriver();
  } else if (PostgresStoreDriver.isAvailable()) {
    driver = new PostgresStoreDriver();
  } else {
    driver = new FileStoreDriver();
  }
  return driver;
}

/** Alleen voor tests: injecteer een driver. */
export function setStoreForTesting(next: RadioStoreDriver | null): void {
  driver = next;
}

/** Beschrijving van de actieve opslag, voor de UI. */
export function describeStore(): string {
  return getStore().describe();
}

/* -------------------------------------------------------------------------- */
/* CRUD                                                                       */
/* -------------------------------------------------------------------------- */

export async function listProspects(): Promise<Prospect[]> {
  const store = getStore();
  await store.init();
  return store.listAll();
}

export async function getProspect(id: string): Promise<Prospect | null> {
  const store = getStore();
  await store.init();
  return store.get(id);
}

export interface AddProspectResult {
  prospect: Prospect;
  /** True als er al een prospect met deze naam/website bestond. */
  duplicate: boolean;
}

/**
 * Voeg een prospect toe, of geef de bestaande terug bij een duplicaat.
 *
 * Dedupe op genormaliseerde website (host+pad) en anders op bedrijfsnaam
 * (case-insensitive). Bij een duplicaat worden ontbrekende contactvelden van de
 * bestaande prospect wél aangevuld — een CSV met LinkedIn-URL's mag een eerder
 * handmatig toegevoegd bedrijf verrijken zonder een tweede rij te maken.
 */
export async function addProspect(input: ProspectInput): Promise<AddProspectResult> {
  const store = getStore();
  await store.init();

  const candidate = createProspect(input);
  const existing = await findDuplicate(candidate);
  if (existing) {
    const enriched = enrichContact(existing, candidate);
    if (enriched) {
      const saved = await store.save(enriched);
      return { prospect: saved ?? existing, duplicate: true };
    }
    return { prospect: existing, duplicate: true };
  }

  const inserted = await store.insert(candidate);
  return { prospect: inserted, duplicate: false };
}

/** Zoek een bestaande prospect op website of naam. */
export async function findDuplicate(candidate: Prospect): Promise<Prospect | null> {
  const all = await listProspects();
  const website = canonicalUrl(candidate.website);
  if (website) {
    const byWebsite = all.find((p) => canonicalUrl(p.website) === website);
    if (byWebsite) return byWebsite;
  }
  const name = candidate.company_name.trim().toLowerCase();
  return all.find((p) => p.company_name.trim().toLowerCase() === name) ?? null;
}

/**
 * Vul lege velden van `existing` aan met wat `incoming` meebrengt.
 * Bestaande waarden worden NIET overschreven. Null = niets te verrijken.
 */
function enrichContact(existing: Prospect, incoming: Prospect): Prospect | null {
  const contact = { ...existing.contact };
  let changed = false;

  const fields = ["first_name", "last_name", "title", "linkedin_url", "source"] as const;
  for (const field of fields) {
    if (!contact[field] && incoming.contact[field]) {
      contact[field] = incoming.contact[field];
      changed = true;
    }
  }

  const patch: Partial<Prospect> = {};
  if (!existing.website && incoming.website) {
    patch.website = incoming.website;
    changed = true;
  }
  if (!existing.city && incoming.city) {
    patch.city = incoming.city;
    changed = true;
  }
  if (!existing.industry && incoming.industry) {
    patch.industry = incoming.industry;
    changed = true;
  }
  if (!existing.segment && incoming.segment) {
    patch.segment = incoming.segment;
    changed = true;
  }

  if (!changed) return null;
  return {
    ...existing,
    ...patch,
    contact,
    updated_at: new Date().toISOString(),
  };
}

/** Werk een prospect bij. `updated_at` wordt automatisch gezet. */
export async function updateProspect(
  id: string,
  patch: Partial<Omit<Prospect, "id" | "created_at">>,
): Promise<Prospect | null> {
  const store = getStore();
  await store.init();
  const existing = await store.get(id);
  if (!existing) return null;
  const next: Prospect = {
    ...existing,
    ...patch,
    id: existing.id,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };
  return store.save(next);
}

/** Zet de status van meerdere prospects (bijv. na een Waalaxy-export). */
export async function setStatusMany(
  ids: string[],
  status: ProspectStatus,
): Promise<number> {
  let updated = 0;
  for (const id of ids) {
    try {
      const result = await updateProspect(id, { status });
      if (result) updated++;
    } catch (error) {
      logError("radio.store.setStatusMany", error);
    }
  }
  return updated;
}

export async function deleteProspect(id: string): Promise<boolean> {
  const store = getStore();
  await store.init();
  return store.remove(id);
}
