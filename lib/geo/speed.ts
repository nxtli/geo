import { z } from "zod";

/**
 * Page speed via PageSpeed Insights v5 (Lighthouse lab run, mobile strategy,
 * performance category only). Pure apart from the injected fetch: no env
 * reads here. The API key, when there is one, comes from the caller; without
 * one the call is keyless (lower quota). Never throws.
 */

export const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** Per-page cap on one PSI call, so a slow measurement cannot hold up the batch. */
export const SPEED_TIMEOUT_MS = 25_000;

export type SpeedFailureReason = "timeout" | "quota" | "http_error" | "invalid_response" | "network";

export type SpeedMeasurement =
  | { ok: true; lcp_ms: number; fcp_ms: number; performance_score: number; source: "lab" }
  | { ok: false; reason: SpeedFailureReason };

export interface MeasureSpeedDeps {
  fetch: typeof fetch;
  apiKey?: string;
  timeoutMs: number;
}

/** The PSI request URL; `key` is only added when an API key is set. */
export function psiRequestUrl(url: string, apiKey?: string): string {
  const params = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  if (apiKey) params.set("key", apiKey);
  return `${PSI_ENDPOINT}?${params.toString()}`;
}

// Field names taken from the public PSI v5 docs (runPagespeed response,
// lighthouseResult); not verified against a live response. Kept in this one
// schema and parsePsiResponse so a correction stays in one place.
const psiResponseSchema = z.object({
  lighthouseResult: z.object({
    audits: z.object({
      "largest-contentful-paint": z.object({ numericValue: z.number().nonnegative() }),
      "first-contentful-paint": z.object({ numericValue: z.number().nonnegative() }),
    }),
    categories: z.object({
      performance: z.object({ score: z.number().min(0).max(1) }),
    }),
  }),
});

/** Reads LCP, FCP (ms, rounded) and the performance score (0..1 → 0..100 integer) from a PSI v5 body. */
export function parsePsiResponse(body: unknown): SpeedMeasurement {
  const parsed = psiResponseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "invalid_response" };
  const { audits, categories } = parsed.data.lighthouseResult;
  return {
    ok: true,
    lcp_ms: Math.round(audits["largest-contentful-paint"].numericValue),
    fcp_ms: Math.round(audits["first-contentful-paint"].numericValue),
    performance_score: Math.round(categories.performance.score * 100),
    source: "lab",
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * One PSI measurement for `url`. 429 is `quota`, any other non-2xx is
 * `http_error`, a body that does not parse is `invalid_response`, the
 * timeout (which also covers reading the body) is `timeout`, anything else
 * thrown is `network`. Results and reasons never carry the request URL, so
 * the key cannot leak through them.
 */
export async function measureSpeed(url: string, deps: MeasureSpeedDeps): Promise<SpeedMeasurement> {
  try {
    const res = await deps.fetch(psiRequestUrl(url, deps.apiKey), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
    if (res.status === 429) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, reason: "quota" };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, reason: "http_error" };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (error) {
      return { ok: false, reason: isAbort(error) ? "timeout" : "invalid_response" };
    }
    return parsePsiResponse(body);
  } catch (error) {
    return { ok: false, reason: isAbort(error) ? "timeout" : "network" };
  }
}
