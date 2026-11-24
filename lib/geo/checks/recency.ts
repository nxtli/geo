import type { CheckDefinition } from "./types";
import { notFetched } from "./types";
import { inferPageType } from "./structured-data";

const DAY_MS = 86_400_000;

/** Up to this many days old is pass. */
export const RECENT_MAX_AGE_DAYS = 180;
/** Up to this many days old is attention; older is fail. */
export const AGING_MAX_AGE_DAYS = 365;
/**
 * A date up to this many days after `now` still counts (time zones, a page
 * published "tomorrow" by its own clock). Anything later is ignored.
 */
export const FUTURE_TOLERANCE_DAYS = 1;

/** How each date source is named in the evidence string. */
const SOURCE_LABELS: Record<string, string> = {
  visible_date: "visible date",
  json_ld_date_modified: "JSON-LD dateModified",
  meta_modified_time: "article:modified_time",
};

const MONTH_NUMBERS: Record<string, number> = {
  januari: 1, january: 1,
  februari: 2, february: 2,
  maart: 3, march: 3,
  april: 4,
  mei: 5, may: 5,
  juni: 6, june: 6,
  juli: 7, july: 7,
  augustus: 8, august: 8,
  september: 9,
  oktober: 10, october: 10,
  november: 11,
  december: 12,
};

function utcDay(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects overflow such as 31-02-2026.
  return date.getUTCMonth() === month - 1 ? date : null;
}

/**
 * Parses the date formats the fact extractor can return: ISO dates and
 * datetimes, "3 oktober 2026" / "3 october 2026", and day-first "03-10-2026"
 * or "03/10/2026". Returns null for anything else.
 */
export function parsePageDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (iso) {
    if (value.length > 10) {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) return new Date(ms);
    }
    return utcDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const named = value.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
  if (named) {
    const month = MONTH_NUMBERS[named[2].toLowerCase()];
    return month ? utcDay(Number(named[3]), month, Number(named[1])) : null;
  }
  const dayFirst = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dayFirst) return utcDay(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  return null;
}

/** Whole days from `date` to `now`; negative when the date lies in the future. */
export function ageInDays(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

/**
 * The newest of the visible date, JSON-LD dateModified and
 * article:modified_time, with its age in days against the injected `now`.
 * A date more than FUTURE_TOLERANCE_DAYS after `now` is ignored when picking
 * the newest and reported in `ignored_future_date`. Pass up to
 * RECENT_MAX_AGE_DAYS, attention up to AGING_MAX_AGE_DAYS, fail when older,
 * unknown when no usable date parses, except on a homepage (the page type
 * the structured_data check infers) with no date at all, which is n/a: a
 * homepage does not need one. A homepage with only a future date stays
 * unknown. Evidence is the date as found plus its
 * source, e.g. "3 oktober 2026 (visible date)".
 */
export const recencyCheck: CheckDefinition = {
  id: "recency",
  label: "Recency",
  run({ url, facts, now, unreachable }) {
    if (!facts) return notFetched("recency", unreachable);
    const candidates = [
      { source: "visible_date", raw: facts.visibleDate },
      { source: "json_ld_date_modified", raw: facts.jsonLd.dateModified },
      { source: "meta_modified_time", raw: facts.metaModified },
    ];
    const latestAllowed = now.getTime() + FUTURE_TOLERANCE_DAYS * DAY_MS;
    let newest: { source: string; raw: string; date: Date } | null = null;
    let ignoredFuture: Date | null = null;
    for (const { source, raw } of candidates) {
      const date = parsePageDate(raw);
      if (!raw || !date) continue;
      if (date.getTime() > latestAllowed) {
        if (!ignoredFuture || date.getTime() > ignoredFuture.getTime()) ignoredFuture = date;
        continue;
      }
      if (!newest || date.getTime() > newest.date.getTime()) newest = { source, raw: raw.trim(), date };
    }
    const ignoredFutureDate = ignoredFuture ? ignoredFuture.toISOString().slice(0, 10) : null;
    const result = {
      visible_date: facts.visibleDate,
      json_ld_date_modified: facts.jsonLd.dateModified,
      meta_modified_time: facts.metaModified,
      newest_date: newest ? newest.date.toISOString().slice(0, 10) : null,
      newest_source: newest?.source ?? null,
      age_days: newest ? ageInDays(newest.date, now) : null,
      ignored_future_date: ignoredFutureDate,
    };
    const futureNote = ignoredFutureDate ? ` A date in the future (${ignoredFutureDate}) was ignored.` : "";
    if (!newest || result.age_days === null) {
      if (!ignoredFutureDate && inferPageType(url, facts) === "home") {
        return { id: "recency", status: "n/a", summary: "A homepage does not need a date.", facts: result, evidence: null };
      }
      const summary = ignoredFutureDate
        ? `Only a date in the future (${ignoredFutureDate}) was found; it was ignored.`
        : "No date found on the page.";
      return { id: "recency", status: "unknown", summary, facts: result, evidence: null };
    }
    const age = result.age_days;
    return {
      id: "recency",
      status: age <= RECENT_MAX_AGE_DAYS ? "pass" : age <= AGING_MAX_AGE_DAYS ? "attention" : "fail",
      summary: `Newest date ${result.newest_date} (${newest.source}), ${age} day(s) old.${futureNote}`,
      facts: result,
      evidence: `${newest.raw} (${SOURCE_LABELS[newest.source] ?? newest.source})`,
    };
  },
};
