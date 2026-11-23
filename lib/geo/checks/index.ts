import type { ScrapeResult } from "../scrape";
import { authorPublisherCheck } from "./author-publisher";
import { clarityCheck } from "./clarity";
import { externalCheck } from "./external";
import { recencyCheck } from "./recency";
import { speedCheck } from "./speed";
import { structuredDataCheck } from "./structured-data";
import type { CheckDefinition, CheckId, CheckResult } from "./types";

export * from "./types";
export { parsePageDate, ageInDays, RECENT_MAX_AGE_DAYS, AGING_MAX_AGE_DAYS } from "./recency";
export { THIN_WORD_COUNT } from "./clarity";

/** All checks, in the order results are returned. Must match CHECK_IDS. */
export const CHECK_REGISTRY: readonly CheckDefinition[] = [
  authorPublisherCheck,
  recencyCheck,
  structuredDataCheck,
  clarityCheck,
  speedCheck,
  externalCheck,
];

/**
 * Runs the registered checks over an already scraped page, in registry order.
 * `ids` narrows the set (order still follows the registry); omitted or empty
 * runs them all. Pure: no network, no model.
 */
export function runChecks(
  scrape: ScrapeResult,
  url: string,
  ids?: CheckId[],
  now: Date = new Date(),
): CheckResult[] {
  const wanted = ids && ids.length > 0 ? new Set(ids) : null;
  const ctx = { url, scrape, facts: scrape.facts, now };
  return CHECK_REGISTRY.filter((check) => !wanted || wanted.has(check.id)).map((check) => check.run(ctx));
}
