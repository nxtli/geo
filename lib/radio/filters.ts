/**
 * Filteren, sorteren en dashboardstatistieken — pure functies over een
 * prospectlijst, zodat dit zonder database te testen is en beide
 * storage-drivers precies hetzelfde gedrag geven.
 */

import type { Prospect, ProspectStatus, Tier } from "./types";
import { isLinkedInProfileUrl } from "./validation";
import { LOW_CONFIDENCE_THRESHOLD } from "./scoring/confidence";

export interface ProspectFilter {
  tiers?: Tier[];
  statuses?: ProspectStatus[];
  segments?: string[];
  /** Vrije tekst op branche (industry) — substring, case-insensitive. */
  industry?: string;
  /** Vrije tekst op de primaire sales angle. */
  angle?: string;
  /** Vrije tekst op stad/land. */
  location?: string;
  minPriority?: number;
  minFit?: number;
  minTrigger?: number;
  /** Contactpersoon gevonden ja/nee. */
  hasContact?: boolean;
  /** LinkedIn-URL aanwezig ja/nee. */
  hasLinkedIn?: boolean;
  /** Vrije zoekterm op bedrijfsnaam of website. */
  search?: string;
  /** Alleen prospects met lage research-confidence. */
  lowConfidenceOnly?: boolean;
  /** DEMO DATA meenemen (default: ja). */
  includeDemo?: boolean;
}

export type SortKey =
  | "priority"
  | "fit"
  | "trigger"
  | "company"
  | "created"
  | "confidence";

export interface SortSpec {
  key: SortKey;
  direction: "asc" | "desc";
}

/** Default: hoogste prioriteit eerst — de belangrijkste sortering (§15). */
export const DEFAULT_SORT: SortSpec = { key: "priority", direction: "desc" };

/** Is er een bruikbare contactpersoon (minimaal een voornaam)? */
export function hasContactPerson(p: Prospect): boolean {
  return Boolean(p.contact.first_name?.trim());
}

/** Is er een LinkedIn-URL? */
export function hasLinkedIn(p: Prospect): boolean {
  return Boolean(p.contact.linkedin_url);
}

/**
 * Klaar voor Waalaxy: een persoon met naam ÉN een LinkedIn-PROFIEL-URL
 * (`/in/…`). Een bedrijfspagina (`/company/…`) is niet genoeg — daar kan
 * Waalaxy geen connectieverzoek naartoe sturen.
 */
export function isReadyForWaalaxy(p: Prospect): boolean {
  return hasContactPerson(p) && isLinkedInProfileUrl(p.contact.linkedin_url);
}

/** Lage betrouwbaarheid — de UI markeert dit expliciet. */
export function isLowConfidence(p: Prospect): boolean {
  return (
    p.research_confidence !== null && p.research_confidence < LOW_CONFIDENCE_THRESHOLD
  );
}

function includesCI(haystack: string | null | undefined, needle: string): boolean {
  if (!needle.trim()) return true;
  return (haystack ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}

export function filterProspects(
  prospects: Prospect[],
  filter: ProspectFilter = {},
): Prospect[] {
  return prospects.filter((p) => {
    if (filter.includeDemo === false && p.demo) return false;
    if (filter.tiers?.length && (!p.tier || !filter.tiers.includes(p.tier))) return false;
    if (filter.statuses?.length && !filter.statuses.includes(p.status)) return false;
    if (filter.segments?.length && (!p.segment || !filter.segments.includes(p.segment))) {
      return false;
    }
    if (filter.industry && !includesCI(p.industry, filter.industry)) return false;
    if (filter.angle) {
      // Zoek in de angle-TEKST én in de soorten ("Retail", "Recruitment",
      // "Launch"). Wie op "recruitment" filtert bedoelt de soort, en die staat
      // zelden letterlijk in de uitgeschreven angle.
      const haystack = [
        p.primary_sales_angle,
        ...p.sales_angles.map((a) => a.kind),
        ...p.sales_angles.map((a) => a.angle),
      ]
        .filter(Boolean)
        .join(" ");
      if (!includesCI(haystack, filter.angle)) return false;
    }
    if (filter.location) {
      const location = [p.city, p.country].filter(Boolean).join(" ");
      if (!includesCI(location, filter.location)) return false;
    }
    if (typeof filter.minPriority === "number") {
      if ((p.priority_score ?? -1) < filter.minPriority) return false;
    }
    if (typeof filter.minFit === "number") {
      if ((p.fit_score ?? -1) < filter.minFit) return false;
    }
    if (typeof filter.minTrigger === "number") {
      if ((p.trigger_score ?? -1) < filter.minTrigger) return false;
    }
    if (typeof filter.hasContact === "boolean") {
      if (hasContactPerson(p) !== filter.hasContact) return false;
    }
    if (typeof filter.hasLinkedIn === "boolean") {
      if (hasLinkedIn(p) !== filter.hasLinkedIn) return false;
    }
    if (filter.lowConfidenceOnly && !isLowConfidence(p)) return false;
    if (filter.search) {
      const haystack = [p.company_name, p.website, p.industry].filter(Boolean).join(" ");
      if (!includesCI(haystack, filter.search)) return false;
    }
    return true;
  });
}

/** Nulls sorteren altijd achteraan, ongeacht de richting. */
function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

export function sortProspects(prospects: Prospect[], sort: SortSpec = DEFAULT_SORT): Prospect[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  const sorted = [...prospects];

  sorted.sort((a, b) => {
    let primary = 0;
    switch (sort.key) {
      case "priority":
        primary = compareNullable(a.priority_score, b.priority_score, direction);
        break;
      case "fit":
        primary = compareNullable(a.fit_score, b.fit_score, direction);
        break;
      case "trigger":
        primary = compareNullable(a.trigger_score, b.trigger_score, direction);
        break;
      case "confidence":
        primary = compareNullable(a.research_confidence, b.research_confidence, direction);
        break;
      case "company":
        primary = a.company_name.localeCompare(b.company_name, "nl") * direction;
        break;
      case "created":
        primary = a.created_at.localeCompare(b.created_at) * direction;
        break;
    }
    if (primary !== 0) return primary;
    // Stabiele tiebreak: nieuwste eerst, dan naam.
    const byCreated = b.created_at.localeCompare(a.created_at);
    return byCreated !== 0 ? byCreated : a.company_name.localeCompare(b.company_name, "nl");
  });

  return sorted;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export interface DashboardStats {
  total: number;
  tierA: number;
  tierB: number;
  tierC: number;
  tierD: number;
  /** Prospects met contactpersoon én LinkedIn-profiel-URL. */
  readyForWaalaxy: number;
  /** Prospects zonder bruikbare contactpersoon. */
  missingContact: number;
  /** Prospects met een contactpersoon maar zonder LinkedIn-URL. */
  missingLinkedIn: number;
  /** Gemiddelde over de GESCOORDE prospects (null als er geen zijn). */
  avgFit: number | null;
  avgTrigger: number | null;
  avgPriority: number | null;
  /** Nog niet onderzocht. */
  notResearched: number;
  lowConfidence: number;
  demo: number;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function computeStats(prospects: Prospect[]): DashboardStats {
  const scored = prospects.filter((p) => p.fit_score !== null);
  return {
    total: prospects.length,
    tierA: prospects.filter((p) => p.tier === "A").length,
    tierB: prospects.filter((p) => p.tier === "B").length,
    tierC: prospects.filter((p) => p.tier === "C").length,
    tierD: prospects.filter((p) => p.tier === "D").length,
    readyForWaalaxy: prospects.filter(isReadyForWaalaxy).length,
    missingContact: prospects.filter((p) => !hasContactPerson(p)).length,
    missingLinkedIn: prospects.filter((p) => hasContactPerson(p) && !hasLinkedIn(p)).length,
    avgFit: average(scored.map((p) => p.fit_score!)),
    avgTrigger: average(scored.map((p) => p.trigger_score ?? 0)),
    avgPriority: average(scored.map((p) => p.priority_score ?? 0)),
    notResearched: prospects.filter((p) => p.fit_score === null).length,
    lowConfidence: prospects.filter(isLowConfidence).length,
    demo: prospects.filter((p) => p.demo).length,
  };
}
