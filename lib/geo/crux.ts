import { z } from "zod";
import type { FieldCategory, FieldLcp } from "./speed";

/**
 * Real-user LCP from the Chrome UX Report API (records:queryRecord), asked
 * directly instead of through PageSpeed Insights: one small POST of about
 * 0.3 s that does not wait for a Lighthouse run. Phone form factor, the 75th
 * percentile over the last 28 days; first for the page itself, then for its
 * origin. Uses the same Google API key as PageSpeed Insights, and the API must
 * be enabled on that key's Google Cloud project: a 403 PERMISSION_DENIED
 * means it is not. Pure apart from the injected fetch. Never throws.
 */

export const CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
/** Per CrUX request; a normal answer takes well under a second. */
export const CRUX_TIMEOUT_MS = 5_000;

/** Google's own Core Web Vitals bands for LCP, the ones PSI's field `category` uses. */
const LCP_GOOD_MAX_MS = 2_500;
const LCP_POOR_ABOVE_MS = 4_000;

/**
 * - `found`: real-user LCP for the page or the origin.
 * - `no_data`: CrUX has no record for either (too little Chrome traffic).
 * - `not_enabled`: the API key's project does not have the CrUX API enabled.
 * - `no_key`: no API key, so CrUX was not asked.
 * - `unavailable`: timeout, quota, network or an answer that could not be read.
 */
export type CruxStatus = "found" | "no_data" | "not_enabled" | "no_key" | "unavailable";

export type CruxResult = { status: "found"; field: FieldLcp } | { status: Exclude<CruxStatus, "found"> };

export interface CruxDeps {
  fetch: typeof fetch;
  apiKey?: string;
  /** The time CrUX may take in total, for both requests. */
  timeoutMs: number;
}

const percentileSchema = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive());
const cruxBodySchema = z.object({
  record: z.object({
    metrics: z.object({
      largest_contentful_paint: z.object({ percentiles: z.object({ p75: percentileSchema }) }),
    }),
  }),
});

function categoryOf(p75Ms: number): FieldCategory {
  return p75Ms <= LCP_GOOD_MAX_MS ? "FAST" : p75Ms <= LCP_POOR_ABOVE_MS ? "AVERAGE" : "SLOW";
}

type QueryAnswer = { kind: "found"; p75_ms: number } | { kind: "not_found" | "not_enabled" | "unavailable" };

async function errorStatus(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { status?: unknown } };
    return typeof body?.error?.status === "string" ? body.error.status : null;
  } catch {
    return null;
  }
}

/** One queryRecord request for `{ url }` or `{ origin }`. */
async function query(
  target: { url: string } | { origin: string },
  deps: CruxDeps & { apiKey: string },
  signal: AbortSignal,
): Promise<QueryAnswer> {
  try {
    const res = await deps.fetch(`${CRUX_ENDPOINT}?key=${encodeURIComponent(deps.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...target, formFactor: "PHONE", metrics: ["largest_contentful_paint"] }),
      signal,
    });
    if (res.status === 404) {
      await res.body?.cancel().catch(() => {});
      return { kind: "not_found" };
    }
    if (res.status === 403) {
      return (await errorStatus(res)) === "PERMISSION_DENIED" ? { kind: "not_enabled" } : { kind: "unavailable" };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { kind: "unavailable" };
    }
    const parsed = cruxBodySchema.safeParse(await res.json());
    if (!parsed.success) return { kind: "not_found" };
    return { kind: "found", p75_ms: Math.round(parsed.data.record.metrics.largest_contentful_paint.percentiles.p75) };
  } catch {
    return { kind: "unavailable" };
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Real-user LCP for `url`: the page's own record, else its origin's. A record
 * without an LCP percentile counts as no record. Results never carry the
 * request URL, so the key cannot leak through them.
 */
export async function queryCruxLcp(url: string, deps: CruxDeps): Promise<CruxResult> {
  if (!deps.apiKey) return { status: "no_key" };
  const withKey = { ...deps, apiKey: deps.apiKey };
  const signal = AbortSignal.timeout(deps.timeoutMs);

  const page = await query({ url }, withKey, signal);
  if (page.kind === "found") {
    return { status: "found", field: { p75_ms: page.p75_ms, category: categoryOf(page.p75_ms), scope: "page" } };
  }
  if (page.kind !== "not_found") return { status: page.kind };

  const origin = originOf(url);
  if (!origin) return { status: "no_data" };
  const site = await query({ origin }, withKey, signal);
  if (site.kind === "found") {
    return { status: "found", field: { p75_ms: site.p75_ms, category: categoryOf(site.p75_ms), scope: "origin" } };
  }
  return { status: site.kind === "not_found" ? "no_data" : site.kind };
}
