import type { ScrapeResult } from "../scrape";
import type { SpeedMeasurement } from "../speed";
import type { ExternalSources } from "../external";
import { authorPublisherCheck } from "./author-publisher";
import { clarityCheck } from "./clarity";
import { externalCheck } from "./external";
import { recencyCheck } from "./recency";
import { speedCheck } from "./speed";
import { structuredDataCheck } from "./structured-data";
import type { CheckDefinition, CheckId, CheckResult, ClarityOutcome } from "./types";

export * from "./types";

/** The ids `ids` selects, in registry order (all when omitted or empty). */
export function selectedCheckIds(ids?: CheckId[]): CheckId[] {
  const wanted = ids && ids.length > 0 ? new Set(ids) : null;
  return CHECK_REGISTRY.map((check) => check.id).filter((id) => !wanted || wanted.has(id));
}
export { parsePageDate, ageInDays, RECENT_MAX_AGE_DAYS, AGING_MAX_AGE_DAYS, FUTURE_TOLERANCE_DAYS } from "./recency";
export { THIN_WORD_COUNT } from "./clarity";
export { LCP_PASS_MAX_MS, LCP_ATTENTION_MAX_MS } from "./speed";

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
 * runs them all. `speed` is a measurement taken beforehand, if any, and
 * `external` what the off-page sources returned, if any, and `clarity` the
 * model's first-screen verdict, if asked. Pure: no network, no model.
 */
export function runChecks(
  scrape: ScrapeResult,
  url: string,
  ids?: CheckId[],
  now: Date = new Date(),
  speed: SpeedMeasurement | null = null,
  external: ExternalSources | null = null,
  clarity: ClarityOutcome | null = null,
): CheckResult[] {
  const wanted = ids && ids.length > 0 ? new Set(ids) : null;
  const ctx = { url, scrape, facts: scrape.facts, now, speed, external, clarity };
  return CHECK_REGISTRY.filter((check) => !wanted || wanted.has(check.id)).map((check) => check.run(ctx));
}
