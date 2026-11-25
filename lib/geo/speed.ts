import { z } from "zod";
import { LCP_ATTENTION_MAX_MS } from "./checks/speed";
import { logInfo } from "./logger";

/**
 * Page speed via PageSpeed Insights v5 (mobile strategy, performance category
 * only). Pure apart from the injected fetch and clock: no env reads here. The
 * API key, when there is one, comes from the caller; without one the call is
 * keyless (lower quota). Never throws.
 *
 * One PSI response carries two kinds of measurement:
 * - field data: the 75th percentile LCP of real Chrome users over the last
 *   28 days (`loadingExperience` for this page, or `originLoadingExperience`
 *   for the whole site). Stable from run to run, and often present even when
 *   Lighthouse cannot load the page. This is the primary signal.
 * - lab data: one Lighthouse run (`lighthouseResult`). Varies from run to run,
 *   and is missing when Lighthouse could not run the page (`runtimeError`).
 *   Used only when there is no field data.
 */

export const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Per-page cap on the PSI calls for one page (a lab retry included), so a
 * slow measurement cannot hold up the batch. Mobile lab runs on heavy pages
 * often take 15 to 40 s, so the cap sits at the top of that range. The
 * request's PAGE_CHECK_BUDGET_MS (90 s, under the route's maxDuration of
 * 120 s) still bounds the whole batch: with FETCH_CONCURRENCY 3 lanes, a
 * measurement still running at the budget counts as a timeout and a page not
 * fetched by then is out of time.
 */
export const SPEED_TIMEOUT_MS = 40_000;

/** A lab-only LCP that would fail the check is measured once more, and the lower run is kept. */
export const LAB_RETRY_ABOVE_MS = LCP_ATTENTION_MAX_MS;
/** A lab retry starts only when at least this much of SPEED_TIMEOUT_MS is left. */
export const LAB_RETRY_MIN_LEFT_MS = 10_000;
/** A Lighthouse error message is cut to this many characters. */
const LIGHTHOUSE_MESSAGE_MAX = 300;

export type SpeedFailureReason =
  | "timeout"
  | "quota"
  | "http_error"
  | "invalid_response"
  | "network"
  | "page_not_measurable";

export type FieldCategory = "FAST" | "AVERAGE" | "SLOW";

/** Real-user LCP: 75th percentile over 28 days, for this page or, failing that, for the whole site. */
export interface FieldLcp {
  p75_ms: number;
  category: FieldCategory | null;
  scope: "page" | "origin";
}

/** One Lighthouse lab run. FCP and the score are null when PSI left them out. */
export interface LabRun {
  lcp_ms: number;
  fcp_ms: number | null;
  performance_score: number | null;
}

/** Why Lighthouse could not run the page, as PSI reports it. */
export interface LighthouseError {
  code: string;
  message: string;
}

export type SpeedMeasurement =
  | {
      ok: true;
      /** Which measurement `lcp_ms` is: real users ("field") or one Lighthouse run ("lab"). */
      source: "field" | "lab";
      /** The LCP the check grades. */
      lcp_ms: number;
      fcp_ms: number | null;
      performance_score: number | null;
      field: FieldLcp | null;
      lab: LabRun | null;
      /** The number of PSI calls made for this page: 2 after a lab retry. */
      runs: 1 | 2;
      /** Set when field data was used because Lighthouse could not run the page. */
      lab_error: LighthouseError | null;
    }
  | { ok: false; reason: SpeedFailureReason; lighthouse_error?: LighthouseError };

export interface MeasureSpeedDeps {
  fetch: typeof fetch;
  apiKey?: string;
  timeoutMs: number;
  /** Clock for the retry decision; defaults to Date.now. */
  now?: () => number;
}

/** The PSI request URL; `key` is only added when an API key is set. */
export function psiRequestUrl(url: string, apiKey?: string): string {
  const params = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  if (apiKey) params.set("key", apiKey);
  return `${PSI_ENDPOINT}?${params.toString()}`;
}

// Field names follow the public PSI v5 docs (runPagespeed response). Every
// part is optional: a page Lighthouse could not run comes back with audits
// that have no numericValue, and a page with little traffic has no field data.
// Kept in these schemas and readPsiBody so a correction stays in one place.
const fieldMetricSchema = z.object({ percentile: z.number().positive(), category: z.string().optional() }).passthrough();
const experienceSchema = z
  .object({
    origin_fallback: z.boolean().optional(),
    metrics: z.object({ LARGEST_CONTENTFUL_PAINT_MS: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();
const auditSchema = z.object({ numericValue: z.number().nonnegative() }).passthrough();
const lighthouseSchema = z
  .object({
    runtimeError: z.object({ code: z.string().nullish(), message: z.string().nullish() }).passthrough().nullish().catch(null),
    audits: z.record(z.string(), z.unknown()).nullish().catch(null),
    categories: z.unknown(),
  })
  .passthrough();
const psiBodySchema = z
  .object({
    loadingExperience: z.unknown().optional(),
    originLoadingExperience: z.unknown().optional(),
    lighthouseResult: z.unknown().optional(),
  })
  .passthrough();

/** What one PSI body says, before the choice between field and lab. */
export interface PsiReading {
  field: FieldLcp | null;
  lab: LabRun | null;
  labError: LighthouseError | null;
}

function fieldCategory(value: unknown): FieldCategory | null {
  return value === "FAST" || value === "AVERAGE" || value === "SLOW" ? value : null;
}

function readExperience(value: unknown, scope: "page" | "origin"): FieldLcp | null {
  const experience = experienceSchema.safeParse(value);
  if (!experience.success) return null;
  const lcp = fieldMetricSchema.safeParse(experience.data.metrics?.LARGEST_CONTENTFUL_PAINT_MS);
  if (!lcp.success) return null;
  return {
    p75_ms: Math.round(lcp.data.percentile),
    category: fieldCategory(lcp.data.category),
    scope: experience.data.origin_fallback ? "origin" : scope,
  };
}

function auditValue(audits: Record<string, unknown> | null | undefined, id: string): number | null {
  const audit = auditSchema.safeParse(audits?.[id]);
  return audit.success ? Math.round(audit.data.numericValue) : null;
}

function cleanMessage(message: string, apiKey?: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  const safe = apiKey
    ? [apiKey, encodeURIComponent(apiKey)].reduce((text, form) => text.split(form).join("[key]"), flat)
    : flat;
  return safe.length > LIGHTHOUSE_MESSAGE_MAX ? `${safe.slice(0, LIGHTHOUSE_MESSAGE_MAX - 1)}…` : safe;
}

function readLighthouse(value: unknown, apiKey?: string): Pick<PsiReading, "lab" | "labError"> {
  const lighthouse = lighthouseSchema.safeParse(value);
  if (!lighthouse.success) return { lab: null, labError: null };
  const { runtimeError, audits, categories } = lighthouse.data;
  if (runtimeError && (runtimeError.code || runtimeError.message)) {
    return {
      lab: null,
      labError: { code: runtimeError.code ?? "UNKNOWN", message: cleanMessage(runtimeError.message ?? "", apiKey) },
    };
  }
  const lcp = auditValue(audits, "largest-contentful-paint");
  if (lcp === null) return { lab: null, labError: null };
  const score = (categories as { performance?: { score?: unknown } | null } | null | undefined)?.performance?.score;
  return {
    lab: {
      lcp_ms: lcp,
      fcp_ms: auditValue(audits, "first-contentful-paint"),
      performance_score: typeof score === "number" && score >= 0 && score <= 1 ? Math.round(score * 100) : null,
    },
    labError: null,
  };
}

/**
 * Reads the field LCP (this page first, then the whole site), the lab run and
 * Lighthouse's runtime error from a PSI v5 body. Null when the body is not an
 * object at all. Never throws.
 */
export function readPsiBody(body: unknown, apiKey?: string): PsiReading | null {
  const parsed = psiBodySchema.safeParse(body);
  if (!parsed.success) return null;
  const field =
    readExperience(parsed.data.loadingExperience, "page") ?? readExperience(parsed.data.originLoadingExperience, "origin");
  return { field, ...readLighthouse(parsed.data.lighthouseResult, apiKey) };
}

/** The key names of a body that could not be read, never its values. */
function shapeOf(body: unknown): string {
  if (!body || typeof body !== "object") return typeof body;
  const top = Object.keys(body).sort();
  const lighthouse = (body as Record<string, unknown>).lighthouseResult;
  const inner = lighthouse && typeof lighthouse === "object" ? Object.keys(lighthouse).sort() : [];
  return `top-level keys [${top.join(", ")}], lighthouseResult keys [${inner.join(", ")}]`;
}

/**
 * Turns one reading into a measurement: field data when there is some, else
 * the lab run, else Lighthouse's error as `page_not_measurable`, else
 * `invalid_response`. `runs` is always 1 here; measureSpeed sets 2 after a retry.
 */
export function toMeasurement(reading: PsiReading | null): SpeedMeasurement {
  if (reading?.field) {
    return {
      ok: true,
      source: "field",
      lcp_ms: reading.field.p75_ms,
      fcp_ms: reading.lab?.fcp_ms ?? null,
      performance_score: reading.lab?.performance_score ?? null,
      field: reading.field,
      lab: reading.lab,
      runs: 1,
      lab_error: reading.labError,
    };
  }
  if (reading?.lab) {
    return {
      ok: true,
      source: "lab",
      lcp_ms: reading.lab.lcp_ms,
      fcp_ms: reading.lab.fcp_ms,
      performance_score: reading.lab.performance_score,
      field: null,
      lab: reading.lab,
      runs: 1,
      lab_error: null,
    };
  }
  if (reading?.labError) return { ok: false, reason: "page_not_measurable", lighthouse_error: reading.labError };
  return { ok: false, reason: "invalid_response" };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** PSI answers some unloadable pages with a non-2xx and "Lighthouse returned error: CODE. message". */
function lighthouseErrorFromErrorBody(text: string, apiKey?: string): LighthouseError | null {
  let message: unknown;
  try {
    message = (JSON.parse(text) as { error?: { message?: unknown } })?.error?.message;
  } catch {
    return null;
  }
  if (typeof message !== "string") return null;
  const match = /Lighthouse returned error:\s*([A-Z][A-Z0-9_]+)\.?\s*([\s\S]*)/.exec(message);
  return match ? { code: match[1]!, message: cleanMessage(match[2] ?? "", apiKey) } : null;
}

/** One PSI call, bounded by `signal`. */
async function callPsi(url: string, deps: MeasureSpeedDeps, signal: AbortSignal): Promise<SpeedMeasurement> {
  try {
    const res = await deps.fetch(psiRequestUrl(url, deps.apiKey), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    if (res.status === 429) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, reason: "quota" };
    }
    if (!res.ok) {
      let text = "";
      try {
        text = await res.text();
      } catch (error) {
        if (isAbort(error)) return { ok: false, reason: "timeout" };
      }
      const lighthouseError = lighthouseErrorFromErrorBody(text, deps.apiKey);
      return lighthouseError
        ? { ok: false, reason: "page_not_measurable", lighthouse_error: lighthouseError }
        : { ok: false, reason: "http_error" };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (error) {
      if (isAbort(error)) return { ok: false, reason: "timeout" };
      logInfo("speed", "PageSpeed Insights answered with a body that is not JSON");
      return { ok: false, reason: "invalid_response" };
    }
    const measurement = toMeasurement(readPsiBody(body, deps.apiKey));
    if (!measurement.ok && measurement.reason === "invalid_response") {
      logInfo("speed", `unreadable PageSpeed Insights response: ${shapeOf(body)}`);
    }
    return measurement;
  } catch (error) {
    return { ok: false, reason: isAbort(error) ? "timeout" : "network" };
  }
}

/**
 * Measures `url`. 429 is `quota`; a non-2xx naming a Lighthouse error, or a
 * 200 with `lighthouseResult.runtimeError` and no field data, is
 * `page_not_measurable` with that error; any other non-2xx is `http_error`; a
 * body with neither field nor lab data is `invalid_response` (its key names
 * are logged, never its values); the timeout (which also covers reading the
 * body) is `timeout`; anything else thrown is `network`.
 *
 * A lab-only result with LCP above LAB_RETRY_ABOVE_MS is measured once more
 * if at least LAB_RETRY_MIN_LEFT_MS of the page's time is left, and the
 * lower run is kept: one slow lab run is often a cold start, not the page.
 * Results never carry the request URL, so the key cannot leak through them.
 */
export async function measureSpeed(url: string, deps: MeasureSpeedDeps): Promise<SpeedMeasurement> {
  const now = deps.now ?? Date.now;
  const started = now();
  const first = await callPsi(url, deps, AbortSignal.timeout(deps.timeoutMs));
  if (!first.ok || first.source !== "lab" || first.lcp_ms <= LAB_RETRY_ABOVE_MS) return first;

  const left = deps.timeoutMs - (now() - started);
  if (left < LAB_RETRY_MIN_LEFT_MS) return first;
  const second = await callPsi(url, deps, AbortSignal.timeout(left));
  // A failed retry is not a run: the first result stands as one measurement.
  if (!second.ok) return first;
  if (second.source === "field") return { ...second, runs: 2 };
  return second.lcp_ms < first.lcp_ms ? { ...second, runs: 2 } : { ...first, runs: 2 };
}
