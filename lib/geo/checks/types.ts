import type { ScrapeResult } from "../scrape";
import type { PageFacts } from "../facts/page";
import type { SpeedMeasurement } from "../speed";
import type { ExternalSources } from "../external";

/** Every check id, in registry order. The route's body schema is built from this list. */
export const CHECK_IDS = [
  "author_publisher",
  "recency",
  "structured_data",
  "clarity",
  "speed",
  "external",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export type CheckStatus = "pass" | "attention" | "fail" | "unknown" | "n/a";

export type CheckFactValue = string | number | boolean | null | string[];

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  /** One short English sentence describing what was measured. */
  summary: string;
  facts: Record<string, CheckFactValue>;
  /**
   * A short quotable string of what was actually found on the page (a date
   * with its source, the JSON-LD types, the names, the h1). Null when nothing
   * was found, and always null for "unknown" and "n/a" results.
   */
  evidence: string | null;
}

/** What a check gets to look at: the page as already scraped. No network, no model. */
export interface CheckContext {
  url: string;
  scrape: ScrapeResult;
  /** Shortcut for `scrape.facts`; null when the page was not fetched. */
  facts: PageFacts | null;
  /** The moment ages are measured against; injected so results are reproducible. */
  now: Date;
  /**
   * A PageSpeed Insights measurement taken before the checks run; absent or
   * null when speed was not requested or not measured (the speed check is
   * then n/a). Checks never measure anything themselves.
   */
  speed?: SpeedMeasurement | null;
  /**
   * What the optional off-page sources (search provider, LLM brand probe)
   * returned, gathered before the checks run; absent or null means both
   * were off. Checks never call them themselves.
   */
  external?: ExternalSources | null;
  /**
   * The model's verdict on the first screen, asked before the checks run;
   * absent or null when no judge is set (the clarity check is then structure
   * only). `ok: false` means it was asked but gave no verdict.
   */
  clarity?: ClarityOutcome | null;
  /**
   * Set only when the page's connection failed: why, so the unmeasured checks
   * say so instead of the generic not-fetched summary. Absent or null otherwise.
   */
  unreachable?: Unreachable | null;
}

export type ClarityOutcome =
  | { ok: true; verdict: "pass" | "attention" | "fail"; reason: string }
  | { ok: false; reason: "error" | "timeout" };

export interface CheckDefinition {
  id: CheckId;
  label: string;
  run(ctx: CheckContext): CheckResult;
}

/** The summary of {@link notFetched}. */
export const NOT_FETCHED_SUMMARY = "The page could not be fetched, so this was not measured.";

/**
 * The shared result for a measurable check when there is no page to measure.
 * Pass the context's `unreachable` so a failed connection says why.
 */
export function notFetched(id: CheckId, unreachable?: Unreachable | null): CheckResult {
  if (unreachable) return notReached(id, unreachable);
  return { id, status: "unknown", summary: NOT_FETCHED_SUMMARY, facts: {}, evidence: null };
}

/** Why a page could not be reached at all: no connection, or a host with only an IPv6 address. */
export type UnreachableReason = "unreachable" | "ipv6_only";

/** A failed connection: the reason, and for "ipv6_only" the host that has no IPv4 record. */
export interface Unreachable {
  reason: UnreachableReason;
  host?: string;
}

/** {@link notFetched} for a page whose connection failed, with the reason; same status. */
export function notReached(id: CheckId, { reason, host }: Unreachable): CheckResult {
  const summary =
    reason === "ipv6_only"
      ? `The page could not be reached: ${host ?? "this address"} has no IPv4 record (IPv6 only).`
      : "The page could not be reached (connection failed).";
  return { id, status: "unknown", summary, facts: { reason }, evidence: null };
}

/** Why a page was not checked at all: the request's time budget ran out first. */
export function outOfTime(id: CheckId): CheckResult {
  return {
    id,
    status: "n/a",
    summary: "Not checked: the time budget of this request ran out first.",
    facts: { reason: "time_budget" },
    evidence: null,
  };
}

/** The shared result for a check that has no measurement yet. */
export function notMeasured(id: CheckId, what: string): CheckResult {
  return { id, status: "n/a", summary: `${what} is not measured yet.`, facts: {}, evidence: null };
}
