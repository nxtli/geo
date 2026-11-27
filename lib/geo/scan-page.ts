import { z } from "zod";
import type { RunAnalysisOutcome } from "./analysis";
import { analysisInputFor } from "./analysis-input";
import type { Brand } from "./brand";
import type { PdfResult } from "./report/pdf";
import { buildPreview, buildReportHtml } from "./report/service";
import type { FetchPageOptions, ScrapeResult, UrlGuard } from "./scrape";
import type { GeoAnalysisInput, GeoAnalysisResult, GeoScanResponse } from "./types";
import { MAX_URL_LENGTH } from "./page-check";

/**
 * One full GEO scan of one page for a machine caller (the `geo_scan_page` MCP
 * tool): the same fetch, analysis and report as POST /api/geo/scan, so the
 * report has the site's own structure. Unlike the site scan it stores no lead,
 * sends no e-mail, and posts nothing to Slack or HubSpot. The page is fetched
 * under the page check's URL guard (public http(s) hosts only).
 */

export const SCAN_TEXT_MAX = 2000;

export const scanPageArgsSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(MAX_URL_LENGTH)
    .refine((value) => /^https?:\/\//i.test(value), "must start with http:// or https://"),
  company: z.string().trim().max(200).optional(),
  questions: z.string().trim().max(SCAN_TEXT_MAX).optional(),
  offer: z.string().trim().max(SCAN_TEXT_MAX).optional(),
  audience: z.string().trim().max(SCAN_TEXT_MAX).optional(),
});

export type ScanPageArgs = z.infer<typeof scanPageArgsSchema>;

export interface ScanPageDeps {
  fetchPage: (url: string, options?: FetchPageOptions) => Promise<ScrapeResult>;
  guard: UrlGuard;
  analyze: (input: GeoAnalysisInput) => Promise<RunAnalysisOutcome>;
  makePdf: (params: { html: string; scanRequestId: string | null }) => Promise<PdfResult>;
  brand: Brand;
  now: () => Date;
}

export interface ScanPageResult {
  url: string;
  company: string;
  /** False when the page itself could not be read; the report then rests on what is known. */
  fetched: boolean;
  /** Why the page was not read, when the guard refused it or a redirect chain ran too long. */
  fetch_error?: ScrapeResult["fetchError"];
  /** The full analysis behind the report: scores, criteria and actions. */
  scorecard: GeoAnalysisResult;
  /** The short summary the site shows before the report. */
  preview: NonNullable<GeoScanResponse["preview"]>;
  /** The report as the site renders it, self-contained HTML. */
  report_html: string;
  /** A stored PDF, only when the site has a PDF strategy configured; otherwise null. */
  pdf_url: string | null;
  /** True when the language model failed and the report holds only the measured facts. */
  degraded: boolean;
}

/** The host without "www.", used as the company name when none is given. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Fetch, analyse and render one page exactly as the site scan does (steps 2 to 4 of its route). */
export async function scanPage(args: ScanPageArgs, deps: ScanPageDeps): Promise<ScanPageResult> {
  const lead = {
    name: "",
    company_name: args.company || hostOf(args.url),
    homepage_url: args.url,
    offer_description: args.offer ?? "",
    target_audience: args.audience ?? "",
    desired_queries: args.questions ?? "",
    competitors: null,
  };
  const page = await deps.fetchPage(lead.homepage_url, { guard: deps.guard });
  const { result: analysis, degraded } = await deps.analyze(analysisInputFor(lead, page));
  const reportHtml = buildReportHtml({ lead, analysis, brand: deps.brand, now: deps.now() });
  const { pdfUrl } = await deps.makePdf({ html: reportHtml, scanRequestId: null });
  return {
    url: lead.homepage_url,
    company: lead.company_name,
    fetched: page.metadata.fetched,
    ...(page.fetchError ? { fetch_error: page.fetchError } : {}),
    scorecard: analysis,
    preview: buildPreview(analysis),
    report_html: reportHtml,
    pdf_url: pdfUrl,
    degraded,
  };
}

export interface ScanRateLimit {
  /** Takes one scan from the window; `retryAfterSeconds` when the window is full. */
  take(): { ok: true } | { ok: false; retryAfterSeconds: number };
}

/**
 * At most `max` scans per `windowMs` on this instance. Every scan costs a
 * language-model run; the machine token's callers get their own budget, apart
 * from the site's per-e-mail gate and daily cap. Process-local, like the
 * site's no-database backstop: it does not span serverless instances.
 */
export function createScanRateLimit(max: number, windowMs: number, now: () => number = Date.now): ScanRateLimit {
  const taken: number[] = [];
  return {
    take() {
      const at = now();
      while (taken.length > 0 && at - taken[0] >= windowMs) taken.shift();
      if (taken.length >= max) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((taken[0] + windowMs - at) / 1000)) };
      }
      taken.push(at);
      return { ok: true };
    },
  };
}

export const DEFAULT_SCAN_MAX_PER_HOUR = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The site's daily cap (GEO_MAX_SCANS_PER_DAY), read the way the site scan
 * reads it: no cap unless it is a positive number, and the count is the
 * site's completed scans over the last 24 hours. Tool scans store no scan
 * request, so they are held to the cap but do not add to the count.
 */
export async function dailyScanCapReached(
  capValue: string | undefined,
  countSince: (sinceIso: string) => Promise<number>,
  now: () => number = Date.now,
): Promise<boolean> {
  const cap = Number(capValue);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  return (await countSince(new Date(now() - DAY_MS).toISOString())) >= cap;
}

/** GEO_MCP_SCAN_MAX_PER_HOUR when it is a positive whole number, else the default. */
export function scanMaxPerHour(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SCAN_MAX_PER_HOUR;
}
