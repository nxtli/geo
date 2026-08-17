/**
 * URL-zoekparameters → filter + sortering.
 *
 * Apart gehouden van de pagina zodat het zonder React te testen is, en zodat
 * onbruikbare invoer (`?min_fit=abc`, `?tier=Z`) genegeerd wordt in plaats van
 * de pagina te laten crashen.
 */

import type { ProspectFilter, SortKey, SortSpec } from "./filters";
import { DEFAULT_SORT } from "./filters";
import { PROSPECT_STATUSES, type ProspectStatus, type Tier } from "./types";
import { normalizeSegment } from "./segments";

/** Wat een Next.js server component als searchParams doorgeeft. */
export type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function num(params: SearchParams, key: string): number | undefined {
  const raw = one(params, key);
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function bool(params: SearchParams, key: string): boolean | undefined {
  const raw = one(params, key);
  if (raw === "yes" || raw === "1" || raw === "true") return true;
  if (raw === "no" || raw === "0" || raw === "false") return false;
  return undefined;
}

const TIERS = new Set(["A", "B", "C", "D"]);

export function filterFromSearchParams(params: SearchParams): ProspectFilter {
  const filter: ProspectFilter = {};

  const tier = one(params, "tier");
  if (tier && TIERS.has(tier)) filter.tiers = [tier as Tier];

  const status = one(params, "status");
  if (status && PROSPECT_STATUSES.includes(status as ProspectStatus)) {
    filter.statuses = [status as ProspectStatus];
  }

  const segment = normalizeSegment(one(params, "segment"));
  if (segment) filter.segments = [segment];

  const industry = one(params, "industry")?.trim();
  if (industry) filter.industry = industry;

  const angle = one(params, "angle")?.trim();
  if (angle) filter.angle = angle;

  const location = one(params, "location")?.trim();
  if (location) filter.location = location;

  const search = one(params, "q")?.trim();
  if (search) filter.search = search;

  const minPriority = num(params, "min_priority");
  if (minPriority !== undefined) filter.minPriority = minPriority;

  const minFit = num(params, "min_fit");
  if (minFit !== undefined) filter.minFit = minFit;

  const minTrigger = num(params, "min_trigger");
  if (minTrigger !== undefined) filter.minTrigger = minTrigger;

  const hasContact = bool(params, "contact");
  if (hasContact !== undefined) filter.hasContact = hasContact;

  const hasLinkedIn = bool(params, "linkedin");
  if (hasLinkedIn !== undefined) filter.hasLinkedIn = hasLinkedIn;

  if (one(params, "low_confidence")) filter.lowConfidenceOnly = true;
  if (one(params, "hide_demo")) filter.includeDemo = false;

  return filter;
}

const SORT_KEYS = new Set<SortKey>([
  "priority",
  "fit",
  "trigger",
  "company",
  "created",
  "confidence",
]);

/** `?sort=priority-desc` → SortSpec. Onbekende waarden vallen terug op default. */
export function sortFromSearchParams(params: SearchParams): SortSpec {
  const raw = one(params, "sort");
  if (!raw) return DEFAULT_SORT;
  const [key, direction] = raw.split("-");
  if (!SORT_KEYS.has(key as SortKey)) return DEFAULT_SORT;
  return {
    key: key as SortKey,
    direction: direction === "asc" ? "asc" : "desc",
  };
}
