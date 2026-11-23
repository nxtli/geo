import type { ScrapeResult } from "../scrape";
import type { PageFacts } from "../facts/page";
import type { SpeedMeasurement } from "../speed";

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
}

export interface CheckDefinition {
  id: CheckId;
  label: string;
  run(ctx: CheckContext): CheckResult;
}

/** The shared result for a measurable check when there is no page to measure. */
export function notFetched(id: CheckId): CheckResult {
  return { id, status: "unknown", summary: "The page could not be fetched, so this was not measured.", facts: {}, evidence: null };
}

/** The shared result for a check that has no measurement yet. */
export function notMeasured(id: CheckId, what: string): CheckResult {
  return { id, status: "n/a", summary: `${what} is not measured yet.`, facts: {}, evidence: null };
}
